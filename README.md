# EazyCount Frontend

React + Vite SPA for EazyCount. Talks to the Spring Boot backend over HTTP.

## Prerequisites

- Node.js 18+
- [Count](https://github.com/Jasonlol63/Count) backend running locally on port `8082`

## Setup

```bash
npm install
cp .env.example .env
```

## Development

```bash
npm run dev
```

Vite serves the app (default `http://127.0.0.1:5173`) and proxies `/auth` and `/api` to the backend.

## Production build

```bash
npm run build
```

Upload the `dist/` folder to the server path `/frontend/dist/` (production `base` is configured in `vite.config.js`).

## CSS workflow

See [CSS_WORKFLOW.md](./CSS_WORKFLOW.md).
