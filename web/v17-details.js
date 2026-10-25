import "./v17-details.css";
import {canManageAccount, reportChoices, reportPending} from "./v17-detail-model.js";

const $ = (s,root=document)=>root.querySelector(s);
const $$ = (s,root=document)=>Array.from(root.querySelectorAll(s));
function el(tag,cls,text) {
  const element=document.createElement(tag);
  if(cls) element.className=cls;
  if(text!==undefined) element.textContent=String(text);
  return element;
}
function me(){
  try {
    if(!sessionStorage.getItem("pixel-token"))return null;
    return JSON.parse(sessionStorage.getItem("pixel-user")||"null");
  } catch {return null;}
}
function apiUrl(){
  return String(localStorage.getItem("pixel-api-base-url")||
    import.meta.env.VITE_API_BASE_URL||"/api").replace(/\/$/,"");
}
async function staffApi(path,opts={}){
  const token=sessionStorage.getItem("pixel-token");
  if(!token)throw Error("Session staff expirée ou absente.");
  const headers={Authorization:"Bearer "+token};
  if(apiUrl().includes(".ngrok-free.")) headers["ngrok-skip-browser-warning"]="pixel-everywhere";
  if(opts.body!==undefined) headers["Content-Type"]="application/json";
  const response=await fetch(apiUrl()+path,{method:opts.method||"GET",headers,
    body:opts.body===undefined?undefined:JSON.stringify(opts.body),cache:"no-store"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||"L'opération a échoué.");
  return data;
}
function showDate(value){
  if(!value)return "Non disponible";
  const raw=String(value);
  const date=new Date(raw.endsWith("Z")||/[+-]\d\d:\d\d$/.test(raw)?raw:raw+"Z");
  return Number.isNaN(date.getTime())?raw:
    new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"short"}).format(date);
}
function field(parent,key,value) {
  const row=el("div","v17-d-field");
  row.append(el("small","",key),el("strong","",value??"Non disponible"));
  parent.append(row);
}
function install() {
  const accounts=$("#staffAccountsList"),alerts=$("#staffAlertsList"),members=$("#memberControlList");
  if(!accounts||!alerts||!members||$("#v17DetailDialog"))return;

  const dialog=el("dialog","v17-d-dialog");
  dialog.id="v17DetailDialog";
  const shell=el("div","v17-d-shell");
  const heading=el("header","v17-d-heading");
  const headings=el("div","");
  const overline=el("p","eyebrow","Pixel Everywhere · v1.7");
  const title=el("h2","","Détails");
  headings.append(overline,title);
  const close=el("button","v17-d-close","×");
  close.type="button";close.setAttribute("aria-label","Fermer");
  heading.append(headings,close);
  const body=el("div","v17-d-body");
  const status=el("p","v17-d-status");
  status.setAttribute("role","status");
  const actions=el("div","v17-d-actions");
  const confirmBox=el("div","v17-d-confirm");
  confirmBox.hidden=true;
  const confirmText=el("p","");
  const confirmButtons=el("div","v17-d-confirm-buttons");
  const cancel=el("button","v17-d-neutral","Annuler");
  cancel.type="button";
  const accept=el("button","v17-d-danger","Confirmer");
  accept.type="button";
  confirmButtons.append(cancel,accept);
  confirmBox.append(confirmText,confirmButtons);
  shell.append(heading,body,status,actions,confirmBox);
  dialog.append(shell);document.body.append(dialog);

  let pending=null;
  function clearConfirmation() {
    pending=null;confirmBox.hidden=true;actions.hidden=false;
  }
  function closeDetails(){clearConfirmation();if(dialog.open)dialog.close();}
  close.addEventListener("click",closeDetails);
  cancel.addEventListener("click",clearConfirmation);
  dialog.addEventListener("cancel",(e)=>{if(pending){e.preventDefault();clearConfirmation();}});
  function begin(name){
    clearConfirmation();
    title.textContent=name;
    body.replaceChildren(el("p","","Chargement…"));
    status.textContent="";actions.replaceChildren();
    if(!dialog.open)dialog.showModal();
  }
  function ask(text,run,destructive=false){
    pending=run;confirmText.textContent=text;
    accept.className=destructive?"v17-d-danger":"v17-d-primary";
    confirmBox.hidden=false;actions.hidden=true;
  }
  accept.addEventListener("click",async()=>{
    if(!pending)return;
    const fn=pending;
    accept.disabled=true;status.textContent="";
    try{await fn();}
    catch(error){status.textContent=error.message;clearConfirmation();}
    finally{accept.disabled=false;}
  });
  function addAction(label,fn,cls="neutral"){
    const button=el("button","v17-d-"+cls,label);
    button.type="button";button.addEventListener("click",fn);actions.append(button);
  }
  function refresh(tab){
    const target=$('.staff-tabs [data-staff-tab="'+tab+'"]');
    if(target)target.click();
  }
  async function accountDetail(card) {
    if(me()?.role!=="admin")return;
    const id=Number(card.dataset.v17AccountId);
    if(!Number.isInteger(id)||id<=0)return;
    begin("Compte staff");
    try{
      const result=await staffApi("/admin/accounts");
      const account=(result.accounts||[]).find(a=>Number(a.id)===id);
      if(!account)throw Error("Compte introuvable.");
      title.textContent=account.username;
      const grid=el("div","v17-d-grid");
      field(grid,"Identifiant",account.username);
      field(grid,"Rôle",account.role==="admin"?"Administrateur":"Modérateur");
      field(grid,"État",account.active?"Actif":"Désactivé");
      field(grid,"Inscription",showDate(account.createdAt||account.created_at));
      field(grid,"Mot de passe",account.mustChangePassword?"À changer":"Personnel");
      field(grid,"Discord","Association Discord prévue pour une prochaine étape.");
      body.replaceChildren(grid);
      if(!canManageAccount(account,me()?.id)){
        status.textContent=account.isOwnerAdmin?"Compte propriétaire protégé.":"Modification de ton propre compte interdite.";
        return;
      }
      addAction(account.active?"Désactiver":"Réactiver",()=>ask(
        account.active?"Désactiver "+account.username+" ? Il ne pourra plus se connecter.":"Réactiver "+account.username+" ?",
        async()=>{await staffApi("/admin/accounts/"+id+"/toggle",{method:"PATCH"});closeDetails();refresh("accounts");},
        account.active
      ),account.active?"danger":"primary");
      addAction("Supprimer…",()=>ask(
        "Supprimer définitivement le compte "+account.username+" ? L'accès sera révoqué, mais son historique restera conservé.",
        async()=>{await staffApi("/admin/accounts/"+id,{method:"DELETE"});closeDetails();refresh("accounts");},true
      ));
    }catch(error){body.replaceChildren(el("p","","Impossible d'afficher cette fiche."));status.textContent=error.message;}
  }
  async function reportDetail(card){
    if(!me())return;
    const id=Number(card.dataset.v17AlertId);
    if(!Number.isInteger(id)||id<=0)return;
    begin("Détail du rapport");
    try{
      const result=await staffApi("/staff/alerts");
      const record=(result.alerts||[]).find(x=>Number(x.id)===id);
      if(!record)throw Error("Ce dossier n'est plus disponible.");
      const bug=record.alert_type==="bug_report";
      title.textContent=bug?"Signalement de bug":"Demande de conversion XP";
      const grid=el("div","v17-d-grid");
      field(grid,"Référence","#"+record.reference_id);
      field(grid,"Reçu le",showDate(record.created_at));
      field(grid,"État",record.resolved?"Traité":"En attente");
      const message=el("section","v17-d-message");
      message.append(el("small","","Contenu du dossier"),el("p","",record.body||""));
      body.replaceChildren(grid,message);
      if(!reportPending(record))return;
      for(const choice of reportChoices(record.alert_type)){
        addAction(choice.label,()=>ask(choice.message,async()=>{
          const latest=await staffApi("/staff/alerts");
          const active=(latest.alerts||[]).find(x=>Number(x.id)===id);
          if(!reportPending(active))throw Error("Cette demande a déjà été traitée.");
          const path=bug?"/staff/bug-reports/":"/staff/xp-conversions/";
          const decision=choice.key==="approve"?(bug?"approved":"completed"):"rejected";
          await staffApi(path+record.reference_id+"/decision",{method:"POST",body:{decision}});
          closeDetails();refresh("messages");
        },choice.key==="reject"),choice.key==="approve"?"primary":"danger");
      }
    }catch(error){body.replaceChildren(el("p","","Impossible d'afficher ce dossier."));status.textContent=error.message;}
  }
  async function memberDetail(card){
    if(me()?.role!=="admin")return;
    const id=Number(card.dataset.memberId);
    if(!Number.isInteger(id)||id<=0)return;
    begin("Profil membre");
    try{
      const result=await staffApi("/admin/live-control");
      const member=(result.members||[]).find(x=>Number(x.id)===id);
      if(!member)throw Error("Membre introuvable.");
      title.textContent=member.displayName||member.username;
      const grid=el("div","v17-d-grid");
      field(grid,"Compte","@"+member.username);
      field(grid,"Pièces",Number(member.points||0).toLocaleString("fr-FR"));
      field(grid,"Inscription",showDate(member.createdAt));
      field(grid,"Dernière présence",showDate(member.lastSeenAt));
      field(grid,"Plateforme",member.lastPlatform||"Non disponible");
      field(grid,"Dernière page",member.lastPage||"Non disponible");
      field(grid,"Discord","Liaison prévue pour une prochaine étape v1.7.");
      body.replaceChildren(grid);
      addAction("Modifier les pièces",()=>{
        closeDetails();card.scrollIntoView({block:"center",behavior:"smooth"});
        $('input[name="amount"]',card)?.focus();
      },"primary");
    }catch(error){body.replaceChildren(el("p","","Impossible d'afficher le membre."));status.textContent=error.message;}
  }
  function addButtons(list,selector,text) {
    for(const card of $$(selector,list)) {
      if(card.dataset.v17DetailsReady)continue;
      card.dataset.v17DetailsReady="yes";
      const button=el("button","v17-d-open",text);
      button.type="button";
      card.append(button);
    }
  }
  function decorate() {
    if(me()?.role==="admin"){
      addButtons(accounts,".account-card[data-v17-account-id]","Voir la fiche");
      addButtons(members,".member-control-card[data-member-id]","Voir le profil");
    }
    if(me()) addButtons(alerts,".staff-alert-card[data-v17-alert-id]","Voir le dossier");
  }
  function listen(list,selector,fn){
    list.addEventListener("click",event=>{
      const btn=event.target.closest(".v17-d-open");
      if(!btn||!list.contains(btn))return;
      const card=btn.closest(selector);
      if(card)fn(card);
    });
    new MutationObserver(decorate).observe(list,{childList:true});
  }
  listen(accounts,".account-card",accountDetail);
  listen(alerts,".staff-alert-card",reportDetail);
  listen(members,".member-control-card",memberDetail);
  decorate();
}
install();
