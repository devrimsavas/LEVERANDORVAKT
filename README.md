# Leverandørvakt

[![CI](https://github.com/devrimsavas/LEVERANDORVAKT/actions/workflows/ci.yml/badge.svg)](https://github.com/devrimsavas/LEVERANDORVAKT/actions/workflows/ci.yml)

_Last updated: 12.11.2026_

> ⚠️ **Under active development** — the backend (following companies, detecting changes in company data, roles and annual accounts, notifications, an explainable risk assessment, regional trends and an AI assistant with tool calling) is in place and covered by tests. The web app has its public pages, login, overview, watchlist, search, company pages, trends, notifications, the assistant, an admin page and an in-app guide, with end-to-end tests in a real browser; production hardening and deployment are next. See the [Roadmap](#roadmap).

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
- **Regional trends** — new companies registered per month by municipality, industry and organization form, each month compared with the same month a year earlier, plus the most common industries in a period; answers are cached because past months hardly change
- **Versioned database migrations** — schema changes are tracked as numbered migration files and applied automatically on startup
- **AI assistant** — questions in plain language ("Which of my suppliers have the highest risk?") answered with tool calling over the app's own service functions; read-only, per-user conversations, a daily question limit (with a status endpoint showing what is left), and a choice of model provider (local Ollama, Ollama Cloud or Gemini) in `.env`
- **Admin overview** — an admin-only status of the background jobs and the data, and a read-only list of users
- **Interactive API documentation** — Swagger UI at `/api/docs`
- **Automated tests and CI** — Vitest + Supertest against a real PostgreSQL database for the API, Playwright end-to-end tests in a real browser for the web app, run by GitHub Actions on every push

### Planned

- **Ownership** — shareholders from Skatteetaten's shareholder register, imported by a separate Python service
- **Email notifications** — critical changes at once, the rest as a daily digest, in the user's language
- **Account features** — password reset, deleting your account and downloading your data (GDPR)

## Web App

The web app in [`web/`](web) is a Next.js app (App Router) on top of the API. It runs on its own port and talks to the API from its server, never from the browser.

### Pages

| Page                   | What it shows                                                                                                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing (`/`)          | What the service does, an example of its notifications, the features and the open data sources                                                                                                                                                                                    |
| Log in, Create account | Forms with a message per field and the new password typed twice; a new account is logged in right away                                                                                                                                                                            |
| Overview               | A "getting started" checklist (follow a company, write a note, ask the assistant) ticked from your own data and closed for good when you choose; the number of followed companies, the ones that need attention, the risk split across the watchlist and the latest notifications |
| Watchlist              | Every followed company with its risk level, last change, latest accounts and the start of your note, sorted by name or highest risk                                                                                                                                               |
| Search                 | Search by name, or go straight to a company by its organization number                                                                                                                                                                                                            |
| Company                | Follow / stop following, a private note, and tabs for overview, roles, annual accounts (chart and table), risk (level, score, warning signs, what could not be checked) and detected changes                                                                                      |
| Trends                 | New companies per month against a year earlier, and the ten most common industries, filtered by municipality, main industry, organization form and period                                                                                                                         |
| Notification bell      | In the header on every app page: unread count, the latest notifications, mark as read; refreshed every minute while the page is visible, with the count in the browser tab                                                                                                        |
| Notifications          | All notifications with what changed (before → after), unread filter, mark one or all as read, 20 per page                                                                                                                                                                         |
| Assistant              | Ask in plain language and get answers in Markdown (tables, lists, links), with the tools each answer is based on; example questions, earlier conversations to reopen or delete, and the questions left today                                                                      |
| About, Contact         | What the project is and how it is built; where to reach the author                                                                                                                                                                                                                |
| Guide                  | Public: how to get started, what is watched, how to read the risk level, notifications, accounts, trends and the assistant, and scenarios such as a supplier going bankrupt or late accounts                                                                                      |
| Admin                  | Only for admins (others get "not found"): the background jobs with their state and a button to run each now, the data in numbers, risk levels of all stored companies, and the users with search and paging                                                                       |

### How it is built

- **Model answers are shown safely.** The assistant's Markdown is rendered with `react-markdown`, which never runs HTML from the text: a `<script>` in an answer is shown as plain text, only `http(s)` links are kept, and images are dropped.
- **The token never reaches the browser (BFF).** The login form posts to the Next server, which logs in against the API and keeps the JWT in an `httpOnly`, `SameSite=Lax` cookie with the token's lifetime. Pages and server actions call the API with it as a Bearer token, so page scripts cannot read it and the API needs no CORS. A proxy (`src/proxy.ts`) sends visitors without a session to the login page and back to the page they asked for; only paths on the site are accepted as the target.
- **Designsystemet.** Components and design tokens from [Designsystemet](https://www.designsystemet.no), the Norwegian public sector's design system, with our own theme generated from `designsystemet.config.json`, Inter as the font and Aksel icons. Light and dark mode follow the operating system until the user chooses; the choice is kept in a cookie, so the page is rendered in the right colors from the start.
- **English and Norwegian.** Texts are in `web/messages/en.json` and `nb.json` (next-intl), chosen by a cookie or the browser's language; a missing or misspelled key is a type error. The API sends risk signals, limitations and changes as codes with `params` (years, amounts, dates), and the web app writes the sentences itself, with amounts and dates in the reader's format.
- **Charts that can be read without color.** Recharts with the theme's tokens: the accounts chart (revenue, net result or equity per year, losses below the zero line) and the trends line chart (this period solid, a year earlier dashed). Every chart has a legend or a title naming its series, a tooltip on hover and keyboard focus, and the same numbers in a table. The second series color was checked for color-blind separation and contrast in both modes. Risk levels and severities always carry their name next to the color.
- **Tested in a real browser.** Playwright tests in `web/e2e` go through the app as a user would: creating an account, searching and following, notes, a bankruptcy turning into a critical notification, the assistant (including that HTML and unsafe links in an answer never run), the daily limit, the admin page, the getting-started list, both languages, dark mode and phone width. The API runs in end-to-end mode with a fresh database and fake Brreg, Kartverket, SSB and language model, so the tests never reach the network.
- **URLs hold the state.** Search queries, filters, sorting and company tabs are in the URL, so every view can be bookmarked, shared and reached with the back button.

## Tech Stack

| Area           | Technology                                                                                                                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime        | Node.js, TypeScript (strict mode, ES modules)                                                                                                                                                              |
| Framework      | Express 5                                                                                                                                                                                                  |
| Database       | PostgreSQL                                                                                                                                                                                                 |
| ORM            | Sequelize with `sequelize-typescript` (decorator models)                                                                                                                                                   |
| Migrations     | Umzug                                                                                                                                                                                                      |
| Authentication | JSON Web Tokens (`jsonwebtoken`), password hashing with `bcryptjs`                                                                                                                                         |
| AI             | Ollama (`ollama` client, local or Ollama Cloud) or the Gemini API, behind one provider interface                                                                                                           |
| API docs       | Swagger / OpenAPI 3 (`swagger-autogen` + `swagger-ui-express`)                                                                                                                                             |
| Testing        | Vitest + Supertest (API), Playwright (web app, end to end), GitHub Actions CI                                                                                                                              |
| Containers     | Docker (multi-stage image) and Docker Compose for the API and PostgreSQL                                                                                                                                   |
| Web app        | Next.js 16 (App Router, server components and server actions), React 19, TypeScript                                                                                                                        |
| Design         | Designsystemet (React components, CSS and a generated theme), Aksel icons, Inter                                                                                                                           |
| Languages      | next-intl (English and Norwegian Bokmål)                                                                                                                                                                   |
| Charts         | Recharts                                                                                                                                                                                                   |
| Markdown       | react-markdown with remark-gfm (assistant answers)                                                                                                                                                         |
| Data source    | [Brønnøysund Register Centre open API](https://data.brreg.no) (Central Coordinating Register and Register of Company Accounts; free, no API key), Kartverket municipality API, SSB industry classification |

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
- **Trends only show what the register can answer honestly.** The search can count new registrations by month exactly, but it has no date for bankruptcies and leaves out struck-off companies, so bankruptcies over time or company survival are not shown rather than estimated.
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

Every signal and limitation has a `code`, ready-made English text (`title`, `detail` or `reason`, used for example by the AI assistant) and `params`: the values it is about, such as `{ "year": 2025, "equity": -120000, "currency": "NOK" }`. Clients write their own text from `code` and `params`, so the web app shows the report in English or Norwegian with amounts and dates in the reader's format.

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

| Method | Endpoint                          | Description                                                                                                 |
| ------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/register`              | Create an account (`firstName`, `lastName`, `email`, `password`)                                            |
| POST   | `/api/auth/login`                 | Log in and receive a JWT together with the user's public data                                               |
| GET    | `/api/auth/me`                    | Get the logged-in user's profile (requires token)                                                           |
| GET    | `/api/auth/me/onboarding`         | The getting-started steps done, read from the user's data, and whether the list was closed (requires token) |
| POST   | `/api/auth/me/onboarding/dismiss` | Close the getting-started list for good (requires token)                                                    |

### Watchlist

All watchlist endpoints require a token (`Authorization: Bearer <token>`). Each user sees and changes only their own watchlist.

| Method | Endpoint                              | Description                                                                                                                                                               |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/watchlist`                      | List the companies on your watchlist with their roles, latest annual accounts and risk level; `sort=name` (default) or `sort=risk` (highest risk level first, then score) |
| POST   | `/api/watchlist`                      | Follow a company (`orgNumber`, optional `note`)                                                                                                                           |
| GET    | `/api/watchlist/{orgNumber}`          | One followed company with your note, roles, latest annual accounts and risk level; `404` when you do not follow it                                                        |
| PATCH  | `/api/watchlist/{orgNumber}`          | Change or remove your note on a followed company                                                                                                                          |
| DELETE | `/api/watchlist/{orgNumber}`          | Stop following a company                                                                                                                                                  |
| GET    | `/api/watchlist/{orgNumber}/changes`  | Change history of a followed company, newest first (`page`, `pageSize`)                                                                                                   |
| GET    | `/api/watchlist/connections`          | People and organizations holding roles in two or more of your companies; `with=<orgNumber>` compares a company you are considering with your watchlist                    |
| GET    | `/api/watchlist/{orgNumber}/risk`     | Full risk report of a followed company, including its change history                                                                                                      |
| GET    | `/api/watchlist/{orgNumber}/accounts` | Every stored set of annual accounts of a followed company, newest first, including years Brreg no longer shows                                                            |

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
| GET    | `/api/assistant/status`             | Whether the assistant is available, the daily limit and how many questions are left in the last 24 hours                    |
| POST   | `/api/assistant/messages`           | Ask a question (`message`, optional `conversationId`); returns the answer, the tools it is based on and the conversation id |
| GET    | `/api/assistant/conversations`      | Your conversations, most recently used first (`page`, `pageSize`)                                                           |
| GET    | `/api/assistant/conversations/{id}` | One conversation with all its messages                                                                                      |
| DELETE | `/api/assistant/conversations/{id}` | Delete a conversation                                                                                                       |

Errors: `429` daily question limit reached, `503` assistant not configured or model not reachable, `504` model did not answer in time, `502` model returned an error.

### Trends

Public, like the company endpoints. All parameters are optional: `municipality` (4-digit number, e.g. `5601` for Alta), `industry` (a code or its start, e.g. `55` for accommodation), `form` (e.g. `AS`), `from` and `to` (months like `2026-03`; default: the last 12 months, at most 36).

| Method | Endpoint                         | Description                                                                                                                                                                                                                                                                                                                  |
| ------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/trends/registrations`      | New companies per month, each with the same month a year earlier (for the current month, only the same days of it), and the change in percent                                                                                                                                                                                |
| GET    | `/api/trends/industries`         | The ten most common industries of new companies in the period (at most 5,000 registrations): by main industry with names from SSB (`level=division`, default) or by full code (`level=detailed`); companies without an industry are counted apart; `limitations` say what could not be done, each with a `code` and `params` |
| GET    | `/api/trends/municipalities`     | All municipalities with their numbers, from Kartverket                                                                                                                                                                                                                                                                       |
| GET    | `/api/trends/industry-divisions` | The main industries (two-digit codes) with their names from Statistics Norway, for choosing one in a list                                                                                                                                                                                                                    |

### Admin

Admin endpoints require a token from an admin account. Regular users get `403 Forbidden`.

| Method | Endpoint                          | Description                                                                                                                                                                       |
| ------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/admin/status`               | System overview: where change detection stopped, accounts checks due, jobs running now, and counts of users, companies by risk level, notifications and assistant use             |
| GET    | `/api/admin/users`                | Users, newest first, with how many companies each follows; `?q=` searches name and email, `?page` / `?pageSize` page the list. Read-only: roles cannot be changed through the API |
| POST   | `/api/admin/change-detection/run` | Run change detection immediately instead of waiting for the next scheduled run                                                                                                    |
| POST   | `/api/admin/accounts-check/run`   | Run the annual accounts check immediately instead of waiting for the next daily run                                                                                               |

List endpoints return `{ items, page, pageSize, totalItems, totalPages }` (default page size 20, maximum 100).

## Data Model

### `users`

| Column                     | Type         | Notes                                                        |
| -------------------------- | ------------ | ------------------------------------------------------------ |
| `id`                       | integer      | Internal primary key, never exposed                          |
| `public_id`                | UUID         | Public user number, used in the API and in tokens            |
| `first_name`               | varchar(100) | Required                                                     |
| `last_name`                | varchar(100) | Required                                                     |
| `email`                    | varchar(255) | Required, unique, stored in lower case                       |
| `password_hash`            | varchar      | bcrypt hash, never returned by the API                       |
| `role`                     | varchar(20)  | `user` (default) or `admin`                                  |
| `last_login_at`            | timestamp    | Updated on every successful login                            |
| `onboarding_dismissed_at`  | timestamp    | When the getting-started list was closed; `null` while shown |
| `created_at`, `updated_at` | timestamp    | Managed automatically                                        |

### Other tables

| Table                                           | What it holds                                                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `companies`                                     | One row per followed company: organization number, last known state (`snapshot`) and roles (JSONB), accounts status, latest risk level and score, check times       |
| `annual_accounts`                               | Every set of annual accounts seen: period, type (company / group), currency, audit and liquidation flags, key figures (JSONB); one row per company, type and period |
| `assistant_conversations`, `assistant_messages` | The user's conversations with the assistant: questions, answers and the tools each answer used (tool calls themselves are not stored)                               |
| `assistant_usage`                               | One row per question, for the daily limit; holds no content and is kept when a conversation is deleted                                                              |
| `trend_cache`                                   | Answers from Brreg and Kartverket that change slowly: past months for 30 days, the current month for 6 hours, the municipality list for a day                       |
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
│   │   ├── onboardingService.ts  # Getting-started steps, read from the user's data
│   │   ├── watchlistService.ts   # Following companies, notes, change history
│   │   ├── companyDiff.ts        # Compares two company states and rates each change
│   │   ├── roleDiff.ts           # Compares two sets of roles and rates each change
│   │   ├── connectionsService.ts # Finds shared people and organizations across companies, from live role data
│   │   ├── trendsService.ts      # Registration trends and industry breakdowns, with caching
│   │   ├── kartverketService.ts  # Municipality list from Kartverket
│   │   ├── ssbService.ts         # Names of the main industries from SSB's classification service
│   │   ├── changeDetectionService.ts  # Reads both update feeds and records changes
│   │   ├── accountsDiff.ts       # Compares stored and current annual accounts and rates each change
│   │   ├── accountsService.ts    # Stores annual accounts and runs the daily accounts check
│   │   ├── storedAccounts.ts     # Reads stored annual accounts (shared by several services)
│   │   ├── riskAssessment.ts     # The risk rules: weights, thresholds and the pure assessRisk function
│   │   ├── riskService.ts        # Builds the risk input from live or stored data, stores levels, records rises
│   │   ├── assistantService.ts   # The agent loop, conversations and the daily limit
│   │   ├── assistantTools.ts     # The read-only tools the model can call, over the existing services
│   │   ├── adminService.ts       # System status and the user list for admins
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
│   │   ├── trends.ts             # Trend filters, monthly counts and industry breakdowns
│   │   ├── llm.ts                # Provider-independent chat messages, tools and errors
│   │   └── express.d.ts          # Adds the authenticated user to Express requests
│   └── utils/                    # Validation, pagination and limited-concurrency helpers
├── tests/
│   ├── e2e/
│   │   ├── fakeServices.ts       # End-to-end mode: fresh database, fake services with example companies, control server
│   │   └── e2e.env               # The API's settings in end-to-end mode (no secrets)
│   ├── helpers/
│   │   ├── fakeRegister.ts       # In-memory stand-in for the Brønnøysund, Kartverket and SSB APIs
│   │   ├── fakeBrreg.ts          # Puts the fake register in place for each test (Vitest)
│   │   ├── fakeLlm.ts            # Fake Ollama server with scripted model replies
│   │   ├── users.ts              # Test users and register/login helper
│   │   ├── globalSetup.ts        # Applies migrations to the test database once
│   │   └── setup.ts              # Empties all tables before every test
│   ├── fixtures/                 # Fictional data shaped like real Brreg responses
│   └── *.test.ts                 # One test file per area (auth, companies, watchlist, ...)
├── web/                          # The Next.js web app
│   ├── e2e/                      # Playwright end-to-end tests, one file per area
│   ├── playwright.config.ts      # Starts the API in end-to-end mode and the web app, then runs the tests
│   ├── Dockerfile                # Image with Next.js's standalone server
│   ├── messages/                 # en.json and nb.json: every text in both languages
│   ├── designsystemet.config.json # Theme colors; npm run theme generates src/theme from it
│   └── src/
│       ├── app/
│       │   ├── (public)/         # Landing, guide, about, contact, log in, create account (public header and footer)
│       │   ├── (app)/            # Overview, watchlist, search, companies, trends, ... (login required)
│       │   └── api/notifications/ # Route the bell polls; calls the API with the session token
│       ├── components/           # Header, footer, bell, company tabs, charts, overview cards
│       ├── i18n/                 # Language choice (cookie or browser) and loading the messages
│       ├── lib/                  # API client, session cookie, server actions, shared types
│       ├── theme/                # Generated Designsystemet theme (do not edit by hand)
│       └── proxy.ts              # Sends visitors without a session to the login page
├── .github/workflows/
│   ├── ci.yml                    # API tests, web app checks and end-to-end tests, and a Docker Compose smoke test on every push
│   └── portfolio-rebuild.yml     # Rebuilds the portfolio site when the README changes
├── Dockerfile                    # Multi-stage image: build with all dependencies, run with production ones only
├── docker-compose.yml            # The web app, the API and PostgreSQL for local development
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

The web app runs at `http://localhost:3001`, the API at `http://localhost:3000` and its docs at `http://localhost:3000/api/docs`. Compose starts PostgreSQL, waits until it accepts connections, then starts the API, which applies the migrations itself, and then the web app. The database is also reachable from your machine on port `5433` (e.g. for pgAdmin), and its data is kept in a Docker volume between runs; `docker compose down --volumes` deletes it.

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

#### 7. Run the web app

In a second terminal, with the API running:

```bash
cd web
npm install
cp .env.example .env.local   # API_URL=http://localhost:3000
npm run dev
```

The web app runs at `http://localhost:3001`. In `web/`, `npm run typecheck` checks the types, `npm run lint` runs ESLint and `npm run theme` generates the theme again after changing `designsystemet.config.json`.

#### 8. Run the end-to-end tests

The tests need PostgreSQL running, as for `npm test`. Install Chromium for Playwright once, then run the tests from `web/`:

```bash
cd web
npx playwright install chromium
npm run e2e
```

Playwright builds and starts the API in end-to-end mode on port `3100` and the web app on port `3101`, so `npm run dev` can keep running. The API uses its own database, `leverandorvakt_e2e`, created fresh on every run with the connection details from `.env.test` (or `E2E_DATABASE_URL`). `npm run e2e:report` opens the report of the last run, with a screenshot and a trace of every failed test.

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
| `npm run e2e:api`    | Runs the API in end-to-end mode (used by the web app's Playwright tests)  |

## Tests

The API's tests run with **Vitest** and **Supertest** against a real PostgreSQL database; the web app is tested end to end with **Playwright** (see below). Every test starts with empty tables, and the Brønnøysund API is replaced by a fake in tests that need it, so the suite never depends on the network.

| Test file                       | What it covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/index.test.ts`           | The API responds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `tests/auth.test.ts`            | Registration (public data only, bcrypt hashing, email normalization, role cannot be set by the client, duplicate email, input validation), login (token content, same error for unknown email and wrong password), `/me` (missing, tampered and expired tokens, deleted account)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `tests/onboarding.test.ts`      | Getting-started steps read from the user's own data (following, a non-empty note, a question asked, still counted after the conversation is deleted), completed when all are done, closing kept with its first time, per user, `404` for a deleted account, not part of the public user                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `tests/companies.test.ts`       | Company lookup and search (struck-off companies, Norwegian characters, input validation, Brreg unavailable), roles mapped from a real-shaped Brreg response (deregistered members left out, sorted in Norwegian order, no birth dates)                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `tests/watchlist.test.ts`       | Following a company (stored once and fetched from Brreg once even with several followers, unknown and struck-off companies, Brreg unavailable, input validation), listing only your own companies, reading one followed company, notes, unfollowing, change history with pagination, users cannot see or change each other's watchlists                                                                                                                                                                                                                                                                                                                                                                          |
| `tests/changeDetection.test.ts` | Starting point on the first run, changes recorded with severity and source update, stored state updated so nothing is recorded twice, one Brreg lookup per company, struck-off companies (including `410 Gone`), stopping before a failed company and catching up after a Brreg outage, notifications only to followers, full rollback when notifications cannot be saved                                                                                                                                                                                                                                                                                                                                        |
| `tests/roleChanges.test.ts`     | Role changes (CEO, auditor, board) with severity and source event, deregistered members, ordering-only changes ignored, starting points in both feeds (also for existing installations), filling in missing roles, one check per company across both feeds, stopping before a failed company in both feeds and catching up                                                                                                                                                                                                                                                                                                                                                                                       |
| `tests/accounts.test.ts`        | Accounts mapped from a real-shaped response (missing figures, other currencies, warning signs, year from the period end), newest first with company before group, companies without accounts, unsupported companies (banks), struck-off companies, unknown companies, Brreg errors                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `tests/accountsCheck.test.ts`   | One filing per period for company and group together, corrected filings, warning signs only when things get worse (liquidation, equity turning negative, audit dropped), group accounts ignored for warnings, two years filed at once, accounts stored when following (also when the register is down or does not cover the company), daily check: no re-check within a day, no duplicates, history kept after Brreg drops a year, other companies checked when one fails, struck-off companies skipped, full rollback when notifications cannot be saved                                                                                                                                                        |
| `tests/risk.test.ts`            | Every risk rule on a fixed date (critical signals, the 31 July filing deadline, company forms and founding dates, key figures from the company's own accounts, change history within 12 months), limitations, `params` on every signal and limitation, score cap and level thresholds, live assessment of unfollowed and struck-off companies, watchlist report and sorting (risk level before score, so a bankruptcy comes first), risk rising by time alone is notified, falling risk recorded without notification                                                                                                                                                                                            |
| `tests/assistant.test.ts`       | The agent loop against a fake Ollama server: answers with and without tools, tool calls and results sent back in Ollama's format, private notes never sent to the model, tools limited to the asking user's data, invalid tool input and unknown tools returned to the model as errors, unfollowed companies, Brreg errors, the step limit, conversation history, daily limit per user (not reset by deleting), unavailable / missing / slow models storing nothing, validation, private conversations                                                                                                                                                                                                           |
| `tests/geminiProvider.test.ts`  | Gemini request format (system instruction, contents, function declarations, API key header), tool calls sent back unchanged with their thought signature, parallel tool results in one turn, quota errors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tests/connections.test.ts`     | People matched on name and birth date (same name with a different birth date is not a connection, no birth date is not matched), shared audit firms, deregistered roles and several roles in one company ignored, most connected first, comparing a candidate company, other users' companies never compared, a company whose roles cannot be fetched, birth dates never returned                                                                                                                                                                                                                                                                                                                                |
| `tests/trends.test.ts`          | Parameter rules and defaults, monthly counts against the same month a year earlier (the current month against the same days), filters (also by the start of an industry code), the current month marked as not over, answers served from the cache, the current month fetched again after 6 hours, industry breakdown by main industry with SSB names or by full code, companies without an industry counted apart, top ten and the rest, paging through large months, refusing periods that are too large, municipalities from Kartverket, Brreg, SSB and Kartverket errors                                                                                                                                     |
| `tests/notifications.test.ts`   | Notifications created end to end from detected changes, unread filter, pagination, unread count, marking one or all as read (first read time is kept), users cannot read or change each other's notifications                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `tests/admin.test.ts`           | Admin account created once from environment variables (never by promoting an existing user), admin-only change detection endpoint (`401` / `403` / `200`), `409` when a run is already in progress, `502` when Brreg cannot be reached; admin-only accounts check endpoint (`403` / `200` / `409`); system status (change detection position, accounts checks due but never struck-off companies, jobs running now, followed companies counted once, risk levels, unread notifications, assistant questions in the last 24 hours, provider or `null`); user list newest first with followed counts, paging, search by email, first and last name (`%` matched as plain text), no password hashes or internal ids |

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

### End-to-end tests

The Playwright tests in `web/e2e` run in Chromium against the real web app and API, on a desktop screen and, for `phone.spec.ts`, as a Pixel 7. See [Run the end-to-end tests](#8-run-the-end-to-end-tests).

| Test file               | What it covers                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `public.spec.ts`        | Landing page and header, switching language and color scheme (kept after reload), guide, about and contact, app pages sending visitors to log in                                                       |
| `auth.spec.ts`          | Creating an account, a message per wrong field, a wrong password, going back to the page asked for after logging in, logging out                                                                       |
| `companies.spec.ts`     | Search by name and by organization number, roles, accounts and risk tabs, following, a private note in the watchlist, stopping following                                                               |
| `notifications.spec.ts` | A followed supplier going bankrupt in the fake register: change detection, the bell, a critical notification, marking all as read                                                                      |
| `assistant.spec.ts`     | A question answered with a tool call, a Markdown table, "based on", HTML shown as text and never run, unsafe links and images dropped, the conversation kept, the daily limit, deleting a conversation |
| `admin.spec.ts`         | Normal users neither see nor reach the admin page; the admin runs a job and finds a user                                                                                                               |
| `onboarding.spec.ts`    | The getting-started list following the user's progress, closed for good                                                                                                                                |
| `trends.spec.ts`        | The chart and filtering by municipality                                                                                                                                                                |
| `phone.spec.ts`         | No sideways scrolling on public and app pages, the menu on a phone                                                                                                                                     |

### Continuous integration

GitHub Actions runs three jobs on every push: the API's type check and all its tests against a temporary PostgreSQL database; the web app's lint, type check, build and end-to-end tests (the report with screenshots and traces is uploaded when a test fails); and a Docker job that builds both images, starts the stack with Docker Compose and checks that the API, its docs and the web app answer.

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
- [x] Getting-started steps and closing the list (`/api/auth/me/onboarding`)
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
- [x] Regional trends: new registrations by month, municipality, industry and form, with industry breakdowns

### AI

- [x] AI assistant with tool calling, using the existing service functions

### Delivery

- [x] Docker Compose for local development
- [ ] Deployment (Render + Aiven PostgreSQL)
- [ ] Usage guide with scenarios

### Web app

- [x] Next.js app with a Designsystemet theme, light and dark mode, English and Norwegian
- [x] Landing page, log in and create account, with the token kept on the server (BFF)
- [x] App header with menu, user menu and a notification bell
- [x] Overview, watchlist, search and company pages (overview, roles, accounts, risk, changes)
- [x] Charts: annual accounts per year, new companies per month
- [x] Trends with municipality, industry, form and period filters
- [x] Assistant and notifications pages
- [x] About and contact pages
- [x] Admin page
- [x] In-app guide and a getting-started checklist
- [x] End-to-end tests (Playwright) and the web app in CI and Docker Compose

### Production readiness

- [ ] Limits on login and registration attempts, security headers
- [ ] Password reset, deleting an account and downloading your data (GDPR)
- [ ] Email notifications: critical changes at once, the rest as a daily digest
- [ ] Logging and error alerts

## Data Source

Company data comes from the open API of the [Brønnøysund Register Centre](https://data.brreg.no), available under the Norwegian Licence for Open Government Data (NLOD). The list of municipalities comes from [Kartverket](https://www.kartverket.no)'s open municipality API. The names of the main industries come from [Statistics Norway (SSB)](https://www.ssb.no)'s classification service (Klass), standard SN2025.
