# RankRoom

Application web multijoueur en temps réel de notation collaborative et génération de Tier List (`S / A / B / C / D`), conçue pour l’auto-hébergement sur LXC Proxmox ou Docker.

![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Fastify](https://img.shields.io/badge/Backend-Fastify%20%2B%20Socket.IO-000000?style=flat-square)
![React](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite-61DAFB?style=flat-square&logo=react&logoColor=black)
![SQLite](https://img.shields.io/badge/Database-SQLite%20WAL-003B57?style=flat-square&logo=sqlite&logoColor=white)
![Self-Hosted](https://img.shields.io/badge/Deploy-Self--Hosted-475569?style=flat-square)

<!-- ![Capture d'écran de RankRoom](docs/screenshot.png) -->

---

## Fonctionnalités principales

- **Multijoueur temps réel** : Création de salles privées par code à 5 caractères (`K7M2P`) ou lien direct `/room/:code`, reconnexion transparente via `playerToken` en `sessionStorage`, contrôles réservés à l’hôte (paramètres, passage forcé, exclusion, retour au lobby) et délai de grâce anti-missclick de 2 secondes lorsque tous les joueurs connectés ont voté.
- **Notation & Pioche intelligente (*Smart Deck*)** : Barème de 1 à 5 étoiles en entiers ou demi-étoiles (`0.5`), raccourcis clavier `1..5`, mélange Fisher-Yates cryptographique (`crypto.randomInt`) sans répétition d’une manche à l’autre dans une même salle, choix du nombre d’items (`Tous`, `5`, `10`, `15`, `20`), suivi des items inédits restants et réinitialisation manuelle de la pioche par l’hôte.
- **Classement & Tier List** : Calcul des moyennes, départage déterministe (écart-type croissant, puis nombre de notes maximales, puis ordre alphabétique), double vue **Classement** et **Tier List S / A / B / C / D**, export **PNG Haute Densité (2x)** généré côté client et liens permanents `/results/:id`.
- **Éditeur de thèmes intégré** : Création et modification de thèmes, import d’images par drag & drop ou URL (avec protection SSRF IPv4/IPv6 et conversion `.webp` optimisée via Sharp), **recherche d’images intégrée Wikipedia / Wikimedia** sans clé API, import/export JSON et protection optionnelle des mutations par `ADMIN_PASSWORD`.

---

## Architecture & Stack Technique

Le dépôt est structuré en monorepo (`pnpm` workspaces) :

| Workspace | Paquet | Rôle et technologies |
| :--- | :--- | :--- |
| `packages/shared` | `@rankroom/shared` | Types TypeScript stricts, schémas Zod v4, moteur de calcul et de départage (`scoring.ts`), algorithme de pioche intelligente Fisher-Yates (`deck.ts`). |
| `apps/server` | `@rankroom/server` | Serveur HTTP Fastify (`trustProxy: true`), temps réel Socket.IO (état autoritaire en mémoire), SQLite via `better-sqlite3` (mode WAL) et Drizzle ORM, traitement d’images Sharp. |
| `apps/web` | `@rankroom/web` | Interface React 19, Vite, Tailwind CSS v4, composants accessibles Radix UI, gestion d’état Zustand, export PNG 2x via Canvas API. |

En production, le serveur Fastify écoute sur un **port unique (`0.0.0.0:3000`)** et sert simultanément :
- l’API REST (`/api/*`) ;
- les événements temps réel WebSocket / Socket.IO (`/socket.io/*`) ;
- les images locales converties en `.webp` (`/uploads/*`) ;
- le bundle frontend statique (`apps/web/dist`).

---

## Déploiement Self-Hosted

### Option A — LXC Proxmox natif (Debian 12 / 13) [Recommandé]

**Ressources recommandées pour le conteneur LXC :**
- **OS** : Debian 12 (*Bookworm*) ou Debian 13 (*Trixie*)
- **CPU** : 2 vCPU
- **RAM** : 1 Go (avec 512 Mo de Swap)
- **Disque** : 8 Go
- **Privilèges** : Conteneur non privilégié (*Unprivileged container*)

#### 1. Installation initiale

Dans le conteneur LXC (en `root` ou avec `sudo`) :

```bash
git clone https://github.com/<votre-utilisateur>/rankroom.git
cd rankroom
sudo bash deploy/install-lxc.sh
```

Le script `deploy/install-lxc.sh` est idempotent :
1. Installe les dépendances système (`ca-certificates`, `curl`, `gnupg`, `build-essential`, `python3`, `sqlite3`).
2. Installe Node.js 22 LTS (si absent ou `< 22`) et `pnpm`.
3. Crée l’utilisateur système `rankroom`, le répertoire d’application `/opt/rankroom` et le répertoire de données `/var/lib/rankroom`.
4. Génère `/etc/rankroom/rankroom.env` (sans jamais écraser un fichier existant).
5. Installe les dépendances npm, compile les trois workspaces et active le service `systemd` `rankroom.service`.

#### 2. Configuration de l’environnement

Éditez `/etc/rankroom/rankroom.env` pour renseigner l’URL publique exposée par votre reverse proxy (et un mot de passe administrateur si souhaité) :

```bash
sudo nano /etc/rankroom/rankroom.env
```

```dotenv
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
DATA_DIR=/var/lib/rankroom
MAX_UPLOAD_SIZE_MB=5
PUBLIC_URL=https://rankroom.exemple.fr
ADMIN_PASSWORD=votre-mot-de-passe
```

#### 3. Gestion du service `systemd`

```bash
# Redémarrer après modification de /etc/rankroom/rankroom.env
sudo systemctl restart rankroom

# Vérifier l'état du service et sa disponibilité locale
sudo systemctl status rankroom
curl -fsS http://127.0.0.1:3000/api/health

# Consulter les journaux en direct
sudo journalctl -u rankroom -f
```

#### 4. Mise à jour

Depuis le dossier source cloné, récupérez les modifications et relancez le script d’installation (vos données `/var/lib/rankroom` et `/etc/rankroom/rankroom.env` sont préservées) :

```bash
cd rankroom
git pull
sudo bash deploy/install-lxc.sh
```

---

### Option B — Docker / Docker Compose

1. Copiez le fichier d’exemple et adaptez les variables :

```bash
cp .env.example .env
nano .env
```

2. Construisez l’image multi-stage et démarrez le conteneur :

```bash
docker compose up -d --build
```

- L’application est exposée sur le port `${PORT:-3000}:3000`.
- La base SQLite et les médias `.webp` sont persistés dans le volume nommé `rankroom_data` monté sur `/data`.
- Un `healthcheck` vérifie automatiquement `http://127.0.0.1:3000/api/health` toutes les 30 secondes.

Pour mettre à jour avec Docker Compose :

```bash
git pull
docker compose up -d --build
```

---

### Configuration derrière un Reverse Proxy

RankRoom active `trustProxy: true` côté Fastify et s’appuie sur Socket.IO pour le temps réel. Quel que soit votre reverse proxy (Nginx Proxy Manager, Nginx, Caddy, Traefik), vérifiez impérativement les points suivants :

1. **WebSockets activés** : Les en-têtes `Upgrade` et `Connection` doivent être relayés pour `/socket.io/`.
2. **En-têtes transmis** : `Host`, `X-Real-IP`, `X-Forwarded-For` et `X-Forwarded-Proto`.
3. **Taille maximale du corps de requête** : Configurez au moins `10M` si `MAX_UPLOAD_SIZE_MB=5` (pour absorber l’enveloppe `multipart/form-data`).
4. **Variable `PUBLIC_URL`** : Définissez l’URL exacte en HTTPS sans slash final (ex. `PUBLIC_URL=https://rankroom.exemple.fr`) afin d’autoriser l’origine CORS HTTP et Socket.IO.

#### Nginx / Nginx Proxy Manager

- **Nginx Proxy Manager** : Ajoutez un *Proxy Host* vers `http://<IP_LXC>:3000`, activez **Websockets Support**, et ajoutez `client_max_body_size 10m;` dans l’onglet *Advanced* si nécessaire.
- **Nginx natif** :

```nginx
server {
    listen 443 ssl http2;
    server_name rankroom.exemple.fr;

    client_max_body_size 10m;

    location / {
        proxy_pass http://192.168.1.50:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
    }
}
```

#### Caddy

Caddy gère nativement les WebSockets et les en-têtes `X-Forwarded-*` :

```caddyfile
rankroom.exemple.fr {
    reverse_proxy 192.168.1.50:3000
}
```

#### Traefik

Pointez le service vers `http://<IP_LXC>:3000` (Traefik prend en charge l’upgrade WebSocket et les en-têtes `X-Forwarded-*` par défaut sur ses routeurs HTTP/HTTPS).

---

## Variables d’environnement

Toutes les variables sont documentées dans `.env.example` et validées au démarrage par `apps/server/src/config.ts` :

| Variable | Valeur par défaut | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port d’écoute HTTP et WebSocket du serveur Fastify. |
| `HOST` | `0.0.0.0` | Interface réseau d’écoute. |
| `NODE_ENV` | `development` (`production` dans `.env.example`) | Environnement d’exécution (`development`, `production` ou `test`). |
| `DATA_DIR` | `./data` (`/var/lib/rankroom` en LXC, `/data` en Docker) | Répertoire isolé contenant `rankroom.sqlite*` et le sous-dossier `uploads/`. |
| `PUBLIC_URL` | *(vide)* | URL publique exposée par le reverse proxy, sans slash final (ex. `https://rankroom.exemple.fr`), utilisée pour le CORS HTTP et Socket.IO. |
| `MAX_UPLOAD_SIZE_MB` | `5` | Taille maximale autorisée par image uploadée ou importée par URL (entre `1` et `25` Mo). |
| `ADMIN_PASSWORD` | *(vide)* | Mot de passe optionnel protégeant la création, modification, suppression des thèmes et l’upload/recherche d’images. Laisser vide pour un accès libre. |

---

## Développement local & Tests

### Prérequis

- **Node.js** `>= 22`
- **pnpm**

### Installation

```bash
pnpm install
```

### Lancement en développement

**Mode port unique (build des dépendances partagées + frontend, puis lancement du serveur sur `http://localhost:3000`) :**

```bash
pnpm run dev
```

**Mode développement avec rechargement rapide sur deux terminaux :**

```bash
# Terminal 1 : Backend Fastify + Socket.IO (port 3000)
pnpm --filter @rankroom/server dev

# Terminal 2 : Frontend Vite avec proxy /api, /uploads et /socket.io (port 5173)
pnpm --filter @rankroom/web dev
```

### Build de production, Vérification des types & Tests

```bash
# Compile packages/shared, apps/server et apps/web
pnpm run build

# Lance la suite complète de tests unitaires et d'intégration (28 tests Vitest : 15 shared + 13 server)
pnpm run test

# Vérifie le typage TypeScript strict sur l'ensemble des workspaces
pnpm run lint

# Démarre le build de production (NODE_ENV=production node apps/server/dist/index.js)
pnpm run start
```

---

## Sauvegarde (Backup)

L’intégralité des données persistantes de RankRoom réside dans le répertoire `DATA_DIR` (`/var/lib/rankroom` en installation LXC native, ou le volume `/data` sous Docker) :
- `rankroom.sqlite` (accompagnée de ses fichiers WAL `-wal` / `-shm`) : thèmes, items et résultats permanents `/results/:id`.
- `uploads/` : images des thèmes converties et stockées en `.webp`.

Pour effectuer une sauvegarde cohérente à chaud sans arrêter le service (exemple en installation LXC) :

```bash
BACKUP_DIR="/tmp/rankroom-backup-$(date +%F)"
mkdir -p "${BACKUP_DIR}"
sqlite3 /var/lib/rankroom/rankroom.sqlite ".backup '${BACKUP_DIR}/rankroom.sqlite'"
cp -a /var/lib/rankroom/uploads "${BACKUP_DIR}/uploads"
tar -czf "/tmp/rankroom-backup-$(date +%F).tar.gz" -C "${BACKUP_DIR}" .
```
