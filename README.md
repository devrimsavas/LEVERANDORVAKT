# Leverandørvakt

[![CI](https://github.com/devrimsavas/LEVERANDORVAKT/actions/workflows/ci.yml/badge.svg)](https://github.com/devrimsavas/LEVERANDORVAKT/actions/workflows/ci.yml)

_Last updated: 11.11.2026_

> ⚠️ **Under active development** — the backend for following companies, detecting changes (company data, roles and annual accounts) and notifying users, an explainable risk assessment and an AI assistant with tool calling are in place and covered by tests. Deployment and the frontend are next. See the [Roadmap](#roadmap).

An early-warning service for Norwegian businesses, built on open data from the **Brønnøysund Register Centre** (Brønnøysundregistrene).

Small businesses rarely notice when a supplier or customer gets into trouble until an invoice goes unpaid. Leverandørvakt lets users follow the companies they work with — suppliers, customers, partners — and get notified when something important changes in the public registry: a new CEO, a change in the board, late annual accounts, or the start of bankruptcy proceedings.

## Features

### Implemented

- **Company lookup** — fetch a company by its 9-digit organization number, live from the Brønnøysund API
- **Company search** — search companies by name (handles Norwegian characters such as æ, ø, å)
- **Company roles** — the current CEO, board, auditor and accountant of a company
- **Annual accounts** — key figures from the last three annual accounts (company and group), in the currency they were reported in, with warning signs such as unaudited accounts
- **Annual accounts history and checks** — every set of accounts seen is stored, including years Brreg no longer shows; a daily check records new and corrected filings, liquidation accounts, equity turning negative and audits being dropped, and notifies followers
- **Risk signals** — an explainable "check before you sign" assessment for any company: every signal with its points and reason, and what could not be checked; followers are notified when a company's risk level rises (see [Risk Signals](#risk-signals))
- **Connections** — people and organizations (e.g. an audit firm) that hold roles in two or more of your companies, or in a company you are considering and your current ones; people are matched on name and birth date in memory, and birth dates are never stored or returned
- **Clean company model** — the raw registry format is mapped into the app's own English data shape, so the rest of the app never depends on the external API format
- **User registration and login** — bcrypt-hashed passwords, JWT authentication, role-based users (`user` / `admin`)
- **Public user IDs** — users are identified externally by a UUID; the internal database ID is never exposed
- **Company watchlist** — each user follows their own list of companies, with a private note per company
- **Change detection** — a scheduled job reads the Brønnøysund company and role update feeds and records every change with a severity (`critical` / `warning` / `info`)
- **Notifications** — followers of a company are notified of every recorded change
- **Versioned database migrations** — schema changes are tracked as numbered migration files and applied automatically on startup
- **AI assistant** — questions in plain language ("Which of my suppliers have the highest risk?") answered with tool calling over the app's own service functions; read-only, per-user conversations, a daily question limit, and a choice of model provider (local Ollama, Ollama Cloud or Gemini) in `.env`
- **Interactive API documentation** — Swagger UI at `/api/docs`
- **Automated tests and CI** — Vitest + Supertest against a real PostgreSQL database, run by GitHub Actions on every push

### Planned

- **Ownership** — shareholders from Skatteetaten's shareholder register, imported by a separate Python service
- **Regional trends** — new companies over time by municipality and industry code

## Tech Stack

| Area           | Technology                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime        | Node.js, TypeScript (strict mode, ES modules)                                                                                                    |
| Framework      | Express 5                                                                                                                                        |
| Database       | PostgreSQL                                                                                                                                       |
| ORM            | Sequelize with `sequelize-typescript` (decorator models)                                                                                         |
| Migrations     | Umzug                                                                                                                                            |
| Authentication | JSON Web Tokens (`jsonwebtoken`), password hashing with `bcryptjs`                                                                               |
| AI             | Ollama (`ollama` client, local or Ollama Cloud) or the Gemini API, behind one provider interface                                                 |
| API docs       | Swagger / OpenAPI 3 (`swagger-autogen` + `swagger-ui-express`)                                                                                   |
| Testing        | Vitest + Supertest, GitHub Actions CI                                                                                                            |
| Containers     | Docker (multi-stage image) and Docker Compose for the API and PostgreSQL                                                                         |
| Data source    | [Brønnøysund Register Centre open API](https://data.brreg.no) (Central Coordinating Register and Register of Company Accounts; free, no API key) |

## Architecture

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

## Key Design Decisions

- **Own data model instead of the raw registry format.** `BrregEnhet` describes the API's Norwegian, nested format; `Company` is the app's own flat, English shape; `toCompany` converts between them. If the registry changes a field, only the mapper changes.
- **Two user identifiers.** `id` is an internal auto-increment primary key used for relations between tables. `public_id` is a UUID used in the API and in tokens, so user numbers cannot be guessed and the number of users is not revealed.
- **User roles are never taken from client input.** New users are always `user`; the admin account is created once from environment variables.
- **Same error for unknown email and wrong password**, so the login endpoint cannot be used to find out which emails are registered.
- **Migrations instead of `sequelize.sync()`.** Every schema change is an explicit, reviewable file that runs the same way locally and in production, without guessing or losing data.
- **Change detection reads the Brønnøysund update feeds instead of polling every company.** Only companies that appear in the company feed or the role feed are looked up, and each feed has its own stored position, so a run continues exactly where the previous one stopped.
- **Nothing is skipped or recorded twice.** Companies are checked in the order their changes happened; if a check fails, the run stops there and both feed positions stay just before that company, so it is checked again on the next run. The changes, the notifications and the new stored state of a company are saved in one transaction.
- **A first look is not a change.** When a company is followed, or its roles are stored for the first time, that state becomes the starting point; only later differences are recorded.
- **No personal data beyond names.** Roles are stored by name only; birth dates from the registry are not stored.
- **Annual accounts are kept in the currency they were reported in.** Some companies report in USD or EUR; figures are never converted, and the currency is always returned with them.
- **"Not covered" is not an error.** The accounts register answers banks and insurance companies with a `500` and a message; the app recognises that message and returns `status: "unsupported"`, so these companies are not retried as failures.
- **Two jobs, two failure strategies.** Change detection follows feeds, so it stops at the first failed company to keep its feed position. The accounts check has no feed: each company has its own check time, so a failed company is skipped and retried on the next run while the others go on.
- **Warnings for changes for the worse, not for known states.** A small company that has never been audited, or whose equity was already negative, does not trigger a new warning every year; only the step from audited to unaudited, or from positive to negative equity, does.
- **The assistant only reads.** Its tools wrap the existing service functions and change nothing; following, notes and notifications are changed by the user through the normal API. The user's identity comes from the login token, never from the model, and private notes are never sent to the model.
- **Provider-independent assistant.** One `LlmProvider` interface with Ollama (local or cloud) and Gemini behind it, chosen in `.env`. Development runs free on a local model; the deployed demo can use a hosted one without code changes. Tests use a fake model server, so CI never calls a real model.
- **Connections without storing personal data.** Telling two people with the same name apart needs their birth date, which is not stored. Connections are therefore computed on request from live role data, matched in memory, and returned with names and roles only. Only the user's own companies are compared, so nobody learns what others follow.
- **Risk that explains itself.** The assessment lists every signal with its points and reason, and every limitation (e.g. no change history for an unfollowed company, no key figures for a bank), so a "low" level is never mistaken for a full check. All weights live in one `RISK_RULES` object.
- **The rules are a pure function of the data and the date.** `assessRisk(input, now)` touches no database or network, so every rule is tested on a fixed day; the tests never break because the calendar moved past a deadline.
- **Clear error status codes.** `400` invalid input, `401` missing or invalid token / credentials, `403` not allowed (e.g. not an admin), `404` not found, `409` conflict (email already registered, change detection already running), `502` the Brønnøysund API could not be reached.

## Risk Signals

A transparent "check before you sign" assessment, built only from public register data. **It is not a credit rating.**

| Signal                                                                                      | When                                                                    | Points                    |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------- |
| `BANKRUPT`, `UNDER_LIQUIDATION`, `FORCED_LIQUIDATION`, `STRUCK_OFF`, `LIQUIDATION_ACCOUNTS` | The register or the latest accounts say so                              | critical: level is `high` |
| `ACCOUNTS_MISSING_TWO_YEARS`                                                                | No accounts for the last two due years (AS, ASA, SA)                    | 40                        |
| `NEGATIVE_EQUITY`                                                                           | Equity below zero in the latest own accounts                            | 30                        |
| `ACCOUNTS_OVERDUE`                                                                          | Accounts for a year not filed by 31 July of the next year (AS, ASA, SA) | 25                        |
| `LOSS_TWO_YEARS`                                                                            | Losses in the two latest consecutive years                              | 20                        |
| `AUDITOR_LEFT`                                                                              | The auditor left or was replaced in the last 12 months                  | 15                        |
| `FREQUENT_CEO_CHANGES`                                                                      | Two or more CEO changes in the last 12 months                           | 15                        |
| `LOW_EQUITY_RATIO`                                                                          | Equity below 10 % of total assets                                       | 10                        |
| `LOSS_LAST_YEAR`                                                                            | A loss in the latest year only                                          | 10                        |
| `FREQUENT_ADDRESS_CHANGES`                                                                  | Two or more address changes in the last 12 months                       | 10                        |
| `YOUNG_COMPANY`                                                                             | Founded less than 12 months ago                                         | 10                        |
| `AUDIT_OPTED_OUT`                                                                           | The company has opted out of audit                                      | info, 0                   |

The score is the sum of the points, at most 100. The level is `high` with any critical signal or a score of 40 or more, `medium` from 20, otherwise `low`. Key figures come from the company's own accounts, not the group's. Change-history signals need the company to be followed.

For followed companies the level is stored and re-assessed after every check. A rise is recorded and notified (unless the same check already notified the followers of the change behind it); a fall is recorded without a notification. Companies that have no risk level yet (e.g. followed before risk signals were added) are assessed from stored data at the end of the next change detection run.

## API Endpoints

Full, interactive documentation is available at `/api/docs` when the server is running.

### Companies

| Method | Endpoint                              | Description                                                                                                                                                     |
| ------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/companies/{orgNumber}`          | Get a company by its 9-digit organization number                                                                                                                |
| GET    | `/api/companies/search?name=...`      | Search companies by name (at least 2 characters)                                                                                                                |
| GET    | `/api/companies/{orgNumber}/roles`    | Get the current CEO, board, auditor and accountant from Brreg                                                                                                   |
| GET    | `/api/companies/{orgNumber}/risk`     | Risk assessment from live register data, also for companies you do not follow                                                                                   |
| GET    | `/api/companies/{orgNumber}/accounts` | Key figures from the latest annual accounts (up to three years), newest first; `status` is `unsupported` for companies the register does not cover (e.g. banks) |

### Authentication

| Method | Endpoint             | Description                                                      |
| ------ | -------------------- | ---------------------------------------------------------------- |
| POST   | `/api/auth/register` | Create an account (`firstName`, `lastName`, `email`, `password`) |
| POST   | `/api/auth/login`    | Log in and receive a JWT together with the user's public data    |
| GET    | `/api/auth/me`       | Get the logged-in user's profile (requires token)                |

### Watchlist

All watchlist endpoints require a token (`Authorization: Bearer <token>`). Each user sees and changes only their own watchlist.

| Method | Endpoint                              | Description                                                                                                                                            |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/watchlist`                      | List the companies on your watchlist with their roles, latest annual accounts and risk level; `sort=name` (default) or `sort=risk`                     |
| POST   | `/api/watchlist`                      | Follow a company (`orgNumber`, optional `note`)                                                                                                        |
| PATCH  | `/api/watchlist/{orgNumber}`          | Change or remove your note on a followed company                                                                                                       |
| DELETE | `/api/watchlist/{orgNumber}`          | Stop following a company                                                                                                                               |
| GET    | `/api/watchlist/{orgNumber}/changes`  | Change history of a followed company, newest first (`page`, `pageSize`)                                                                                |
| GET    | `/api/watchlist/connections`          | People and organizations holding roles in two or more of your companies; `with=<orgNumber>` compares a company you are considering with your watchlist |
| GET    | `/api/watchlist/{orgNumber}/risk`     | Full risk report of a followed company, including its change history                                                                                   |
| GET    | `/api/watchlist/{orgNumber}/accounts` | Every stored set of annual accounts of a followed company, newest first, including years Brreg no longer shows                                         |

### Notifications

All notification endpoints require a token. Each user sees and changes only their own notifications.

| Method | Endpoint                          | Description                                                 |
| ------ | --------------------------------- | ----------------------------------------------------------- |
| GET    | `/api/notifications`              | List your notifications (`unread=true`, `page`, `pageSize`) |
| GET    | `/api/notifications/unread-count` | Number of unread notifications                              |
| PATCH  | `/api/notifications/{id}/read`    | Mark one notification as read                               |
| POST   | `/api/notifications/read-all`     | Mark all notifications as read                              |

### Assistant

All assistant endpoints require a token. Each user sees only their own conversations.

| Method | Endpoint                            | Description                                                                                                                 |
| ------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/assistant/messages`           | Ask a question (`message`, optional `conversationId`); returns the answer, the tools it is based on and the conversation id |
| GET    | `/api/assistant/conversations`      | Your conversations, most recently used first (`page`, `pageSize`)                                                           |
| GET    | `/api/assistant/conversations/{id}` | One conversation with all its messages                                                                                      |
| DELETE | `/api/assistant/conversations/{id}` | Delete a conversation                                                                                                       |

Errors: `429` daily question limit reached, `503` assistant not configured or model not reachable, `504` model did not answer in time, `502` model returned an error.

### Admin

Admin endpoints require a token from an admin account. Regular users get `403 Forbidden`.

| Method | Endpoint                          | Description                                                                         |
| ------ | --------------------------------- | ----------------------------------------------------------------------------------- |
| POST   | `/api/admin/change-detection/run` | Run change detection immediately instead of waiting for the next scheduled run      |
| POST   | `/api/admin/accounts-check/run`   | Run the annual accounts check immediately instead of waiting for the next daily run |

List endpoints return `{ items, page, pageSize, totalItems, totalPages }` (default page size 20, maximum 100).

## Data Model

### `users`

| Column                     | Type         | Notes                                             |
| -------------------------- | ------------ | ------------------------------------------------- |
| `id`                       | integer      | Internal primary key, never exposed               |
| `public_id`                | UUID         | Public user number, used in the API and in tokens |
| `first_name`               | varchar(100) | Required                                          |
| `last_name`                | varchar(100) | Required                                          |
| `email`                    | varchar(255) | Required, unique, stored in lower case            |
| `password_hash`            | varchar      | bcrypt hash, never returned by the API            |
| `role`                     | varchar(20)  | `user` (default) or `admin`                       |
| `last_login_at`            | timestamp    | Updated on every successful login                 |
| `created_at`, `updated_at` | timestamp    | Managed automatically                             |

### Other tables

| Table                                           | What it holds                                                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `companies`                                     | One row per followed company: organization number, last known state (`snapshot`) and roles (JSONB), accounts status, latest risk level and score, check times       |
| `annual_accounts`                               | Every set of annual accounts seen: period, type (company / group), currency, audit and liquidation flags, key figures (JSONB); one row per company, type and period |
| `assistant_conversations`, `assistant_messages` | The user's conversations with the assistant: questions, answers and the tools each answer used (tool calls themselves are not stored)                               |
| `assistant_usage`                               | One row per question, for the daily limit; holds no content and is kept when a conversation is deleted                                                              |
| `watchlist_entries`                             | Which user follows which company, with the user's note (unique per user and company)                                                                                |
| `company_changes`                               | Every detected change: field, old and new value, severity, and the feed event that revealed it                                                                      |
| `notifications`                                 | One row per follower per change, with a public UUID and the time it was read                                                                                        |
| `brreg_sync_state`                              | Where change detection stopped in each Brønnøysund feed                                                                                                             |

Applied migrations are recorded in the `migrations` table.

## Project Structure

```
LEVERANDORVAKT/
├── src/
│   ├── app.ts                    # Express app: middleware, routes, Swagger UI (no startup side effects)
│   ├── server.ts                 # Entry point: loads .env, connects to the DB, runs migrations, starts the server and the job
│   ├── swagger.ts                # Generates swagger_output.json from the routes
│   ├── config/
│   │   ├── database.ts           # Sequelize connection and model registration
│   │   ├── migrator.ts           # Umzug migration runner
│   │   └── ensureAdmin.ts        # Creates the admin account once from environment variables
│   ├── migrations/               # Numbered schema changes (0001-create-users.ts, ...), applied on startup
│   ├── models/                   # User, CompanyRecord, WatchlistEntry, CompanyChange, Notification, BrregSyncState, AnnualAccountsRecord, Assistant*
│   ├── routes/                   # URL → controller mapping: index, auth, companies, watchlist, notifications, assistant, admin
│   ├── middlewares/
│   │   ├── requireAuth.ts        # Verifies the JWT and adds the user to the request
│   │   └── requireRole.ts        # Allows only the given roles (e.g. admin)
│   ├── controllers/              # HTTP layer: input validation and status codes
│   ├── services/
│   │   ├── brregService.ts       # Calls the Brønnøysund APIs: companies, roles, annual accounts and both update feeds
│   │   ├── authService.ts        # Registration, login, JWT
│   │   ├── userService.ts        # Maps the public user id in tokens to the internal id
│   │   ├── watchlistService.ts   # Following companies, notes, change history
│   │   ├── companyDiff.ts        # Compares two company states and rates each change
│   │   ├── roleDiff.ts           # Compares two sets of roles and rates each change
│   │   ├── connectionsService.ts # Finds shared people and organizations across companies, from live role data
│   │   ├── changeDetectionService.ts  # Reads both update feeds and records changes
│   │   ├── accountsDiff.ts       # Compares stored and current annual accounts and rates each change
│   │   ├── accountsService.ts    # Stores annual accounts and runs the daily accounts check
│   │   ├── storedAccounts.ts     # Reads stored annual accounts (shared by several services)
│   │   ├── riskAssessment.ts     # The risk rules: weights, thresholds and the pure assessRisk function
│   │   ├── riskService.ts        # Builds the risk input from live or stored data, stores levels, records rises
│   │   ├── assistantService.ts   # The agent loop, conversations and the daily limit
│   │   ├── assistantTools.ts     # The read-only tools the model can call, over the existing services
│   │   ├── llm/                  # LlmProvider implementations: Ollama (local or cloud) and Gemini, chosen in .env
│   │   └── notificationService.ts     # Creates and serves notifications
│   ├── jobs/
│   │   ├── changeDetectionJob.ts # Runs change detection on a timer, never two runs at once
│   │   └── accountsCheckJob.ts   # Runs the accounts check once a day, never two runs at once
│   ├── mappers/                  # Brreg / database shapes → API shapes (company, roles, role holders, accounts, changes)
│   ├── types/
│   │   ├── brreg.ts              # Shapes of the Brønnøysund API responses
│   │   ├── regnskap.ts           # Shapes of the Register of Company Accounts API responses
│   │   ├── company.ts            # The app's own Company type
│   │   ├── companyRoles.ts       # The app's own CompanyRoles type
│   │   ├── annualAccounts.ts     # The app's own AnnualAccounts type
│   │   ├── risk.ts               # Risk assessment types
│   │   ├── connections.ts        # Role holders and connections between companies
│   │   ├── llm.ts                # Provider-independent chat messages, tools and errors
│   │   └── express.d.ts          # Adds the authenticated user to Express requests
│   └── utils/                    # Validation and pagination helpers
├── tests/
│   ├── helpers/
│   │   ├── fakeBrreg.ts          # In-memory stand-in for the Brønnøysund API
│   │   ├── fakeLlm.ts            # Fake Ollama server with scripted model replies
│   │   ├── users.ts              # Test users and register/login helper
│   │   ├── globalSetup.ts        # Applies migrations to the test database once
│   │   └── setup.ts              # Empties all tables before every test
│   ├── fixtures/                 # Fictional data shaped like real Brreg responses
│   └── *.test.ts                 # One test file per area (auth, companies, watchlist, ...)
├── .github/workflows/
│   ├── ci.yml                    # Type check, tests and a Docker Compose smoke test on every push
│   └── portfolio-rebuild.yml     # Rebuilds the portfolio site when the README changes
├── Dockerfile                    # Multi-stage image: build with all dependencies, run with production ones only
├── docker-compose.yml            # The API and PostgreSQL for local development
├── .dockerignore
├── vitest.config.ts
├── envexample
├── package.json
└── tsconfig.json
```

## Getting Started

There are two ways to run the project: with Docker, which needs nothing else installed, or directly with Node.js for development.

### Quick start with Docker

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine with Compose).

```bash
git clone https://github.com/devrimsavas/LEVERANDORVAKT.git
cd LEVERANDORVAKT
cp envexample .env        # then set JWT_SECRET (and the ADMIN_* values) in .env
docker compose up --build
```

The API runs at `http://localhost:3000` and the docs at `http://localhost:3000/api/docs`. Compose starts PostgreSQL, waits until it accepts connections, then starts the API, which applies the migrations itself. The database is also reachable from your machine on port `5433` (e.g. for pgAdmin), and its data is kept in a Docker volume between runs; `docker compose down --volumes` deletes it.

Inside Docker the database address and the Ollama address are set by `docker-compose.yml`, so the `DATABASE_URL` and `OLLAMA_HOST` in `.env` are not used there. The assistant reaches Ollama running on your machine through `host.docker.internal`.

### Development setup

#### Prerequisites

- Node.js 22+
- PostgreSQL

#### 1. Clone the repository

```bash
git clone https://github.com/devrimsavas/LEVERANDORVAKT.git
cd LEVERANDORVAKT
```

#### 2. Install dependencies

```bash
npm install
```

#### 3. Create the database

```sql
CREATE DATABASE leverandorvakt;
```

#### 4. Create a `.env` file

Copy `envexample` to `.env` and fill in your own values:

```env
PORT=3000
DATABASE_URL=postgres://postgres:password@localhost:5432/leverandorvakt
JWT_SECRET=change_me
JWT_EXPIRES_IN=1d

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change_me
ADMIN_FIRST_NAME=Admin
ADMIN_LAST_NAME=User

CHANGE_DETECTION_INTERVAL_MINUTES=10
ACCOUNTS_CHECK_INTERVAL_HOURS=24

# AI assistant: "ollama" or "gemini"; leave empty to turn it off
AI_PROVIDER=ollama
AI_TIMEOUT_SECONDS=60
ASSISTANT_DAILY_LIMIT=20
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen3
OLLAMA_API_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=
```

The admin account is created once on the first startup from the `ADMIN_*` values; an existing user is never promoted to admin. Setting `CHANGE_DETECTION_INTERVAL_MINUTES` or `ACCOUNTS_CHECK_INTERVAL_HOURS` to `0` turns that job off.

For the assistant with a local model, install [Ollama](https://ollama.com), pull a model that supports tool calling (e.g. `ollama pull qwen3`) and set `OLLAMA_MODEL` to its name. For Ollama Cloud, set `OLLAMA_HOST=https://ollama.com` and an `OLLAMA_API_KEY`. For Gemini, set `AI_PROVIDER=gemini` with a key from Google AI Studio.

Generate a strong `JWT_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

#### 5. Build and generate the API docs

```bash
npm run build
npm run swagger
```

#### 6. Run in development mode

```bash
npm run dev
```

On startup the app connects to the database and applies any pending migrations automatically. The server runs at `http://localhost:3000` and the API docs at `http://localhost:3000/api/docs`.

#### Available scripts

| Script               | What it does                                                              |
| -------------------- | ------------------------------------------------------------------------- |
| `npm run dev`        | Compiles TypeScript in watch mode and restarts the server on every change |
| `npm run build`      | Compiles TypeScript into `dist/`                                          |
| `npm start`          | Runs the compiled app                                                     |
| `npm run swagger`    | Generates `swagger_output.json` from the compiled routes                  |
| `npm test`           | Runs all tests once                                                       |
| `npm run test:watch` | Runs the tests again on every change                                      |
| `npm run typecheck`  | Type checks the app and the tests without writing files                   |

## Tests

Tests run with **Vitest** and **Supertest** against a real PostgreSQL database. Every test starts with empty tables, and the Brønnøysund API is replaced by a fake in tests that need it, so the suite never depends on the network.

| Test file                       | What it covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/index.test.ts`           | The API responds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `tests/auth.test.ts`            | Registration (public data only, bcrypt hashing, email normalization, role cannot be set by the client, duplicate email, input validation), login (token content, same error for unknown email and wrong password), `/me` (missing, tampered and expired tokens, deleted account)                                                                                                                                                                                                                                                                          |
| `tests/companies.test.ts`       | Company lookup and search (struck-off companies, Norwegian characters, input validation, Brreg unavailable), roles mapped from a real-shaped Brreg response (deregistered members left out, sorted in Norwegian order, no birth dates)                                                                                                                                                                                                                                                                                                                    |
| `tests/watchlist.test.ts`       | Following a company (stored once and fetched from Brreg once even with several followers, unknown and struck-off companies, Brreg unavailable, input validation), listing only your own companies, notes, unfollowing, change history with pagination, users cannot see or change each other's watchlists                                                                                                                                                                                                                                                 |
| `tests/changeDetection.test.ts` | Starting point on the first run, changes recorded with severity and source update, stored state updated so nothing is recorded twice, one Brreg lookup per company, struck-off companies (including `410 Gone`), stopping before a failed company and catching up after a Brreg outage, notifications only to followers, full rollback when notifications cannot be saved                                                                                                                                                                                 |
| `tests/roleChanges.test.ts`     | Role changes (CEO, auditor, board) with severity and source event, deregistered members, ordering-only changes ignored, starting points in both feeds (also for existing installations), filling in missing roles, one check per company across both feeds, stopping before a failed company in both feeds and catching up                                                                                                                                                                                                                                |
| `tests/accounts.test.ts`        | Accounts mapped from a real-shaped response (missing figures, other currencies, warning signs, year from the period end), newest first with company before group, companies without accounts, unsupported companies (banks), struck-off companies, unknown companies, Brreg errors                                                                                                                                                                                                                                                                        |
| `tests/accountsCheck.test.ts`   | One filing per period for company and group together, corrected filings, warning signs only when things get worse (liquidation, equity turning negative, audit dropped), group accounts ignored for warnings, two years filed at once, accounts stored when following (also when the register is down or does not cover the company), daily check: no re-check within a day, no duplicates, history kept after Brreg drops a year, other companies checked when one fails, struck-off companies skipped, full rollback when notifications cannot be saved |
| `tests/risk.test.ts`            | Every risk rule on a fixed date (critical signals, the 31 July filing deadline, company forms and founding dates, key figures from the company's own accounts, change history within 12 months), limitations, score cap and level thresholds, live assessment of unfollowed and struck-off companies, watchlist report and sorting, risk rising by time alone is notified, falling risk recorded without notification                                                                                                                                     |
| `tests/assistant.test.ts`       | The agent loop against a fake Ollama server: answers with and without tools, tool calls and results sent back in Ollama's format, private notes never sent to the model, tools limited to the asking user's data, invalid tool input and unknown tools returned to the model as errors, unfollowed companies, Brreg errors, the step limit, conversation history, daily limit per user (not reset by deleting), unavailable / missing / slow models storing nothing, validation, private conversations                                                    |
| `tests/geminiProvider.test.ts`  | Gemini request format (system instruction, contents, function declarations, API key header), tool calls sent back unchanged with their thought signature, parallel tool results in one turn, quota errors                                                                                                                                                                                                                                                                                                                                                 |
| `tests/connections.test.ts`     | People matched on name and birth date (same name with a different birth date is not a connection, no birth date is not matched), shared audit firms, deregistered roles and several roles in one company ignored, most connected first, comparing a candidate company, other users' companies never compared, a company whose roles cannot be fetched, birth dates never returned                                                                                                                                                                         |
| `tests/notifications.test.ts`   | Notifications created end to end from detected changes, unread filter, pagination, unread count, marking one or all as read (first read time is kept), users cannot read or change each other's notifications                                                                                                                                                                                                                                                                                                                                             |
| `tests/admin.test.ts`           | Admin account created once from environment variables (never by promoting an existing user), admin-only change detection endpoint (`401` / `403` / `200`), `409` when a run is already in progress, `502` when Brreg cannot be reached; admin-only accounts check endpoint (`403` / `200` / `409`)                                                                                                                                                                                                                                                        |

### Running the tests

1. Create a separate test database, so tests never touch your development data:

   ```sql
   CREATE DATABASE leverandorvakt_test;
   ```

2. Create a `.env.test` file:

   ```env
   DATABASE_URL=postgres://postgres:password@localhost:5432/leverandorvakt_test
   JWT_SECRET=test_secret
   JWT_EXPIRES_IN=1h
   ```

3. Run:

   ```bash
   npm test
   ```

Migrations are applied to the test database automatically.

### Continuous integration

GitHub Actions runs two jobs on every push: the type check and all tests against a temporary PostgreSQL database, and a Docker job that builds the image, starts the stack with Docker Compose and checks that the API and its docs answer.

## Roadmap

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
- [x] `requireAuth` middleware for protected endpoints
- [x] `GET /api/auth/me` — current user's profile
- [x] Admin account created once on startup from environment variables

### Watchlist and change detection

- [x] Data model design: `companies`, `watchlist_entries`, `company_changes`
- [x] Add and remove companies from a user's watchlist
- [x] Scheduled change detection using the Brønnøysund update feeds (companies and roles)
- [x] Change history per company
- [x] Notifications for followed companies

### Testing and CI

- [x] Test setup: Vitest + Supertest with a separate test database
- [x] Fake Brønnøysund API for tests, so the suite never depends on the network
- [x] Tests for auth, companies, watchlist, change detection, role changes, annual accounts, risk signals, notifications, the AI assistant and admin
- [x] GitHub Actions CI: type check and tests on every push

### Company data

- [x] Roles: CEO and board changes from the Brønnøysund roles API
- [x] Annual accounts: key figures from the Register of Company Accounts
- [x] Annual accounts: storing every filing, detecting new filings and warning signs
- [ ] Ownership service: separate Python ETL for Skatteetaten shareholder data

### Insights

- [x] Role network: shared people and audit firms across your companies, matched on name and birth date without storing them
- [x] Risk signals: explainable assessment, stored levels and early warning
- [ ] Regional trends by municipality and industry

### AI

- [x] AI assistant with tool calling, using the existing service functions

### Delivery

- [x] Docker Compose for local development
- [ ] Deployment (Render + Aiven PostgreSQL)
- [ ] Frontend
- [ ] Usage guide with scenarios

## Data Source

Company data comes from the open API of the [Brønnøysund Register Centre](https://data.brreg.no), available under the Norwegian Licence for Open Government Data (NLOD).
