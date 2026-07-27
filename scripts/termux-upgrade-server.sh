#!/data/data/com.termux/files/usr/bin/bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

printf '\nPixel Everywhere — mise à niveau du serveur Termux\n'
printf 'Dossier : %s\n\n' "$PROJECT_DIR"

if ! command -v git >/dev/null 2>&1; then
  echo "Installation de Git…"
  pkg install -y git
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Installation de Node.js LTS…"
  pkg install -y nodejs-lts
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm est introuvable après l’installation de Node.js."
  exit 1
fi

if [ ! -d .git ]; then
  echo "Ce dossier n’est pas un clone Git du projet Pixel Everywhere."
  exit 1
fi

mkdir -p backups
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DATABASE="data/pixel-everywhere.db"

if [ -f "$DATABASE" ]; then
  BACKUP="backups/pixel-everywhere-$TIMESTAMP.db"
  cp "$DATABASE" "$BACKUP"
  echo "Base sauvegardée : $BACKUP"
else
  echo "Aucune ancienne base trouvée : une nouvelle base sera créée au démarrage."
fi

if [ -f .env ]; then
  cp .env "backups/env-$TIMESTAMP.txt"
  echo "Configuration .env sauvegardée."
elif [ -f .env.example ]; then
  cp .env.example .env
  echo "Un fichier .env a été créé depuis .env.example. Modifie ses secrets avant le démarrage."
fi

echo "Récupération de la dernière version du serveur…"
git fetch origin main
git pull --ff-only origin main

echo "Installation des dépendances serveur compatibles Termux…"
npm install --omit=dev

echo "Vérification des fichiers serveur…"
node --check server/index.mjs
node --check server/db.mjs
node --check server/auth.mjs
node --check server/validation.mjs

cat <<'EOF'

Mise à niveau terminée.

Le prochain démarrage effectuera automatiquement la migration de l’ancienne base
et ajoutera les tables nécessaires aux comptes membres, sans supprimer les données
existantes.

Lance maintenant :
  npm start

Puis, dans une deuxième session Termux :
  ngrok http 3000
EOF
