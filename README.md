# Pixel Everywhere

Application mobile officielle du serveur Discord **PDD — Pixel Difficult Drawer**,
une communauté consacrée au dessin, au gaming et au partage de créations.

## Fonctionnalités

- présentation du serveur et invitation `https://discord.gg/DbxADDbuzz` ;
- lecture du salon Discord d’annonces `1256623943494926407` ;
- création et connexion de comptes membres, séparés des comptes du staff ;
- candidature au staff réservée aux comptes membres connectés ;
- messagerie membre privée avec badge non lu et notifications locales ;
- acceptation d’une candidature avec création obligatoire d’identifiants
  modérateur temporaires et envoi automatique par **PDD Staff** ;
- refus confirmé dans une fenêtre administrateur, avec décision professionnelle
  envoyée automatiquement au membre par **PDD Staff** ;
- vérification automatique du serveur au lancement, au retour dans l’application
  et toutes les 30 secondes, avec alertes de fermeture et de réouverture ;
- signalements de bugs membres distribués à tous les comptes staff, avec
  validation rapportant 50 pièces ;
- économie membre sécurisée : 5 pièces par minute active, pause anti-AFK après
  3 minutes, boutique de nourriture Pixel et demandes de conversion XP ;
- espace privé pour lire et classer les candidatures ;
- notes privées sur chaque candidature ;
- messagerie réservée à l’équipe ;
- panneau administrateur pour créer et désactiver les comptes du staff ;
- changement obligatoire du mot de passe temporaire à la première connexion ;
- Tamagotchi Pixel immersif avec atelier jour/nuit, faim, joie, énergie, niveau et XP ;
- assistant Pixel pour naviguer dans l’application ;
- animation de démarrage où Pixel flotte, écrit « Hello », regarde l’utilisateur,
  glisse à gauche et révèle le logo PDD 2 avant un fondu au noir ;
- identité visuelle Alpha et crédits complets de l’équipe PDD.

## Sécurité des comptes

Le compte administrateur initial porte l’identifiant `Eitan14`. Son mot de passe
n’est volontairement pas enregistré dans le code ni dans l’APK. Il doit être
fourni au serveur par `INITIAL_ADMIN_PASSWORD`, puis remplacé à la première
connexion.

Le mot de passe précédemment partagé dans une conversation ne doit pas être
utilisé pour la mise en ligne. Il faut en choisir un nouveau, unique et long.

Les mots de passe sont hachés avec bcrypt. L’APK ne contient ni mot de passe
administrateur, ni token Discord.

## Lancer le projet localement

Pré-requis : Node.js 20 ou une version plus récente.

```bash
cp .env.example .env
npm install
npm run dev
```

Avant le premier démarrage, modifier au minimum dans `.env` :

```dotenv
JWT_SECRET=une-longue-valeur-aleatoire-secrete
INITIAL_ADMIN_USERNAME=Eitan14
INITIAL_ADMIN_PASSWORD=un-nouveau-mot-de-passe-prive
DISCORD_BOT_TOKEN=token-du-bot
DISCORD_ANNOUNCEMENT_CHANNEL_ID=1256623943494926407
```

Le site de développement est disponible sur `http://localhost:5173` et l’API
sur `http://localhost:3000/api`.

## Connecter le salon Discord d’annonces

1. Ouvrir le [Discord Developer Portal](https://discord.com/developers/applications).
2. Créer une application, puis un bot.
3. Activer **Message Content Intent** dans la page du bot.
4. Dans **OAuth2 > URL Generator**, sélectionner le scope `bot`.
5. Donner uniquement les permissions **View Channels** et **Read Message History**.
6. Inviter le bot sur PDD et lui permettre de voir le salon d’annonces.
7. Enregistrer le token dans `DISCORD_BOT_TOKEN` sur le serveur, jamais dans
   GitHub, l’application mobile ou un message public.

## Mettre le serveur en ligne

Le serveur Node.js doit être hébergé en HTTPS avec un stockage persistant pour
le dossier `/app/data`. Le `Dockerfile` fourni peut être utilisé chez un
hébergeur compatible Docker.

Variables nécessaires en production :

- `NODE_ENV=production`
- `PORT=3000`
- `APP_ORIGIN=https://adresse-du-site`
- `MOBILE_ORIGINS=http://localhost,https://localhost,capacitor://localhost`
- `JWT_SECRET`
- `INITIAL_ADMIN_USERNAME=Eitan14`
- `INITIAL_ADMIN_PASSWORD`
- `DISCORD_BOT_TOKEN`
- `DISCORD_ANNOUNCEMENT_CHANNEL_ID=1256623943494926407`

Une sauvegarde régulière du fichier `data/pixel-everywhere.db` est recommandée.

## Compiler l’APK avec GitHub Actions

Le projet contient le workflow `.github/workflows/android.yml`.

1. Mettre le projet dans un dépôt GitHub.
2. Installer et démarrer le serveur Node.js dans Termux.
3. Démarrer le tunnel ngrok public associé au port `3000`.
4. Ouvrir **Actions > Compiler Pixel Everywhere > Run workflow**.
5. Télécharger l’artefact **Pixel-Everywhere-APK** à la fin de la compilation.

L’APK est configuré pour joindre automatiquement le serveur Termux via le
tunnel HTTPS `https://reprimand-overprice-quickly.ngrok-free.dev`. Les autres
administrateurs peuvent ainsi utiliser l’application depuis leur propre
appareil tant que Termux, le serveur Node.js et ngrok restent actifs.

## Comptes et autorisations

| Type de compte | Envoyer une candidature | Messagerie membre | Espace staff | Créer des comptes staff | Accepter une candidature |
| --- | ---: | ---: | ---: | ---: | ---: |
| Membre | Oui | La sienne uniquement | Non | Non | Non |
| Modérateur | Non | Non | Oui | Non | Non |
| Administrateur | Non | Non | Oui | Oui | Oui |

Les comptes membres et staff utilisent des sessions séparées. Un compte membre
ne peut pas accéder aux routes privées du staff ni choisir un rôle lors de son
inscription. L’acceptation est réservée à un administrateur : elle crée toujours
un compte modérateur avec mot de passe temporaire, puis envoie les identifiants
dans la messagerie du membre. Un administrateur ne peut pas désactiver son propre
compte depuis l’application.

Hors traitement des candidatures, seul le compte défini par
`OWNER_ADMIN_USERNAME` (`Eitan14` par défaut) peut ouvrir le panneau de gestion,
créer manuellement des comptes modérateur ou administrateur et activer/désactiver
ces comptes. Les autres administrateurs peuvent accepter ou refuser une
candidature, mais ne peuvent pas créer librement un compte staff.

Les notifications locales avertissent le membre lorsque l’application est
ouverte ou reprise. Les notifications reçues lorsque l’application est
complètement fermée nécessiteront l’ajout ultérieur de Firebase Cloud Messaging.

## Pièces, bugs et XP PDD

- Une minute d’activité réelle rapporte 5 pièces.
- Après 3 minutes sans interaction, le gain est suspendu jusqu’au retour du membre.
- Un signalement de bug validé par un modérateur ou administrateur rapporte
  exactement 50 pièces, une seule fois.
- Les pièces permettent d’acheter une friandise (15), un repas (30) ou un
  festin (50) pour Pixel.
- Le taux de conversion est **1 pièce = 15 XP PDD**.
- Lors d’une demande de conversion, les pièces sont réservées immédiatement.
  Le staff ajoute les XP manuellement sur Discord puis confirme la demande.
  En cas de refus, toutes les pièces sont remboursées automatiquement.

## Crédits

- **Eitan 2.0** — Programmation et créateur du serveur et de l’application
- **thib549** — Co-créateur
- **Kamiko** — Co-créateur
- **Simgi** — Directeur du staff
- **Baba**, **Touille** et **Maggie** — Modérateurs responsables
