# Railway Deployment Guide — Medical System (Core Health)

## Project Overview

| Layer    | Tech                          | Folder    |
|----------|-------------------------------|-----------|
| Backend  | Node.js + Express + TypeScript | `server/` |
| Frontend | React + Vite + TypeScript     | `client/` |
| Database | PostgreSQL                    | Railway managed |

---

## Prerequisites

- [Railway account](https://railway.com) (free tier works)
- [Railway CLI](https://docs.railway.app/develop/cli) installed (optional but helpful)
- Your project pushed to a GitHub repository

---

## Step 1 — Push to GitHub

Make sure your project is on GitHub. Railway deploys directly from a repo.

```bash
git add .
git commit -m "prepare for railway deployment"
git push origin main
```

> **Important:** Make sure `server/.env` is in `.gitignore` — never commit secrets.

---

## Step 2 — Create a Railway Project

1. Go to [railway.com](https://railway.com) → **New Project**
2. Choose **Deploy from GitHub repo**
3. Select your repository
4. Railway will detect the repo — **do not deploy yet**, you'll configure services manually

---

## Step 3 — Add PostgreSQL Database

This is the most important step. Railway provides a managed PostgreSQL instance.

1. Inside your Railway project, click **+ New Service**
2. Select **Database → PostgreSQL**
3. Railway will provision the database automatically
4. Click on the PostgreSQL service → go to the **Variables** tab
5. You will see these auto-generated variables — **copy them**, you'll need them for the backend:

| Railway Variable | Maps to your app |
|-----------------|-----------------|
| `PGHOST`        | `DB_HOST`       |
| `PGPORT`        | `DB_PORT`       |
| `PGDATABASE`    | `DB_NAME`       |
| `PGUSER`        | `DB_USER`       |
| `PGPASSWORD`    | `DB_PASSWORD`   |

> Railway also provides `DATABASE_URL` as a full connection string (used in Step 4 alternative).

---

## Step 4 — Deploy the Backend (Server)

### 4a. Add a new service for the backend

1. Click **+ New Service → GitHub Repo**
2. Select the same repository
3. Railway will try to auto-detect — you'll override the settings below

### 4b. Configure the backend service

Go to the backend service → **Settings** tab:

| Setting | Value |
|---------|-------|
| **Root Directory** | `server` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |

> `npm run build` runs `tsc` → compiles TypeScript to `dist/`.  
> `npm start` runs `node dist/server.js`.

### 4c. Set environment variables for the backend

Go to backend service → **Variables** tab → add these:

```
PORT=5000
NODE_ENV=production

DB_HOST=${{Postgres.PGHOST}}
DB_PORT=${{Postgres.PGPORT}}
DB_NAME=${{Postgres.PGDATABASE}}
DB_USER=${{Postgres.PGUSER}}
DB_PASSWORD=${{Postgres.PGPASSWORD}}

JWT_SECRET=your_strong_random_secret_here_change_this
JWT_EXPIRES_IN=7d

CLIENT_URL=https://your-frontend-url.railway.app
```

> **Reference syntax:** `${{Postgres.PGHOST}}` lets Railway inject the database service's variable directly — no copy-pasting credentials. Replace `Postgres` with the exact name of your PostgreSQL service if it differs.

> **Generate a strong JWT secret:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

### 4d. Note your backend URL

After deploying, Railway assigns a public URL like:  
`https://your-project-backend.railway.app`

Save this — you'll need it for the frontend.

---

## Step 5 — Run Database Migrations

After the backend service is deployed and running, run the migration to create all tables.

### Option A — Via Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Run migration against the deployed service
railway run --service your-backend-service-name npm run db:migrate
```

### Option B — Via Railway Shell (in the dashboard)

1. Go to the backend service → **Deploy** tab → click the active deployment
2. Open the **Terminal / Shell** panel (if available on your plan)
3. Run:
   ```bash
   npm run db:migrate
   ```

### Option C — Trigger migration on startup (simplest)

Modify `server/package.json` start script to run migrations before starting:

```json
"start": "node -e \"require('./dist/config/migrate')\" && node dist/server.js"
```

But the cleanest approach is a separate one-time run via the CLI (Option A).

### Run the seed (optional)

If you want initial data (admin user, sample records):

```bash
railway run --service your-backend-service-name npm run db:seed
```

---

## Step 6 — Deploy the Frontend (Client)

### 6a. Update the API URL for production

The `vite.config.ts` proxy only works in local dev. In production, the client must call the backend URL directly.

Create `client/.env.production`:

```env
VITE_API_URL=https://your-project-backend.railway.app
```

Then update your API service file (`client/src/services/api.js` or `api.ts`) to use:

```ts
const BASE_URL = import.meta.env.VITE_API_URL || '';
```

If you use axios, update the base URL:

```ts
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: true,
});
```

### 6b. Add a new service for the frontend

1. Click **+ New Service → GitHub Repo** (same repo again)
2. Go to **Settings**:

| Setting | Value |
|---------|-------|
| **Root Directory** | `client` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npx serve dist -p $PORT` |

> You need `serve` to serve the built Vite output. Add it to `client/package.json`:
> ```bash
> cd client && npm install serve --save
> ```

Alternatively, use Railway's **Static Site** option (if available):

| Setting | Value |
|---------|-------|
| **Build Command** | `npm install && npm run build` |
| **Output Directory** | `dist` |

### 6c. Set environment variables for the frontend

```
VITE_API_URL=https://your-project-backend.railway.app
```

---

## Step 7 — Update CORS in the Backend

After you get the frontend Railway URL, update the backend environment variable:

```
CLIENT_URL=https://your-frontend.railway.app
```

The backend `server.ts` already reads `process.env.CLIENT_URL` for CORS — no code change needed.

---

## Step 8 — Verify Deployment

Check these endpoints:

```
GET https://your-backend.railway.app/api/health
# Expected: { "status": "ok", "timestamp": "..." }
```

Then open your frontend URL and test login.

---

## Important Caveats

### File Uploads (Critical)

Railway uses an **ephemeral filesystem** — files uploaded to `server/uploads/` are **deleted on every redeploy or restart**.

For production, you must move file storage to an external service:

- **Cloudinary** (recommended for images/PDFs) — free tier available
- **AWS S3 / Cloudflare R2** — object storage
- **Supabase Storage** — free tier, easy setup

Until you migrate, uploads will work but won't survive restarts.

### Tesseract OCR (`eng.traineddata`)

The `eng.traineddata` file (5 MB) in `server/` is used by Tesseract.js. Make sure it is committed to git and not in `.gitignore`, otherwise OCR will fail on Railway.

### Socket.IO

Socket.IO works on Railway by default. If you scale to multiple instances, you'll need a Redis adapter (`@socket.io/redis-adapter`) to share socket state across instances. For a single instance (Railway's default), no change needed.

### Free Tier Limits

Railway's free tier sleeps inactive services. For a medical system in active use, upgrade to a paid plan to avoid cold starts.

---

## Environment Variables Summary

### Backend service

| Variable | Value |
|----------|-------|
| `PORT` | `5000` |
| `NODE_ENV` | `production` |
| `DB_HOST` | `${{Postgres.PGHOST}}` |
| `DB_PORT` | `${{Postgres.PGPORT}}` |
| `DB_NAME` | `${{Postgres.PGDATABASE}}` |
| `DB_USER` | `${{Postgres.PGUSER}}` |
| `DB_PASSWORD` | `${{Postgres.PGPASSWORD}}` |
| `JWT_SECRET` | `<64-char random string>` |
| `JWT_EXPIRES_IN` | `7d` |
| `CLIENT_URL` | `https://your-frontend.railway.app` |

### Frontend service

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://your-backend.railway.app` |

---

## Quick Checklist

- [ ] Project pushed to GitHub
- [ ] `server/.env` is in `.gitignore`
- [ ] PostgreSQL service created on Railway
- [ ] Backend service configured (root: `server`, build + start commands set)
- [ ] Backend environment variables set (DB vars referencing Postgres service)
- [ ] Database migrations run (`npm run db:migrate`)
- [ ] Seed data loaded if needed (`npm run db:seed`)
- [ ] `client/.env.production` created with `VITE_API_URL`
- [ ] Frontend service configured (root: `client`, build command set)
- [ ] `CLIENT_URL` in backend updated to frontend Railway URL
- [ ] `/api/health` returns `ok`
- [ ] Frontend login tested end-to-end
- [ ] File upload strategy decided (Cloudinary/S3 for production)
