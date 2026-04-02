# Foldwatch — Docker setup (step-by-step)

Yeh guide is monorepo (`pnpm` workspace: `apps/backend`, `apps/frontend`) ke Docker flow ko detail mein explain karti hai.

---

## 1. Project structure (Docker ke liye kyun important hai)

```
foldwatch/                    ← build context (hamesha yahan se)
├── package.json              ← root workspace
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── Dockerfile                → symlink → docker/backend.Dockerfile (optional)
├── docker/
│   ├── backend.Dockerfile
│   ├── frontend.Dockerfile
│   └── README.md             ← yeh file
├── docker-compose.yml
├── .dockerignore
├── apps/
│   ├── backend/              ← NestJS API
│   └── frontend/             ← Next.js
```

**Rule:** Dono Dockerfiles ka **context** repo root (`.`) hai, taaki `pnpm` lockfile + dono `package.json` copy ho sakein. `apps/backend` ya `apps/frontend` ko alag root mat banao warna `COPY` paths toot jayenge.

---

## 2. `.dockerignore` — build mein kya ignore hota hai

File: repo root par `.dockerignore`

| Pattern | Matlab |
|--------|--------|
| `**/node_modules` | Local `node_modules` image mein copy nahi — fresh `pnpm install` builder stage mein |
| `**/.next`, `**/dist` | Purane build artifacts |
| `.git` | Git history zaroorat nahi |
| `.env`, `.env.*` (except `.env.example`) | Secrets image mein leak na hon |
| `**/*.md` | Docs se build halka |

**Note:** `docker-compose` ka `env_file: apps/backend/.env` **host** se read hota hai runtime par; image ke andar `.env` copy nahi hota agar ignore ho.

---

## 3. Backend Dockerfile — line-by-line flow

File: `docker/backend.Dockerfile`

### Stage 1: `builder` (Node 22 + pnpm)

1. **Base image:** `node:22-bookworm` — stable Node + Debian.
2. **pnpm:** `corepack enable` + `pnpm@9` — lockfile version 9 ke saath match.
3. **Pehle sirf manifests copy:**  
   `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `apps/backend/package.json`, `apps/frontend/package.json`  
   — Workspace resolve karne ke liye dono app ke `package.json` chahiye (backend filter ke saath bhi).
4. **`pnpm install --frozen-lockfile --filter backend...`**  
   — `...` matlab backend aur uski dependencies; poora monorepo install nahi.
5. **Phir source:** `COPY apps/backend ./apps/backend`
6. **Build + production bundle:**  
   - `pnpm --filter backend build` → `apps/backend/dist/`  
   - `pnpm --filter backend deploy --prod --legacy /out`  
   — pnpm 10+ ke liye `--legacy` zaroori; output `/out` mein production `node_modules` + `dist` + `package.json` jaisa layout.

### Stage 2: `runner` (Playwright official image)

1. **Image:** `mcr.microsoft.com/playwright:v1.58.2-noble`  
   — Backend **Playwright (Chromium)** use karta hai (`crawler.tool.ts`). Yeh image browsers + OS deps deta hai; version lockfile (`playwright@1.58.x`) ke saath align rakho.
2. **WORKDIR /app**, `NODE_ENV=production`, default `PORT=3001` (Railway/host `PORT` se override ho sakta hai).
3. **`COPY --from=builder /out ./`** — sirf deploy output.
4. **`CMD ["node", "dist/main.js"]`** — Nest entry.

**Port:** Container andar `3001` (compose mein bhi map kiya gaya). Production par platform `PORT` set kare to Nest `main.ts` wahi use karta hai.

---

## 4. Frontend Dockerfile — line-by-line flow

File: `docker/frontend.Dockerfile`

### Stage 1: `builder`

1. Wahi monorepo root layout + **`pnpm install --frozen-lockfile --filter frontend...`**
2. **`COPY apps/frontend`**
3. **Optional build-time env:** `ARG` / `ENV` `NEXT_PUBLIC_API_URL` — default `http://localhost:3001`. Docker build args se override:  
   `docker build --build-arg NEXT_PUBLIC_API_URL=...`
4. **`pnpm --filter frontend build`** — Next production build.

### Stage 2: `runner` (`node:22-bookworm-slim`)

Next **standalone** output use hota hai (chhota runtime):

1. **`output: "standalone"`** + monorepo root fix — `apps/frontend/next.config.ts` mein:
   - `output: "standalone"`
   - `outputFileTracingRoot` + `turbopack.root` → monorepo root, taaki `.next/standalone` mein galat absolute path (`Desktop/...`) na bane.

2. **Copy:**
   - `.next/standalone` → app root (`WORKDIR /app`)
   - `.next/static` → `apps/frontend/.next/static`
   - `public` → `apps/frontend/public`

3. **`ENV PORT=3000`**, **`HOSTNAME=0.0.0.0`** — container ke bahar se port bind.

4. **`CMD ["node", "apps/frontend/server.js"]`** — Next standalone server.

### Frontend ↔ Backend URL (Docker network)

- Browser se API **same-origin** `/api/...` par jaati hai (Next proxy).
- Server-side (`api.ts`, `[...proxy]/route.ts`) **container** se backend ko **`INTERNAL_API_URL`** se call karte hain, e.g. `http://backend:3001` (compose service name).

Isliye `INTERNAL_API_URL` set karna zaroori hai jab frontend alag container mein ho.

---

## 5. Code changes (Docker ke saath align)

| File | Change |
|------|--------|
| `apps/frontend/next.config.ts` | `standalone`, `outputFileTracingRoot`, `turbopack.root` |
| `apps/frontend/src/lib/api.ts` | Browser: `apiBase()` → `''`; server: `INTERNAL_API_URL` / `NEXT_PUBLIC_API_URL` |
| `apps/frontend/src/app/api/[...proxy]/route.ts` | `INTERNAL_API_URL` pehle |

---

## 6. `docker-compose.yml` — teen services

| Service | Role |
|---------|------|
| **mysql** | `mysql:8.0`, DB `fold_watch`, root password example; host port **3307→3306** taaki Mac par local MySQL (3306) clash na ho |
| **backend** | `docker/backend.Dockerfile`, port `3001`, `DATABASE_*` point to hostname **`mysql`**, `depends_on` + healthcheck |
| **frontend** | `docker/frontend.Dockerfile`, port `3000`, `INTERNAL_API_URL=http://backend:3001` |

**`init: true` + `ipc: host` (backend):** Playwright/Chromium ke liye recommended Docker flags.

---

## 7. Local — images build karna

Repo root se:

```bash
# Sirf backend
docker build -f docker/backend.Dockerfile -t foldwatch-backend:local .

# Sirf frontend
docker build -f docker/frontend.Dockerfile -t foldwatch-frontend:local .
```

---

## 8. Local — compose se sab chalana

```bash
cd /path/to/foldwatch
docker compose up --build
```

- UI: `http://localhost:3000`
- API: `http://localhost:3001/api/...`
- MySQL (host se tool se): `127.0.0.1:3307` (user/pass compose jaisa)

**Pehli baar:** `apps/backend/.env` hona chahiye (compose `env_file` ke liye) — AI keys wagaira ke liye.

---

## 9. Root `Dockerfile` (symlink)

`Dockerfile` → `docker/backend.Dockerfile` — kuch platforms (jaise auto-detect) sirf root par `Dockerfile` dhoondhte hain; symlink se wahi backend build milta hai.

---

## 10. Common issues

| Problem | Fix |
|---------|-----|
| `ECONNREFUSED 127.0.0.1:3306` (backend container) | `DATABASE_HOST=mysql` (service name), localhost mat rakho |
| Port 3306 already in use (host) | Compose mein `3307:3306` jaise change karo |
| Next standalone galat path | `next.config.ts` mein `outputFileTracingRoot` / `turbopack.root` check karo |
| Railpack / no start command (cloud) | Root par Dockerfile ya `railway.json` mein `builder: DOCKERFILE` — yeh alag cloud doc (`railway-setup.txt`) |

---

## 11. Security checklist

- Secrets **image ya git** mein commit mat karo.
- Production mein compose ke default passwords badlo.
- API keys sirf env / secret manager mein.

---

## Quick reference — ek nazar mein

| Item | Path / command |
|------|----------------|
| Backend image | `docker build -f docker/backend.Dockerfile -t foldwatch-backend .` |
| Frontend image | `docker build -f docker/frontend.Dockerfile -t foldwatch-frontend .` |
| Full stack | `docker compose up --build` |
| Ignore rules | `.dockerignore` |
| Compose | `docker-compose.yml` |

Yeh poora flow is project mein implement hai; nayi machine par sirf Docker + repo clone + `.env` se repeat kar sakte ho.
