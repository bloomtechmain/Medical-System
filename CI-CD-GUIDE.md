# CI/CD Pipeline Guide for Medical System

## Table of Contents
1. [What is CI/CD? (Super Simple)](#1-what-is-cicd-super-simple)
2. [The Full Picture — What Happens When You Push Code](#2-the-full-picture--what-happens-when-you-push-code)
3. [CI Explained — Continuous Integration](#3-ci-explained--continuous-integration)
4. [CD Explained — Continuous Deployment](#4-cd-explained--continuous-deployment)
5. [Testing — What It Is and Where It Fits](#5-testing--what-it-is-and-where-it-fits)
6. [Build the CI Pipeline (Step by Step)](#6-build-the-ci-pipeline-step-by-step)
7. [Build the CD Pipeline (Step by Step)](#7-build-the-cd-pipeline-step-by-step)
8. [Add Secrets to GitHub](#8-add-secrets-to-github)
9. [How to Read Pipeline Results on GitHub](#9-how-to-read-pipeline-results-on-github)
10. [Quick Reference Cheat Sheet](#10-quick-reference-cheat-sheet)

---

## 1. What is CI/CD? (Super Simple)

Think of CI/CD like a **robot helper** that watches your GitHub repo.

Every time you push code, the robot automatically:
1. **Checks** your code for mistakes (CI)
2. **Deploys** your code to the live server (CD)

Without CI/CD — you push → manually build → manually deploy → hope nothing broke.  
With CI/CD — you push → robot does everything → you relax.

```
YOU PUSH CODE
     ↓
  GitHub
     ↓
Robot runs checks (CI)
     ↓
  All good? → Robot deploys to server (CD)
  Has errors? → Robot emails you, nothing breaks on production
```

---

## 2. The Full Picture — What Happens When You Push Code

```
┌─────────────────────────────────────────────────────┐
│                  YOUR LOCAL MACHINE                 │
│  git add . → git commit -m "fix" → git push         │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│                    GITHUB                           │
│  Your code lands in the repo                        │
│  GitHub Actions wakes up automatically              │
└─────────────────────┬───────────────────────────────┘
                      │
          ┌───────────▼───────────┐
          │                       │
          ▼                       ▼
┌─────────────────┐    ┌─────────────────────────────┐
│   CI PIPELINE   │    │   (CD waits for CI to pass) │
│                 │    └─────────────────────────────┘
│ 1. Install deps │
│ 2. Lint code    │
│ 3. Build server │
│ 4. Build client │
│ 5. Run tests    │
│                 │
│ PASS ✅ or FAIL ❌│
└────────┬────────┘
         │
    PASS ✅ only
         │
         ▼
┌─────────────────┐
│   CD PIPELINE   │
│                 │
│ 1. Deploy to    │
│    Railway      │
│ 2. Server live! │
└─────────────────┘
```

---

## 3. CI Explained — Continuous Integration

**CI = "Check my code every time I push"**

The word "Integration" means merging new code into the main project. CI runs automated checks to make sure your new code doesn't break anything.

### What CI does for your Medical System:

| Step | What it checks | Why it matters |
|------|---------------|----------------|
| Install dependencies | `npm install` runs clean | Catches missing packages |
| Lint | Code style rules (`npm run lint`) | Catches typos and bad patterns |
| Build Server | TypeScript compiles (`npm run build`) | Catches type errors |
| Build Client | Vite builds React app (`npm run build`) | Catches import errors, bad JSX |
| Tests | Runs test files | Catches logic bugs |

### When CI runs:
- Every `git push` to any branch
- When someone opens a Pull Request (PR)

### CI result:
- **Green checkmark ✅** — code is safe to deploy
- **Red X ❌** — something broke, do NOT deploy, fix first

---

## 4. CD Explained — Continuous Deployment

**CD = "Automatically send my code to the live server after CI passes"**

CD only runs if CI passes. It takes your checked code and pushes it to Railway (your hosting platform).

### What CD does for your Medical System:

| Step | What happens |
|------|-------------|
| Trigger | CI passed on the `main` branch |
| Deploy server | Railway updates your Node/Express API |
| Deploy client | Railway updates your React frontend |
| Done | Your users see the new version |

### When CD runs:
- Only when you push to the `main` branch AND CI passes
- Does NOT run on feature branches (you don't want half-finished code going live)

### The rule:
```
Push to any branch  →  CI runs only
Push to main        →  CI runs, then CD runs (if CI passes)
```

---

## 5. Testing — What It Is and Where It Fits

Tests are small pieces of code that check your real code works correctly.

### 3 types of tests (simple explanation):

```
UNIT TEST
─────────
Tests one small function in isolation.
Example: "Does my login function return a token when given correct credentials?"

INTEGRATION TEST  
────────────────
Tests two things working together.
Example: "Does my /api/login route talk to the database and return the right response?"

END-TO-END TEST (E2E)
─────────────────────
Tests the whole app like a real user would.
Example: "Can I click Login, fill in the form, and see the dashboard?"
```

### Where tests fit in CI:

```
CI Pipeline
    ├── Install deps
    ├── Lint
    ├── Build
    └── RUN TESTS ← here
            ├── unit tests (fast, seconds)
            ├── integration tests (medium, minutes)
            └── e2e tests (slow, optional in CI)
```

### Your project currently has no tests — that is fine!

The CI pipeline will still run lint + build checks. You can add tests later. This guide sets up the structure so adding tests just means dropping test files in.

---

## 6. Build the CI Pipeline (Step by Step)

### Step 1 — Create the GitHub Actions folder

In your project root, create this folder structure:
```
Medical-System/
└── .github/
    └── workflows/
        └── ci.yml       ← CI pipeline file
        └── cd.yml       ← CD pipeline file
```

### Step 2 — Create the CI workflow file

Create the file `.github/workflows/ci.yml` with this content:

```yaml
# .github/workflows/ci.yml
name: CI - Check Code Quality

# When does this run?
on:
  push:
    branches: ["*"]          # runs on every branch push
  pull_request:
    branches: [main]         # runs when PR targets main

jobs:
  # ─────────────────────────────────────────────────────
  # JOB 1: Check the Server (Node.js + TypeScript)
  # ─────────────────────────────────────────────────────
  check-server:
    name: Server — Lint & Build
    runs-on: ubuntu-latest   # GitHub provides a free Linux machine

    steps:
      # 1. Download your code onto the GitHub machine
      - name: Checkout code
        uses: actions/checkout@v4

      # 2. Install Node.js
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: server/package-lock.json

      # 3. Install server dependencies
      - name: Install server dependencies
        working-directory: ./server
        run: npm ci              # ci = clean install, faster than npm install

      # 4. Check code style
      - name: Lint server
        working-directory: ./server
        run: npm run lint
        continue-on-error: true  # lint warnings won't block deployment

      # 5. Compile TypeScript → check for type errors
      - name: Build server
        working-directory: ./server
        run: npm run build

  # ─────────────────────────────────────────────────────
  # JOB 2: Check the Client (React + Vite)
  # ─────────────────────────────────────────────────────
  check-client:
    name: Client — Lint & Build
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: client/package-lock.json

      - name: Install client dependencies
        working-directory: ./client
        run: npm ci

      - name: Lint client
        working-directory: ./client
        run: npm run lint
        continue-on-error: true

      - name: Build client
        working-directory: ./client
        run: npm run build
        env:
          # Vite needs these at build time — use placeholder for CI
          VITE_API_URL: http://localhost:5000
          VITE_WS_URL: ws://localhost:5000
```

> **What this does:**  
> - GitHub spins up a fresh Linux computer  
> - Installs Node 20, downloads your code, installs packages  
> - Runs lint and build for both server and client  
> - If TypeScript has errors → pipeline fails → you get notified  

---

## 7. Build the CD Pipeline (Step by Step)

Your app is hosted on **Railway**. Railway has two ways to auto-deploy:

### Option A — Railway Auto-Deploy (Easiest, recommended for beginners)

Railway can watch your GitHub repo and deploy automatically when you push to `main`. No YAML needed.

**Steps:**
1. Go to [railway.app](https://railway.app) and open your project
2. Click your service (backend or frontend)
3. Go to **Settings** → **Source**
4. Under **Branch**, make sure it says `main`
5. Toggle **Auto Deploy** to ON

That's it. Every push to `main` deploys automatically after CI passes... well, Railway deploys regardless of CI with this option. To link CI and CD properly, use Option B.

---

### Option B — GitHub Actions CD (Proper CI/CD, CD waits for CI)

Create the file `.github/workflows/cd.yml`:

```yaml
# .github/workflows/cd.yml
name: CD - Deploy to Railway

# Only run when CI passes on main branch
on:
  workflow_run:
    workflows: ["CI - Check Code Quality"]   # must match the name in ci.yml
    branches: [main]
    types: [completed]

jobs:
  deploy:
    name: Deploy to Railway
    runs-on: ubuntu-latest

    # Only deploy if CI actually passed (not if it failed)
    if: ${{ github.event.workflow_run.conclusion == 'success' }}

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      # Install Railway CLI tool
      - name: Install Railway CLI
        run: npm install -g @railway/cli

      # Deploy! Uses your Railway token stored as a GitHub Secret
      - name: Deploy to Railway
        run: railway up --service ${{ secrets.RAILWAY_SERVICE_ID }}
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

> This workflow only runs **after** the CI workflow finishes AND **only if CI passed**. No more broken code going to production.

---

## 8. Add Secrets to GitHub

Your CD pipeline needs your Railway credentials. You store them as **Secrets** (encrypted, never visible in logs).

### Get your Railway token:

1. Go to [railway.app](https://railway.app)
2. Click your profile icon → **Account Settings**
3. Scroll to **API Tokens**
4. Click **New Token** → name it `github-actions` → copy it

### Get your Railway Service ID:

1. Open your Railway project
2. Click the service you want to deploy
3. Go to **Settings**
4. Copy the **Service ID** from the top

### Add secrets to GitHub:

1. Go to your GitHub repo: `github.com/TharushaTDK/Medical-System`
2. Click **Settings** (top tab)
3. Left sidebar → **Secrets and variables** → **Actions**
4. Click **New repository secret**

Add these two secrets:

| Secret Name | Value |
|------------|-------|
| `RAILWAY_TOKEN` | Your Railway API token |
| `RAILWAY_SERVICE_ID` | Your Railway service ID |

> Secrets are encrypted. GitHub hides them in logs as `***`. Nobody can see them.

---

## 9. How to Read Pipeline Results on GitHub

After you push code, go to your repo on GitHub:

### View pipeline status:
1. Click the **Actions** tab (top of your repo)
2. You see a list of workflow runs
3. Green circle ✅ = passed, Red circle ❌ = failed, Yellow circle ⏳ = running

### View details when something fails:
1. Click the failed run
2. Click the failed job (e.g., "Server — Lint & Build")
3. Click the failed step
4. Read the error message — it shows exactly what went wrong

### Status shown on commits:
GitHub also shows a small ✅ or ❌ next to each commit hash on the main page.

### Email notifications:
GitHub emails you automatically when a pipeline fails. You can control this in:  
Profile → Settings → Notifications → GitHub Actions

---

## 10. Quick Reference Cheat Sheet

### Files you need to create:

```
Medical-System/
├── .github/
│   └── workflows/
│       ├── ci.yml     ← copy from Section 6
│       └── cd.yml     ← copy from Section 7
```

### The simple flow:

```
YOU: git push origin main
          ↓
GITHUB ACTIONS:
  ci.yml runs →  install → lint → build
          ↓
  All passed? → cd.yml runs → railway up → LIVE!
  Something failed? → Email to you → nothing deployed
```

### Common errors and fixes:

| Error | What it means | Fix |
|-------|--------------|-----|
| `npm ci` fails | package-lock.json is out of sync | Run `npm install` locally and push |
| TypeScript error | Type mistake in your code | Fix the error shown in the log |
| `RAILWAY_TOKEN` not found | Secret not added to GitHub | Do Section 8 again |
| Build fails with `VITE_API_URL` | Missing env variable in CI | Add `env:` block in ci.yml (already included above) |

### Branches strategy (simple):

```
main      → production code, triggers CD
feature/* → your working branches, only CI runs
```

Always work on a feature branch, then merge to main when ready. That way the live app only gets stable code.

---

## Summary — What You Built

```
BEFORE CI/CD:
  You push → manually build → manually deploy → fingers crossed

AFTER CI/CD:
  You push → robot checks code → robot deploys → you sleep well
```

Your pipeline does:
- **CI**: Checks TypeScript types + linting on every push to any branch
- **CD**: Deploys to Railway only when CI passes on main branch
- **Protection**: Broken code can never reach your users automatically

---

*Tech stack detected: Node.js + TypeScript (server), React + Vite + TypeScript (client), PostgreSQL, Railway hosting*
