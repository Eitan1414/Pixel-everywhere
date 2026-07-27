# Pixel Everywhere

Application mobile officielle du serveur Discord **PDD — Pixel Difficult Drawer**,
une communauté consacrée au dessin, au gaming et au partage de créations.

## Fonctionnalités

- présentation du serveur et invitation `https://discord.gg/DbxADDbuzz` ;
- lecture du salon Discord d’annonces `1531069689583763467` ;
- formulaire public de candidature au staff ;
- espace privé pour lire et classer les candidatures ;
- notes privées sur chaque candidature ;
- messagerie réservée à l’équipe ;
- panneau administrateur pour créer et désactiver les comptes du staff ;
- changement obligatoire du mot de passe temporaire à la première connexion ;
- crédits complets de l’équipe PDD.

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
DISCORD_ANNOUNCEMENT_CHANNEL_ID=1531069689583763467
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
- `DISCORD_ANNOUNCEMENT_CHANNEL_ID=1531069689583763467`

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

| Type de compte | Candidatures | Messagerie | Notes | Créer des comptes | Désactiver des comptes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Modérateur | Oui | Oui | Oui | Non | Non |
| Administrateur | Oui | Oui | Oui | Oui | Oui |

Un administrateur ne peut pas désactiver son propre compte depuis l’application.

## Crédits

- **Eitan 2.0** — Programming and creator of the server/app
- **thib549** — Co-creator
- **kamiko** — Co-creator
- **simgi** — Director of staff
- **baba / touille / Maggie** — Modérateurs responsables
