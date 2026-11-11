import WebSocket from "ws";

// Opt-in, single process Gateway client; requires the privileged GUILD_MEMBERS
// intent in Discord Developer Portal. No message/presence intents are requested.
export function startDiscordActivityGateway({
  store, env = process.env, WebSocketImpl = WebSocket, logger = console
}) {
  const token = String(env.DISCORD_BOT_TOKEN || "").trim();
  const guildId = String(env.DISCORD_GUILD_ID || "").trim();
  const enabled = env.DISCORD_ACTIVITY_GATEWAY_ENABLED === "true";
  const state = {
    enabled, status: enabled ? "starting" : "disabled",
    lastReadyAt: null, lastEventAt: null, error: null
  };
  let socket = null;
  let retryTimer = null;
  let heartbeatTimer = null;
  let firstHeartbeat = null;
  let ack = true;
  let sequence = null;
  let sessionId = null;
  let resumeUrl = null;
  let stopped = false;
  let attempt = 0;

  function stopTimers() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (firstHeartbeat) clearTimeout(firstHeartbeat);
    heartbeatTimer = firstHeartbeat = null;
  }
  function send(payload) {
    if (socket?.readyState === WebSocketImpl.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }
  function heartbeat() {
    if (!ack) {
      state.status = "reconnecting";
      state.error = "Discord ne répond plus aux battements de cœur.";
      socket?.terminate();
      return;
    }
    ack = false;
    send({op: 1, d: sequence});
  }
  function scheduleReconnect() {
    if (stopped || retryTimer || state.status === "unauthorized") return;
    state.status = "reconnecting";
    const delay = Math.min(60000,3000 * 2 ** Math.min(attempt++,4));
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    },delay);
    retryTimer.unref?.();
  }
  function connect() {
    if (stopped) return;
    state.status = "connecting";
    ack = true;
    const endpoint = (resumeUrl || "wss://gateway.discord.gg") + "/?v=10&encoding=json";
    try {
      socket = new WebSocketImpl(endpoint, { handshakeTimeout: 12000, maxPayload: 2 * 1024 * 1024 });
    } catch {
      state.error = "Connexion WebSocket Discord impossible.";
      scheduleReconnect();
      return;
    }
    const currentSocket = socket;
    currentSocket.on("message", (raw) => {
      let packet;
      try { packet = JSON.parse(String(raw)); } catch { return; }
      if (typeof packet.s === "number")sequence = packet.s;
      if (packet.op === 11) { ack = true; return; }
      if (packet.op === 1) { heartbeat(); return; }
      if (packet.op === 7) { currentSocket.close(); return; }
      if (packet.op === 9) {
        if (!packet.d) {
          sequence = null;
          sessionId = null;
          resumeUrl = null;
        }
        currentSocket.close();
        return;
      }
      if (packet.op === 10) {
        const interval = Number(packet.d?.heartbeat_interval);
        if (!Number.isFinite(interval) || interval < 1000) {
          currentSocket.close();
          return;
        }
        stopTimers();
        firstHeartbeat = setTimeout(heartbeat, Math.floor(Math.random() * interval));
        firstHeartbeat.unref?.();
        heartbeatTimer = setInterval(heartbeat,interval);
        heartbeatTimer.unref?.();
        if (sessionId && sequence !== null) {
          send({ op: 6, d: {token,session_id:sessionId,seq:sequence} });
        } else {
          send({
            op: 2, d: {
              token, intents: (1 << 0) | (1 << 1),
              properties: { os: "linux", browser: "Pixel Everywhere", device: "Termux" }
            }
          });
        }
        return;
      }
      if (packet.op !== 0 || !packet.t) return;
      if (packet.t === "READY") {
        sessionId = packet.d?.session_id || null;
        const nextUrl = String(packet.d?.resume_gateway_url || "");
        resumeUrl = /^wss:\/\/(?:gateway|gateway-[a-z0-9-]+)\.discord\.gg$/.test(nextUrl)
          ? nextUrl : null;
        state.status = "connected";
        state.error = null;
        state.lastReadyAt = new Date().toISOString();
        attempt = 0;
      } else if (packet.t === "RESUMED") {
        state.status = "connected";
        state.error = null;
        attempt = 0;
      } else {
        try {
          if (store.observe(packet.t,packet.d)) {
            state.lastEventAt = new Date().toISOString();
          }
        } catch (error) {
          state.error = "Un événement Discord n'a pas pu être enregistré.";
          logger.error("DISCORD_ACTIVITY_STORE_FAILED",error?.code || "request");
        }
      }
    });
    currentSocket.on("error", () => {
      state.error = "Connexion Discord Gateway interrompue.";
    });
    currentSocket.on("close", (code) => {
      if (socket !== currentSocket) return;
      stopTimers();
      socket = null;
      if (stopped) return;
      if ([4004,4010,4011,4013,4014].includes(code)) {
        state.status = "unauthorized";
        state.error = code === 4014
          ? "Active Server Members Intent dans Discord Developer Portal."
          : "Discord a refusé la connexion Gateway (code " + code + ").";
        return;
      }
      if (code === 4007 || code === 4009) {
        sessionId = resumeUrl = sequence = null;
      }
      scheduleReconnect();
    });
  }
  function close() {
    stopped = true;
    stopTimers();
    if (retryTimer)clearTimeout(retryTimer);
    retryTimer = null;
    const previous = socket;
    socket = null;
    previous?.close();
    state.status = "stopped";
  }
  if (enabled) {
    if (!token || !/^\d{15,25}$/.test(guildId)) {
      state.status = "misconfigured";
      state.error = "DISCORD_GUILD_ID et DISCORD_BOT_TOKEN sont nécessaires.";
    } else {
      connect();
    }
  }
  return { getStatus: () => ({...state}), close };
}
