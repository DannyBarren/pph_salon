# PPH Stylist App — Production Deployment Guide (v1.0, `production` branch)

> **Production readiness (2026-09-04):** the full stack below was verified
> end-to-end against a local production-mode deployment (Postgres 16, gunicorn,
> `ENVIRONMENT=production`, `NEXT_PUBLIC_DEMO_MODE=false`): migrations, seed
> (16 salons / 60 employees / admin), both client pay-period workbooks imported
> with zero skips (430 + 424 day rows), idempotent re-uploads, client-aligned
> pay periods, and the invite/activation flow. Before deploying, merge the four
> readiness PRs and follow the click-by-click provider steps in
> [`DEPLOYMENT_RUNBOOK.md`](./DEPLOYMENT_RUNBOOK.md).

**Status:** Ready for hundreds of stylists across multiple salons.
**Branch:** `production`
**Stack:** Next.js 16 (Vercel) frontend + FastAPI (Railway/Render/Docker) backend + managed PostgreSQL.

This guide takes you from an empty account to a live, secure, multi-tenant deployment. Follow the sections in order.

---

## 1. Prerequisites

- GitHub access to `DannyBarren/pph_salon` (this `production` branch).
- A **Vercel** account (for the frontend).
- A **Railway** or **Render** account (for the backend). Free tiers work to start.
- A managed **PostgreSQL** database — Neon, Supabase, or the Postgres add-on built into Railway/Render.

You do **not** need to run anything locally to deploy, but a local run is documented in §10.

---

## 2. Architecture at a glance

```
┌────────────────────┐        HTTPS/JSON        ┌────────────────────────┐
│  Next.js (Vercel)  │  ───────────────────▶    │  FastAPI (Railway/…)   │
│  PWA, JWT in       │  ◀───────────────────    │  JWT auth, RBAC,       │
│  localStorage      │     Bearer access token   │  rate limiting, audit  │
└────────────────────┘                           └───────────┬────────────┘
                                                              │ SQLAlchemy
                                                    ┌─────────▼─────────┐
                                                    │  PostgreSQL       │
                                                    └───────────────────┘
```

- **Frontend** talks only to the backend's `/api/v1/*` endpoints. With `NEXT_PUBLIC_DEMO_MODE=false`, all mock data / localStorage persistence is disabled, the demo account switcher is hidden, and login is required.
- **Backend** enforces JWT auth, role-based access, per-salon row scoping, rate limiting, security headers, and writes an audit trail for every admin action. `DEMO_MODE` is **force-disabled** whenever `ENVIRONMENT=production`, and the app refuses to boot with the insecure default `SECRET_KEY`.

---

## 3. Deploy the database + backend (10–15 min)

### 3.1 Create the database
Create a managed Postgres instance (Neon/Supabase/Railway). Copy its connection string and convert it to the SQLAlchemy driver form used by the app:

```
postgresql+psycopg2://USER:PASSWORD@HOST:5432/DBNAME
```

### 3.2 Deploy the backend service
1. Railway/Render → **New Project → Deploy from GitHub**, select the `production` branch, **root directory = `/backend`**. The `backend/Dockerfile` is detected automatically.
2. Set the environment variables below (template: `backend/.env.production.example`):

| Variable | Value |
|---|---|
| `ENVIRONMENT` | `production` |
| `DATABASE_URL` | `postgresql+psycopg2://…` (from your provider) |
| `SECRET_KEY` | a strong random string (**required**, ≥32 chars) — generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `DEMO_MODE` | `false` (also force-disabled in code when `ENVIRONMENT=production`) |
| `CORS_ORIGINS` | `https://your-app.vercel.app` (comma-separated for multiple) |
| `ALLOWED_HOSTS` | your backend hostname, e.g. `your-backend.up.railway.app` |
| `ENABLE_DOCS` | `false` (keep Swagger private) |
| `WEB_CONCURRENCY` | `4` (gunicorn workers; tune to CPU) |
| `BOOTSTRAP_TOKEN` | one-time secret for the `/setup` first-owner flow (set for initial deploy, then unset) — see §3.3 |
| *(optional)* `SENDGRID_API_KEY`, `EMAIL_FROM` | to email user invites |
| *(optional)* `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | to send SMS |
| *(optional)* `SENTRY_DSN` | backend error reporting |

3. **Deploy.** The container's `entrypoint.sh` runs database migrations (`alembic upgrade head`) automatically, then starts gunicorn with uvicorn workers.
4. Verify health:
   - `GET https://your-backend/api/v1/health` → `{"status":"ok"}`
   - `GET https://your-backend/api/v1/health/ready` → includes `"database":{"ok":true}`

> If your host doesn't run the container entrypoint (e.g. a buildpack), run migrations manually once in the service console: `alembic upgrade head`.

### 3.3 Create the admin + seed the real roster (recommended, one-time)
This deployment ships a **preset admin** and a one-command seeder that also loads
the real salons/employees. After the DB is migrated (the entrypoint does this on
boot; run `alembic upgrade head` manually if your host skips the entrypoint), run
the seeder from the backend service console (or locally against the prod
`DATABASE_URL`):

```bash
cd backend
python -m scripts.seed_production \
  --csv "../PPH Data 06-26-2026.xlsx.csv"
```

It creates the preset admin and imports every real salon + employee. Defaults:

| Field | Value |
|---|---|
| Admin **username** (login identifier, stored in the `email` field) | `admin` |
| Admin **password** | `venitaadmin` |
| Admin **role** | `owner` (full org-wide powers) |

The admin is **active immediately** and can sign in right away at `/login` using
`admin` / `venitaadmin`. **Change this password after the first login**
(Account → Change password). Every imported employee is created **pending setup**
(profile only, no password) and **cannot log in** until an admin/manager activates
them (§5). The seeder is **idempotent** — safe to re-run. Override any default via
`--admin-username`, `--admin-password`, `--admin-name`, `--admin-role`, `--csv`.

**Alternative first-owner methods** (if you'd rather not use the preset admin):

- **Web setup page:** set `BOOTSTRAP_TOKEN` on the backend, visit
  `https://your-app.vercel.app/setup`, enter the token + owner name/email/password
  + salon name. Works **only while the users table is empty** (409 afterward), so
  it can't be reused as a backdoor. **Unset/rotate `BOOTSTRAP_TOKEN`** afterward.
- **CLI:** `python -m scripts.create_superadmin --email owner@yoursalon.com --name "Jordan Avery" --salon "Aria Studio"` (prints a temp password; idempotent).

Everyone else is provisioned **down the hierarchy** — never by hand (§5).

---

## 4. Deploy the frontend on Vercel (5 min)

1. Vercel → **Add New Project** → import `DannyBarren/pph_salon`. **Root Directory = repo root** (the Next.js app lives at the root — do *not* set `frontend`). Framework preset: **Next.js**.
2. Set environment variables (template: `.env.production.example`):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://your-backend.up.railway.app` (the app appends `/api/v1`) |
| `NEXT_PUBLIC_DEMO_MODE` | `false` |
| `NEXT_PUBLIC_FEATURE_TEAM_DASHBOARD` | `true` |
| *(optional)* `NEXT_PUBLIC_SENTRY_DSN` | browser error reporting |

3. Set the **Production Branch** to `production` (Project → Settings → Git), or merge `production` → `main`.
4. **Deploy.** After it builds, make sure `CORS_ORIGINS` on the backend contains your final Vercel domain, then redeploy the backend if you changed it.

---

## 5. Provisioning model — a delegated hierarchy

### 5.1 How accounts are created
Accounts cascade down the chain **owner → admin → manager → stylist**. Each level can only create accounts **strictly below** its own, and this is enforced by the backend on every endpoint (single create, bulk CSV, and `register`):

| Signed-in role | Can create | Where |
|---|---|---|
| **Owner** | admins, managers, stylists | any salon |
| **Admin** | managers, stylists | any salon |
| **Manager** | **stylists only** | **their own salon** (new stylist auto-reports to them) |
| **Stylist** | — (leaf level) | — |

Managers are therefore **responsible for setting up their own stylists**, and they cannot touch other salons or create peers/superiors. Self-registration is disabled entirely.

> **Full, step-by-step account guide:** [`ACCOUNT_SETUP_GUIDE.md`](./ACCOUNT_SETUP_GUIDE.md) covers the whole flow (first owner → managers → stylists), the CSV formats, credential distribution, password resets, and troubleshooting.

### 5.2 Owner/admin bootstraps the org (Admin panel)
Sign in as the owner (§3.3) → open **Admin**:
1. **Salons** tab → create each salon (name, city, guarantee $/hr, haircut/color prices).
2. **Pay Plan** tab → set each salon's pay-tier ladder (desired $/hr → required PPH). Leave empty to use the Excel-accurate defaults.
3. **Users** tab → create your **managers** (assign each to a salon). Single form or CSV bulk import (`email, name, role, salon_id or salon_name, manager_id or manager_email, title, phone, guarantee_rate`). Temporary passwords are returned in the response (or emailed if SendGrid is configured).
4. **Data Import** tab → upload weekly/daily performance CSV/XLSX; choose the **source** (`native`, `zenoti`, `paycor`) to auto-map vendor columns.
5. **Audit Log** tab → every privileged action is recorded here.

### 5.3 Managers set up their stylists (Staff page)
Each manager signs in and opens **Staff** (the `/staff` page in their nav):
- **Add a team member** — one-off stylist creation (role + salon are fixed automatically).
- **Bulk import** — CSV of their stylists (`email, name` + optional `title, phone, guarantee_rate`); everyone lands in the manager's salon reporting to them. Rows for other salons/roles are safely skipped.
- The list shows only their team; they can deactivate a stylist who leaves.

Distribute each new user their email + temporary password. On first login they should change it.

### 5.4 Activating pending accounts (setup links) + daily passcode
Seeded/imported staff start **pending setup** (no password). Rather than handing
out temporary passwords, activate them with a secure, expiring **setup link**:

- **Admin → Users** (or **Manager → Staff**): each row shows a status badge
  (**Pending setup** / **Active** / **Deactivated**). Click **Activate** on a
  pending user to email a one-time `/accept-invite` link; you're prompted for an
  email if the profile has none (it becomes their login username). The user sets
  their own password via the link and is signed straight in. If email isn't
  configured, the link is shown once to copy. Delegated rules apply (managers →
  their own stylists only). Every activation is audit-logged.
- **Daily passcode:** after their first login (or right after accepting the setup
  link), a user may set a **4–6 digit numeric passcode** (Account → Quick-access
  passcode) for faster same-device sign-in. The device remembers who they are and
  asks for the passcode **once per device-local calendar day**; full password
  login is still used on new devices and after repeated wrong attempts. The
  passcode is stored only as a hash server-side — never plaintext, never logged.

---

## 6. Data import formats

Download the exact templates from the Admin **Data Import** / **Users** tabs (they are also served by the API):

- **Users:** `email, name, role, salon_id, salon_name, manager_id, manager_email, title, phone, guarantee_rate`
- **Weekly:** `employee_id, salon_name, week_start, scheduled_hrs, actual_hrs, actual_haircuts, actual_colors, actual_other_value, notes`
- **Daily (client v2 export):** `employee_id, salon_name, sale_date, scheduled_hrs, actual_hrs, actual_haircuts, actual_colors, service_revenue, Employee Name, pay_period, Include/Exclude`

### Uploading the client's daily export (recommended)

The client's real file is **one row per employee per work day** (e.g. `v2.PPH Data 06-22-2026 TO 07-05-2026.xlsx`). Upload it as-is under **Admin → Data Import → Daily performance**:

- **`employee_id`** routes each row to the right person. The hyphen is optional — `VG-1426` and `VG1426` both match the roster — and routing is **by employee id regardless of `salon_name`** (salon is just a label).
- **`sale_date`** accepts ISO (`2026-06-22`) or US `M/D/YYYY` (`6/22/2026`). The two-names-in-one-cell headers the client uses (`week_start`/`sale_date`, `actual_other_value`/`service_revenue`) are both accepted.
- **`service_revenue`** (a.k.a. `actual_other_value`) is the **authoritative** daily service revenue; the day's production is taken directly from it (not re-derived from counts).
- **`Include/Exclude`** drives each employee's pay-plan `excluded` flag (`Exclude` → excluded; `Include` → on-plan).
- Daily rows are idempotently upserted and their parent **Week** is aggregated automatically, so the Stylist Dashboard, Daily Breakdown, Team views and Goal Planner show the real per-day numbers immediately. Re-uploading the same file is safe.

Two other daily layouts are accepted as-is, with the same behaviour:

- The client's **raw per-day export** — `Salon Name | Employee ID | Employee Name | Sale Date | Scheduled Hours | Actual Hours | Service Sale | Haircuts | Color | Include/Exclude` (`Service Sale` is the authoritative revenue, as `service_revenue` is above).
- The older **"Data provided to App"** layout — `Salon | EEID | … | Act Svc Rev($) | Act Cuts Count | Act Colors Count`.

The credential-free demo build accepts the same files: the Admin page's **Data input** and **Data Management → Bulk import** panels read `.xlsx` directly and pick the daily or weekly parser from the file's headers.

**Vendor sources:** select `zenoti` or `paycor` on upload to normalize their column headers to the native shape. Live API pulls are stubbed (`app/services/importers.py::fetch_zenoti_week` / `fetch_paycor_week`) and ready to wire when you have vendor credentials.

---

## 7. Security checklist (verify before go-live)

- [x] `ENVIRONMENT=production` and `DEMO_MODE=false` on the backend (demo is force-disabled in prod regardless).
- [x] `SECRET_KEY` is a unique strong value (boot fails otherwise).
- [x] `CORS_ORIGINS` limited to your Vercel domain(s); `ALLOWED_HOSTS` set to the backend host.
- [x] `NEXT_PUBLIC_DEMO_MODE=false` on the frontend (login enforced, account switcher hidden, no mock/localStorage).
- [x] HTTPS everywhere (Vercel + backend provider provide TLS; HSTS header is sent in prod).
- [x] Rate limiting on (`/auth/login` tight, imports throttled).
- [x] Security headers + CSP applied by both the frontend (`next.config.mjs`) and backend middleware.
- [x] Passwords hashed with argon2; password policy enforced; login is rate-limited.
- [x] Fast-access passcodes hashed with argon2 (never plaintext/logged); verify endpoint rate-limited + locks out after repeated failures.
- [ ] Preset admin password (`venitaadmin`) changed after first login.
- [x] Self-registration disabled — accounts are provisioned down the owner→admin→manager→stylist hierarchy only.
- [x] Delegated provisioning enforced server-side (managers limited to stylists in their own salon).
- [ ] `BOOTSTRAP_TOKEN` unset/rotated once the first owner exists (see §3.3).
- [x] Row-level salon scoping + role-rank gating on all admin/provisioning endpoints.
- [x] Audit log records every privileged action.
- [ ] `ENABLE_DOCS=false` (or gate `/docs`) if you don't want the schema public.
- [ ] Configure `SENTRY_DSN` (front + back) for error monitoring.
- [ ] Set up automated Postgres backups with your DB provider.

---

## 8. Scaling & maintenance

- **200–500 users:** a single small backend instance + a small managed Postgres is plenty.
- **Horizontal scale:** the backend is stateless (JWT auth, no server session); increase `WEB_CONCURRENCY` and/or replicas behind your provider's load balancer. Vercel scales the frontend automatically.
- **Weekly data:** import Zenoti/PayCor CSVs from the Admin panel; automate later via a cron job hitting `/api/v1/admin/import-weekly` with a service token, or by wiring the live-API stubs.
- **Updates:** push to `production` → Vercel + Railway/Render auto-deploy. DB schema changes ship as new Alembic migrations (applied on boot by `entrypoint.sh`).
- **Observability:** request-id + timing logs are emitted per request; add Sentry DSNs for error aggregation.

---

## 9. First-day usage (salon owner)

1. Sign in as the super-admin.
2. Create your salon(s) and pay plans.
3. Bulk-import all stylists/managers via CSV; assign managers.
4. Import the latest week's data (Zenoti/PayCor export).
5. Share login links + temporary credentials with the team.
6. Stylists open the app → see their Week Summary + Goal Planner. Managers see the full Team Dashboard. Install the PWA on phones (Add to Home Screen).

---

## 10. Local development (optional)

**Everything in Docker (Postgres + backend):**
```bash
docker compose up --build          # backend on :8000, Postgres on :5432
```

**Frontend:**
```bash
npm install
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 npm run dev   # http://localhost:3000
```

**Run the test suites:**
```bash
# Frontend (pay-math + parity regression):
npm test
# Backend:
cd backend && pip install -r requirements.txt && pytest
```

**Demo mode:** leave `NEXT_PUBLIC_DEMO_MODE` unset (defaults to on) and the backend `DEMO_MODE=true` for the zero-login, mock-data demo experience.

---

## 11. What changed for production (summary)

- **Frontend:** real API client with JWT + auto-refresh; login (email **or** username) / accept-invite / setup pages; route protection (`proxy.ts` + `AuthGate`); daily **passcode gate** (numeric keypad) + Account passcode management; admin management UI (salons, users single/bulk CSV with **status badges** + **Activate / Send setup link**, pay plans, imports, audit); Calendar / Promotions / Notifications screens; PWA (manifest, service worker, offline banner, installable); `DEMO_MODE` flag conditionalizing all mocks/localStorage; Sentry placeholder; security headers.
- **Backend:** rate limiting, security headers/CSP, strict CORS + trusted hosts, request logging, prod-safe config enforcement; JWT auth with username-or-email login; secure invite / accept-invite setup-token flow; **fast-access numeric passcode** (set/change/clear/verify, hashed, rate-limited + lockout); `seed_production` (preset admin + real roster, pending-setup employees); salon/user CRUD; bulk CSV user provisioning; per-salon pay-tier config; weekly + daily import pipeline with Zenoti/PayCor adapters; row-level salon scoping; audit log; readiness probe; SendGrid/Twilio stubs; gunicorn + non-root Docker + auto-migrations.
- **Pay math:** frontend `tiers.ts`, backend `pay_engine.py`, and the mirror tests are kept byte-for-byte in sync with `docs/spec/PPH Based Payplan.xlsx` and guarded by `scripts/test-pay-parity.mjs`.

---

Questions or issues → push to the `production` branch and reference this guide.
