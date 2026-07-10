# CLAUDE.md — Outpost

## Project Overview

Outpost is a self-hosted, Docker-based home network health monitor. It continuously tracks internet connectivity, speed, latency, and DNS health, presenting results through a web dashboard. It runs as a single containerized service backed by SQLite.

## Tech Stack

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript 5.7, Tailwind CSS 3.4, Chart.js 4.4
- **Backend:** Node.js 20+, Express-less HTTP server (native `http` + Next.js handler), SQLite via better-sqlite3
- **Scheduling:** node-cron for periodic monitoring tasks
- **Containerization:** Docker (Node 22-alpine, multi-stage build)
- **CI/CD:** GitHub Actions → GitHub Container Registry (ghcr.io)

## Repository Structure

```
outpost/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/                # REST API route handlers (TypeScript)
│   │   ├── config/         # GET/PATCH/POST config endpoints
│   │   ├── dns/            # DNS monitoring results
│   │   ├── health/         # Health check endpoint
│   │   ├── outages/        # Outage records
│   │   ├── ping/           # Ping monitoring results
│   │   ├── speedtest/      # Speedtest results and manual trigger
│   │   ├── stats/          # Aggregated statistics
│   │   └── status/         # Current outage status
│   ├── dns/                # DNS health page
│   ├── latency/            # Latency monitoring page
│   ├── outages/            # Outage tracking page
│   ├── settings/           # Configuration page
│   ├── speedtest/          # Speedtest results page
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Dashboard home page
│   └── globals.css         # Global styles
├── components/
│   ├── charts/             # Chart.js visualizations (LatencyChart, SpeedChart)
│   ├── dashboard/          # Dashboard widget cards
│   └── ui/                 # Shared UI components (Card, Navigation, TimeRangeSelect)
├── lib/
│   ├── api.ts              # Centralized API client with TypeScript interfaces
│   └── utils.ts            # Utility functions (cn for class merging)
├── src/                    # Backend Node.js code (JavaScript)
│   ├── config.js           # Configuration management (JSON file + env vars)
│   ├── scheduler.js        # Cron job orchestration
│   ├── monitors/           # Monitoring modules
│   │   ├── ping.js         # ICMP ping monitor
│   │   ├── dns.js          # DNS resolution monitor
│   │   ├── speedtest.js    # Speedtest-cli wrapper
│   │   └── outage.js       # Outage detection state machine
│   └── storage/
│       └── database.js     # SQLite database layer with prepared statements
├── server.js               # Application entry point (HTTP server + scheduler)
├── Dockerfile              # Multi-stage production Docker build
├── docker-compose.yml      # Docker Compose deployment config
├── docker-compose.bridge.yml  # Alternative bridge network config
├── .github/workflows/ci.yml   # CI/CD pipeline
├── GitVersion.yml          # Semantic versioning config
├── next.config.js          # Next.js config (standalone output)
├── tailwind.config.js      # Tailwind CSS config
├── tsconfig.json           # TypeScript config
└── postcss.config.js       # PostCSS config
```

## Commands

```bash
npm run dev       # Start development server (node server.js)
npm run build     # Build Next.js for production (next build)
npm start         # Start production server (NODE_ENV=production node server.js)
npm run lint      # Run ESLint via Next.js (next lint)
```

There is no test runner configured. No automated tests exist in the project.

## Architecture

### Backend

The application starts from `server.js`, which creates a native HTTP server, initializes the Next.js app, and starts the monitoring scheduler.

**Layering:**
1. `server.js` — HTTP server + Next.js integration + graceful shutdown
2. `app/api/**/route.ts` — API route handlers (TypeScript, Next.js App Router conventions)
3. `src/scheduler.js` — Cron-based task scheduling, supports dynamic restart on config changes
4. `src/monitors/*` — Individual monitoring implementations (ping, dns, speedtest, outage)
5. `src/storage/database.js` — SQLite wrapper with prepared statements and WAL mode
6. `src/config.js` — Configuration from `/data/config.json` with environment variable overrides

**Key patterns:**
- Singleton instances for database (`getDb()`) and config (`getConfig()`)
- Prepared statements cached in a `stmts` object for performance
- Outage detection uses a state machine tracking consecutive failures/successes
- Speedtest prevents concurrent runs with an `isRunning` flag
- Data retention cleanup runs daily at 3:00 AM via cron

### Frontend

- Next.js 15 App Router with `'use client'` pages
- Centralized API client in `lib/api.ts` with full TypeScript interfaces
- Polling pattern (30s interval) for real-time dashboard updates
- React hooks for state management (no external state library)
- Tailwind CSS utility-first styling with a dark theme (bg-black/bg-gray-900)

### Database

SQLite with four main tables: `ping_results`, `speedtest_results`, `dns_results`, `outages`. All indexed on timestamp. Uses WAL mode for concurrent read/write access. Transactions used for bulk retention cleanup.

## Code Conventions

### TypeScript / Frontend
- Strict mode enabled in `tsconfig.json`
- Path alias: `@/*` maps to the project root
- Module resolution: `bundler` (Next.js style)
- Target: ES2017
- Frontend pages use `'use client'` directive
- API routes follow Next.js App Router conventions (`route.ts` files exporting GET/POST/PATCH)
- Class merging uses `cn()` from `lib/utils.ts` (clsx + tailwind-merge)

### JavaScript / Backend
- Backend monitoring code in `src/` is plain JavaScript (not TypeScript)
- CommonJS modules (`require`/`module.exports`)
- Error handling via try-catch with `console.error` logging
- Unix millisecond timestamps used throughout

### Styling
- Tailwind CSS utility classes
- Dark theme: `bg-black`, `bg-gray-900`, `text-gray-100`
- Accent: `blue-600` / `blue-500`
- Glass effect: backdrop blur with transparency
- Responsive: mobile-first with standard Tailwind breakpoints

### API Conventions
- JSON responses throughout
- Error responses include descriptive message field
- Time range filtering via query parameters (e.g., `?range=24h`)
- Config endpoints enforce constraints (min/max values for intervals, retention, targets)

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` / `OUTPOST_PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment mode |
| `OUTPOST_DATA_DIR` | `./data` | Data directory for SQLite DB and config |
| `OUTPOST_PING_INTERVAL` | `60` | Ping frequency in seconds (30–900) |
| `OUTPOST_SPEEDTEST_INTERVAL` | `1` | Speedtest frequency in hours (1–24) |
| `OUTPOST_DNS_INTERVAL` | `300` | DNS check frequency in seconds (60–1800) |
| `OUTPOST_RETENTION_DAYS` | `90` | Data retention period in days (7–365) |
| `HOSTNAME` | `0.0.0.0` | Server bind address |

## CI/CD Pipeline

GitHub Actions pipeline (`.github/workflows/ci.yml`) triggers on pushes to `main`, version tags (`v*`), and PRs to `main`.

**Jobs:**
1. **version** — Determines semantic version via GitVersion or tag parsing
2. **dependency-audit** — `npm audit` + Snyk vulnerability scan
3. **secret-scan** — Gitleaks secret detection
4. **build-scan-push** — Docker build, Trivy image scan, push to ghcr.io (skipped on PRs)

## Docker

The `Dockerfile` uses a 4-stage multi-stage build:
1. `base` — Node 22-alpine + native build tools + iputils + speedtest-cli
2. `deps` — `npm ci` to install dependencies
3. `builder` — `next build` producing standalone output
4. `runner` — Minimal production image, non-root user (`outpost`, UID 1001), `/data` volume, Ookla speedtest CLI (live progress) + speedtest-cli fallback

The container requires `NET_RAW` capability for ICMP ping. Default port is 3000. Data persists at `/data`.

## Key Files for Common Tasks

| Task | Files |
|---|---|
| Add a new monitoring module | `src/monitors/`, `src/scheduler.js`, `src/storage/database.js` |
| Add a new API endpoint | `app/api/<resource>/route.ts` |
| Add a new dashboard page | `app/<page>/page.tsx`, `components/` |
| Modify database schema | `src/storage/database.js` (table creation in `getDb()`) |
| Change configuration options | `src/config.js` (defaults, constraints, validation) |
| Update navigation | `components/ui/Navigation.tsx` |
| Add a new chart | `components/charts/` |
| Modify CI/CD | `.github/workflows/ci.yml` |
| Change Docker build | `Dockerfile`, `docker-compose.yml` |
