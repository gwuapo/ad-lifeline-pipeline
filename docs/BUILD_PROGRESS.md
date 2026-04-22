# Ad Lifeline Pipeline — Build Progress Snapshot
**Last updated:** April 23, 2026

## PRD v2 Build Phases

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | 11-column pipeline, schema migration, SLA tracking, priority system | **DONE** |
| Phase 2 | Role-based dashboards (Founder, Manager/CD, Editor) | **DONE** |
| Phase 3 | Discord bot v1 — read-only notifications, SLA breach alerts, buffer warnings | NOT STARTED |
| Phase 4 | Discord bot v2 — reaction-based stage transitions, slash commands | NOT STARTED |
| Phase 5 | Card detail view upgrade — 5-tab slide-out (Script, Brief, Production, Performance, Activity) | NOT STARTED |
| Phase 6 | Analytics dashboard — pipeline health, editor performance, creative performance | NOT STARTED |
| Phase 7 | Polish — Concept Council bulk actions, mobile quick-add, kill/blocked/revision flag UI | NOT STARTED |

## What's Been Built (Summary)

### Pipeline v2
- 11 stages: Inbox → Researching → Drafting → Scripted → Briefed → Assigned → In Edit → QA → Ready → Live → Analyzed
- SLA tracking per stage with configurable timeframes in Settings
- Priority system (P0/P1/P2) with colored dots
- Scripted buffer counter (X/40) with runway calculation
- Stage transitions event log (stage_transitions table)
- Stage picker dropdown in ad detail view
- Auto-scroll when dragging cards near kanban edges
- Editor view restricted to: Assigned, In Edit, QA, Live columns only
- Columns expand to fill screen when fewer than 5 visible

### Dashboards
- Founder: buffer health, weekly deploy count, spend, avg ROAS, win/loss, Ready/Analyzed queues, writing queues
- Manager/CD: briefs queue, QA queue, SLA breaches, team load table (per-editor WIP)
- Editor: pending acceptance banner, stats, pipeline chart, deadlines, activity feed
- All roles land on Home dashboard by default

### Database Changes Applied
- `supabase-pipeline-v2.sql` — extended ads table, stage_transitions, avatars table
- `supabase-sla-config.sql` — sla_config column on workspace_settings
- Existing ads migrated: pre→scripted, in→in_edit, post→qa

## Key Files Modified
- `apps/pipeline/src/App.jsx` — STAGES, SO, checkGate, PCard, kanban, NewAdForm, dispatch
- `apps/pipeline/src/supabaseData.js` — adToRow, rowToAd, logStageTransition, saveSlaConfig
- `apps/pipeline/src/EditorHomePage.jsx` — 4-stage editor view, pending acceptance
- `apps/pipeline/src/FounderDashboard.jsx` — NEW
- `apps/pipeline/src/ManagerDashboard.jsx` — NEW
- `apps/pipeline/src/Sidebar.jsx` — Home nav for all roles
- `apps/pipeline/src/SettingsPage.jsx` — SLA timeframes section
- `apps/pipeline/src/styles.css` — horizontal flex kanban

## Next Up When Resuming
Start with Phase 3 (Discord bot) or Phase 5 (card detail upgrade) — user's choice.
