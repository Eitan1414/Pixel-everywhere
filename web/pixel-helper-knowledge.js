const ROLE_LABELS = Object.freeze({
  guest: "visiteur",
  member: "membre",
  moderator: "modérateur",
  admin: "administrateur"
});

const ROLE_RANK = Object.freeze({ guest: 0, member: 1, moderator: 2, admin: 3 });

export function normalizeHelperText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-zA-Z0-9@#]+/g, " ")
    .trim()
    .toLowerCase();
}

export function helperRoleLabel(role) {
  return ROLE_LABELS[role] || ROLE_LABELS.guest;
}

export function roleAtLeast(role, requiredRole) {
  return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[requiredRole] ?? 0);
}

function answerByRole(role, answers) {
  if (typeof answers === "string") return answers;
  if (answers[role]) return answers[role];
  if (role === "admin" && answers.moderator) return answers.moderator;
  if (role !== "guest" && answers.member) return answers.member;
  return answers.guest || answers.default || "Je n’ai pas encore de fiche précise pour ce sujet.";
}

function topic({
  id,
  bots = ["guide"],
  roles = ["guest", "member", "moderator", "admin"],
  keywords = [],
  phrases = [],
  pageHints = [],
  action = "",
  actionLabel = "",
  answers
}) {
  return Object.freeze({ id, bots, roles, keywords, phrases, pageHints, action, actionLabel, answers });
}

const GUIDE_TOPICS = Object.freeze([
  topic({
    id: "overview",
    keywords: ["aide", "aider", "possible", "fonction", "outil", "categorie", "menu", "guide", "pixel helper", "quoi faire"],
    phrases: ["que peux tu faire", "comment fonctionne l application", "montre moi les outils", "liste des categories"],
    answers: {
      default: "Je peux t’indiquer où se trouvent les catégories, expliquer les outils, préciser les droits d’un visiteur, d’un membre, d’un modérateur ou d’un administrateur, et ouvrir directement la plupart des écrans. Demande-moi par exemple où sont le chat public, les MP, les annonces, Mon Pixel, les candidatures, les idées, la création, les avis ou l’espace staff."
    }
  }),
  topic({
    id: "home",
    keywords: ["accueil", "discord", "invitation", "rejoindre serveur", "serveur pdd", "bienvenue"],
    phrases: ["ou est le lien discord", "comment rejoindre pdd", "retour accueil"],
    pageHints: ["home"],
    action: "open-home",
    actionLabel: "Ouvrir l’accueil",
    answers: {
      default: "L’Accueil présente Pixel Everywhere et contient le bouton pour rejoindre le serveur Discord PDD. Tu peux aussi revenir à l’Accueil en touchant le logo Pixel Everywhere en haut ou l’icône Accueil dans la barre du bas."
    }
  }),
  topic({
    id: "announcements",
    keywords: ["annonce", "annonces", "nouveaute", "actualite", "update log", "journal version", "release note", "version"],
    phrases: ["ou voir les mises a jour", "quoi de neuf", "derniere version"],
    pageHints: ["announcements"],
    action: "open-announcements",
    actionLabel: "Ouvrir les annonces",
    answers: {
      default: "La catégorie Annonces regroupe les annonces du serveur, les annonces de l’application et l’Update log. Utilise les sous-catégories pour n’afficher qu’un type de contenu, puis le bouton ↻ pour actualiser."
    }
  }),
  topic({
    id: "updates",
    keywords: ["mise a jour", "mettre a jour", "telecharger apk", "apk", "windows", "macos", "ios", "installer version"],
    phrases: ["comment installer la mise a jour", "ou telecharger la nouvelle version", "mise a jour manuelle"],
    action: "open-announcements",
    actionLabel: "Voir les mises à jour",
    answers: {
      guest: "Les nouvelles versions sont annoncées dans Annonces, avec un lien adapté à Android, Windows ou macOS lorsqu’il est disponible. L’installation reste manuelle : télécharge le fichier, puis confirme l’installation avec ton appareil.",
      member: "Les nouvelles versions sont annoncées dans Annonces et Pixel Helper peut afficher un guide adapté à ton appareil. Télécharge le fichier proposé, ouvre-le, puis suis la confirmation Android, Windows ou macOS.",
      moderator: "Tu peux installer une mise à jour comme un membre. La publication d’un nouveau fichier ou la modification des liens de version reste réservée aux administrateurs.",
      admin: "Pour publier une version, ouvre l’espace administrateur des mises à jour, renseigne les numéros et notes, puis envoie les fichiers Android, Windows et macOS concernés. Vérifie ensuite les liens depuis Annonces avant de prévenir les membres."
    }
  }),
  topic({
    id: "public-chat",
    keywords: ["chat", "salon", "public", "message public", "mention", "@admin", "@moderateur", "@membre", "pseudo"],
    phrases: ["comment parler dans le chat", "ou est le chat public", "comment mentionner quelqu un"],
    action: "open-chat",
    actionLabel: "Ouvrir # Chat public",
    answers: {
      guest: "Le chat public est réservé aux comptes connectés. Ouvre Compte, crée ou connecte un compte membre, puis ouvre la catégorie # Chat public.",
      member: "Dans # Chat public, écris ton message puis utilise les mentions @Admin, @Modérateur, @Membre ou le pseudo exact d’une personne. Évite le spam et ne partage aucune information privée.",
      moderator: "Tu peux discuter dans le chat avec ton profil membre lié au compte staff. Tes mentions et ton rôle sont visibles ; utilise Pixel Guard pour préparer une réaction prudente si un échange devient problématique.",
      admin: "Ton compte administrateur possède aussi un profil membre lié. Tu peux écrire dans le chat, utiliser les mentions de rôle et accéder aux outils staff sans créer un deuxième compte."
    }
  }),
  topic({
    id: "direct-messages",
    keywords: ["mp", "message prive", "messages prives", "messagerie", "boite", "inbox", "conversation", "repondre"],
    phrases: ["comment envoyer un mp", "ou sont mes messages", "parler en prive"],
    action: "open-mp",
    actionLabel: "Ouvrir la messagerie",
    answers: {
      guest: "La messagerie nécessite un compte. Ouvre Compte, connecte-toi comme membre ou staff, puis touche l’enveloppe en haut.",
      member: "Touche l’enveloppe en haut pour ouvrir Ma messagerie. L’onglet des MP permet de choisir un membre, d’ouvrir une conversation et de répondre ; les messages officiels du staff restent séparés.",
      moderator: "Ta boîte staff et tes MP membre sont accessibles avec le même compte. Vérifie l’onglet actif avant de répondre afin de ne pas confondre une conversation privée avec une demande officielle.",
      admin: "Tu disposes des MP membre et de la boîte administrateur. Les échanges privés entre membres ne doivent être consultés ou modérés que par les outils prévus et selon les règles de PDD."
    }
  }),
  topic({
    id: "account",
    keywords: ["compte", "connexion", "connecter", "inscription", "creer compte", "mot de passe", "deconnexion", "session"],
    phrases: ["comment me connecter", "comment creer un compte", "compte membre ou staff"],
    action: "open-account",
    actionLabel: "Ouvrir mon compte",
    answers: {
      guest: "Ouvre Compte en haut à droite. Choisis Compte membre pour t’inscrire ou te connecter ; l’onglet Compte staff est réservé aux identifiants créés par un administrateur.",
      member: "Dans Compte, tu peux voir ton identité, tes pièces, ouvrir la messagerie, signaler un bug, demander une conversion en XP, gérer les notifications ou te déconnecter.",
      moderator: "Le même panneau donne accès à ta session staff et à ton profil membre lié. Utilise Ouvrir l’espace staff pour les outils de modération et l’onglet membre pour les fonctions communautaires.",
      admin: "Ton compte donne accès aux fonctions membre, au staff et au Panel admin. Ne partage jamais ton mot de passe temporaire ou personnel."
    }
  }),
  topic({
    id: "rights",
    keywords: ["droit", "droits", "permission", "acces", "role", "membre", "moderateur", "modo", "administrateur", "admin", "staff"],
    phrases: ["qui peut faire quoi", "difference membre moderateur admin", "mes permissions"],
    answers: {
      guest: "Un visiteur peut consulter les écrans publics comme l’Accueil, les Annonces et les Crédits. Un compte membre débloque le chat, les MP, Mon Pixel, les candidatures, les avis et les demandes. Les modérateurs et administrateurs ont en plus l’espace staff.",
      member: "Un membre peut utiliser le chat, les MP, Mon Pixel, envoyer une candidature, noter l’application, proposer des idées, signaler un bug et demander une conversion en XP. Les outils de traitement et de sanction restent réservés au staff.",
      moderator: "Un modérateur possède les droits membre plus l’accès aux candidatures, messages, avis et outils de modération. Il ne peut pas créer ou désactiver les comptes staff ni modifier les réglages réservés aux administrateurs.",
      admin: "Un administrateur possède les droits membre et modérateur, plus le Panel admin : création, activation ou désactivation des comptes staff, réglages et publication des mises à jour selon les outils disponibles."
    }
  }),
  topic({
    id: "pixel",
    keywords: ["mon pixel", "tamagotchi", "mascotte", "nourrir", "jouer", "promener", "dormir", "caresser", "faim", "joie", "energie", "niveau"],
    phrases: ["comment utiliser pixel", "prendre soin de pixel", "actions pixel"],
    pageHints: ["pixel"],
    action: "open-pixel",
    actionLabel: "Ouvrir Mon Pixel",
    answers: {
      guest: "Tu peux voir Mon Pixel, mais un compte membre est nécessaire pour enregistrer les actions et les pièces. Connecte-toi d’abord depuis Compte.",
      default: "Dans Mon Pixel, touche les boutons Nourrir, Jouer, Promener ou Dormir. Chaque action coûte des pièces et possède un délai anti-spam ; les jauges de faim, joie et énergie évoluent, et le journal résume les dernières actions."
    }
  }),
  topic({
    id: "coins",
    keywords: ["piece", "pieces", "diamant", "portefeuille", "gagner", "cout", "boutique", "xp", "conversion"],
    phrases: ["comment gagner des pieces", "convertir en xp", "a quoi servent les pieces"],
    action: "open-pixel",
    actionLabel: "Voir Mon Pixel",
    answers: {
      guest: "Les pièces sont liées à un compte membre. Connecte-toi pour voir ton portefeuille et utiliser Mon Pixel.",
      default: "Les pièces servent aux actions et à la boutique de Mon Pixel. Le portefeuille est visible en haut ; depuis Compte, tu peux aussi envoyer une demande de conversion de pièces en XP PDD au staff. Une demande doit ensuite être vérifiée par un humain."
    }
  }),
  topic({
    id: "application",
    keywords: ["candidature", "postuler", "rejoindre staff", "devenir modo", "moderateur", "motivation", "age"],
    phrases: ["comment rejoindre le staff", "envoyer une candidature", "suivre ma candidature"],
    pageHints: ["application"],
    action: "open-application",
    actionLabel: "Ouvrir Candidature",
    answers: {
      guest: "La candidature exige un compte membre. Connecte-toi, ouvre Candidature, puis complète l’âge, le rôle souhaité, ton prénom, ton pseudo Discord et ta motivation.",
      member: "Ouvre Candidature, complète tous les champs avec des informations honnêtes puis envoie. Le résumé de ta demande permet de suivre son état ; évite d’envoyer plusieurs candidatures identiques.",
      moderator: "Les candidatures reçues se traitent dans l’espace staff. Lis la demande complète, échange avec l’équipe si nécessaire, puis utilise les décisions prévues sans promettre un rôle avant validation.",
      admin: "Tu peux examiner les candidatures et, après acceptation, créer le compte staff correspondant depuis le Panel admin avec un mot de passe temporaire."
    }
  }),
  topic({
    id: "suggestions",
    keywords: ["idee", "idees", "suggestion", "proposer", "amelioration", "fonctionnalite"],
    phrases: ["ou proposer une idee", "envoyer une suggestion"],
    action: "open-suggestions",
    actionLabel: "Ouvrir Idées",
    answers: {
      guest: "La catégorie Idées permet de découvrir les propositions, mais l’envoi peut demander un compte connecté.",
      default: "Dans Idées, décris clairement le besoin, le fonctionnement souhaité et l’intérêt pour la communauté. Évite les doublons et ajoute assez de détails pour que le staff puisse comprendre la proposition."
    }
  }),
  topic({
    id: "creation",
    keywords: ["creation", "studio", "dessin", "creer", "outil creatif", "projet", "modele"],
    phrases: ["ou est le studio", "comment utiliser creation", "outil de creation"],
    action: "open-creation",
    actionLabel: "Ouvrir Création",
    answers: {
      default: "La catégorie Création regroupe les outils créatifs disponibles dans l’application. Ouvre-la, choisis un type de création, complète les champs proposés puis utilise l’aperçu avant d’enregistrer ou de partager ton résultat."
    }
  }),
  topic({
    id: "rating",
    keywords: ["avis", "note", "noter", "etoile", "commentaire", "evaluation"],
    phrases: ["comment noter l application", "ou donner mon avis"],
    pageHints: ["rating"],
    action: "open-rating",
    actionLabel: "Noter l’application",
    answers: {
      guest: "Tu peux voir la note globale, mais publier un avis nécessite un compte membre.",
      member: "Ouvre Noter l’application, choisis de 1 à 5 étoiles, écris un commentaire utile puis enregistre. Tu peux expliquer ce qui fonctionne bien et ce qui devrait être amélioré.",
      moderator: "Les avis sont visibles dans l’onglet Avis de l’espace staff. Lis-les comme des retours produit ; ne traite pas une mauvaise note comme une infraction.",
      admin: "L’onglet Avis du staff affiche la moyenne et les commentaires. Utilise-les pour prioriser les corrections et les améliorations."
    }
  }),
  topic({
    id: "bug-report",
    keywords: ["bug", "probleme", "erreur", "crash", "freeze", "fige", "signalement", "report"],
    phrases: ["signaler un bug", "application ne marche pas", "envoyer un rapport"],
    action: "open-account",
    actionLabel: "Ouvrir Signaler un bug",
    answers: {
      guest: "Connecte un compte membre, puis ouvre Compte et Signaler un bug. Décris l’écran, l’action effectuée, le résultat obtenu et, si possible, le message d’erreur.",
      member: "Dans Compte, touche Signaler un bug. Indique la plateforme, la version, les étapes pour reproduire le problème et ce que tu attendais. Un signalement approuvé peut recevoir la récompense prévue par l’application.",
      moderator: "Les signalements arrivent dans la messagerie staff. Vérifie qu’ils sont reproductibles, demande des précisions sans réclamer de données privées, puis approuve seulement les rapports utiles et réels.",
      admin: "Classe les bugs par gravité et reproductibilité. Vérifie les logs et la version concernée avant de corriger, puis informe les membres via l’Update log."
    }
  }),
  topic({
    id: "notifications",
    keywords: ["notification", "notifications", "alerte", "autorisation", "rappel"],
    phrases: ["activer les notifications", "je ne recois pas les notifications"],
    action: "open-account",
    actionLabel: "Ouvrir les notifications",
    answers: {
      guest: "Les notifications sont liées à un compte membre et à l’autorisation de ton appareil.",
      default: "Ouvre Compte puis Activer les notifications. Accepte la demande du système ; si rien n’arrive, vérifie aussi les réglages Android, iOS, Windows ou macOS de Pixel Everywhere."
    }
  }),
  topic({
    id: "offline",
    keywords: ["hors ligne", "serveur inaccessible", "serveur ferme", "connexion", "ngrok", "termux", "offline", "reseau"],
    phrases: ["continuer hors ligne", "le serveur ne repond pas", "serveur pixel everywhere"],
    answers: {
      guest: "Quand le serveur est indisponible, tu peux continuer hors ligne pour consulter les écrans locaux. Les comptes, annonces actualisées, messages, candidatures et autres données en ligne restent temporairement indisponibles.",
      member: "Le mode hors ligne laisse l’interface accessible, mais il ne peut pas synchroniser le chat, les MP, les pièces, les candidatures ou les avis. Réessaie lorsque le serveur Termux ou l’URL publique est revenu.",
      moderator: "En panne serveur, n’effectue pas de décision staff depuis des données anciennes. Préviens l’équipe et attends le retour de la synchronisation avant de traiter les demandes.",
      admin: "Vérifie le processus Node dans Termux, l’URL configurée, le tunnel public et la route /health. Une fois le serveur rétabli, contrôle les fonctions de connexion et de messagerie avant l’annonce de retour."
    }
  }),
  topic({
    id: "staff-space",
    keywords: ["espace staff", "panel staff", "candidatures staff", "messages staff", "avis staff", "moderation"],
    phrases: ["ou est l espace staff", "ouvrir le panel moderation"],
    action: "open-staff",
    actionLabel: "Ouvrir l’espace staff",
    answers: {
      guest: "L’espace staff est réservé aux comptes autorisés. Un compte membre ordinaire ne peut pas l’ouvrir.",
      member: "L’espace staff n’est pas accessible avec un compte membre. Tu peux envoyer une candidature depuis la catégorie Candidature.",
      moderator: "Ouvre Compte, vérifie que la session staff est active, puis touche Ouvrir l’espace staff. Les onglets Candidatures, Messagerie et Avis sont disponibles selon tes droits.",
      admin: "L’espace staff contient Candidatures, Messagerie, Avis et Panel admin. Le Panel admin permet notamment de gérer les comptes staff."
    }
  }),
  topic({
    id: "admin-accounts",
    roles: ["guest", "member", "moderator", "admin"],
    keywords: ["creer compte staff", "supprimer compte", "desactiver compte", "panel admin", "mot de passe temporaire", "admin compte"],
    phrases: ["comment ajouter un moderateur", "gerer les comptes staff"],
    action: "open-staff",
    actionLabel: "Ouvrir le Panel admin",
    answers: {
      guest: "La gestion des comptes staff est réservée aux administrateurs.",
      member: "Un membre ne peut pas créer de compte staff. Il doit passer par une candidature et une validation humaine.",
      moderator: "Un modérateur ne peut pas créer, désactiver ou supprimer les comptes staff. Transmets la demande à un administrateur.",
      admin: "Dans Espace staff > Panel admin, saisis l’identifiant, un mot de passe temporaire et le rôle. Le nouveau membre du staff devra remplacer ce mot de passe. Tu peux aussi activer, désactiver ou supprimer les comptes selon les protections prévues."
    }
  }),
  topic({
    id: "privacy",
    keywords: ["confidentialite", "prive", "donnee", "mot de passe", "token", "securite", "adresse", "telephone"],
    phrases: ["quelles informations partager", "proteger mon compte", "donnees personnelles"],
    answers: {
      default: "Ne partage jamais ton mot de passe, un token, une clé, ton adresse, ton numéro de téléphone ou une autre information sensible dans le chat, les MP, un bug report ou une candidature. Pixel Guide fonctionne avec des fiches locales et ne transmet pas tes questions à un service externe."
    }
  }),
  topic({
    id: "navigation",
    keywords: ["naviguer", "navigation", "swipe", "glisser", "retour", "bouton", "barre bas", "categorie introuvable"],
    phrases: ["comment changer de categorie", "je ne trouve pas un outil", "ou cliquer"],
    answers: {
      default: "Utilise la barre en bas pour les catégories principales et les boutons de l’Accueil pour les écrans complémentaires. Sur Mon Pixel, un glissement horizontal change de catégorie, tandis qu’un mouvement vertical doit seulement faire défiler la page. Pixel Guide peut aussi ouvrir directement l’écran correspondant."
    }
  }),
  topic({
    id: "credits",
    keywords: ["credit", "credits", "equipe", "createur", "developpeur", "qui a cree", "pdd"],
    phrases: ["qui a fait l application", "voir l equipe"],
    pageHints: ["credits"],
    action: "open-credits",
    actionLabel: "Ouvrir les Crédits",
    answers: {
      default: "La catégorie Crédits présente les créateurs, co-créateurs, responsables et modérateurs de Pixel Everywhere et de PDD."
    }
  })
]);

const MODERATION_TOPICS = Object.freeze([
  topic({
    id: "moderation-overview",
    bots: ["moderation"],
    keywords: ["aide", "moderation", "regle", "situation", "incident", "que faire", "conseil"],
    phrases: ["comment moderer", "analyse cette situation", "aide moi a reagir"],
    answers: {
      guest: "Pixel Guard peut expliquer les réflexes de sécurité, mais seuls les membres connectés peuvent contacter le staff depuis les outils prévus.",
      member: "Décris le type de problème sans recopier de donnée privée. Pixel Guard te dira comment conserver le contexte, bloquer l’escalade et prévenir le staff ; il ne sanctionne personne.",
      moderator: "Commence par vérifier les faits, le contexte, la répétition et l’impact. Choisis l’action la plus légère qui protège la communauté, note la décision, puis escalade vers un administrateur si nécessaire.",
      admin: "Vérifie les éléments disponibles, les décisions précédentes et les règles applicables. Pour un incident grave, sécurise d’abord la communauté, coordonne le staff et conserve une trace de la décision."
    }
  }),
  topic({
    id: "conflict",
    bots: ["moderation"],
    keywords: ["dispute", "conflit", "embrouille", "desaccord", "provocation", "insulte", "tension"],
    phrases: ["deux membres se disputent", "conversation qui degenere"],
    answers: {
      member: "Ne réponds pas par des insultes. Garde les messages utiles, coupe la conversation si elle s’aggrave et préviens le staff avec le contexte complet plutôt qu’une seule phrase isolée.",
      moderator: "Sépare un désaccord ponctuel d’une attaque répétée. Demande le calme, rappelle la règle concernée et déplace la discussion si nécessaire ; utilise un avertissement seulement si le comportement continue.",
      admin: "Si le conflit implique plusieurs membres ou le staff, désigne une personne neutre pour examiner les faits. Évite les décisions prises sous pression et documente les mesures retenues.",
      guest: "Évite d’alimenter la dispute et demande l’aide d’un membre du staff."
    }
  }),
  topic({
    id: "harassment",
    bots: ["moderation"],
    keywords: ["harcelement", "harceler", "cible", "repetition", "acharnement", "humiliation", "intimidation"],
    phrases: ["est ce du harcelement", "messages repetes contre quelqu un"],
    answers: {
      member: "Le harcèlement repose souvent sur la répétition, la cible et l’impact. Conserve les messages et dates, bloque la personne si nécessaire et contacte rapidement le staff ; ne mène pas d’enquête publique.",
      moderator: "Vérifie la répétition, le ciblage, les refus déjà exprimés et les espaces concernés. Protège d’abord la personne visée, limite le contact si nécessaire et fais vérifier toute sanction importante par un autre membre du staff.",
      admin: "Centralise les preuves, protège la victime et examine les antécédents sans exposer publiquement les détails. Une mesure temporaire peut précéder une décision définitive après vérification humaine.",
      guest: "Conserve les éléments sans les repartager et préviens le staff ou un adulte de confiance."
    }
  }),
  topic({
    id: "spam",
    bots: ["moderation"],
    keywords: ["spam", "flood", "repetition", "copier coller", "pub", "publicite", "messages rapides"],
    phrases: ["plusieurs messages de spam", "quelqu un flood"],
    answers: {
      member: "N’ajoute pas de réponses au flood. Signale le message ou préviens le staff, puis attends que le salon soit nettoyé.",
      moderator: "Supprime ou masque le contenu répétitif si l’outil le permet, rappelle la règle et utilise d’abord une mesure courte et réversible. Vérifie s’il s’agit d’une erreur, d’un bot ou d’une action coordonnée avant d’escalader.",
      admin: "En cas de spam massif, ralentis temporairement les salons, sécurise les comptes et vérifie les intégrations. Analyse ensuite l’origine avant de lever les protections.",
      guest: "Ignore les messages répétitifs et préviens le staff."
    }
  }),
  topic({
    id: "suspicious-link",
    bots: ["moderation"],
    keywords: ["lien", "arnaque", "phishing", "scam", "cadeau", "nitro", "telechargement", "fichier", "virus"],
    phrases: ["lien douteux", "est ce une arnaque", "faux cadeau"],
    answers: {
      member: "Ne clique pas, ne télécharge rien et ne saisis aucun mot de passe. Copie seulement l’adresse du message si c’est sûr, préviens le staff et change ton mot de passe si tu as déjà donné des informations.",
      moderator: "Masque le lien pour limiter les clics, vérifie le domaine sans l’ouvrir sur ton appareil principal et contacte l’auteur si son compte semble compromis. Avertis les membres exposés.",
      admin: "En plus du retrait, vérifie les comptes touchés, révoque les accès compromis et publie une alerte claire sans republier le lien actif.",
      guest: "Ne clique pas sur le lien et préviens immédiatement le staff."
    }
  }),
  topic({
    id: "personal-data",
    bots: ["moderation"],
    keywords: ["adresse", "telephone", "numero", "ecole", "nom complet", "photo privee", "dox", "information personnelle", "donnee personnelle"],
    phrases: ["quelqu un partage une information personnelle", "message avec une adresse"],
    answers: {
      member: "Ne cite pas et ne transfère pas l’information. Demande son retrait si tu peux le faire sans danger, préviens le staff et parle à un adulte de confiance si une personne mineure est concernée.",
      moderator: "Retire ou masque rapidement la donnée, limite sa diffusion et contacte la personne concernée en privé. Ne copie pas l’information dans les notes de modération sauf nécessité stricte.",
      admin: "Vérifie les sauvegardes et journaux accessibles, réduis l’exposition et informe les personnes concernées selon la gravité. Conserve uniquement les traces indispensables.",
      guest: "Ne repartage pas l’information et préviens le staff ou un adulte de confiance."
    }
  }),
  topic({
    id: "threat",
    bots: ["moderation"],
    keywords: ["menace", "danger", "violence", "suicide", "arme", "attaque", "urgence", "faire du mal"],
    phrases: ["menace immediate", "quelqu un risque de se blesser", "danger reel"],
    answers: {
      default: "En cas de danger immédiat ou de menace crédible, ne gère pas cela seul dans l’application. Préviens immédiatement un adulte de confiance, le staff et les services d’urgence locaux appropriés ; conserve le contexte sans diffuser publiquement les détails. Pixel Guard ne remplace pas les secours."
    }
  }),
  topic({
    id: "hate",
    bots: ["moderation"],
    keywords: ["haine", "racisme", "homophobie", "transphobie", "discrimination", "slur", "insulte discriminatoire"],
    phrases: ["message haineux", "attaque une communaute"],
    answers: {
      member: "Ne réponds pas par une autre attaque. Conserve le contexte, bloque la personne si nécessaire et contacte le staff.",
      moderator: "Protège la cible, retire le contenu selon les règles et vérifie s’il s’agit d’un usage hostile, d’une citation ou d’un contexte éducatif. Une attaque claire et ciblée justifie une escalade rapide.",
      admin: "Examine les antécédents, l’intention et l’impact, puis applique une mesure cohérente avec les règles. Informe le staff de la décision sans répéter les termes offensants.",
      guest: "Évite de répondre et préviens le staff."
    }
  }),
  topic({
    id: "sexual-content",
    bots: ["moderation"],
    keywords: ["sexuel", "nsfw", "nude", "photo intime", "contenu adulte", "grooming", "demande photo"],
    phrases: ["contenu sexuel", "demande une photo intime"],
    answers: {
      default: "Ne recopie pas et ne transfère pas le contenu. Si une personne mineure est impliquée, préviens immédiatement un adulte de confiance et le staff ; en cas de danger ou d’exploitation, contacte les autorités ou services compétents. Le staff doit limiter l’accès et éviter de conserver des copies inutiles."
    }
  }),
  topic({
    id: "impersonation",
    bots: ["moderation"],
    keywords: ["usurpation", "faux compte", "imite", "se fait passer", "impersonation", "pseudo similaire"],
    phrases: ["se fait passer pour un admin", "faux moderateur"],
    answers: {
      member: "Ne donne aucune information au faux compte. Vérifie le rôle officiel dans l’application ou Discord et préviens le staff.",
      moderator: "Compare les identifiants et rôles vérifiés, contacte la personne imitée et demande au compte suspect de cesser. Retire les messages trompeurs et escalade s’il cherche à obtenir des informations.",
      admin: "Sécurise les annonces officielles, vérifie les comptes compromis et informe la communauté du moyen correct d’identifier le staff.",
      guest: "Ne fais pas confiance au pseudo seul et préviens le staff."
    }
  }),
  topic({
    id: "raid",
    bots: ["moderation"],
    keywords: ["raid", "attaque serveur", "comptes massifs", "arrivee massive", "bot raid"],
    phrases: ["le serveur est raid", "beaucoup de faux comptes"],
    answers: {
      member: "N’interagis pas avec les comptes du raid. Coupe les notifications si nécessaire et laisse le staff sécuriser les salons.",
      moderator: "Active les mesures temporaires prévues : ralentissement, verrouillage limité et vérification renforcée. Note les comptes et heures, puis coordonne-toi avec un administrateur.",
      admin: "Sécurise les permissions, invitations et intégrations, applique les protections temporaires et répartis les tâches du staff. Ne rouvre les salons qu’après vérification.",
      guest: "Évite les messages suspects et attends les consignes officielles."
    }
  }),
  topic({
    id: "evidence",
    bots: ["moderation"],
    keywords: ["preuve", "capture", "contexte", "historique", "signalement", "temoin", "journal"],
    phrases: ["quelles preuves garder", "comment faire un signalement utile"],
    answers: {
      member: "Garde la date, le salon, les messages avant et après l’incident et les identifiants visibles. Ne modifie pas les captures et n’ajoute pas d’informations privées inutiles.",
      moderator: "Vérifie la source, le contexte complet et l’authenticité des éléments. Note ce qui est certain, ce qui est rapporté et ce qui reste à confirmer avant toute sanction.",
      admin: "Conserve une trace minimale mais suffisante de la décision et de ses motifs, avec un accès limité au staff concerné.",
      guest: "Conserve le contexte sans le publier et remets-le directement au staff."
    }
  }),
  topic({
    id: "sanctions",
    bots: ["moderation"],
    keywords: ["sanction", "avertissement", "mute", "timeout", "ban", "bannir", "exclure", "punition"],
    phrases: ["quelle sanction", "dois je bannir", "reaction proportionnee"],
    answers: {
      member: "Un membre ne doit pas décider ou appliquer une sanction. Signale les faits et laisse le staff vérifier le contexte.",
      moderator: "Privilégie une action proportionnée et réversible : rappel, avertissement ou mesure courte avant une exclusion longue, sauf danger clair. Vérifie toujours les faits et les règles avec un humain.",
      admin: "Pour une mesure lourde, vérifie le dossier, la cohérence avec les décisions précédentes et la possibilité d’appel. Documente la durée, le motif et les conditions de retour.",
      guest: "Préviens le staff au lieu de chercher à sanctionner toi-même."
    }
  }),
  topic({
    id: "appeal",
    bots: ["moderation"],
    keywords: ["appel", "contester", "sanction injuste", "debannissement", "unban", "reclamation"],
    phrases: ["contester une sanction", "demande de deban"],
    answers: {
      member: "Présente calmement les faits, la décision contestée et les éléments nouveaux. Évite les messages répétés ou les attaques contre le staff.",
      moderator: "Transmets l’appel à une personne qui n’a pas pris seule la décision initiale lorsque c’est possible. Vérifie les nouveaux éléments et réponds avec un motif clair.",
      admin: "Organise un réexamen impartial, compare les faits aux règles et indique si la sanction est maintenue, réduite ou levée. Garde une trace de la réponse.",
      guest: "Utilise le canal officiel de contact avec le staff et reste factuel."
    }
  })
]);

const ALL_TOPICS = Object.freeze([...GUIDE_TOPICS, ...MODERATION_TOPICS]);

function topicScore(item, normalizedQuestion, role, bot, page) {
  if (!item.bots.includes(bot) || !item.roles.includes(role)) return -1;
  let score = 0;
  for (const phrase of item.phrases) {
    const normalizedPhrase = normalizeHelperText(phrase);
    if (normalizedPhrase && normalizedQuestion.includes(normalizedPhrase)) score += 12;
  }
  for (const keyword of item.keywords) {
    const normalizedKeyword = normalizeHelperText(keyword);
    if (!normalizedKeyword) continue;
    if (normalizedQuestion === normalizedKeyword) score += 8;
    else if (normalizedQuestion.includes(normalizedKeyword)) score += normalizedKeyword.includes(" ") ? 6 : 3;
  }
  if (item.pageHints.includes(page)) score += 2;
  return score;
}

function fallbackAnswer({ bot, role, page }) {
  if (bot === "moderation") {
    if (role === "guest" || role === "member") {
      return "Je n’ai pas reconnu précisément la situation. Décris seulement le type de problème — dispute, spam, harcèlement, lien douteux, donnée privée, menace ou faux compte — sans recopier d’information sensible. Je te proposerai les étapes sûres pour prévenir le staff.";
    }
    return "Je n’ai pas reconnu précisément l’incident. Indique le type de comportement, s’il est répété, qui est exposé et ce qui a déjà été vérifié. Je proposerai une réponse proportionnée, mais la décision finale doit toujours être prise par un humain selon les règles de PDD.";
  }

  const location = page && page !== "inconnue"
    ? ` Tu es actuellement dans la catégorie « ${page} ».`
    : "";
  const roleHint = role === "guest"
    ? " Tu peux aussi me demander comment créer un compte membre."
    : role === "member"
      ? " Tu peux me demander tes droits de membre ou comment utiliser le chat, les MP, Mon Pixel, les candidatures, les idées, les avis et les bug reports."
      : role === "moderator"
        ? " Tu peux me demander les outils membre, l’espace staff, les candidatures, les avis ou une situation de modération."
        : " Tu peux me demander les outils membre, staff, Panel admin, comptes et mises à jour.";
  return `Je n’ai pas trouvé une fiche exacte pour cette formulation.${location}${roleHint}`;
}

export function resolvePixelHelperMessage({ bot = "guide", question = "", role = "guest", page = "inconnue" } = {}) {
  const safeBot = bot === "moderation" ? "moderation" : "guide";
  const safeRole = ROLE_LABELS[role] ? role : "guest";
  const normalizedQuestion = normalizeHelperText(question);
  if (!normalizedQuestion) {
    return { answer: fallbackAnswer({ bot: safeBot, role: safeRole, page }), topic: "fallback" };
  }

  let best = null;
  let bestScore = 0;
  for (const item of ALL_TOPICS) {
    const score = topicScore(item, normalizedQuestion, safeRole, safeBot, page);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }

  if (!best || bestScore < 3) {
    return { answer: fallbackAnswer({ bot: safeBot, role: safeRole, page }), topic: "fallback" };
  }

  return {
    answer: answerByRole(safeRole, best.answers),
    action: best.action,
    actionLabel: best.actionLabel,
    topic: best.id
  };
}

export function quickPromptsFor({ bot = "guide", role = "guest" } = {}) {
  if (bot === "moderation") {
    if (role === "moderator" || role === "admin") {
      return [
        "Deux membres se disputent : quelle réaction proportionnée ?",
        "Comment traiter plusieurs messages de spam ?",
        "Un membre a envoyé un lien douteux : que vérifier ?",
        "Quelles preuves conserver avant une sanction ?",
        "Comment traiter une demande de contestation ?"
      ];
    }
    return [
      "Deux membres se disputent : que dois-je faire ?",
      "Comment signaler du harcèlement sans aggraver la situation ?",
      "J’ai reçu un lien douteux : que faire ?",
      "Quelqu’un partage une information personnelle.",
      "Comment faire un signalement utile au staff ?"
    ];
  }

  const common = [
    "Où sont les annonces et l’Update log ?",
    "Comment fonctionne le chat public ?",
    "Comment envoyer un MP ?",
    "Comment utiliser Mon Pixel et les pièces ?"
  ];
  if (role === "guest") return [...common, "Comment créer un compte membre ?"];
  if (role === "member") return [...common, "Quels sont mes droits de membre ?", "Comment signaler un bug ?"];
  if (role === "moderator") return [...common, "Quels outils sont disponibles dans l’espace staff ?", "Que peut faire un modérateur ?"];
  return [...common, "Comment gérer les comptes staff ?", "Comment publier une mise à jour ?"];
}

export function helperKnowledgeStats() {
  return Object.freeze({
    guideTopics: GUIDE_TOPICS.length,
    moderationTopics: MODERATION_TOPICS.length,
    totalTopics: ALL_TOPICS.length,
    roles: Object.keys(ROLE_LABELS)
  });
}
