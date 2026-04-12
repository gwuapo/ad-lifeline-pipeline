# PRD: NCM Split Test Module
**Product:** Ad Lifeline — Marketing OS
**Module:** Offer Split Test / Net Contribution Margin Analyzer
**Status:** Draft v1.0
**Author:** Adolf
**Date:** March 2026

---

## 1. Overview

The NCM Split Test Module allows users to create, run, and evaluate offer split tests across Meta and TikTok ad campaigns. Rather than comparing ad sets by ROAS alone, the module evaluates each offer variant using Net Contribution Margin per dollar of ad spend (NCM/$) — a profit-first metric that accounts for COGS, landed costs, payment fees, and refund rates.

The module integrates with Triple Whale to auto-sync ad set performance data (spend, orders, revenue) on a daily cadence, eliminating manual data entry once a test is configured.

---

## 2. Problem Statement

When running split tests across landing pages with different offer structures (e.g. single-unit vs. bundle vs. combo), ROAS is a misleading comparison metric because:

- Different offers have different COGS and landed costs
- Higher AOV offers typically convert at lower CVR
- Gross margin % varies per offer, so equal ROAS ≠ equal profitability

Users need a single, normalized profit metric that accounts for all of these variables to make correct budget allocation decisions.

---

## 3. User Workflow

### Step 1 — Create a New Split Test
User clicks "New Split Test" and is taken to a setup wizard.

**Fields:**
- Test name (e.g. "Serum Only vs Bundle — March 2026")
- Platform(s): Meta / TikTok / Both
- Number of variations: 2 to 5 (user selects via segmented control)
- Currency: SAR / USD / AED (default: SAR)
- USD exchange rate (editable, default: 3.75)
- Start date

### Step 2 — Configure Each Variation
For each variation (up to 5), user fills in:

**Offer Configuration:**
- Variation name (e.g. "Serum Only", "3-Bottle Bundle")
- Number of SKU tiers in this offer: 1, 2, or 3 (e.g. Buy 1 / Buy 2 / Buy 3)
- Per tier: selling price, landed cost (supplier all-in: product + shipping)
- Assumed quantity mix % across tiers (must sum to 100%; used to compute blended AOV and blended landed cost)

**Ad Set Linkage:**
- Meta Ad Set ID (optional, enables Triple Whale auto-sync)
- TikTok Ad Set ID (optional, enables Triple Whale auto-sync)

**Unit Economics (shared defaults, overridable per variation):**
- Payment processing % (default: 5%)
- Estimated refund rate % (default: 0.05%)

### Step 3 — Test Dashboard (Live View)
Once created, the test appears in the Tests Dashboard with live metrics pulled from Triple Whale.

---

## 4. Metric Calculation Logic

For each variation, the following metrics are computed:

```
Gross Revenue         = Orders × Blended AOV
Net Revenue           = Gross Revenue × (1 − Refund Rate)
Total Landed Cost     = Orders × Blended Landed Cost per Order
Blended AOV           = Σ (Tier Price × Tier Mix %)
Blended Landed Cost   = Σ (Tier Landed Cost × Tier Mix %)

CM1                   = Net Revenue − Total Landed Cost
CM1 %                 = CM1 / Net Revenue

CM2                   = CM1 − Ad Spend
Payment Fees          = Net Revenue × Payment Processing %
CM3                   = CM2 − Payment Fees

ROAS                  = Gross Revenue / Ad Spend
CPA                   = Ad Spend / Orders
NCM per $1 Ad Spend   = CM3 / Ad Spend   ← primary decision metric
```

The variation with the highest NCM/$ is flagged as the winner.

---

## 5. Triple Whale Integration

### Authentication
- User connects Triple Whale account via OAuth or API key in App Settings (one-time setup)
- Triple Whale workspace/store is selected on first connection

### Data Sync
- Sync cadence: once daily at 6:00 AM user local time (manual sync also available)
- Data pulled per ad set ID (Meta and/or TikTok):
  - Ad spend (date range: test start → yesterday)
  - Orders attributed
  - Revenue attributed
- Attribution window: matches user's Triple Whale default attribution window
- Data settling flag: tests younger than 48 hours display a "Data still settling" warning badge

### Sync Status
- Each variation shows last sync timestamp
- If an ad set ID is not linked, variation shows "Manual mode" and user enters spend/orders/revenue manually

### Error Handling
- If Triple Whale API returns an error or ad set ID is not found: show inline error with retry button
- If API rate limit hit: queue sync and notify user

---

## 6. Screens & Components

### 6.1 Tests Dashboard
- List of all split tests (active, completed, archived)
- Per test: test name, platform, number of variations, days running, current winning variation, winning NCM/$
- Filters: platform, status (active / completed / archived), date range
- CTA: "New Split Test" button

### 6.2 Test Detail Screen
**Top section:**
- Test name, platform badges, date range, sync status

**Variation selector:**
- Tab or column layout depending on number of variations (2–5)
- Winner badge on highest NCM/$ variation

**Metrics table (per variation, side by side):**
- Ad Spend
- Orders
- Blended AOV
- ROAS
- CPA
- Gross Revenue
- Net Revenue (after refunds)
- CM1 + CM1 %
- CM2
- CM3
- **NCM per $1 Ad Spend** (highlighted, primary)

**NCM trend chart:**
- Line chart showing NCM/$ per variation over time (one data point per day)
- Shows when data stabilized — useful for knowing when to call the winner

**Quantity mix controls:**
- Editable % inputs per tier per variation
- Blended AOV and blended landed cost update reactively

**Winner callout card:**
- "Based on NCM/$, [Variation Name] is the current winner"
- Shows delta: "X% higher NCM/$ than nearest competitor"
- CTA: "Mark as Winner & Archive Test"

### 6.3 Offer Library
- Reusable offer configurations (prices, landed costs, tier structure)
- When creating a new test, user can select a saved offer instead of re-entering
- CRUD: create, edit, duplicate, delete offers

### 6.4 New Test Setup Wizard
- Step 1: Test metadata (name, platform, currency, variation count)
- Step 2: Configure each variation (tabs, one per variation)
- Step 3: Review summary → Launch

---

## 7. Data Model (Simplified)

```
SplitTest
  id, name, platform[], currency, usdExchangeRate, startDate, status, createdAt

Variation
  id, splitTestId, name, adSetIdMeta, adSetIdTikTok
  paymentPct, refundRate
  tiers: Tier[]
  quantityMix: number[]   // must sum to 100

Tier
  id, variationId, label, price, landedCost

DailySnapshot (synced from Triple Whale)
  id, variationId, date, adSpend, orders, revenue

ComputedMetrics (derived, not stored — calculated on render)
  blendedAOV, blendedLandedCost, grossRevenue, netRevenue,
  cm1, cm1Pct, cm2, paymentFees, cm3, roas, cpa, ncmPerDollar
```

---

## 8. Constraints & Edge Cases

- **Max 5 variations per test** — enforced in UI (segmented control capped at 5)
- **Min 2 variations per test** — a single variation is not a split test
- **Quantity mix validation** — must sum to 100%; show inline error if not
- **Zero orders guard** — if orders = 0, NCM/$ shows "—" not divide-by-zero
- **Negative CM values** — display in red; do not suppress (user needs to see when an offer is loss-making)
- **Currency consistency** — landed cost entered in USD is auto-converted to display currency at the stored exchange rate; conversion rate is locked at test creation time, not recalculated daily
- **Partial sync** — if only one variation has an ad set ID linked, mixed mode: synced variation auto-updates, manual variation prompts user to update
- **Test archiving** — completed tests are read-only; all historical data and winner is preserved

---

## 9. Out of Scope (v1)

- COD confirmation rate / return rate modeling (Saudi COD) — v2
- LTV / repeat purchase attribution — v2
- Automatic winner declaration (app flags, human confirms) — v2
- Statistical significance calculator — v2
- Shopify direct integration (Triple Whale is the data layer for now)
- AppLovin / other ad platform integrations — v2

---

## 10. Success Metrics

- User can set up a new split test in under 3 minutes
- NCM/$ updates automatically each morning without user action (when ad set IDs are linked)
- User can correctly identify the more profitable offer variant even when ROAS rankings diverge from NCM/$ rankings
