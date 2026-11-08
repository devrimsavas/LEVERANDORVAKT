# Leverandørvakt

> ⚠️ **Under active development** — the backend foundation (company lookup, authentication, database migrations) is in place. The watchlist and change-detection features are being built next. See the [Roadmap](#-roadmap).

An early-warning service for Norwegian businesses, built on open data from the **Brønnøysund Register Centre** (Brønnøysundregistrene).

Small businesses rarely notice when a supplier or customer gets into trouble until an invoice goes unpaid. Leverandørvakt lets users follow the companies they work with — suppliers, customers, partners — and get notified when something important changes in the public registry: a new CEO, a change in the board, late annual accounts, or the start of bankruptcy proceedings.

## 🚀 Features

### Implemented

- **Company lookup** — fetch a company by its 9-digit organization number, live from the Brønnøysund API
- **Company search** — search companies by name (handles Norwegian characters such as æ, ø, å)
- **Clean company model** — the raw registry format is mapped into the app's own English data shape, so the rest of the app never depends on the external API format
- **User registration and login** — bcrypt-hashed passwords, JWT authentication, role-based users (`user` / `admin`)
- **Public user IDs** — users are identified externally by a UUID; the internal database ID is never exposed
- **Versioned database migrations** — schema changes are tracked as numbered migration files and applied automatically on startup
- **Interactive API documentation** — Swagger UI at `/api/docs`

### Planned

- **Company watchlist** — each user follows their own list of companies
- **Change detection** — a scheduled job compares the registry with the last known state and records every change
- **Notifications** — users are alerted when a followed company changes
- **Role network** — how people and companies are connected through board and management roles
- **Risk signals** — a "check before you sign" score based on bankruptcy/liquidation flags, company age, late annual accounts and frequent management changes
- **Regional trends** — new companies over time by municipality and industry code
- **AI assistant** — ask questions about followed companies in plain language, using the same service functions as the API

## 🛠 Tech Stack

| Area | Technology |
|---|---|
| Runtime | Node.js, TypeScript (strict mode, ES modules) |
| Framework | Express 5 |
| Database | PostgreSQL |
| ORM | Sequelize with `sequelize-typescript` (decorator models) |
| Migrations | Umzug |
| Authentication | JSON Web Tokens (`jsonwebtoken`), password hashing with `bcryptjs` |
| API docs | Swagger / OpenAPI 3 (`swagger-autogen` + `swagger-ui-express`) |
| Data source | [Brønnøysund Register Centre open API](https://data.brreg.no) (free, no API key) |

## 🏗 Architecture

The backend is split into layers, each with one responsibility:

```
Request
   │
   ▼
routes/        URL → handler mapping only
   │
   ▼
controllers/   HTTP concerns: read and validate input, choose the status code
   │
   ▼
services/      Business logic: talk to Brreg and the database, no knowledge of HTTP
   │
   ├──► mappers/   Convert external data (Brreg format) into the app's own types
   └──► models/    Database tables (Sequelize)
```

Services do not know about HTTP, so the same functions can be reused by the scheduled change-detection job and by the AI assistant, not only by the API.

## 🔑 Key Design Decisions

- **Own data model instead of the raw registry format.** `BrregEnhet` describes the API's Norwegian, nested format; `Company` is the app's own flat, English shape; `toCompany` converts between them. If the registry changes a field, only the mapper changes.
- **Two user identifiers.** `id` is an internal auto-increment primary key used for relations between tables. `public_id` is a UUID used in the API and in tokens, so user numbers cannot be guessed and the number of users is not revealed.
- **Roles are never taken from client input.** New users are always `user`; admin accounts are created separately.
- **Same error for unknown email and wrong password**, so the login endpoint cannot be used to find out which emails are registered.
- **Migrations instead of `sequelize.sync()`.** Every schema change is an explicit, reviewable file that runs the same way locally and in production, without guessing or losing data.
- **Clear error status codes.** `400` invalid input, `401` invalid credentials, `404` company not found, `409` email already registered, `502` the Brønnøysund API could not be reached.

## 📡 API Endpoints

Full, interactive documentation is available at `/api/docs` when the server is running.

### Companies

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/companies/{orgNumber}` | Get a company by its 9-digit organization number |
| GET | `/api/companies/search?name=...` | Search companies by name (at least 2 characters) |

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create an account (`firstName`, `lastName`, `email`, `password`) |
| POST | `/api/auth/login` | Log in and receive a JWT together with the user's public data |

## 🗄 Data Model

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | integer | Internal primary key, never exposed |
| `public_id` | UUID | Public user number, used in the API and in tokens |
| `first_name` | varchar(100) | Required |
| `last_name` | varchar(100) | Required |
| `email` | varchar(255) | Required, unique, stored in lower case |
| `password_hash` | varchar | bcrypt hash, never returned by the API |
| `role` | varchar(20) | `user` (default) or `admin` |
| `last_login_at` | timestamp | Updated on every successful login |
| `created_at`, `updated_at` | timestamp | Managed automatically |

Applied migrations are recorded in the `migrations` table.

## 📂 Project Structure

```
LEVERANDORVAKT/
├── src/
│   ├── app.ts                    # Entry point: Express setup, DB connection, migrations, server start
│   ├── swagger.ts                # Generates swagger_output.json from the routes
│   ├── config/
│   │   ├── database.ts           # Sequelize connection
│   │   └── migrator.ts           # Umzug migration runner
│   ├── migrations/
│   │   └── 0001-create-users.ts
│   ├── models/
│   │   └── User.ts
│   ├── routes/
│   │   ├── index.ts
│   │   ├── companies.ts
│   │   └── auth.ts
│   ├── controllers/
│   │   ├── companyController.ts
│   │   └── authController.ts
│   ├── services/
│   │   ├── brregService.ts       # Calls the Brønnøysund API
│   │   └── authService.ts        # Registration, login, JWT
│   ├── mappers/
│   │   └── companyMapper.ts      # Brreg format → Company
│   └── types/
│       ├── brreg.ts              # Shapes of the Brønnøysund API responses
│       └── company.ts            # The app's own Company type
├── envexample
├── package.json
└── tsconfig.json
```

## ▶️ Getting Started

### Prerequisites

- Node.js 22+
- PostgreSQL

### 1. Clone the repository

```bash
git clone https://github.com/devrimsavas/LEVERANDORVAKT.git
cd LEVERANDORVAKT
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create the database

```sql
CREATE DATABASE leverandorvakt;
```

### 4. Create a `.env` file

Copy `envexample` to `.env` and fill in your own values:

```env
PORT=3000
DATABASE_URL=postgres://postgres:password@localhost:5432/leverandorvakt
JWT_SECRET=change_me
JWT_EXPIRES_IN=1d
```

Generate a strong `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 5. Build and generate the API docs

```bash
npm run build
npm run swagger
```

### 6. Run in development mode

```bash
npm run dev
```

On startup the app connects to the database and applies any pending migrations automatically. The server runs at `http://localhost:3000` and the API docs at `http://localhost:3000/api/docs`.

### Available scripts

| Script | What it does |
|---|---|
| `npm run dev` | Compiles TypeScript in watch mode and restarts the server on every change |
| `npm run build` | Compiles TypeScript into `dist/` |
| `npm start` | Runs the compiled app |
| `npm run swagger` | Generates `swagger_output.json` from the compiled routes |

## 🗺 Roadmap

### Foundation
- [x] Express 5 + TypeScript project setup
- [x] Brønnøysund API integration: lookup by organization number and search by name
- [x] Layered architecture: routes, controllers, services, mappers
- [x] Swagger / OpenAPI documentation
- [x] PostgreSQL connection with Sequelize
- [x] Versioned migrations with Umzug, applied on startup

### Authentication and users
- [x] User registration and login (bcrypt + JWT)
- [x] Internal ID + public UUID, roles (`user` / `admin`)
- [ ] `requireAuth` middleware for protected endpoints
- [ ] `GET /api/auth/me` — current user's profile
- [ ] Admin account created once on startup from environment variables

### Watchlist and change detection
- [ ] Data model design: `companies`, `watchlist_entries`, `company_changes`
- [ ] Add and remove companies from a user's watchlist
- [ ] Scheduled change detection using the Brønnøysund update feed
- [ ] Change history per company
- [ ] Notifications for followed companies

### Insights
- [ ] Role network (board members and management across companies)
- [ ] Risk signals score
- [ ] Regional trends by municipality and industry

### AI
- [ ] AI assistant with tool calling, using the existing service functions

### Quality and delivery
- [ ] Automated tests (Jest + Supertest)
- [ ] GitHub Actions CI
- [ ] Docker Compose for local development
- [ ] Deployment (Render + Aiven PostgreSQL)
- [ ] Frontend

## 📄 Data Source

Company data comes from the open API of the [Brønnøysund Register Centre](https://data.brreg.no), available under the Norwegian Licence for Open Government Data (NLOD).
