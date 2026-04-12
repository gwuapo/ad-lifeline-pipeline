# Nexus Platform

Internal suite of tools for Nexus Holdings. Monorepo with shared Supabase backend.

## Apps

- **apps/pipeline/** — Ad Lifeline Pipeline (ad management, tracking, analytics)
- **apps/hub/** — PS5-style launcher homepage (planned)
- **apps/brain/** — Marketing AI chatbot (planned)

## Shared

- **packages/shared/** — Shared Supabase client, auth, types, theme
- **migrations/** — Supabase SQL migrations (shared across all apps)
- **docs/** — PRDs and documentation

## Setup

Each app has its own `package.json`. To work on a specific app:

```bash
cd apps/pipeline
npm install
npm run dev
```
