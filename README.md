# Pharmacy Management System

Full-stack pharmacy management app built with the PERN stack (PostgreSQL, Express, React, Node) and Tailwind CSS.

## Tech Stack

| Layer     | Technology                                      |
|-----------|-------------------------------------------------|
| Frontend  | React 18, Vite, Tailwind CSS, React Query, Axios |
| Backend   | Node.js, Express, PostgreSQL (`pg`)             |
| Auth      | JWT (jsonwebtoken) + bcryptjs                   |
| Forms     | React Hook Form                                 |

## Project Structure

```
Pharmacy/
├── client/                  # React + Tailwind frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/      # Modal, Table, StatCard, PageHeader, ConfirmDialog
│   │   │   └── layout/      # Layout, Sidebar, Header
│   │   ├── context/         # AuthContext
│   │   ├── hooks/           # useDebounce, useModal
│   │   ├── pages/           # Dashboard, Medicines, Suppliers, Orders, Sales, Inventory, Users
│   │   ├── services/        # api.js (Axios + resource helpers)
│   │   └── utils/           # helpers (formatCurrency, formatDate, stockStatus)
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── package.json
│
└── server/                  # Express + PostgreSQL backend
    ├── config/              # db.js, migrate.js, seed.js
    ├── controllers/         # auth, user, medicine, supplier, order, sale, inventory
    ├── middleware/          # auth (JWT), errorHandler, validate
    ├── routes/              # One file per resource
    ├── utils/               # helpers
    └── server.js
```

## Getting Started

### 1. PostgreSQL Setup

Create a database:
```sql
CREATE DATABASE pharmacy_db;
```

### 2. Backend

```bash
cd server
cp .env.example .env      # fill in your DB credentials and JWT_SECRET
npm install
npm run db:migrate        # create tables

# Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env first, then:
npm run db:seed           # creates that one admin account — skipped if unset

npm run dev
```

### 3. Frontend

```bash
cd client
cp .env.example .env      # set VITE_API_URL if not using the Vite proxy
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Admin Account

No default admin account exists (SEC-07) — `npm run db:seed` creates exactly
one, from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` in your own `.env`. For
a full local demo dataset (sample doctors, patients, pharmacies, lab
results), see `corehealth_seed_data.sql` — **local development only**,
never run it against a shared or deployed environment.

## API Endpoints

| Method | Path                        | Description         | Auth       |
|--------|-----------------------------|---------------------|------------|
| POST   | /api/auth/login             | Login               | Public     |
| GET    | /api/auth/me                | Current user        | Any        |
| POST   | /api/auth/register          | Create user         | Admin only |
| GET    | /api/medicines              | List medicines      | Any        |
| POST   | /api/medicines              | Add medicine        | Admin/Pharm|
| PUT    | /api/medicines/:id          | Update medicine     | Admin/Pharm|
| DELETE | /api/medicines/:id          | Delete medicine     | Admin      |
| GET    | /api/suppliers              | List suppliers      | Any        |
| GET    | /api/orders                 | List orders         | Any        |
| POST   | /api/orders                 | Create order        | Admin/Pharm|
| PATCH  | /api/orders/:id/receive     | Receive order       | Admin/Pharm|
| GET    | /api/sales                  | List sales          | Any        |
| POST   | /api/sales                  | Record sale         | Any        |
| GET    | /api/inventory/summary      | Stock summary       | Any        |
| GET    | /api/inventory/low-stock    | Low stock items     | Any        |
| GET    | /api/inventory/expiring     | Expiring medicines  | Any        |
| GET    | /api/users                  | List users          | Admin      |
| DELETE | /api/users/:id              | Delete user         | Admin      |

## Roles

| Role        | Permissions                                     |
|-------------|-------------------------------------------------|
| `admin`     | Full access including user management           |
| `pharmacist`| Add/edit medicines, suppliers, orders, sales    |
| `staff`     | View all, record sales                          |
