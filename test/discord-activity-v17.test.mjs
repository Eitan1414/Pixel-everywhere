import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import initSqlJs from "sql.js";
import { createDiscordActivityStore } from "../server/discord-activity-v17.mjs";
import { startDiscordActivityGateway } from "../server/discord-gateway-v17.mjs";

const sqlJsDirectory = path.dirname(fileURLToPath(import.meta.resolve("sql.js")));
const SQL = await initSqlJs({ locateFile: (file) => path.join(sqlJsDirectory, file) });
const GUILD = "123456789012345678";
const ID = "888888888888888888";
const ROLE = "987654321098765432";
const OTHER = "777777777777777777";

function fixture() {
  const sqlite = new SQL.Database();
  const db = {
    exec: (sql) => sqlite.exec(sql),
    prepare(sql) {
      return {
        run(...params) {
          sqlite.run(sql,params);
          return { changes: sqlite.getRowsModified() };
        },
        get(...params) {
          const statement = sqlite.prepare(sql);
          try {
            statement.bind(params);
            return statement.step() ? statement.getAsObject() : undefined;
          } finally { statement.free(); }
        },
        all(...params) {
          const statement = sqlite.prepare(sql), rows = [];
          try {
            statement.bind(params);
            while (statement.step()) rows.push(statement.getAsObject());
            return rows;
          } finally { statement.free(); }
        }
      };
    }
  };
  let now = Date.UTC(2026,10,11,17,0,0);
  const store = createDiscordActivityStore({db,guildId:GUILD,now:()=>now});
  const member = (roles, guild = GUILD) => ({
    guild_id:guild, user:{id:ID,username:"PixelUser"},roles
  });
  return {db,store,member,close:()=>sqlite.close(),advanceDays:(n)=>{now+=n*86400000;}};
}

test("journal Discord: arrivee, depart et changement des roles sans faux doublons", () => {
  const {store,member,close} = fixture();
  try {
    store.observe("GUILD_CREATE",{id:GUILD,roles:[{id:ROLE,name:"Artiste"}]});
    assert.equal(store.observe("GUILD_MEMBER_ADD",member([])),true);
    assert.equal(store.observe("GUILD_MEMBER_ADD",member([])),false);
    assert.equal(store.observe("GUILD_MEMBER_UPDATE",member([])),false);
    assert.equal(store.observe("GUILD_MEMBER_UPDATE",member([ROLE])),true);
    assert.equal(store.observe("GUILD_MEMBER_UPDATE",member([ROLE])),false);
    assert.equal(store.observe("GUILD_MEMBER_UPDATE",member([])),true);
    assert.equal(store.observe("GUILD_MEMBER_REMOVE",{guild_id:GUILD,user:{id:ID,username:"PixelUser"}}),true);
    const events = store.list({days:7});
    assert.deepEqual(events.map((item)=>item.type),["leave","roles","roles","join"]);
    assert.deepEqual(events[2].addedRoles,[{id:ROLE,name:"Artiste"}]);
    assert.deepEqual(events[1].removedRoles,[{id:ROLE,name:"Artiste"}]);
    assert.equal(store.list({type:"roles"}).length,2);
    assert.equal(store.list({type:"join"}).length,1);
    assert.equal(store.list({type:"leave"}).length,1);
  } finally {close();}
});

test("journal Discord: seules les données du serveur autorisé sont enregistrées", () => {
  const {store,member,close} = fixture();
  try {
    assert.equal(store.observe("GUILD_MEMBER_ADD",member([],OTHER)),false);
    assert.equal(store.observe("GUILD_MEMBER_ADD",member([])),true);
    assert.equal(store.observe("GUILD_MEMBER_UPDATE",{guild_id:GUILD,user:{id:"bad",username:"x"},roles:[ROLE]}),false);
    assert.equal(store.list({days:7}).length,1);
  } finally {close();}
});

test("journal Discord: premier update initialise un référentiel sans inventer de rôle", () => {
  const {store,member,close} = fixture();
  try {
    assert.equal(store.observe("GUILD_MEMBER_UPDATE",member([ROLE])),false);
    assert.equal(store.observe("GUILD_MEMBER_UPDATE",member([ROLE,OTHER])),true);
    assert.equal(store.list()[0].type,"roles");
    assert.equal(store.list()[0].addedRoles[0].id,OTHER);
  } finally {close();}
});

test("Gateway GUILD_CREATE initialise les roles des membres existants sans faux événements", () => {
  const {store,member,close} = fixture();
  try {
    store.observe("GUILD_CREATE",{
      id:GUILD,roles:[{id:ROLE,name:"Artiste"}],
      members:[{user:{id:ID,username:"PixelUser"},roles:[ROLE]}]
    });
    assert.equal(store.list().length,0);
    assert.equal(store.observe("GUILD_MEMBER_UPDATE",member([ROLE])),false);
    assert.equal(store.observe("GUILD_MEMBER_UPDATE",member([])),true);
    assert.deepEqual(store.list()[0].removedRoles,[{id:ROLE,name:"Artiste"}]);
  } finally {close();}
});

test("journal Discord: conservation de 30 jours et filtres de dates", () => {
  const {store,member,advanceDays,close} = fixture();
  try {
    store.observe("GUILD_MEMBER_ADD",member([]));
    advanceDays(8);
    assert.equal(store.list({days:7}).length,0);
    assert.equal(store.list({days:30}).length,1);
    advanceDays(24);
    store.prune();
    assert.equal(store.list({days:30}).length,0);
  } finally {close();}
});

test("Gateway inactif par défaut: aucune connexion réseau ouverte", () => {
  const gateway = startDiscordActivityGateway({
    store: {observe:()=>{}},
    env:{DISCORD_BOT_TOKEN:"",DISCORD_GUILD_ID:GUILD},
    WebSocketImpl:class { constructor(){throw Error("Connexion inattendue");} }
  });
  assert.equal(gateway.getStatus().status,"disabled");
  gateway.close();
});

test("Gateway: Identify demande seulement GUILDS et GUILD_MEMBERS; logs à l'arrivée", async () => {
  class MockSocket extends EventEmitter {
    static OPEN = 1;
    constructor() {
      super();
      this.readyState = 1;
      this.sent = [];
      MockSocket.last = this;
    }
    send(payload) {this.sent.push(JSON.parse(payload));}
    close(code=1000) {this.readyState=3;this.emit("close",code);}
    terminate() {this.close();}
  }
  const received=[];
  const gateway = startDiscordActivityGateway({
    store:{observe:(type,payload)=>{received.push([type,payload]);return true;}},
    env:{
      DISCORD_ACTIVITY_GATEWAY_ENABLED:"true",DISCORD_BOT_TOKEN:"private-test-token",
      DISCORD_GUILD_ID:GUILD
    },
    WebSocketImpl:MockSocket,
    logger:{error:()=>{}}
  });
  try {
    const socket=MockSocket.last;
    assert.equal(gateway.getStatus().status,"connecting");
    socket.emit("message",JSON.stringify({op:10,d:{heartbeat_interval:60000}}));
    assert.equal(socket.sent[0].op,2);
    assert.equal(socket.sent[0].d.intents,3);
    assert.equal(socket.sent[0].d.token,"private-test-token");
    socket.emit("message",JSON.stringify({op:0,t:"READY",s:1,d:{session_id:"test-session",resume_gateway_url:"wss://gateway.discord.gg"}}));
    assert.equal(gateway.getStatus().status,"connected");
    socket.emit("message",JSON.stringify({op:0,t:"GUILD_MEMBER_ADD",s:2,d:{guild_id:GUILD,user:{id:ID}}}));
    assert.equal(received[0][0],"GUILD_MEMBER_ADD");
    assert.ok(gateway.getStatus().lastEventAt);
    socket.emit("message",JSON.stringify({op:11,d:null}));
  } finally {gateway.close();}
});

test("Gateway refuse les membres sans intent privilégié (4014) sans reconnexion en boucle", () => {
  class MockSocket extends EventEmitter {
    static OPEN = 1;
    constructor(){super();this.readyState=1;MockSocket.last=this;}
    close(code=1000){this.readyState=3;this.emit("close",code);}
    send(){}
  }
  const gateway=startDiscordActivityGateway({
    store:{observe:()=>false},
    env:{DISCORD_ACTIVITY_GATEWAY_ENABLED:"true",DISCORD_BOT_TOKEN:"test-token",DISCORD_GUILD_ID:GUILD},
    WebSocketImpl:MockSocket
  });
  try{
    MockSocket.last.close(4014);
    const status=gateway.getStatus();
    assert.equal(status.status,"unauthorized");
    assert.match(status.error,/Server Members Intent/);
  }finally{gateway.close();}
});
