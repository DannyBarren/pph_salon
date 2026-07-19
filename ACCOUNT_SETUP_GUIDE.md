# PPH Stylist App — Account Setup & Organization Guide

**Audience:** salon owners, admins, and managers responsible for setting up and
running the app for their organization.
**Scope:** how accounts work, how to create the first owner, and how each level
sets up the people below it — from the org's very first login to day-to-day user
management.

> This guide is about **people and accounts**. For infrastructure/deployment
> (databases, Vercel, env vars), see [`PRODUCTION_INSTRUCTIONS.md`](./PRODUCTION_INSTRUCTIONS.md).

---

## 1. The big picture — how accounts are organized

The app is **multi-tenant and hierarchical**. Every person has exactly one
**role** and belongs to exactly one **salon**. Accounts are created **top-down**:
the owner sets up the organization, and each level provisions the level directly
below it, until you reach stylists (the "leaf" level).

```
            ┌─────────┐
            │  OWNER  │  the org's top account (created once, at setup)
            └────┬────┘
       creates   │
            ┌────▼────┐
            │  ADMIN  │  optional; org-wide helpers for large chains
            └────┬────┘
       creates   │
            ┌────▼─────┐
            │ MANAGER  │  runs one salon; creates that salon's stylists
            └────┬─────┘
       creates   │
            ┌────▼─────┐
            │ STYLIST  │  the end user (sees their pay, plan, goals)
            └──────────┘
```

**Golden rule:** *you can only create accounts below your own level, and (unless
you're an owner/admin) only within your own salon.* This is enforced by the
server on every path — the UI, the CSV importer, and the API all obey it.

### Who can do what

| Your role | Can create | In which salon(s) | Can reset passwords for | Sees data for |
|---|---|---|---|---|
| **Owner** | admins, managers, stylists | any salon | anyone | the whole organization |
| **Admin** | managers, stylists | any salon | anyone | the whole organization |
| **Manager** | **stylists only** | **their own salon** (new stylist reports to them automatically) | their own-salon stylists | their salon's team |
| **Stylist** | — (nothing) | — | — (only their own via *Change password*) | only themselves |

**"Owner" vs "Admin":** they have the same powers (both are "super-admins").
Use **Owner** for the person who owns the business; add **Admins** only if you
run several salons and want extra org-wide helpers. A single salon needs only an
owner + managers + stylists.

> In the app's UI, owners/admins see the full **Admin** area; managers see a
> simpler **Staff** area scoped to their salon. Stylists see neither.

---

## 2. Before you start

- The app must be **deployed and running** (see `PRODUCTION_INSTRUCTIONS.md`), with:
  - the **frontend** on Vercel with `NEXT_PUBLIC_DEMO_MODE=false`, and
  - the **backend** reachable, with `DEMO_MODE=false` and a strong `SECRET_KEY`.
- You'll need the URL of the app, e.g. `https://your-app.vercel.app`.

> **Demo vs. live.** If the app is in **demo mode** (`NEXT_PUBLIC_DEMO_MODE`
> unset/true) there is *no login and no real accounts* — it's a sandbox with mock
> data and an instant account switcher. Everything in this guide applies to the
> **live** app (demo mode off). You can tell you're live because the app shows a
> **Sign in** screen.

---

## 3. Part A — Create the first owner (one time)

This is the only account created "from outside" the hierarchy. Pick **one** of
the two methods.

### Method 1 (recommended): the web Setup page

1. Ask whoever deployed the backend to set a **one-time setup secret**:
   the `BOOTSTRAP_TOKEN` environment variable (any long random string).
2. Go to **`https://your-app.vercel.app/setup`**.
3. Fill in:
   - **Setup token** — the `BOOTSTRAP_TOKEN` value.
   - **Your full name** — e.g. *Jordan Avery*.
   - **Owner email** — the address you'll sign in with.
   - **Password** — at least 8 characters.
   - **Salon name** — your first/primary salon (you can add more later).
4. Click **Create owner & sign in**. You're now signed in as the owner.
5. **Security follow-up:** ask the deployer to **remove or rotate**
   `BOOTSTRAP_TOKEN`. The setup page automatically stops working once any user
   exists (it returns "already initialised"), but unsetting the token is good
   hygiene.

**Why it's safe:** the setup endpoint only works while the database has **zero
users**, and it requires the secret token (checked in constant time). It can't be
used as a back door after your org exists.

### Method 2: the command line (server console)

If you'd rather not use a setup token, run this once in the backend's console
(or locally with the production `DATABASE_URL` set):

```bash
python -m scripts.create_superadmin \
  --email owner@yoursalon.com \
  --name "Jordan Avery" \
  --salon "Aria Studio"
```

It prints a **temporary password** (or pass `--password "…"` to choose one). The
command is idempotent — re-running it just updates that owner.

### Troubleshooting Part A

| Symptom | Cause & fix |
|---|---|
| "Setup is disabled or the token is invalid" | `BOOTSTRAP_TOKEN` isn't set on the backend, or you typed it wrong. Set it and retry. |
| "This application is already set up" (409) | An owner already exists. Use **Sign in** instead (or reset via CLI). |
| "Password must be at least 8 characters" | Choose a longer password. |

---

## 4. Part B — Owner builds the organization

Sign in as the owner and open the **Admin** area (top navigation). Work through
the tabs left to right.

### Step 1 — Create your salons

**Admin → Salons → Create salon.** For each salon set:
- **Name** (required) and **City**.
- **Guarantee $/hr** — the hourly floor a stylist is guaranteed.
- **Haircut $ / Color $** — the per-service production values used by the pay math
  (defaults: haircut $23, color $85).

Repeat for every location. A single-salon business just needs the one created at
setup (you can edit it here).

### Step 2 — (Optional) Set each salon's pay plan

**Admin → Pay Plan.** Pick a salon and define its **pay-tier ladder** (desired
$/hr → required production-per-hour). Leave it empty to use the built-in
Excel-accurate defaults. You can revisit this any time.

### Step 3 — Create your managers

Every salon needs at least one **manager** who will run its team.

**Admin → Users → Add a single user:**
- **Full name**, **Email** (they sign in with it).
- **Role** = *Manager*.
- **Salon** = the salon they'll run.
- (Optional) assign them under another manager/owner.
- Click **Create user** → a **temporary password** is shown (or emailed if email
  is configured). Give it to the manager.

**Bulk option (many managers at once):** use **Bulk import (CSV)** on the same
tab — see the [CSV reference](#6-csv-reference-bulk-import) below.

### Step 4 — (Optional) Create admins

For multi-salon chains, add **Admins** the same way (Role = *Admin*). They get
org-wide powers like the owner. Skip this for a single salon.

> **Owners/admins can create stylists directly too**, but the intended flow is to
> let **managers create their own stylists** (next section). This keeps each
> manager responsible for — and in control of — their team roster.

---

## 5. Part C — Managers set up their stylists

Each manager signs in with the credentials the owner/admin gave them and opens
the **Staff** area (top navigation). Everything here is automatically scoped to
**their** salon.

### Add one stylist
**Staff → Add a team member:**
- Enter **Full name** and **Email**.
- That's it — the app automatically makes them a **stylist in your salon**, and
  sets them to **report to you**. (No role or salon pickers — you can't create
  anything other than your own stylists.)
- Click **Create user** → share the **temporary password** shown.

### Add a whole team at once (CSV)
**Staff → Bulk import (CSV):** upload a file with just `email, name` (plus optional
`title, phone, guarantee_rate`). Everyone is imported as a **stylist in your
salon reporting to you**. Rows that try to specify another salon or a non-stylist
role are safely ignored, so you can even reuse an owner-style template. See the
[CSV reference](#6-csv-reference-bulk-import).

### Manage your team
On the **Staff** page you can:
- See your team roster.
- **Reset password** for any of your stylists (shows a new temporary password to
  hand over).
- **Deactivate** a stylist who leaves (their login stops working; their history
  is preserved).

---

## 6. CSV reference (bulk import)

Download the exact template from the **Users** (owner/admin) or **Staff**
(manager) tab — there's a **Template** button. Columns:

| Column | Required | Notes |
|---|---|---|
| `email` | ✅ | Unique; used to sign in. Re-importing the same email **updates** that user. |
| `name` | ✅ | Full name. |
| `role` | – | `stylist` (default), `manager`, `admin`, `owner`. Must be **below your level**. Managers importing: always treated as `stylist`. |
| `salon_id` | – | Numeric salon id. **Or** use `salon_name`. Ignored for managers (forced to your salon). |
| `salon_name` | – | Salon name (case-insensitive). Handy when you don't know ids. |
| `manager_id` | – | Numeric id of the manager they report to. **Or** use `manager_email`. Ignored for managers (forced to you). |
| `manager_email` | – | Email of their manager (resolved to that manager). |
| `title` | – | e.g. "Senior Stylist". |
| `phone` | – | Contact number. |
| `guarantee_rate` | – | Per-stylist $/hr floor (overrides the salon default). |

### Resolution rules
- **Salon:** `salon_id` wins; otherwise `salon_name` is matched (case-insensitive).
  For a **manager** importing, the salon is always their own regardless of the row.
- **Manager (report-to):** `manager_id` wins; otherwise `manager_email` is looked
  up. For a **manager** importing, every stylist reports to them automatically.
- **Passwords:** a strong temporary password is generated per new user and
  returned in the results (or emailed if you tick "email credentials" and email
  is configured).

### Example — owner/admin importing managers + stylists across salons
```csv
email,name,role,salon_name,manager_email,title,guarantee_rate
gm.aria@salon.com,Jordan Avery,manager,Aria Studio,,General Manager,
rebeca@salon.com,Rebeca Diaz,stylist,Aria Studio,gm.aria@salon.com,Senior Stylist,17
steph@salon.com,Steph Lin,stylist,Aria Studio,gm.aria@salon.com,Stylist,16
gm.lumiere@salon.com,Pat Kim,manager,Lumiere,,General Manager,
mia@salon.com,Mia Wong,stylist,Lumiere,gm.lumiere@salon.com,Stylist,16
```
> Tip: import **managers first**, then stylists that reference them by
> `manager_email`. (If you import together it still works as long as the manager
> row appears above the stylist rows.)

### Example — a manager importing their own stylists
```csv
email,name,title,guarantee_rate
rebeca@salon.com,Rebeca Diaz,Senior Stylist,17
steph@salon.com,Steph Lin,Stylist,16
noah@salon.com,Noah Reyes,Stylist,
```
(No `role`/`salon`/`manager` columns needed — they're set automatically.)

### Reading the import result
After upload you'll see **created / updated / skipped** counts, a list of any
row errors (e.g. "email and name are required"), and the **temporary passwords**
for newly created users. Copy the passwords somewhere safe before leaving the
page — they're shown once.

---

## 7. Credentials & first login

### Distributing credentials
- New users get a **temporary password** (shown in the UI / import result, or
  emailed if SendGrid is configured on the backend).
- Share credentials **securely** (a password manager, an encrypted message — not
  a public channel). Send each person their **email + temporary password + the
  app URL**.

### First login → change password
1. The user goes to `https://your-app.vercel.app/login` and signs in with the
   temporary password.
2. They open the **Account** menu (top-right) → **Account** → **Change password**,
   enter the temporary password as "current", and set a new one (min 8 chars).

### Forgotten or compromised password
- A **manager** (for their stylists) or an **owner/admin** (for anyone) opens the
  user list (**Staff** or **Admin → Users**) and clicks **Reset password**. A new
  temporary password is shown to hand over. The user then changes it as above.

---

## 8. Ongoing account management

All from **Admin → Users** (owner/admin) or **Staff** (manager, own team):

- **Change a role / move salon / reassign manager** — owners/admins edit any
  user. Managers can't change roles/salons (by design); ask an owner/admin.
- **Reset a password** — see §7.
- **Deactivate a leaver** — turns off their login while keeping their history and
  pay data. (Re-provision a new account if they return.)
- **Audit trail** — every privileged action (create, import, role change,
  password reset, deactivate) is recorded in **Admin → Audit Log** with who did
  what and when.

---

## 9. Recommended setups by org size

### Single salon
1. Owner completes **Setup** (Part A).
2. Owner creates **1 manager** for the salon (Part B, Step 3).
3. Manager creates the **stylists** (Part C).
That's it — no admins or extra salons needed.

### Multi-salon chain
1. Owner completes **Setup**.
2. Owner creates each **salon** and (optionally) an **admin** or two to help.
3. Owner/admin creates **one manager per salon**.
4. Each **manager** builds their own salon's stylist roster (single or CSV).
This keeps each salon's roster owned by its manager while the owner retains
org-wide oversight and reporting.

---

## 10. Security model (why it's set up this way)

- **No self-registration.** Accounts only come from the hierarchy, so nobody can
  create their own access.
- **Least privilege.** Each level can only create/manage the level(s) below it,
  and managers are confined to their own salon. Attempts to cross those lines are
  rejected (HTTP 403).
- **Strong credentials.** Passwords are hashed with argon2, must meet a minimum
  length, and login is rate-limited against guessing.
- **One-time bootstrap.** The first-owner setup is token-gated and only works on
  an empty system.
- **Auditability.** Provisioning actions are logged for later review.

---

## 11. Quick checklists

**Owner — day one**
- [ ] Complete `/setup` (or run the CLI) to create the owner account.
- [ ] Ask the deployer to unset `BOOTSTRAP_TOKEN`.
- [ ] Create all salons; set guarantees & service prices.
- [ ] (Optional) Configure each salon's pay-tier ladder.
- [ ] Create one manager per salon; hand over their credentials.
- [ ] (Optional) Import the first week of performance data (Admin → Data Import).

**Manager — day one**
- [ ] Sign in; change your temporary password (Account → Change password).
- [ ] Add your stylists (Staff → Add a team member, or Bulk import).
- [ ] Distribute each stylist's email + temporary password + app URL.
- [ ] Tell stylists to change their password on first login.

**Stylist — first login**
- [ ] Sign in with the temporary password.
- [ ] Account → Change password.
- [ ] Explore Dashboard, Planner, Calendar, Goals.

---

## 12. FAQ / troubleshooting

| Question / error | Answer |
|---|---|
| "You can only create accounts below your own level" (403) | You picked a role at/above your own (e.g. a manager trying to create a manager). Only create subordinate roles. |
| "You can only create users in your own salon" (403) | Managers can only add people to their own salon. Ask an owner/admin for cross-salon changes. |
| "Email already registered" (409) | That email exists. Edit the existing user, or use a different email. In a CSV, re-using an email **updates** that person. |
| "Could not resolve salon" (import) | The `salon_id`/`salon_name` didn't match. Create the salon first, or fix the spelling. |
| Row "skipped" in a manager's import | The row asked for another salon or a non-stylist role — not allowed for managers, so it was skipped. Use just `email,name`. |
| A user can't sign in | Confirm they're **active** (not deactivated) and using the latest password. Reset it if unsure. |
| "Password change requires a real signed-in account" | You're in demo mode, or not signed in with a real account. Password management is a live-app feature. |
| Where do I change roles or move someone between salons? | Owner/admin only, via **Admin → Users** (edit the user). |

---

## 13. Appendix — API reference (for automation)

All under the backend `/api/v1` prefix; all require a Bearer JWT except where noted.

| Action | Method & path | Who |
|---|---|---|
| First-owner bootstrap | `POST /auth/bootstrap` (token in body; no auth) | one-time, empty DB |
| Sign in | `POST /auth/login` (no auth) | anyone with credentials |
| Refresh token | `POST /auth/refresh` (no auth) | any session |
| Who am I | `GET /auth/me` | any signed-in user |
| Change own password | `POST /auth/change-password` | any real user |
| Create salon | `POST /salons` | owner/admin |
| Configure pay tiers | `PUT /salons/{id}/pay-tiers` | owner/admin |
| Create user | `POST /users` | manager+ (delegated rules apply) |
| List users | `GET /users` | manager+ (salon-scoped) |
| Update user (role/manager/…) | `PATCH /users/{id}` | manager+ (delegated rules apply) |
| Reset a user's password | `POST /users/{id}/reset-password` | manager+ (own-salon) / owner-admin (any) |
| Deactivate user | `POST /users/{id}/deactivate` | manager+ (delegated rules apply) |
| Bulk-import users | `POST /admin/import-users` (CSV) | manager+ (delegated rules apply) |
| Users CSV template | `GET /admin/import-users-template` | manager+ |
| Audit log | `GET /admin/audit` | owner/admin |

"Delegated rules apply" = a creator may only affect roles below their own, and
managers are confined to their own salon.

---

## This deployment — admin account, real roster & unlocking accounts

### The admin account

The organization admin signs in with a **username** (not an email):

| Field | Value |
| --- | --- |
| Username | `Venita_Admin` |
| Password | `Salon_Admin` |

The admin can change this password anytime from **Account → Change password**
(or `/account`). Everyone else signs in with their **email address**.

### Seeding the admin + the real salons/employees (one-time, per deploy)

After the database is migrated (`alembic upgrade head`), seed the admin and the
real roster (all real salons + employees from the client export) with:

```bash
cd backend
python -m scripts.seed_production \
    --admin-username Venita_Admin \
    --admin-password 'Salon_Admin' \
    --csv "../PPH Data 06-26-2026.xlsx.csv"
```

This is **idempotent** (safe to re-run). Every salon and employee is created in a
**pending-setup** state — they exist in the system but **cannot log in yet**
because they have no password. No plaintext passwords are stored for staff.

### Unlocking accounts ("send setup link")

Instead of handing out temporary passwords, accounts are activated with a secure,
expiring **setup link** — the person sets their own password:

1. **Admin → Users** (or a **Manager → My Team**): find the person and click
   **Send setup link**. If the account has no email yet, you'll be asked for one
   (that becomes their username).
2. They receive an email with a link to **`/accept-invite`**, choose a password,
   and are signed straight in. Afterward they log in with their **email + password**.
3. If email delivery isn't configured, the link is shown once in the UI to copy
   and share directly.

**Who can unlock whom** (same delegated hierarchy as account creation):

- **Admin/Owner** can unlock **anyone** (any salon).
- **Managers** can unlock **their own stylists** (their salon only).

Links are one-time and expire (default 72h). Re-send anytime; you can also still
**Reset password** to issue a temporary password if preferred.

> Configure `APP_BASE_URL` (backend) to your site's public URL so the links point
> to the right place, and set `SENDGRID_API_KEY` to actually deliver the emails.

---

*Questions? See `PRODUCTION_INSTRUCTIONS.md` for deployment, or contact whoever
administers your deployment.*
