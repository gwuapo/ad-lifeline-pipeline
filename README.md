# Ad Lifeline Pipeline

Internal ad management system for tracking ads from concept through production to live performance. Built for direct response advertising operations.

## Features

- **4-Stage Kanban Pipeline** — Pre-Production → In-Production → Post-Production → Live with drag-and-drop
- **Stage Gate Enforcement** — exit criteria validated before advancing (brief approved, editor assigned, draft submitted, final approved)
- **Auto CPA Classification** — configurable green/yellow/red thresholds, auto-classifies from latest metrics
- **AI Analysis** — calls Claude API to analyze ad metrics + scraped comments, returns findings and iteration plans
- **Iteration Logic** — max 3 iterations for losing ads, carries forward analysis context, then kill
- **Variation System** — 6 variation types for winners (hook, lead, pre-lander, format, pacing, proof block tests)
- **Learnings Flywheel** — capture and accumulate learnings that feed back into generators
- **Draft & Revision Tracking** — editors submit drafts, founders review, approve, or request revisions
- **Comment Scraping** — add comments with sentiment + hidden flag (TikTok auto-hidden negatives = critical intel)
- **Editor Incentives** — win rate, on-time %, quality score, health badge, auto-calculated bonus
- **Role-Based Access** — Founder (full access) vs Editor (pipeline-only, assigned ads)
- **Kill System** — archive failed ads after max iterations, preserve learnings

## Setup

```bash
npm install
npm run dev
```

## Tech Stack

- React 18 + Vite
- Claude API (Sonnet) for AI analysis
- No external UI libraries — custom dark theme

## CPA Thresholds (configurable)

- 🟢 Green (Winner): ≤ $15 CPA → scale via variations
- 🟡 Yellow (Medium): ≤ $25 CPA → monitor & optimize  
- 🔴 Red (Losing): > $25 CPA → iterate (max 3) or kill
