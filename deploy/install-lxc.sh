#!/usr/bin/env bash
set -euo pipefail

# Script d'installation idempotent de RankRoom pour un LXC Debian 12 minimal
# Usage : sudo bash deploy/install-lxc.sh

APP_USER="rankroom"
APP_GROUP="rankroom"
APP_DIR="/opt/rankroom"
DATA_DIR="/var/lib/rankroom"
ENV_DIR="/etc/rankroom"
ENV_FILE="${ENV_DIR}/rankroom.env"
SERVICE_FILE="/etc/systemd/system/rankroom.service"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "Erreur : ce script doit être exécuté en root (sudo)." >&2
  exit 1
fi

echo "[1/6] Vérification des dépendances système Debian 12..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  gnupg \
  build-essential \
  python3 \
  sqlite3

echo "[2/6] Vérification de Node.js 22 LTS et pnpm..."
NEED_NODE=0
if ! command -v node >/dev/null 2>&1; then
  NEED_NODE=1
else
  NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  if [ "${NODE_MAJOR}" -lt 22 ]; then
    NEED_NODE=1
  fi
fi

if [ "${NEED_NODE}" -eq 1 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y --no-install-recommends nodejs
fi

if command -v corepack >/dev/null 2>&1; then
  corepack enable
  corepack prepare pnpm@latest --activate
else
  npm install -g pnpm
fi

echo "[3/6] Création de l'utilisateur système et des répertoires..."
if ! getent group "${APP_GROUP}" >/dev/null 2>&1; then
  groupadd --system "${APP_GROUP}"
fi
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --gid "${APP_GROUP}" --home-dir "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi

mkdir -p "${APP_DIR}" "${DATA_DIR}/uploads" "${ENV_DIR}"
chown -R "${APP_USER}:${APP_GROUP}" "${DATA_DIR}"

echo "[4/6] Synchronisation du code source dans ${APP_DIR}..."
if [ "${SOURCE_DIR}" != "${APP_DIR}" ]; then
  tar \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='data' \
    --exclude='.env' \
    --exclude='.playwright-cli' \
    -C "${SOURCE_DIR}" -cf - . | tar -C "${APP_DIR}" -xf -
fi
chown -R "${APP_USER}:${APP_GROUP}" "${APP_DIR}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "[5/6] Génération de la configuration initiale ${ENV_FILE}..."
  cat > "${ENV_FILE}" <<EOF
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
DATA_DIR=${DATA_DIR}
MAX_UPLOAD_SIZE_MB=5
# Renseignez l'URL publique HTTPS de votre reverse proxy :
# PUBLIC_URL=https://rankroom.exemple.fr
# Optionnel : mot de passe requis pour créer/modifier/supprimer des thèmes
# ADMIN_PASSWORD=
EOF
  chown "${APP_USER}:${APP_GROUP}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
else
  echo "[5/6] Configuration existante conservée (${ENV_FILE})."
fi

echo "[6/6] Installation des dépendances, compilation et activation systemd..."
cd "${APP_DIR}"
if [ -f "${APP_DIR}/pnpm-lock.yaml" ]; then
  su -s /bin/bash "${APP_USER}" -c "cd '${APP_DIR}' && pnpm install --frozen-lockfile && pnpm run build"
else
  su -s /bin/bash "${APP_USER}" -c "cd '${APP_DIR}' && pnpm install && pnpm run build"
fi

install -m 644 "${APP_DIR}/deploy/rankroom.service" "${SERVICE_FILE}"
systemctl daemon-reload
systemctl enable rankroom
systemctl restart rankroom

echo "RankRoom installé et démarré avec succès."
echo "Vérification : curl -fsS http://127.0.0.1:3000/api/health"
