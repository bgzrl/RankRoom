# RankRoom

Application web multijoueur en temps réel de notation collaborative et génération de Tier List (`S / A / B / C / D`).

## Stack Technique

- **Monorepo** : `pnpm` workspaces (`packages/shared`, `apps/server`, `apps/web`)
- **Shared** : TypeScript strict, schémas Zod v4, moteur de calcul (moyenne arithmétique, écart-type, départage déterministe, Tiers)
- **Backend (`apps/server`)** : Node.js 22 LTS, Fastify (`trustProxy: true`), Socket.IO (état autoritaire serveur), SQLite (`better-sqlite3` en mode WAL) + Drizzle ORM, `sharp` (redimensionnement + suppression EXIF + conversion `.webp`)
- **Frontend (`apps/web`)** : React 19, Vite, Tailwind CSS v4, Radix UI, Zustand, export Tier List en PNG haute densité côté client

---

## Développement local

```bash
pnpm install
pnpm run build          # Compile @rankroom/shared, apps/server et apps/web
pnpm run test           # Exécute les tests Vitest (shared + server)
pnpm run lint           # Vérifie les types TypeScript sur tous les workspaces
```

Pour lancer le serveur et le frontend en mode développement avec rechargement :

```bash
# Terminal 1 : Backend Fastify + Socket.IO (port 3000)
pnpm --filter @rankroom/server dev

# Terminal 2 : Frontend Vite avec proxy /api, /uploads et /socket.io (port 5173)
pnpm --filter @rankroom/web dev
```

Ou pour servir le build complet sur un port unique (`3000`) :

```bash
pnpm run build
pnpm run start
```

---

## Déploiement sur Proxmox LXC (Debian 12)

L’application sert l’API REST (`/api/*`), les WebSockets (`/socket.io/*`), les médias (`/uploads/*`) et l’interface React (`apps/web/dist`) **sur un port unique (`3000`)**.

### Méthode 1 — Installation native `systemd` (recommandée pour LXC minimal 512 Mo – 1 Go RAM)

1. Créez un conteneur LXC **Debian 12** (1 vCPU, 512 Mo–1 Go RAM).
2. Copiez le dépôt dans le conteneur (ou clonez-le) puis exécutez :

```bash
sudo bash deploy/install-lxc.sh
```

Le script est idempotent :
- installe Node.js 22 LTS, `pnpm`, `build-essential` et `python3` ;
- crée l’utilisateur système `rankroom` et le dossier de persistance `/var/lib/rankroom` ;
- crée `/etc/rankroom/rankroom.env` (sans l’écraser lors des mises à jour) ;
- compile le monorepo et active le service `rankroom.service`.

Éditez ensuite `/etc/rankroom/rankroom.env` pour renseigner votre `PUBLIC_URL` (et optionnellement `ADMIN_PASSWORD`), puis redémarrez :

```bash
sudo systemctl restart rankroom
sudo journalctl -u rankroom -f
```

### Méthode 2 — Docker Compose

```bash
cp .env.example .env
# Éditez .env (PUBLIC_URL, ADMIN_PASSWORD, MAX_UPLOAD_SIZE_MB...)
docker compose up -d --build
```

Les données SQLite (`rankroom.sqlite*`) et les images `.webp` sont persistées dans le volume `/data`.

---

## Configuration du Reverse Proxy réseau (Obligatoire pour Socket.IO)

RankRoom est conçu pour fonctionner derrière votre reverse proxy existant (`trustProxy: true`). Vérifiez les points suivants sur votre proxy :

1. **Cible** : `http://<IP_DU_LXC>:3000`
2. **Support WebSockets activé** (`Upgrade` et `Connection`) pour `/socket.io/`
3. **En-têtes transmis** : `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`
4. **Taille d’upload** : autorisez au moins `10M` si `MAX_UPLOAD_SIZE_MB=5`
5. **Variable `.env`** : définissez `PUBLIC_URL=https://votre-domaine.tld` (sans slash final) pour le CORS HTTP & Socket.IO

### Exemple Nginx

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

### Exemple Caddy

```caddyfile
rankroom.exemple.fr {
    reverse_proxy 192.168.1.50:3000
}
```

---

## Sauvegarde (Backup)

Toutes les données persistantes résident exclusivement dans `DATA_DIR` (`/var/lib/rankroom` en natif ou volume `/data` en Docker) :

```bash
sqlite3 /var/lib/rankroom/rankroom.sqlite ".backup /tmp/rankroom-backup.sqlite"
```
