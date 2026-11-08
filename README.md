# Leverandørvakt

> ⚠️ **Under active development** — the project is in its early stages. Features are added step by step.

An early-warning service for Norwegian businesses, built on open data from the **Brønnøysund Register Centre** (Brønnøysundregistrene). Leverandørvakt lets users follow the companies they work with — suppliers, customers, partners — and get notified when something important changes, such as a new CEO, a change in the board, or the start of bankruptcy proceedings.

## 🚀 Key Features (planned)

- **Company watchlist** — follow companies and get notified when their registry data changes
- **Role network** — see how people and companies are connected through board and management roles
- **Risk signals** — a simple "check before you sign" score based on bankruptcy/liquidation flags, company age and frequent management changes
- **Regional trends** — new companies over time by municipality and industry code
- **AI assistant** — ask questions about followed companies in plain language

## 🛠 Tech Stack

- Runtime: **Node.js** with **TypeScript**
- Framework: **Express 5**
- API Docs: Swagger / OpenAPI
- Data source: [Brønnøysund Register Centre open API](https://data.brreg.no) (free, no API key)

## 📂 Project Structure

```
LEVERANDORVAKT/
├── src/
│   ├── app.ts          # Entry point: Express setup and server start
│   └── routes/
│       └── index.ts    # Root route
├── package.json
└── tsconfig.json
```

## ▶️ Getting Started

### Prerequisites

- Node.js 22+

### 1. Clone the repository

```bash
git clone https://github.com/devrimsavas/LEVERANDORVAKT.git
cd LEVERANDORVAKT
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create a `.env` file

```env
PORT=3000
```

### 4. Run in development mode

```bash
npm run dev
```

The server starts at `http://localhost:3000`.
