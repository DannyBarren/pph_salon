# PPH Stylist App — Production Deployment Guide (v1.0, `production` branch)

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
| *(optional)* `SENDGRID_API_KEY`, `EMAIL_FROM` | to email user invites |
| *(optional)* `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | to send SMS |
| *(optional)* `SENTRY_DSN` | backend error reporting |

3. **Deploy.** The container's `entrypoint.sh` runs database migrations (`alembic upgrade head`) automatically, then starts gunicorn with uvicorn workers.
4. Verify health:
   - `GET https://your-backend/api/v1/health` → `{"status":"ok"}`
   - `GET https://your-backend/api/v1/health/ready` → includes `"database":{"ok":true}`

> If your host doesn't run the container entrypoint (e.g. a buildpack), run migrations manually once in the service console: `alembic upgrade head`.

### 3.3 Create the first super-admin (critical, one-time)
This is the **only** account you create by hand. Run in the backend service console (or locally against the prod `DATABASE_URL`):

```bash
python -m scripts.create_superadmin \
  --email owner@yoursalon.com \
  --name "Jordan Avery" \
  --salon "Aria Studio"
```

It prints a temporary password (omit `--password` to auto-generate). The command is idempotent. Everyone else is provisioned from the Admin panel (single form or CSV bulk import).

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

## 5. First-run: admin bootstraps the org

Log in at `https://your-app.vercel.app/login` with the super-admin credentials from §3.3, then open **Admin**:

1. **Salons** tab → create each salon (name, city, guarantee $/hr, haircut/color prices).
2. **Pay Plan** tab → set each salon's pay-tier ladder (desired $/hr → required PPH). Leave empty to use the app defaults (the Excel-accurate table).
3. **Users** tab →
   - **Bulk import**: download the CSV template, fill it (`email, name, role, salon_id or salon_name, manager_id or manager_email, title, phone, guarantee_rate`), and upload. Provision hundreds at once. Temporary passwords are returned in the response (or emailed if SendGrid is configured).
   - **Single user**: quick form for one-off additions; assign role + manager.
4. **Data Import** tab → upload weekly or daily performance CSV/XLSX. Choose the **source** (`native`, `zenoti`, `paycor`) to auto-map vendor columns. Weekly imports upsert by `(user, week)`; daily imports also aggregate the parent week and populate `DailyPerformance`.
5. **Audit Log** tab → confirm your actions are recorded.

Distribute each stylist/manager their email + temporary password. On first login they should change it.

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

The older "Data provided to App" daily layout (`Salon | EEID | … | Act Svc Rev($) | Act Cuts Count | Act Colors Count`) is still accepted.

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
- [x] Self-registration disabled — accounts are admin-provisioned only.
- [x] Row-level salon scoping + super-admin gating on all admin endpoints.
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

- **Frontend:** real API client with JWT + auto-refresh; login/register pages; route protection (`proxy.ts` + `AuthGate`); admin management UI (salons, users single/bulk CSV, pay plans, imports, audit); Calendar / Promotions / Notifications screens; PWA (manifest, service worker, offline banner, installable); `DEMO_MODE` flag conditionalizing all mocks/localStorage; Sentry placeholder; security headers.
- **Backend:** rate limiting, security headers/CSP, strict CORS + trusted hosts, request logging, prod-safe config enforcement; salon/user CRUD; bulk CSV user provisioning; per-salon pay-tier config; weekly + daily import pipeline with Zenoti/PayCor adapters; row-level salon scoping; audit log; readiness probe; SendGrid/Twilio stubs; gunicorn + non-root Docker + auto-migrations.
- **Pay math:** frontend `tiers.ts`, backend `pay_engine.py`, and the mirror tests are kept byte-for-byte in sync with `docs/spec/PPH Based Payplan.xlsx` and guarded by `scripts/test-pay-parity.mjs`.

---

Questions or issues → push to the `production` branch and reference this guide.
