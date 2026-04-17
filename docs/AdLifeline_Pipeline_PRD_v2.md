# Ad Lifeline — Pipeline System PRD

**Version:** 2.0
**Status:** Draft for build
**Owners:** Adolf, Boyan
**Repo:** Gwuapo/ad-lifeline-pipeline
**Last updated:** April 2026

---

## 1. Context & Problem

Ad Lifeline currently uses a 4-column kanban (Pre-Production / In-Production / Post-Production / Live). At our target throughput of 20–35 concepts per week, this structure breaks down:

- Each column hides multiple sub-states with different owners, entry criteria, and SLAs.
- Cards sit in "Pre-Production" with checklists showing 5–6 overdue tasks — those checklists are actually hidden stages that should be surfaced as columns.
- No role-based views, so editors and the creative director see the same cluttered board as the founders.
- No handoff automation. Delays compound silently because nothing flags when a card has been stuck.
- No separation between private writer-side ideation and production-side execution.

The v2 pipeline replaces the 4-column structure with 11 columns, a role-based view system, an SLA engine, and a Discord bot for handoff notifications.

---

## 2. Goals

**Primary goals**

1. Maintain a rolling buffer of 40 completed scripts in the `Scripted` column at all times.
2. Ship 20–35 production-ready ads per week at consistent quality.
3. Eliminate dropped handoffs — every card has one visible owner at every moment.
4. Surface bottlenecks in real time via SLA tracking and Discord alerts.
5. Give each team member a focused view of only their work.

**Non-goals (out of scope for v2)**

- Scheduling or calendar features.
- Invoicing or payroll.
- A full analytics replacement for Meta/TikTok Ads Manager.
- Public-facing or client-facing views.

**Success metrics**

- 40-concept buffer in Scripted held at ≥90% of weeks after month 2.
- 20+ concepts shipped to Live per week, sustained over a rolling 4-week window.
- Median stage transition time within SLA for 85%+ of stages.
- Zero "lost" cards (cards sitting >SLA without any team action).

---

## 3. User Roles

| Role | Who | Scope |
|------|-----|-------|
| Founder / Writer | Adolf, Boyan | Full pipeline access. Writes scripts. Approves deploys. Tags learnings. Owns left-of-Scripted ideation columns. |
| Creative Director | Aymane | Owns Briefed, QA, Live. Assigns editors. Manages production handoffs. |
| Editor | 5 contractors | Sees only own assigned cards. Accepts work, uploads cuts, handles revisions. |
| Admin | (future) | Full read access, no modification rights. For bookkeeping / ops support. |

**Role-based view rules**

- Founders see all 11 columns.
- Creative Director sees Scripted → Analyzed (9 columns). Left-of-Scripted is hidden.
- Editors see a filtered dashboard of only their assigned cards across Assigned, In Edit, and QA-revision states.

---

## 4. Pipeline Stages

The pipeline has 11 sequential stages. Each stage has one owner, one entry criterion, one exit criterion, and one SLA.

### 4.1 Stage overview

```
[Inbox] → [Researching] → [Drafting] → [Scripted] → [Briefed] → [Assigned]
    → [In Edit] → [QA] → [Ready] → [Live] → [Analyzed]
```

### 4.2 Stage details

#### Stage 1: Inbox

- **Owner:** Founders
- **Purpose:** Low-friction capture of raw ideas, hooks, angles, competitor references, customer pain, studies.
- **Entry criteria:** Any thought worth remembering.
- **Exit criteria:** Founder promotes to Researching after deciding the idea merits development.
- **SLA:** None. Cards can sit indefinitely.
- **Visibility:** Founders only.
- **Required fields:** Title only. Everything else optional.
- **Optional fields:** Short note, URL, screenshot, tag(s).
- **Entry method:** In-app quick-add, Discord slash command `/idea [text]`, mobile-optimized form.

#### Stage 2: Researching

- **Owner:** Founders
- **Purpose:** Develop a raw idea into a validated angle. Gather proof, competitor teardowns, customer review mining, cultural references, studies.
- **Entry criteria:** Promoted from Inbox.
- **Exit criteria:** Enough material gathered that a script can be written. Founder promotes to Drafting.
- **SLA:** None. Some angles marinate.
- **Visibility:** Founders only.
- **Required fields:** Title, avatar (from the 14), angle hypothesis.
- **Optional fields:** Research notes, links, screenshots, citation drafts.

#### Stage 3: Drafting

- **Owner:** Founders
- **Purpose:** Active writing state. Script and hooks being composed.
- **Entry criteria:** Promoted from Researching. Founder commits to writing this one.
- **Exit criteria:** Full VSL script + 5 hook variations + citations + compliance flags completed.
- **SLA:** None, but cards showing age >14 days here warrant a self-check.
- **Visibility:** Founders only.
- **Required fields:** Title, avatar, angle hypothesis, hook mechanism.
- **Working fields:** Script draft (in-progress), hook drafts.

#### Stage 4: Scripted

- **Owner:** Founders (buffer management)
- **Purpose:** The rolling buffer of 40 production-ready concepts awaiting Concept Council selection.
- **Entry criteria:** Full VSL script + 5 hooks + citations + compliance flags attached. Required field schema fully complete.
- **Exit criteria:** Approved at Monday Concept Council. Moves to Briefed.
- **SLA:** None. Cards can sit in the buffer.
- **Visibility:** All roles (first column visible to Aymane and editors).
- **Required fields:** Title, avatar, angle, hook mechanism, full script body, 5 hook variants, citations, compliance flags, estimated production time, priority tag (P0/P1/P2), target ship date (can be set at council).

#### Stage 5: Briefed

- **Owner:** Aymane
- **Purpose:** Convert a script into a production-ready editor brief.
- **Entry criteria:** Approved at Concept Council.
- **Exit criteria:** Editor brief complete — shot list, b-roll references, style refs, pacing notes, estimated hours, proposed editor assignment.
- **SLA:** 24 hours from entry.
- **Visibility:** Aymane + Founders.
- **Required fields:** Shot list, style references, pacing notes, music/SFX references, stock asset pulls, estimated edit hours, proposed editor.

#### Stage 6: Assigned

- **Owner:** Editor
- **Purpose:** Handoff window. Editor reviews the brief and accepts or flags.
- **Entry criteria:** Brief complete and editor selected.
- **Exit criteria:** Editor accepts via Discord reaction or in-app button. Card moves to In Edit.
- **SLA:** 12 hours from entry.
- **Visibility:** Assigned editor + Aymane + Founders.
- **Required action:** Editor reacts ✅ (accept) or 🚨 (flag blocker) on the Discord assignment message.

#### Stage 7: In Edit

- **Owner:** Editor
- **Purpose:** Active production.
- **Entry criteria:** Editor accepted assignment.
- **Exit criteria:** First cut uploaded to the card.
- **SLA:** 48–72 hours, set per card based on estimated edit hours.
- **Visibility:** Assigned editor + Aymane + Founders.
- **WIP limit:** Maximum 2 cards per editor simultaneously.

#### Stage 8: QA

- **Owner:** Aymane
- **Purpose:** Review first cut for quality, compliance, pacing, hook strength, brand consistency.
- **Entry criteria:** Editor uploaded first cut.
- **Exit criteria:** One of:
  - **Pass** → moves to Ready.
  - **Revision** → moves back to In Edit with structured feedback note.
- **SLA:** 24 hours from entry.
- **Visibility:** Aymane + Founders + assigned editor (for revision notes).

#### Stage 9: Ready

- **Owner:** Founders
- **Purpose:** Final deploy approval.
- **Entry criteria:** QA passed.
- **Exit criteria:** Founder approves for deploy. Card moves to Live via AdPusher.
- **SLA:** 24 hours from entry.
- **Visibility:** Founders + Aymane.

#### Stage 10: Live

- **Owner:** Aymane (operationally)
- **Purpose:** Ad is running on Meta and/or TikTok. Performance data accumulates.
- **Entry criteria:** Deployed via AdPusher.
- **Exit criteria:** Minimum 7 days of ad-live data collected.
- **SLA:** 7 days minimum in stage, no upper bound.
- **Visibility:** All roles (filtered so editors see only their own).
- **Auto-populated fields:** Spend, CPA, ROAS, hook rate, CTR, thumbstop (synced from Meta/TikTok every 4 hours).

#### Stage 11: Analyzed

- **Owner:** Founders
- **Purpose:** Extract learnings and feed back into future Researching cards.
- **Entry criteria:** 7 days of Live data in.
- **Exit criteria:** Learnings tagged (winner/loser, hook that worked, angle strength, what to test next). Card archived.
- **SLA:** 48 hours from entry.
- **Visibility:** Founders + Aymane.
- **Required fields:** Result tag (winner/loser/inconclusive), learnings note, recommended follow-ups (e.g. "test same hook with different proof").

### 4.3 Stage SLA summary

| Stage | Owner | SLA |
|-------|-------|-----|
| Inbox | Founders | None |
| Researching | Founders | None |
| Drafting | Founders | None |
| Scripted | Founders | None |
| Briefed | Aymane | 24h |
| Assigned | Editor | 12h |
| In Edit | Editor | 48–72h (per card) |
| QA | Aymane | 24h |
| Ready | Founders | 24h |
| Live | Aymane | 7d minimum |
| Analyzed | Founders | 48h |

### 4.4 Additional card states

Alongside the 11 stages, cards can carry these states:

- **Killed** — manually archived before reaching Live. Requires a kill reason.
- **Revision** — flag state inside In Edit, set when QA sends a card back.
- **Blocked** — flag state at any stage, set when the owner flags an external blocker. Triggers an alert.

---

## 5. Data Model

### 5.1 `concepts` table

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | Primary key |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto on update |
| title | text | Required |
| avatar_id | fk → avatars | From the 14 Darina avatars |
| angle_hypothesis | text | Optional until Researching |
| hook_mechanism | text | Optional until Drafting |
| current_stage | enum | See stage enum below |
| stage_entered_at | timestamptz | Reset on every stage transition |
| script_body | text | Required from Scripted onward |
| hook_variants | jsonb | Array of 5 strings, required from Scripted |
| compliance_flags | jsonb | Array of flag objects |
| citations | jsonb | Array of citation objects |
| brief_body | jsonb | Shot list, style refs, pacing, etc. |
| estimated_edit_hours | numeric | Set at Briefed |
| assigned_editor_id | fk → editors | Nullable until Assigned |
| priority | enum | P0, P1, P2 |
| target_ship_date | date | Set at Concept Council |
| performance_data | jsonb | Populated post-Live |
| result_tag | enum | Winner, loser, inconclusive (set at Analyzed) |
| learnings_note | text | Set at Analyzed |
| kill_reason | text | If in Killed state |
| is_blocked | boolean | Blocker flag |
| blocked_reason | text | If is_blocked |

**Stage enum values:**
`inbox`, `researching`, `drafting`, `scripted`, `briefed`, `assigned`, `in_edit`, `qa`, `ready`, `live`, `analyzed`, `killed`

### 5.2 `editors` table

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | Primary key |
| name | text | |
| email | text | |
| specialization_tags | jsonb | e.g. ["scientific_authority", "emotional_documentary"] |
| capacity_per_week | int | Target concepts per week |
| discord_user_id | text | For @mentions |
| is_active | boolean | |

### 5.3 `stage_transitions` table

Event log for every stage change. Critical for analytics and bot triggers.

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | Primary key |
| concept_id | fk → concepts | |
| from_stage | enum | Null if created |
| to_stage | enum | |
| transitioned_by | fk → users | Who triggered the move |
| transitioned_at | timestamptz | |
| notes | text | Optional — e.g. QA revision reason |

### 5.4 `comments` table

Threaded discussion per concept.

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | Primary key |
| concept_id | fk → concepts | |
| author_id | fk → users | |
| body | text | |
| created_at | timestamptz | |

### 5.5 `avatars` table

The 14 Darina customer avatars (existing reference data).

---

## 6. UI Requirements

### 6.1 Kanban view (default)

- Horizontal scrolling board with 11 columns.
- Each column header shows: stage name, card count, WIP limit (where applicable), buffer target (Scripted only: "38/40").
- Column width: narrower than current design (Linear/Height style). User scrolls horizontally.
- Role-based column filtering: each role sees only their scope by default, with a "show all" toggle.

**Card design (compact)**

- Title (1–2 lines, truncated).
- Avatar tag pill.
- Priority dot (P0 red, P1 yellow, P2 grey) — top left.
- Stage age indicator (pill): green <SLA, yellow approaching SLA, red over SLA.
- Assigned owner avatar (based on current stage) — top right.
- Quick-action arrows to move stage left/right (permission-gated).
- Comment count icon if any.
- Blocker flag icon if `is_blocked = true`.

**Card design (Live stage only)**

Additional surfaced metrics: Spend, ROAS, CPA, Thumbstop %. Sync freshness indicator (e.g. "updated 2h ago").

### 6.2 Sheet view

Same data in a sortable, filterable table. Existing sheet toggle retained.

### 6.3 Card detail view (slide-out or full page)

Tabs:

1. **Script** — full VSL + 5 hooks + citations. Editable by founders, read-only for others.
2. **Brief** — editable by Aymane, read-only until stage ≥ Briefed.
3. **Production** — editor uploads, version history, QA notes.
4. **Performance** — Meta/TikTok synced metrics (Live stage onward).
5. **Activity** — full audit log of stage transitions and comments.

Action buttons are context-aware to current stage and user role.

### 6.4 Role-specific dashboards

**Founder dashboard (Adolf, Boyan)**
- Scripted buffer health: count, days of runway at current deploy rate, color-coded.
- Cards needing approval (Ready stage).
- Cards awaiting learnings (Analyzed stage).
- Weekly performance rollup from Live ads.
- Personal Inbox + Researching + Drafting queues.

**Creative Director dashboard (Aymane)**
- Incoming queues: Briefed-pending (from Scripted), QA-pending (from In Edit).
- Team load chart: each editor's current WIP.
- SLA breach alerts at top.
- Deploy queue (Ready stage).

**Editor dashboard**
- My assigned cards (Assigned + In Edit + any revisions).
- Pending acceptance (Assigned cards waiting on my ✅).
- Upcoming deadlines.
- My performance (points / incentive system, if integrated).

### 6.5 Top bar (global)

Retain existing elements:
- Pipeline / Kanban / Sheet toggle.
- Role switcher.
- "+ New Ad" button.
- Ads count and total spend.

Add:
- **Buffer counter:** "Scripted: 38/40" with green/yellow/red color.
- **SLA breach counter:** "2 breached" — clickable, filters board to breached cards.
- **Sync status indicator:** "TW synced 2h ago" (auto-sync every 4h, manual trigger available).

### 6.6 Quick-add flows

- In-app: floating "+ Idea" button that creates an Inbox card with just a title.
- Discord: `/idea [text]` slash command creates an Inbox card attributed to the sending user.
- Mobile: simplified form accessible from the main app on mobile web.

---

## 7. Discord Bot

### 7.1 Architecture

- Hosted on existing Hostinger VPS.
- Node.js + discord.js.
- Listens to Supabase Realtime on `stage_transitions` table.
- Formats and posts messages to designated channels.
- Handles reactions and slash commands, writing back to Supabase.

### 7.2 Channel structure

| Channel | Purpose |
|---------|---------|
| `#pipeline-feed` | All transitions, full visibility |
| `#assignments` | Editor @mentions when assigned |
| `#qa-queue` | Aymane alerts when cuts ready |
| `#deploy-queue` | Founders alerted when Ready |
| `#alerts` | SLA breaches, `@here` if P0 |
| `#performance` | Daily/weekly Live ad rollup |

### 7.3 Message templates

**Assignment**
```
🎬 New assignment for @<editor>
Concept: <title> (P1)
Angle: <angle hypothesis>
Brief: <link>
Estimated: <n> hours | Target ship: <date>
React ✅ to accept or 🚨 to flag
```

**Ready for brief (Aymane)**
```
📋 Brief needed @aymane
Concept: <title> (P0)
Approved at council, script attached.
<link> — SLA: 24h
```

**QA ready**
```
👀 First cut ready for QA @aymane
Concept: <title>
Edited by: <editor>
Duration: <seconds>s | <link>
SLA: 24h
```

**Ready to deploy**
```
🚀 Ready to deploy @adolf @boyan
Concept: <title>
QA passed by Aymane.
Files: <link> | Deploy within 24h
```

**SLA breach**
```
🚨 SLA BREACH @<owner>
Concept: <title>
Stuck in <stage> for <hours>h (SLA: <sla>h)
<link>
```

**Buffer warning**
```
⚠️ Scripted buffer at <n>/40
Current deploy rate: <n>/week → runway: <days>d
```

### 7.4 Interactive actions

**Reactions**
- ✅ on assignment message → accepts, card moves Assigned → In Edit.
- 🚨 on assignment message → flags back to Aymane, bot prompts in thread for reason.

**Slash commands**
- `/idea [text]` — create Inbox card.
- `/status [title]` — returns current stage, owner, SLA state.
- `/buffer` — returns Scripted buffer count and runway.
- `/my-queue` — returns current user's assigned cards.
- `/kill [title] [reason]` — (permission-gated) moves card to Killed state.

### 7.5 SLA breach engine

- Scheduled Supabase Edge Function runs every 15 minutes.
- Queries: `concepts WHERE now() - stage_entered_at > sla_for(current_stage)` and `is_blocked = false`.
- Fires breach event per match (with deduplication so we don't re-alert every 15 min — once per breach, then every 12h if still breached).
- P0 breaches use `@here`. P1 uses @mention. P2 posts without @.

---

## 8. Concept Council (Monday ritual)

Not a software feature per se, but the board should support it:

- **Agenda view:** filter Scripted column by "not yet selected this week" and sort by creation date.
- **Select for week:** bulk-select 20–25 cards, move to Briefed with one action. Bot posts a summary to `#pipeline-feed`.
- **Inbox sweep:** filter Inbox → Researching, bulk-promote promising ideas.
- **Kill sweep:** bulk-archive stale ideas from Inbox.

---

## 9. Analytics (Phase 6)

Powered by the `stage_transitions` event log. Dedicated Analytics tab.

### 9.1 Pipeline health

- Median time in each stage (rolling 30d).
- P90 time in each stage.
- Stage-breach rate per stage.
- Weekly throughput (Scripted → Live count).
- Buffer stability (daily Scripted count over time).

### 9.2 Editor performance

- Average In Edit duration per editor.
- QA pass rate (first-cut-approved / total) per editor.
- Average revisions per card per editor.
- Specialization accuracy (do their "scientific authority" cards outperform their "emotional" cards, etc.).

### 9.3 Creative performance

- Avatar performance (CPA, ROAS rollup by avatar tag).
- Angle-type performance (which angle types produce winners most often).
- Hook mechanism performance.
- Kill-stage distribution (where do concepts get killed — Researching? Drafting? Or post-Live?).

---

## 10. Build Sequence

Phased rollout. Each phase is shippable on its own.

### Phase 1 — Columns and data model (Week 1)

- Migrate the schema to support 11 stages, editor/stage_transitions/comments tables.
- Migrate existing cards: Pre-Production → Scripted or Briefed (user decides per card during migration). In-Production → In Edit. Post-Production → QA. Live → Live.
- Update kanban to render 11 columns with WIP limits and SLA timestamps.
- Stage transition enforcement (no invalid moves).

### Phase 2 — Role-based views (Week 2)

- Founder, Creative Director, Editor dashboards.
- Column visibility filtering per role.
- Role switcher in top bar (already exists, wire it to new rules).

### Phase 3 — Discord bot v1 (Week 3)

- Read-only notifications on every stage transition.
- SLA breach alerts.
- Buffer warnings.
- Channel structure deployed.

### Phase 4 — Discord bot v2 (Week 4)

- Reaction-based stage transitions (accept assignment).
- Slash commands (`/idea`, `/status`, `/buffer`, `/my-queue`, `/kill`).

### Phase 5 — Card detail view + brief template (Week 5)

- Slide-out card detail with tabs.
- Brief template schema enforced at Scripted → Briefed transition.
- Activity log rendering.

### Phase 6 — Analytics + performance sync (Week 6)

- Analytics tab.
- Auto-sync Meta/TikTok performance every 4h into Live cards.
- Weekly performance rollup posted to `#performance`.

### Phase 7 — Polish (Week 7+)

- Tune SLAs based on actual data.
- Add any missing slash commands.
- Mobile-optimize the quick-add flow.
- Kill/revision/blocked flag UI refinement.

---

## 11. Migration Plan (from v1 to v2)

Existing cards in the 4-column board need to map to the new 11-column system.

**Mapping rules:**

| v1 column | v2 column | Notes |
|-----------|-----------|-------|
| Pre-Production (no brief) | Scripted | If script exists |
| Pre-Production (brief in progress) | Briefed | Aymane reviews and adjusts |
| Pre-Production (no script) | Drafting | Founder re-evaluates |
| In-Production | In Edit | |
| Post-Production | QA | |
| Live | Live | Direct map |

**Migration steps:**

1. Back up existing Supabase data.
2. Run schema migration (add new tables, extend concepts table with new fields, add stage enum).
3. Run card-level mapping script that prompts per card for ambiguous ones.
4. Freeze the board for 2 hours during the migration.
5. Post-migration audit: every card has a valid stage, owner, and stage_entered_at.

---

## 12. Open Questions

1. Should `Inbox` support voice memo upload (for capturing ideas on the go)?
2. Do we want Revision to be its own column, or a flag on In Edit?
3. Should Killed cards be permanently deleted after 90 days, or archived forever?
4. How do we handle multi-platform deploys (Meta + TikTok) — one card or two?
5. Does the brief template need different schemas for different ad types (VSL vs hook-test vs static)?

---

## 13. Appendix

### 13.1 Concept brief schema (required for Scripted → Briefed)

```json
{
  "shot_list": [
    { "shot_id": "S1", "description": "...", "duration_s": 3, "asset_ref": "..." }
  ],
  "style_references": ["url1", "url2"],
  "pacing_notes": "Fast cuts 0-5s, slow 5-15s, build tension 15-30s",
  "music_references": ["url1"],
  "sfx_notes": "...",
  "stock_pulls": ["..."],
  "estimated_edit_hours": 6,
  "proposed_editor_id": "uuid",
  "target_ship_date": "2026-04-25"
}
```

### 13.2 Compliance flag schema

```json
{
  "flag_type": "claim_substantiation | medical_claim | before_after | testimonial",
  "severity": "info | warning | block",
  "note": "Redensyl 89% vs Minoxidil 60% requires citation (Karaca 2019)",
  "citation_ref": "citation_id"
}
```

### 13.3 Stage enum (authoritative)

```
inbox
researching
drafting
scripted
briefed
assigned
in_edit
qa
ready
live
analyzed
killed
```

---

**End of PRD v2**
