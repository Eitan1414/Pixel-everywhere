import "./v17-discord.css";

const $ = (s,root=document)=>root.querySelector(s);
function node(tag,cls,text) {
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  if(text!==undefined)n.textContent=String(text);
  return n;
}
function apiBase(){
 return String(localStorage.getItem("pixel-api-base-url") || import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/,"");
}
async function callAPI(path,kind="member",method="GET",body){
 const token=kind==="guest"?"":kind==="staff"?sessionStorage.getItem("pixel-token"):localStorage.getItem("pixel-member-token");
 if(kind!=="guest"&&!token)throw Error("Connecte-toi d'abord à Pixel Everywhere.");
 const headers=token?{Authorization:"Bearer "+token}:{};
 if(body!==undefined)headers["Content-Type"]="application/json";
 if(apiBase().includes(".ngrok-free."))headers["ngrok-skip-browser-warning"]="pixel-everywhere";
 let response;
 try { response=await fetch(apiBase()+path,{method,headers,cache:"no-store",body:body===undefined?undefined:JSON.stringify(body)}); }
 catch { throw Error("Impossible de joindre le serveur PDD. Vérifie la connexion et l'adresse du serveur."); }
 const contentType=String(response.headers.get("content-type")||"").toLowerCase();
 if(!contentType.includes("application/json")) {
  throw Error("Réponse inattendue du serveur PDD (page HTML ou avertissement ngrok). Vérifie l'adresse du serveur.");
 }
 const data=await response.json().catch(()=>{throw Error("Réponse JSON invalide du serveur PDD.");});
 if(!response.ok)throw Error(data.error||"Une erreur s'est produite.");
 return data;
}
function showPage(page) {
 document.querySelectorAll(".page.active").forEach(n=>n.classList.remove("active"));
 page.classList.add("active");
 window.scrollTo({top:0,behavior:"smooth"});
}
function makeMemberPage(){
 const main=$("#mainContent"),grid=$("#page-home .feature-grid");
 if(!main||!grid||$("#page-v17-discord"))return;
 const page=node("section","page v17-discord-page");
 page.id="page-v17-discord";
 page.append(node("p","eyebrow","Pixel Everywhere · Discord"),node("h2","","Lier mon compte Discord"));
 const card=node("article","v17-discord-card");
 const status=node("p","v17-discord-muted","Vérification du compte Discord…");
 status.setAttribute("role","status");
 const identity=node("div","v17-discord-identity");
 const actions=node("div","v17-discord-actions");
 const connect=node("button","v17-discord-primary","Préparer la connexion Discord");
 const refresh=node("button","v17-discord-secondary","Actualiser l'état");
 const unlink=node("button","v17-discord-danger","Délier Discord");
 const open=node("a","v17-discord-link","Ouvrir Discord pour autoriser");
 for(const button of [connect,refresh,unlink])button.type="button";
 open.target="_blank";open.rel="noopener noreferrer";open.hidden=true;unlink.hidden=true;
 actions.append(connect,open,refresh,unlink);
 card.append(status,identity,actions);
 page.append(node("p","v17-discord-muted","Associe ton compte via la page officielle Discord. Aucun mot de passe Discord n'est demandé dans l'application."),card,
   node("p","v17-discord-muted","Après l'autorisation dans le navigateur, reviens ici et appuie sur Actualiser."));
 main.append(page);
 let pendingAuth=null;
 let loading=false;
 function clearPendingAuth(){
  pendingAuth=null;open.hidden=true;open.removeAttribute("href");
 }
 function hasValidPendingAuth(){
  return Boolean(pendingAuth &&
   pendingAuth.memberToken===localStorage.getItem("pixel-member-token") &&
   Date.now()<pendingAuth.expiresAt);
 }
 async function load(){
  if(loading)return;
  loading=true;
  connect.disabled=true;refresh.disabled=true;
  if(!hasValidPendingAuth())clearPendingAuth();
  try{
   const result=await callAPI("/members/discord/link");
   identity.replaceChildren();
   if(result.linked&&result.discord) {
    clearPendingAuth();
    status.textContent="Compte Discord lié ✓";
    identity.append(node("strong","",result.discord.displayName),node("small","","@"+result.discord.username));
   } else {
    if(!result.configured)clearPendingAuth();
    status.textContent=!result.configured
     ?"L'intégration Discord n'est pas encore configurée sur Termux."
     :hasValidPendingAuth()
      ?"Autorisation Discord en attente. Reviens ici après l'avoir acceptée."
      :"Aucun compte Discord lié.";
   }
   open.hidden=!hasValidPendingAuth();
   connect.hidden=result.linked||!result.configured;
   unlink.hidden=!result.linked;
  }catch(err){status.textContent=err.message;connect.hidden=true;unlink.hidden=true;}
  finally{connect.disabled=false;refresh.disabled=false;loading=false;}
 }
 connect.addEventListener("click",async()=>{
  connect.disabled=true;status.textContent="Préparation de l'autorisation…";
  try{
   const result=await callAPI("/members/discord/link/start","member","POST");
   const url=new URL(result.authorizationUrl);
   if(url.protocol!=="https:"||url.hostname!=="discord.com")throw Error("Lien Discord non valide.");
   pendingAuth={
    memberToken:localStorage.getItem("pixel-member-token"),
    expiresAt:Date.now()+Math.max(1,Number(result.expiresInSeconds)||600)*1000
   };
   open.href=url.href;open.hidden=false;
   status.textContent="Le lien est prêt. Ouvre Discord avec le bouton ci-dessous.";
  }catch(err){status.textContent=err.message;}
  finally{connect.disabled=false;}
 });
 refresh.addEventListener("click",load);
 unlink.addEventListener("click",async()=>{
  if(!window.confirm("Délier Discord de ton compte Pixel Everywhere ?"))return;
  unlink.disabled=true;
  try{await callAPI("/members/discord/link","member","DELETE");clearPendingAuth();await load();}
  catch(err){status.textContent=err.message;}
  finally{unlink.disabled=false;}
 });
 const feature=node("button","feature-card");feature.type="button";
 const icon=node("span","feature-icon purple","⌁");
 const label=node("span","");
 label.append(node("strong","","Compte Discord"),node("small","","Liaison du compte Discord"));
 feature.append(icon,label);
 feature.addEventListener("click",()=>{showPage(page);void load();});
 const refreshOnReturn=()=>{
  if(document.visibilityState!=="hidden"&&page.classList.contains("active")&&pendingAuth)void load();
 };
 window.addEventListener("focus",refreshOnReturn);
 document.addEventListener("visibilitychange",refreshOnReturn);
 grid.append(feature);
}

function makeStaffPanel(){
 const tabs=$(".staff-tabs"),workspace=$("#staffWorkspace");
 if(!tabs||!workspace||$("#staff-discord-activity"))return;
 const tab=node("button","","Activité Discord");tab.type="button";tab.dataset.staffTab="discord-activity";
 tabs.append(tab);
 const panel=node("section","staff-panel v17-discord-staff");panel.id="staff-discord-activity";
 const head=node("div","v17-discord-staff-heading");
 head.append(node("h3","","Discord Activity Center"));
 const refresh=node("button","v17-discord-secondary","↻ Actualiser");refresh.type="button";
 head.append(refresh);
 const status=node("p","v17-discord-muted","Données du serveur Discord PDD");
 status.setAttribute("role","status");
 const stats=node("div","v17-discord-stats"),announcements=node("div","v17-discord-announcements");
 panel.append(head,status,stats,node("h4","","Dernières annonces Discord"),announcements,
  node("p","v17-discord-muted","Statistiques approximatives, actualisées au plus une fois par minute. Le journal complet des arrivées/départs nécessitera Discord Gateway."));
 workspace.append(panel);
 async function load(){
  refresh.disabled=true;status.textContent="Lecture du serveur Discord…";
  try{
   const result=await callAPI("/staff/discord/activity","staff");
   status.textContent=result.guildName+" · Relevé "+new Date(result.generatedAt).toLocaleTimeString("fr-FR");
   stats.replaceChildren();
   for(const [label,value] of [["Membres ≈",result.memberCount],["En ligne ≈",result.onlineCount],["Comptes liés",result.linkedAccounts]]) {
    const box=node("article","v17-discord-stat");
    box.append(node("strong","",value==null?"—":Number(value).toLocaleString("fr-FR")),node("small","",label));
    stats.append(box);
   }
   announcements.replaceChildren();
   if(!result.announcements?.length)announcements.append(node("p","v17-discord-muted","Aucune annonce récente accessible."));
   else for(const item of result.announcements){
    const box=node("article","v17-discord-announcement");
    box.append(node("strong","",item.author||"PDD"),
     node("small","",item.createdAt?new Date(item.createdAt).toLocaleString("fr-FR"):""),
     node("p","",item.text||"Annonce sans texte"));
    announcements.append(box);
   }
  }catch(err){status.textContent=err.message;stats.replaceChildren();announcements.replaceChildren();}
  finally{refresh.disabled=false;}
 }
 refresh.addEventListener("click",load);
 tab.addEventListener("click",load);
}

function makeDiscordLogin(){
 const guest=$("#memberGuest");
 if(!guest||$("#v17DiscordLoginButton"))return;
 const area=node("div","v17-discord-login");
 const heading=node("p","v17-discord-muted",
  "Ou connecte-toi avec ton compte Discord déjà associé à Pixel Everywhere.");
 const start=node("button","v17-discord-login-button","Se connecter avec Discord");
 start.id="v17DiscordLoginButton";start.type="button";
 const open=node("a","v17-discord-login-continue","Autoriser avec Discord");
 open.target="_blank";open.rel="noopener noreferrer";open.hidden=true;
 const refresh=node("button","v17-discord-secondary","J'ai autorisé, vérifier");
 refresh.type="button";refresh.hidden=true;
 const cancel=node("button","v17-discord-secondary","Annuler");
 cancel.type="button";cancel.hidden=true;
 const status=node("p","v17-discord-muted","");
 status.setAttribute("role","status");status.setAttribute("aria-live","polite");
 area.append(heading,start,open,refresh,cancel,status);
 guest.append(area);
 let pending=null;
 let busy=false;
 let timer=null;
 function clearAttempt(){
  pending=null;
  if(timer!==null){window.clearTimeout(timer);timer=null;}
  start.disabled=false;
  open.hidden=true;open.removeAttribute("href");
  refresh.hidden=true;cancel.hidden=true;
 }
 async function finish(){
  if(busy||!pending)return;
  if(localStorage.getItem("pixel-member-token")){clearAttempt();return;}
  if(Date.now()>=pending.expiresAt){
   clearAttempt();status.textContent="L'autorisation Discord a expiré. Recommence la connexion.";return;
  }
  busy=true;refresh.disabled=true;
  try{
   const result=await callAPI("/members/discord/login/finish","guest","POST",{
    requestId:pending.requestId,claimKey:pending.claimKey
   });
   if(result.status==="pending"){
    status.textContent="En attente de la confirmation Discord…";
   }else if(result.token&&result.member){
    clearAttempt();
    status.textContent="Connexion Discord réussie !";
    window.dispatchEvent(new CustomEvent("pixel:discord-member-login",{
     detail:{token:result.token,member:result.member}
    }));
   }else{
    throw Error("Le serveur n'a pas renvoyé de session membre valide.");
   }
  }catch(error){
   status.textContent=error.message;
   if(/expir|annul|associ|utilis|refus|invalide/.test(error.message.toLowerCase()))clearAttempt();
  }finally{busy=false;refresh.disabled=false;}
 }
 function onReturn(){
  if(!pending||document.visibilityState==="hidden")return;
  if(timer!==null)window.clearTimeout(timer);
  let remaining=6;
  const retry=async()=>{
   timer=null;
   await finish();
   if(pending&&remaining-->0&&document.visibilityState!=="hidden"){
    timer=window.setTimeout(retry,1800);
   }
  };
  void retry();
 }
 start.addEventListener("click",async()=>{
  start.disabled=true;status.textContent="Préparation de la connexion Discord…";
  try{
   const response=await callAPI("/members/discord/login/start","guest","POST");
   const url=new URL(response.authorizationUrl);
   if(url.protocol!=="https:"||url.hostname!=="discord.com"||
    typeof response.requestId!=="string"||typeof response.claimKey!=="string"){
    throw Error("Lien Discord non valide.");
   }
   pending={
    requestId:response.requestId,claimKey:response.claimKey,
    expiresAt:Date.now()+Math.max(1,Number(response.expiresInSeconds)||600)*1000
   };
   open.href=url.href;open.hidden=false;refresh.hidden=false;cancel.hidden=false;
   status.textContent="Ouvre Discord, autorise l'accès puis reviens dans PE.";
  }catch(error){status.textContent=error.message;start.disabled=false;}
 });
 refresh.addEventListener("click",onReturn);
 cancel.addEventListener("click",()=>{
  clearAttempt();status.textContent="Connexion Discord annulée sur cet appareil.";
 });
 window.addEventListener("focus",onReturn);
 document.addEventListener("visibilitychange",onReturn);
}

makeMemberPage();
makeDiscordLogin();
makeStaffPanel();
