/** v1.7 staff navigation: UI visibility only; server authorizes every action. */
export const V17_STAFF_SECTIONS = Object.freeze([
 {id:"applications",tab:"applications",label:"Candidatures",description:"Dossiers, notes et décisions",icon:"✦"},
 {id:"reports",tab:"messages",label:"Rapports",description:"Signalements et demandes XP",icon:"!"},
 {id:"discussions",tab:"messages",label:"Discussions",description:"Messagerie interne du staff",icon:"☏"},
 {id:"announcements",tab:"publications",label:"Annonces",description:"Publications et journaux de versions",icon:"▤"},
 {id:"accounts",tab:"accounts",label:"Comptes staff",description:"Créer, activer ou désactiver",icon:"▣",adminOnly:true},
 {id:"members",tab:"live-control",label:"Utilisateurs",description:"Présences, comptes et pièces",icon:"◉",adminOnly:true},
 {id:"discord-activity",tab:"discord-activity",label:"Activité Discord",description:"Statistiques et annonces du serveur PDD",icon:"◎"},
 {id:"ratings",tab:"ratings",label:"Avis",description:"Retours sur l'application",icon:"★"}
]);
export function getV17StaffSections(role, availableTabs) {
 const normalized = String(role || "").toLowerCase();
 const admin = normalized === "admin";
 if (!admin && !["moderator","mod"].includes(normalized)) return [];
 const tabs = new Set(availableTabs || []);
 const sections = V17_STAFF_SECTIONS.filter(s => (!s.adminOnly || admin) && tabs.has(s.tab)).map(s=>({...s}));
 const known = new Set(V17_STAFF_SECTIONS.map(s=>s.tab));
 for (const tab of tabs) if (tab && !known.has(tab)) {
   sections.push({id:tab,tab,label:tab.replace(/[-_]/g," ").replace(/^./,c=>c.toUpperCase()),description:"Outil complémentaire du staff",icon:"◇"});
 }
 return sections;
}
