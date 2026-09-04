# Production Deployment Runbook — Venita Group (PPH Stylist App)

**Purpose:** click-by-click steps to take the `production` branch live — managed
Postgres, FastAPI backend, and a NEW Vercel frontend project — plus seeding,
data import, and the go-live checklist. Verified end-to-end on 2026-09-04
against a local production-mode stack (Postgres 16 + gunicorn + Next.js build
with `NEXT_PUBLIC_DEMO_MODE=false`).

> **Do not touch the existing demo project** (`v1_pph-salon`,
> https://v1pph-salon.vercel.app). Its Production Branch stays on `main`.
> Everything below creates NEW resources.

---

## 0. Merge the readiness PRs first

Seven small PRs into `production` fix blockers found during the production
bring-up. Merge in this order (any order works except as noted):

1. **#43** — config: accept plain-string `CORS_ORIGINS`/`ALLOWED_HOSTS` without
   crashing (without this the backend cannot boot with the documented env vars).
2. **#44** — seed/setup: make the first account an **admin** (the top role).
   Without this the seeded `admin` gets 403 on every admin endpoint.
3. **#45** — import: deterministic routing for dual-salon employees (fixes
   duplicate days on re-upload).
4. **#46** — performance: pay-period dropdown matches the client's payroll
   calendar (Jun 22 – Jul 5, Jul 6 – Jul 19, …).
5. **#47** — roster: adds VG-1502 / VG-1503 / VG-1504 so both client workbooks
   import with **zero skips**.
6. **#49** — team dashboard: serves live Postgres data in production mode
   (was mock-only). **Stacked on #46 — merge #46 first.**
7. **#50** — import UX: Data Import defaults to the client's **Daily
   performance** path; weekly import error points at it.

Then redeploy/re-sync so `production` includes all seven.

---

## 1. Managed Postgres (Neon — ~3 min)

1. https://console.neon.tech → **Sign up** (GitHub login is fine) → **New project**.
2. Name: `pph-salon-prod`. Region: closest to the backend host (e.g. US East).
   Postgres 16+. Click **Create project**.
3. On the project dashboard click **Connect** and copy the connection string.
   It looks like `postgresql://USER:PASSWORD@HOST-xyz.neon.tech/DBNAME?sslmode=require`.
4. **Convert it to the SQLAlchemy driver form** the app requires:

   ```
   postgresql+psycopg2://USER:PASSWORD@HOST-xyz.neon.tech/DBNAME?sslmode=require
   ```

   (i.e. insert `+psycopg2` after `postgresql`.)
5. Backups: Neon → Project → **Settings → Storage/Backups** — point-in-time
   restore is on by default on paid tiers; on the free tier enable
   **scheduled snapshots** if available, or export nightly via `pg_dump`
   (GitHub Action cron is fine). Tick the checklist box only once some form of
   automated backup exists.

*(Supabase or Railway Postgres work identically — any managed Postgres 14+.)*

---

## 2. Backend on Railway (~10 min)

1. https://railway.app → **New Project → Deploy from GitHub repo** → pick
   `DannyBarren/pph_salon`. Authorize the Railway GitHub app if asked.
2. In the new service → **Settings**:
   - **Source branch:** `production`
   - **Root Directory:** `/backend`
   - Railway auto-detects `backend/Dockerfile`. The image's `entrypoint.sh`
     runs `alembic upgrade head` then gunicorn — no custom start command needed.
3. **Variables** tab — add exactly these (template: `backend/.env.production.example`):

   | Variable | Value |
   |---|---|
   | `ENVIRONMENT` | `production` |
   | `DATABASE_URL` | `postgresql+psycopg2://…` from step 1.4 |
   | `SECRET_KEY` | generate: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
   | `DEMO_MODE` | `false` |
   | `CORS_ORIGINS` | `http://localhost:3000` **temporarily** — replaced with the real Vercel domain in step 3 |
   | `ALLOWED_HOSTS` | the Railway domain from step 2.4, e.g. `pph-backend-production.up.railway.app` |
   | `ENABLE_DOCS` | `false` |
   | `WEB_CONCURRENCY` | `4` |
   | `APP_BASE_URL` | `http://localhost:3000` **temporarily** — replaced in step 3 |
   | `INVITE_TOKEN_EXPIRE_HOURS` | `72` |
   | `BOOTSTRAP_TOKEN` | one-time random string (used only if you bootstrap via `/setup` instead of the seeder; **unset after first admin exists**) |
   | *(optional)* `SENDGRID_API_KEY`, `EMAIL_FROM` | invite emails; without them setup links display on-screen to copy |
   | *(optional)* `SENTRY_DSN` | backend error reporting |

4. **Settings → Networking → Generate Domain** to get the public backend URL
   (e.g. `https://pph-backend-production.up.railway.app`). Put that hostname in
   `ALLOWED_HOSTS` (above) and redeploy if needed.
5. **Verify** (from any shell):
   - `curl https://<backend>/api/v1/health` → `{"status":"ok",…}`
   - `curl https://<backend>/api/v1/health/ready` → `…"database":{"ok":true…}`
   - `curl https://<backend>/docs` → 404 (docs are private).
6. If the deploy logs show the entrypoint was skipped (some builders do), open
   the service **Console** and run `alembic upgrade head` once.

*(Render equivalent: New → Web Service → same repo/branch/root, Docker runtime,
same env vars, `gunicorn` start comes from the Dockerfile.)*

---

## 3. Frontend on Vercel — NEW project (~5 min)

1. https://vercel.com → **Add New… → Project** → import `DannyBarren/pph_salon`.
2. **Project name:** e.g. `pph-venita` (must NOT be the existing `v1_pph-salon`).
3. **Root Directory:** leave **blank** (the Next.js app is at the repo root).
   Framework preset: **Next.js** (auto-detected).
4. **Environment Variables** (Production):

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_BASE_URL` | `https://<backend>` from step 2.4 (no trailing slash) |
   | `NEXT_PUBLIC_DEMO_MODE` | `false` |
   | `NEXT_PUBLIC_FEATURE_TEAM_DASHBOARD` | `true` |

5. **Settings → Git → Production Branch:** set to `production`.
   (`vercel.json` already enables deploys for both branches; the DEMO project
   keeps `main`.)
6. **Deploy.** Note the assigned domain, e.g. `https://pph-venita.vercel.app`.
7. **Close the CORS loop:** back in Railway set
   - `CORS_ORIGINS=https://pph-venita.vercel.app`
   - `APP_BASE_URL=https://pph-venita.vercel.app`
   and redeploy the backend.
8. **Verify:** open `https://pph-venita.vercel.app` → you must land on `/login`;
   there must be **no demo account switcher**. Opening `/admin` logged-out must
   redirect to `/login`.

---

## 4. Seed the roster + admin (one time, ~1 min)

From any machine with the repo and the venv (or the Railway service console —
`DATABASE_URL` is already set there):

```bash
cd backend
pip install -r requirements.txt          # local only; console already has them
export DATABASE_URL='postgresql+psycopg2://…'   # local only
export ENVIRONMENT=production
export SECRET_KEY='<the same value as Railway>'  # local only
python -m scripts.seed_production --csv "../PPH Data 06-26-2026.xlsx.csv"
```

**Expected output** (verified 2026-09-04):

```
Roster import: 16 salons, 60 employees created (0 updated), 0 skipped.
Created super-admin 'admin' (role=admin).
```

Then:

1. Sign in at `https://<frontend>/login` with username `admin`, password
   `venitaadmin`.
2. **Immediately** Account → **Change password** to a strong unique password.
3. Railway → remove (or rotate) `BOOTSTRAP_TOKEN`.
4. Admin → **Users**: confirm Dalton Rivera (VG-1502), Hallie Ekness (VG-1503),
   Wynter Winslow (VG-1504) exist as **Pending setup** (they seed from the
   updated roster CSV via PR #47).

> **Operational note:** re-running `seed_production` is idempotent for the
> roster but also **resets the admin password to `venitaadmin`**. Treat re-seeding
> as the password-recovery path; rotate the password again afterward.

---

## 5. Import the real pay periods (~2 min)

Admin → **Data Import** → **Daily performance**. Upload as-is, in order:

1. `v2.PPH Data 06-22-2026 TO 07-05-2026.xlsx`
   → verified result: **inserted=430, updated=0, skipped=0**
2. `PPH Data 07-06-2026 TO 07-19-2026.xlsx`
   → verified result: **inserted=424, updated=0, skipped=0**

(Re-uploads are idempotent upserts — verified: second upload of file 1 returns
`inserted=0, updated=430`.)

Later periods (Aug/Sep) import the same way the moment the client sends the
files — no template changes required; the client's own export layout is the
supported format.

**Spot-check (verified locally):** Holliean Miller (VG-1426) —
week 06-22: 9.90 h / $280.70 · week 06-29: 22.35 h / $544.15 ·
week 07-06: 19.98 h / $579.80 · week 07-13: 24.42 h / $507.70 — matching the
spreadsheets to the penny. Rebeca Ortega (VG-1313) — 07-06: 27.83 h / $442.30;
07-13: 25.97 h / $734.60. Dual-salon totals (Michelle Moore, VG-1429) combine
across her two salon records to the spreadsheet totals exactly.

---

## 6. Monday 2026-09-07 call — exact click-paths (Sim)

**Add a new pay period**
1. Sign in → **Admin** → **Data Import** tab.
2. Import type = **Daily performance** (the default) → drop the client's new
   .xlsx (e.g. `PPH Data 07-20-2026 TO 08-02-2026.xlsx`) → **Upload & import**.
3. Read the result line: `Inserted / updated / skipped` with any unknown
   employees named.
4. Open any stylist dashboard → **Pay Period** dropdown → the new period
   (e.g. **Jul 20 – Aug 2**) is there; pick it, then pick a week for
   Week-by-Day. The **Team Dashboard** automatically opens on the latest
   imported week.

**Add a new stylist**
1. **Admin → Users → Add user** (single form): name, employee code, salon,
   role = Stylist. (Managers can do the same from **Staff** for their salon.)
2. The new person shows **Pending setup** → click **Activate**.
3. Enter their email when asked (it becomes their login). If SendGrid is set,
   they get the link by email; otherwise **copy the on-screen setup link** and
   text/email it yourself.
4. They open the link, set a password, and are signed straight in.

**Data upload hand-holding**
- The client's own export is the format — no template, no editing. Daily file
  → Daily performance. Unknown employees are skipped **by name**; add them under
  Admin → Users, then re-upload the same file (safe — it upserts).

---

## 7. Go-live checklist

- [ ] PRs #43, #44, #45, #46, #47, #49, #50 merged to `production`
- [ ] `ENVIRONMENT=production`, `DEMO_MODE=false` on backend (demo is also force-disabled in code)
- [ ] `NEXT_PUBLIC_DEMO_MODE=false` on the NEW frontend project only
- [ ] Unique `SECRET_KEY` ≥ 32 chars (boot fails otherwise)
- [ ] `CORS_ORIGINS` = the new frontend origin only; `ALLOWED_HOSTS` = backend host
- [ ] `ENABLE_DOCS=false` (`/docs` → 404)
- [ ] Preset admin password changed after first login
- [ ] `BOOTSTRAP_TOKEN` unset/rotated
- [ ] HTTPS on both (Vercel + Railway TLS automatic; HSTS sent by backend in prod)
- [ ] Postgres backups enabled at the provider
- [ ] No demo switcher visible; every page except `/login` `/setup` `/accept-invite` requires login
- [ ] `/api/v1/health` + `/api/v1/health/ready` green
- [ ] Both pay periods imported and selectable (`Jun 22 – Jul 5`, `Jul 6 – Jul 19`)
- [ ] One new user created + activated end-to-end (setup link → set password → signed in)
- [ ] `npm test` (36) + backend `pytest` (147) green on the merged branch

## 8. Blockers that need Danny

- **Provider logins** — Vercel / Railway (or Render) / Neon (or Supabase). The
  cloud agent had no credentials for any provider, so all resources above must
  be created by you following this runbook.
- **SendGrid key** (optional) — without it, setup links are copied on-screen
  instead of emailed (acceptable for go-live).
- **Aug/Sep pay-period files** from the client — import on arrival via §5.
- **Custom domain** (optional) — point it at the new Vercel project and add it
  to `CORS_ORIGINS`.
