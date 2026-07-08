# PPH Salon App — Complete Codebase Guide (`client_readme`)

> A thorough, educational walk-through of the **entire** PPH Salon application: the
> product, the tech stack, the pay-plan math, every feature, and every meaningful
> file in the codebase. This document is intentionally exhaustive — read it
> top-to-bottom to understand how everything fits together, or jump to a section.
>
> This file is **documentation only** (it lives in the repo, not the running UI).
> The original `README.md` is unchanged.

---

## Table of contents

1. [What the app is](#1-what-the-app-is)
2. [The two applications & repo layout](#2-the-two-applications--repo-layout)
3. [Tech stack (full)](#3-tech-stack-full)
4. [The pay-plan domain & math (the heart of everything)](#4-the-pay-plan-domain--math-the-heart-of-everything)
5. [Roles, permissions & the privacy rule](#5-roles-permissions--the-privacy-rule)
6. [Web frontend (Next.js) — deep dive](#6-web-frontend-nextjs--deep-dive)
7. [Web backend (FastAPI) — deep dive](#7-web-backend-fastapi--deep-dive)
8. [Streamlit MVP — deep dive](#8-streamlit-mvp--deep-dive)
9. [Feature-by-feature reference](#9-feature-by-feature-reference)
10. [How the pieces talk to each other (data flow)](#10-how-the-pieces-talk-to-each-other-data-flow)
11. [Running everything locally](#11-running-everything-locally)
12. [Testing, linting & CI](#12-testing-linting--ci)
13. [Deployment](#13-deployment)
14. [Environment variables & feature flags](#14-environment-variables--feature-flags)
15. [Glossary](#15-glossary)
16. [Known trade-offs & next steps](#16-known-trade-offs--next-steps)

---

## 1. What the app is

**PPH** = **Production Per Hour**. The app helps hair-salon **stylists** understand
how their **scheduled/worked hours** and **service production** (revenue from
haircuts & colors) translate into **pay**, and helps **managers/owners** coach a
team against that pay plan.

The pay model is a **tiered commission plan** built around a single factor
(`0.4`): your pay rate is 40% of your production-per-hour, with an hourly
**guarantee** as a floor. The app turns this spreadsheet logic into glanceable,
mobile-friendly screens plus planning and goal-setting tools.

Everything is driven by two source-of-truth documents in `docs/spec/`:
- `PPH Based Payplan.xlsx` — the pay formulas & worked examples (sheets **Sched
  View** for the stylist "Rebeca" and **Actual** for "Steph").
- `PPH Stylist App.pdf` — the product screens & flows (referenced by the specs).

---

## 2. The two applications & repo layout

There are **two independent implementations** of the product in this repo:

| App | Stack | Location | Role |
| --- | --- | --- | --- |
| **Web app** | Next.js + FastAPI + PostgreSQL | repo root (`src/`, `backend/`) | The primary, deployable product |
| **Streamlit MVP** | Pure Python + SQLite | `streamlit_app/` | A fast, self-contained internal tool / reference implementation of the math |

They do **not** share code or data. The web app is what you deploy; the Streamlit
app is a quick internal calculator that proves the numbers match the Excel.

```
pph_salon/
├── src/                     Next.js 16 App-Router frontend (deployed at repo root)
│   ├── app/                 routes: / /planner /board /team /team-goals /admin
│   ├── components/          UI + feature components (+ components/team, components/ui)
│   ├── hooks/               React-Query-style data hooks
│   ├── lib/                 pure logic: pay math, types, roles, privacy, mock data…
│   ├── services/            data-fetch layer (mock, swappable for real APIs)
│   └── store/               AppContext global state (+ localStorage persistence)
├── backend/                 FastAPI + SQLModel + Alembic (Excel-accurate pay engine)
│   ├── app/{api,core,db,models,schemas,services}
│   └── alembic/versions/    DB migrations
├── streamlit_app/           Standalone Python/Streamlit MVP (own SQLite DB)
├── docs/                    AGENTS.md, pay-plan-logic.md, spec/ (Excel source)
├── scripts/                 zero-dep Node tests + DB seed helper
├── public/                  static assets
├── package.json, next.config.mjs, tsconfig.json, vercel.json   (root = web app)
├── docker-compose.yml       Postgres + backend for local dev
├── README.md                short public readme (unchanged)
└── client_readme.md         ← this document
```

---

## 3. Tech stack (full)

**Frontend (web)**
- **Next.js 16** (App Router, React 19, Turbopack), **TypeScript (strict)**.
- **Tailwind CSS v4** (design tokens as CSS variables in `src/app/globals.css`).
- **lucide-react** icons.
- **No heavyweight runtime deps** — state, data-fetching, validation, and tables
  are hand-rolled lightweight utilities (see §6) to keep the bundle small and the
  demo dependency-free.

**Backend (web API)**
- **FastAPI** (Python 3.12), **SQLModel** (SQLAlchemy 2 + Pydantic v2 models),
  **PostgreSQL** (via `psycopg2`), **Alembic** migrations.
- **Auth**: JWT (`pyjwt`) + password hashing (`passlib`/`argon2`), with a
  **demo mode** that bypasses auth for the no-login demo.
- **openpyxl** + **python-multipart** for spreadsheet imports.
- Lint/format with **ruff**; tests with **pytest**.

**Streamlit MVP**
- **Streamlit**, **pandas**, **openpyxl**, **SQLite** (stdlib `sqlite3`), tests
  with **pytest**.

**Tooling**
- ESLint (`eslint-config-next`), GitHub Actions CI (frontend lint+build, backend
  ruff+pytest), Docker Compose for local Postgres+API.

---

## 4. The pay-plan domain & math (the heart of everything)

This is the most important section — every screen is a presentation of these
formulas. The canonical spec is [`docs/pay-plan-logic.md`](docs/pay-plan-logic.md);
the values are asserted by tests against the Excel.

### 4.1 Core constants

| Symbol | Value | Meaning |
| --- | --- | --- |
| **NP factor** (Excel `B6`) | `0.4` | Pay rate = `0.4 × PPH`. To *earn* a rate you need `PPH = rate / 0.4`. |
| **Haircut price** (`T6`) | `$23` | Production per haircut. |
| **Color price** (`AC6`) | `$85` | Production per color service. |
| **Guarantee rate** | e.g. `$12` / `$13` | Hourly floor; you never earn below `guarantee × hours`. |
| **NP%** | `19.5%` | `1 − 0.4 − (16%+5%+1.5%+18%)` overhead — the net-profit share. |

### 4.2 The tier table (PayRt → PPH)

`PPH = ROUND(pay_rate / 0.4, 0)` using **Excel half-up rounding** (so `13/0.4 =
32.5 → 33`, not Python's banker's `32`). This produces the fixed table:

| Rate | PPH | Rate | PPH | Rate | PPH |
| --- | --- | --- | --- | --- | --- |
| 11 | 28 | 18 | 45 | 25 | 63 |
| 12 | 30 | 19 | 48 | 26 | 65 |
| 13 | 33 | 20 | 50 | 27 | 68 |
| 14 | 35 | 21 | 53 | 28 | 70 |
| 15 | 38 | 22 | 55 | 29 | 73 |
| 16 | 40 | 23 | 58 | | |
| 17 | 43 | 24 | 60 | | |

### 4.3 The formulas (per weekly schedule)

```
PPH(rate)                = round_half_up(rate / 0.4)
daily_target[d]          = PPH(rate) × daily_hours[d]     (0 if rate < guarantee)
weekly_required(rate)    = PPH(rate) × total_hours        (col K)
min_expected             = round(guarantee / 0.4 × hours) (cell N3)
weekly_svcs_incr(rate)   = weekly_required − min_expected (col L, 0 if rate ≤ guarantee)
weekly_pay(rate)         = total_hours × rate             (col M, 0 if rate < guarantee)
weekly_pay_incr(rate)    = total_hours × (rate − guarantee) (col N, 0 if rate ≤ guarantee)
```

**Actual performance** (what a stylist really did):
```
current_PPH     = production / hours_worked
earned_rate     = highest tier whose PPH ≤ current_PPH, floored at guarantee
week_pay         = earned_rate × hours_worked   (never below guarantee × hours)
over_short       = actual_production − required_production   (green ≥ 0, red < 0)
```

**Service mix** to hit a production target:
- all-haircuts = `ceil(target / 23)`, all-colors = `ceil(target / 85)`, or a
  blended split.

### 4.4 Golden examples (used as tests)

- **Rebeca** (Sched View): guarantee `$12`, `27.25 h`. Rate 13 → weekly required
  `899.25`, pay `354.25`, increment `27.25`; min expected `818`.
- **Steph** (Actual): guarantee `$13`, `28 h`. Rate 14 → weekly required `980`,
  min expected `910`, services increment `70`.

### 4.5 Where the math lives (multiple implementations, kept in agreement)

| File | Purpose |
| --- | --- |
| `docs/pay-plan-logic.md` | Canonical written spec. |
| `backend/app/services/pay_engine.py` | `PayPlanEngine` — tiered, Excel-accurate (authoritative backend). |
| `src/lib/tiers.ts` | Frontend tiered engine (powers the Team Dashboard). |
| `src/lib/planner.ts` | Goal Planner math (`getRequiredProduction`, `snapServiceMix`, linked sliders). |
| `src/lib/payEngine.ts` | Older flat-commission approximation (personal Stylist Dashboard). |
| `streamlit_app/calculations.py` | Exact Excel port for the Streamlit MVP (10 golden tests). |

> Trade-off worth knowing: the personal Stylist Dashboard (`payEngine.ts`) still
> uses a simplified flat-commission model, while the Team Dashboard, Goal Planner,
> backend, and Streamlit use the tiered model. Reconciling `payEngine.ts` to the
> tiered engine is a documented next step.

---

## 5. Roles, permissions & the privacy rule

### 5.1 Roles

- **Frontend** (`src/lib/types.ts`): `stylist | manager | sdl`, where **`sdl`**
  (Salon Development Leader) carries **owner + admin** privileges.
- **Backend** (`backend/app/models/user.py`): `stylist | manager | admin | owner`.
  The frontend `sdl` maps to owner/admin.

Hierarchy (single source of truth `src/lib/roles.ts`): `sdl > manager > stylist`.
Helpers: `ROLE_RANK`, `isAtLeast`, `canManageTeam`, `canPostAnnouncements`,
`canSeeMoney`, `ROLE_LABEL`.

### 5.2 Who can do what

| Capability | Stylist | Manager | SDL / Owner / Admin |
| --- | --- | --- | --- |
| See own data | ✅ | ✅ | ✅ |
| See team | — | their salon / direct reports | everyone |
| See **revenue / production $** | ❌ **never** | ✅ | ✅ |
| Post announcements | ❌ | ✅ (own salon) | ✅ (any salon) |
| Acknowledge announcements | ✅ | ✅ | ✅ |
| Set own goal | ✅ | ✅ | ✅ |
| Review (approve/disapprove) goals | ❌ | direct reports | all |
| Edit pay config / prices / users / import | ❌ | ❌ | ✅ |

### 5.3 The privacy rule (critical)

Stylists must **never** see revenue, production dollars, or monetary totals — only
hours, **pay rates** ($/hr are allowed), service counts, services/hour, and
over/short expressed in service terms. This is centralized in
`src/lib/privacy.ts` → `canSeeMoney(role)` (re-exported from `roles.ts`) and
applied across the Stylist Dashboard, Week-by-Day, and Goal Planner. Managers and
above see full `$` on the same screens via conditional rendering. The backend
mirrors this with role-scoped visibility in `app/api/deps.py`.

---

## 6. Web frontend (Next.js) — deep dive

### 6.1 App Router routes (`src/app/`)

| Route | File | Purpose | Who |
| --- | --- | --- | --- |
| `/` | `page.tsx` | Personal **Stylist Dashboard**; managers/SDL are redirected to `/team`. | all |
| `/planner` | `planner/page.tsx` | **Goal Planner** (evolved What-If planner). | all |
| `/board` | `board/page.tsx` | **Message Board** (announcements). | all |
| `/team` | `team/page.tsx` | **Team Dashboard** (composite team view). | manager, sdl |
| `/team-goals` | `team-goals/page.tsx` | **Team Goals** (approvals + hierarchy). | manager, sdl |
| `/admin` | `admin/page.tsx` | **Admin**: config, data management, imports. | sdl |

`src/app/layout.tsx` wraps everything in `AppProvider` (global state) and
`AppShell` (nav). `globals.css` defines the Tailwind theme tokens (brand red/blue
accents, surfaces, status colors, radii).

### 6.2 Global state — `src/store/AppContext.tsx`

A single React context is the app's "database" in the demo. It holds and persists
(to `localStorage` key `pph-state-v1`) all mutable state:

- `currentUser` / `setCurrentUserId` — the active demo account.
- `viewedStylistId` / `allowedStylists` — which stylist a manager is drilling into.
- `config: PayConfig` — pay engine settings incl. `salonGuarantee` and
  `salonServicePrices` overrides. Mutators: `updateConfig`, `setSalonGuarantee`,
  `setSalonServicePrice`, `resetConfig`.
- Time selection: `timeView`, `selectedWeekId`, `selectedPeriodIndex`.
- `overrides` — per-stylist `DayRecord[]` (legacy day-level data) via `getDays` /
  `addRecords`.
- `weeklyData` — `WeeklyData` keyed by `userId:weekStart` via `getWeeklyData` /
  `upsertWeeklyData`.
- `userProfiles` — editable profile overrides via `resolveUser` /
  `upsertUserProfile`.
- **Message board**: `boardPosts`, `boardAcks`, `boardLastSeen` + `createPost`,
  `acknowledgePost`, `markBoardSeen`.
- **Goals**: `goals`, `notifications` + `setGoal`, `reviewGoal`, `getActiveGoal`,
  `getGoalHistory`, `markNotificationRead`.

> Because the demo is client-only, all "backend" writes here go to the store and
> `localStorage`. The FastAPI backend is the "real" implementation you'd wire in
> for production.

### 6.3 `src/lib/` — pure logic modules

| File | What it does |
| --- | --- |
| `types.ts` | All shared TypeScript types: `Role`, `User`, `Salon`, `ServicePrices`, `DayRecord`, `WeeklyData`, `PayConfig`, `Week`/`TimeView`, `MessageBoardPost`, `MessageAcknowledgment`, `TargetAudience`, `Goal`, `AppNotification`, etc. |
| `roles.ts` | Role hierarchy + permission helpers (single source of truth). |
| `privacy.ts` | `canSeeMoney`, `servicePricesFor` (config → salon → default prices). |
| `tiers.ts` | Tiered PPH engine for the Team Dashboard: tier table, `getCurrentEffectivePayRate`, `getRequiredProductionForPayRate`, `getNextTier`, `getTierProgress`, `calculateOverShort`, service conversions. |
| `planner.ts` | Goal Planner math: `getRequiredProduction`, `snapServiceMix`, `adjustLinkedSlider`, `assessFeasibility` (realism warnings), `effectiveRate`. |
| `payEngine.ts` | Legacy flat-commission engine: `summarize` (period rollup), `plan` (what-if). Used by the personal dashboard. |
| `format.ts` | `money`, `rate`, `hrs`, `num`, `pct` display helpers. |
| `time.ts` | Deterministic week/period model (fixed "today" for stable demos), date helpers. |
| `selection.ts` | Resolve the time view into a concrete date range; slice day records. |
| `mockData.ts` | Demo salons, users (stylists/managers/owner), generated day records, usage stats, `DEFAULT_CONFIG`, message-board seed posts/acks, hierarchy helpers. |
| `csv.ts` | Minimal RFC-4180 CSV parser + sample. |
| `exportCsv.ts` | CSV builder + browser download; Team Dashboard export. |
| `validate.ts` | ~80-line Zod-style runtime validator (`v.object/array/string/number/enum`, `safeParse`). |
| `telemetry.ts` | `track(event, props)` analytics placeholder. |
| `featureFlags.ts` | `FEATURE_TEAM_DASHBOARD`, refresh interval. |
| `messaging.ts` | Message-board visibility/targeting/ack-stats + smart audience options. |
| `teamTypes.ts` / `teamDerive.ts` / `teamData.ts` / `teamMessaging.ts` | Team Dashboard types, per-stylist derivation, seed dataset (real Rebeca/Steph + modeled stylists), and coaching copy. |

### 6.4 `src/hooks/`

- `useAsyncQuery.ts` — a **React-Query-style** hook (caching by key, `staleTime`,
  `gcTime`, retry, refetch-on-focus, polling, `isLoading`/`isFetching`).
- `useDebounced.ts` — debounce a value (search inputs).
- `useTeamDashboard.ts` — fetch + derive team performance + KPIs; `filterAndSortPerformances`.

### 6.5 `src/services/`

- `teamDashboardService.ts` — mock data service shaped like a real API:
  600–900 ms latency, **retry with exponential backoff**, salon scoping, Zod-lite
  validation. Swap this one file for real Zenoti + PayCor calls in production.

### 6.6 Components

**Shell & shared UI**
- `AppShell.tsx` — top bar + desktop/mobile nav (role-filtered), role indicator,
  unread badges (Board + Goals). Nav adapts to `FEATURE_TEAM_DASHBOARD`.
- `ui/primitives.tsx` — the design system: `Card`, `Button`, `Badge`, `Avatar`,
  `Progress`, `ProgressRing`, `Segmented`, `Select`, `Slider`, `NumberField`,
  `Modal` (portal + focus-trap + Escape), `SectionTitle`.
- `Stat.tsx`, `AccountSwitcher.tsx` (demo account switch), `StylistSwitcher.tsx`,
  `TimeNavigator.tsx`.

**Personal dashboard & planner**
- `StylistDashboard.tsx` — hero, KPIs, "what you still need", daily breakdown
  (privacy-aware: hides $ for stylists).
- `DailyBreakdown.tsx` — per-day table (privacy-aware bars/values).
- `GoalPlanner.tsx` — the **Goal Planner**: pay-rate slider, planned-hours slider
  (0+ for call-offs), two **linked service sliders** + auto-snap, realism
  warnings, **Set/Update Goal** with active-goal + status + **Goal History**.

**Team Dashboard (`components/team/`)**
- `TeamDashboard.tsx` (orchestrator) + `TeamKPICard`, `TeamFiltersBar`,
  `TeamDistribution`, `StylistCard`, `StylistTableView`, `StylistDetailModal`,
  `ProgressToNextTier`, `StatusBadge`, `DailyMiniTrend`, `Skeletons`,
  `ErrorBoundary`. Features: KPIs, filters/sort/search, cards↔table toggle,
  actual↔scheduled toggle, needs-attention callout, rate distribution, CSV
  export, auto-refresh, virtualization for large lists, a11y.
- `TeamOverview.tsx` — the legacy simple team list (fallback when the flag is off).

**Message Board**
- `MessageBoard.tsx` — pinned-first posts, unread highlight, stylist
  **Acknowledge**, manager **ack stats + per-stylist breakdown**, **New Post**
  modal with a role-smart audience selector, pin + expiry.

**Team Goals**
- `TeamGoals.tsx` — manager review (prefilled comment, Approve/Disapprove,
  re-review, status badges, notifications panel) + **SDL cascading Store →
  Manager → Stylist accordion**.

**Admin**
- `AdminConfigPanel.tsx` — pay engine config, per-salon guarantees & service
  prices, live formula preview.
- `DataManagementPanel.tsx` — salon → stylist filter, editable profile + weekly
  data (week picker, upsert), CSV template + bulk import.
- `DataInputPanel.tsx` — legacy day-record CSV import + manual entry.

---

## 7. Web backend (FastAPI) — deep dive

Structure under `backend/app/`:

- `main.py` — FastAPI app, CORS, includes the v1 router at `/api/v1`.
- `core/config.py` — settings (DB URL, JWT, `demo_mode`, CORS) via
  pydantic-settings.
- `core/security.py` — password hashing + JWT encode/decode.
- `db/session.py` — SQLAlchemy engine + `get_session` dependency.
- `api/deps.py` — **authentication + RBAC**: `get_current_user` (demo mode injects
  an admin; real mode validates JWT), `require_role`, `visible_stylist_ids`
  (admin/owner → all; manager → salon; stylist → self).

### 7.1 Models (`app/models/`, SQLModel tables)

| Model | Key fields |
| --- | --- |
| `Salon` | name, city/location, `guarantee_rate`, **`service_prices` (JSON)** |
| `User` | name, **role** (`stylist/manager/admin/owner`), `salon_id`, `manager_id` (self-ref), email/phone, **`guarantee_rate`**, auth fields |
| `Week` (WeeklyData) | `stylist_id`, `week_start`/`week_end`, scheduled/actual hours, production, haircuts, colors, `actual_other_value`, notes — unique per (stylist, week) |
| `DailyPerformance` | per-day rows within a week |
| `PayTier` | per-salon PPH tier overrides |
| `MessageBoardPost` | author, role, salon, **`target_audience` (JSON)**, title, content, pinned, expiry |
| `MessageAcknowledgment` | post_id + user_id (unique), timestamp |
| `Goal` | stylist, week, **targets** (pph/hours/haircuts/colors), `is_active`, **`previous_goal_id`** (override chain), approval fields (`approval_status`, `manager_comment`, `reviewed_by/at`) |
| `Notification` | recipient, actor, type, message, `goal_id`, `is_read` |

### 7.2 Services (`app/services/`)

- `pay_engine.py` — `PayPlanEngine` (tiered, Excel-accurate) + functional helpers
  (`effective_pay`, `plan_what_if`, `required_production`, `suggest_service_mix`).
- `weekly_repo.py` — `upsert_weekly_data_by_user_and_week`, `get_stylists_by_salon`
  (derives production from service counts × salon prices).
- `messaging.py` — post visibility/targeting, `normalize_audience_for_role`
  (managers auto-scoped to their salon), `acknowledgment_stats`, `acknowledge_post`.
- `goal_service.py` — **one-active-goal-per-(stylist, week)** rule, override chain
  via `previous_goal_id`, manager notification on set/update, `review_goal`
  (approve/disapprove + comment → notify stylist), `get_team_goals`,
  `get_hierarchy` (Store → Manager → Stylist).

### 7.3 API endpoints (all under `/api/v1`)

| Method & path | Purpose |
| --- | --- |
| `GET /health` | Liveness check. |
| `POST /auth/...` | JWT login / refresh (bypassed in demo mode). |
| `GET /users/visible-stylists` | Role-scoped stylist list. |
| `POST /payplan/effective-rate` | Compute pay/effective-rate for production+hours. |
| `POST /payplan/what-if` | Required/remaining production for a target rate. |
| `GET /admin/import-template` · `POST /admin/import-weekly` | CSV/XLSX weekly-data template + bulk upsert. |
| `GET/POST /messages` · `POST /messages/{id}/acknowledge` · `GET /messages/{id}/acknowledgments` | Message board. |
| `POST /goals` · `GET /goals/active|history|team|hierarchy` · `POST /goals/{id}/review` | Goals. |
| `GET /notifications` · `POST /notifications/{id}/read` | Notifications. |

### 7.4 Migrations (`backend/alembic/versions/`)

1. `97c9c4984125` initial models (salon, user, week, daily_performance, pay_tier).
2. `aa6945c404fc` auth fields on user.
3. `b1f2a3c4d5e6` weekly-data fields, salon `service_prices`, `owner` role.
4. `c3d4e5f6a7b8` message board + acknowledgments.
5. `d4e5f6a7b8c9` goals + notifications.

Apply with `alembic upgrade head`.

---

## 8. Streamlit MVP — deep dive

A standalone Python app in `streamlit_app/` — same product, minimal stack.

| File | Role |
| --- | --- |
| `app.py` | Entry point + role-based sidebar navigation. |
| `calculations.py` | Exact Excel pay engine (half-up PPH, tiers, min-expected, increments, service mix, over/short). |
| `data_models.py` | SQLite persistence + repository functions (Postgres-swappable). |
| `seed_data.py` | Rebeca + Steph golden data + a demo team, loaded once. |
| `auth.py` | Session-based role switcher + permission helpers. |
| `import_utils.py` | CSV/Excel/paste import (Zenoti per-day rows → weekly). |
| `screens/` | One module per screen: `week_summary`, `week_by_day`, `goal_planner`, `team_dashboard`, `data_entry`, `admin`, `extras` (calendar/promotions/notifications), `common`. |
| `tests/test_calculations.py` | 10 golden-case tests vs the workbook. |

Screens: **Week in Summary**, **Week by Day** (Over/Short 🟢/🔴), **Goal Planner**
(tier targets, guarantee/current highlighted), **Team Dashboard** (composite +
drill-in), **Data Entry**, **Admin** (prices/guarantees/users/import), and
Calendar/Promotions/Notifications. Roles: Stylist / Manager / Admin.

---

## 9. Feature-by-feature reference

- **Demo account switching** — instant, no-login role/persona switching that
  re-scopes the whole app (`AccountSwitcher`).
- **Personal Stylist Dashboard** — effective rate, production/pace, hours,
  services, "what you still need", daily breakdown (privacy-aware).
- **Goal Planner** — plan pay rate + hours + service mix (linked sliders,
  auto-snap, realism warnings); **Set/Update Goal for the pay period** with
  history and manager review status. One active goal per period; overrides archive
  the previous goal.
- **Team Dashboard (manager/SDL)** — KPIs, per-stylist cards/table, filters,
  search, sort, actual↔scheduled toggle, needs-attention, rate distribution, CSV
  export, auto-refresh, detail modal, virtualization, a11y, error boundaries,
  loading skeletons.
- **Message Board / Announcements** — one-way posts with salon/role targeting,
  pinning, expiry, unread badges; stylist Acknowledge; manager ack stats.
- **Team Goals** — manager approve/disapprove + comment (with notifications both
  directions); SDL cascading org hierarchy.
- **Admin** — pay-engine config, per-salon guarantees & service prices, editable
  stylist profiles + weekly data, CSV/Excel bulk import (works offline).
- **Notifications** — goal events (set/updated → manager; reviewed → stylist).
- **Privacy** — stylists never see revenue anywhere.

---

## 10. How the pieces talk to each other (data flow)

**Demo mode (default, what you run today):**
1. UI reads/writes the `AppContext` store (in-memory + `localStorage`).
2. All "features" (goals, posts, data entry) mutate that store — no network.
3. Deterministic mock data + a fixed "today" make the demo stable and shareable.

**Production path (designed-for, partially wired):**
1. Zenoti provides scheduled/actual hours + service sales; PayCor provides pay
   rates → imported via `/admin/import-weekly` or future API clients.
2. FastAPI persists to PostgreSQL (models + Alembic).
3. The frontend swaps `services/teamDashboardService.ts` (and store actions) for
   real `fetch` calls to the FastAPI endpoints; RBAC is enforced server-side in
   `api/deps.py`.
4. Demo mode is toggled off (`DEMO_MODE=false`) to require real JWT auth.

The **Streamlit app** is fully self-contained: UI → repository functions →
its own SQLite file (`streamlit_app/pph.db`).

---

## 11. Running everything locally

**Web frontend**
```bash
npm install
npm run dev          # http://localhost:3000
# or: npm run build && npm run start
```

**Web backend** (optional for the demo; required for the real API)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000     # docs at /docs
alembic upgrade head                          # against a Postgres DB
# or run Postgres + API together:
docker compose up
```

**Streamlit MVP**
```bash
cd streamlit_app
pip install -r requirements.txt
streamlit run app.py     # http://localhost:8501
```

> Demo tip: to reset the web demo, clear the browser `localStorage` key
> `pph-state-v1`.

---

## 12. Testing, linting & CI

- **Frontend:** `npm run lint` (ESLint) and `npm run build` (TypeScript strict).
  Zero-dep calculation tests: `npm run test:calc`, `npm run test:planner`
  (Node's built-in test runner, under `scripts/`).
- **Backend:** `ruff check .` and `pytest` (models, pay engine, weekly import,
  messaging, goals/notifications, auth — 55+ tests).
- **Streamlit:** `pytest streamlit_app/tests/` (10 golden-case tests).
- **CI** (`.github/workflows/ci.yml`): runs backend ruff+pytest and frontend
  lint+build on every PR.

---

## 13. Deployment

- **Frontend** deploys to **Vercel** with **Root Directory = repo root** (the
  Next.js app is intentionally at the root; the Python backend in `backend/` is
  ignored by the Vercel build). Framework preset: Next.js. `vercel.json` +
  `next.config.mjs` at root.
- **Backend** deploys as a container (`backend/Dockerfile`) with a managed
  Postgres; run `alembic upgrade head` on release.
- **Streamlit** can deploy to Streamlit Community Cloud or a container.

---

## 14. Environment variables & feature flags

- `NEXT_PUBLIC_FEATURE_TEAM_DASHBOARD` (frontend) — toggles the Team Dashboard nav
  & default landing (defaults **on**). The Vite-equivalent name is noted in code.
- Backend (`backend/.env`, see `.env.example`): `DATABASE_URL`, `SECRET_KEY`,
  `DEMO_MODE` (default `true` — set `false` to enforce JWT), CORS origins, token
  lifetimes.
- Streamlit: `PPH_DB_PATH` (optional SQLite path override).

---

## 15. Glossary

- **PPH** — Production Per Hour (`production / hours`).
- **NP factor (0.4)** — pay rate is 40% of PPH; `PPH = rate / 0.4`.
- **NP%** — net-profit share (19.5%) after overhead deductions.
- **Guarantee rate** — hourly pay floor.
- **PayRt / tier** — a discrete pay rate ($11–$29) with a required PPH.
- **Over/Short** — actual production minus required production.
- **Min Expected** — the guarantee expressed as production.
- **SDL** — Salon Development Leader (owner-level role on the frontend).
- **Effective rate / Current PPH** — headline $/hr a stylist is earning.

---

## 16. Known trade-offs & next steps

- **Two implementations** (web + Streamlit) will drift; pick one as the product
  long-term (the Next.js + FastAPI app is the deployable path).
- **Pay-engine reconciliation:** migrate `src/lib/payEngine.ts` (personal
  dashboard) from flat-commission to the tiered engine used everywhere else.
- **Wire the frontend to the real backend:** replace store mutations +
  `teamDashboardService.ts` with FastAPI calls; turn off `DEMO_MODE`.
- **Real integrations:** Zenoti (hours + sales) and PayCor (pay rates) API
  clients instead of CSV import.
- **Real auth:** replace the demo account switcher with SSO / email-password.
- **Lightweight-lib swaps (optional):** the hand-rolled `useAsyncQuery`,
  `validate.ts`, and table/virtualization helpers can be replaced with React
  Query / Zod / TanStack Table if the team standardizes on them.
- **Notifications:** currently in-app; add email/push if desired.

---

*Generated as an educational companion to the codebase. Keep it updated as
features evolve, or ask for a regenerated version after major changes.*
