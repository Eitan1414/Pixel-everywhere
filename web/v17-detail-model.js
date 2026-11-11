export function canManageAccount(a, viewerId) {
  return Boolean(a && Number.isInteger(Number(a.id)) && Number(a.id) > 0 &&
    Number(a.id) !== Number(viewerId) && !a.isOwnerAdmin);
}
export function reportChoices(type) {
  if(type==="bug_report") return [
    {key:"approve",label:"Valider · +50 pièces",message:"50 pièces seront attribuées au membre."},
    {key:"reject",label:"Refuser la récompense",message:"Le membre sera prévenu du refus."}
  ];
  if(type==="xp_conversion") return [
    {key:"approve",label:"Confirmer l'ajout des XP",message:"Confirme uniquement si les XP ont réellement été ajoutés."},
    {key:"reject",label:"Refuser et rembourser",message:"Les pièces réservées seront remboursées."}
  ];
  return [];
}
export function reportPending(a) {
  return Boolean(a && reportChoices(a.alert_type).length && !Number(a.resolved) && a.resolved!==true);
}
