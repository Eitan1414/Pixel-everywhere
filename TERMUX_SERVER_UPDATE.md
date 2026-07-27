# Mettre à niveau l’ancien serveur Termux

Cette mise à niveau conserve l’ancien serveur et sa base de données, puis ajoute la gestion sécurisée des comptes membres utilisée par la nouvelle version de Pixel Everywhere.

## Ce qui est ajouté

- création d’un compte membre ;
- connexion d’un membre ;
- restauration de session ;
- stockage sécurisé des mots de passe avec bcrypt ;
- messagerie et candidatures rattachées au membre ;
- migration automatique de l’ancienne base de données ;
- sauvegarde de la base avant la mise à jour.

## Mise à jour

Arrêter d’abord le serveur avec `Ctrl + C`, puis exécuter :

```bash
cd ~/Pixel-everywhere
git pull --ff-only origin main
npm run termux:upgrade-server
```

Si le dossier porte un autre nom, remplacer `~/Pixel-everywhere` par son chemin réel.

La commande crée une sauvegarde dans le dossier `backups/`, met à jour le dépôt, installe les dépendances nécessaires au serveur et vérifie les fichiers JavaScript.

## Redémarrage

Dans la première session Termux :

```bash
npm start
```

Dans une deuxième session Termux :

```bash
ngrok http 3000
```

## Vérification locale

Quand le serveur est démarré :

```bash
curl http://127.0.0.1:3000/api/health
```

Le serveur doit répondre avec un objet contenant `"ok":true`.

Pour vérifier que la route d’inscription membre existe sans créer de compte valide :

```bash
curl -i -X POST http://127.0.0.1:3000/api/members/register \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Une réponse de validation en JSON confirme que la nouvelle route est active. Une erreur HTML `404` indique que l’ancien serveur tourne encore et doit être redémarré.

## Données conservées

La migration ne supprime pas les comptes staff, les candidatures ou les messages existants. Le fichier original est sauvegardé avant la mise à jour sous la forme :

```text
backups/pixel-everywhere-AAAAMMJJ-HHMMSS.db
```

Ne pas supprimer le dossier `data/`, car il contient la base utilisée par le serveur.
