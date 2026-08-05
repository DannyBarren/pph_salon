# PPH Stylist App — Complete Client Walkthrough Guide (Developer Edition)

**For:** Danny (presenter)  
**Audience:** Client stakeholders (live demo call)  
**Demo URL:** https://v1pph-salon.vercel.app  
**Document purpose:** Keep this open on a second monitor and follow it almost line-by-line while screen-sharing.  
**Target call length:** 45–60 minutes (expandable to ~75 with deep Q&A)

---

## How to use this guide during the call

- Text marked **Say this:** are suggested spoken lines — paraphrase so you sound natural.
- Text marked **Show this:** tell you exactly what to point at or click.
- Text marked **Watch for:** are things that commonly go wrong or surprise clients.
- **Talking points** are short bullets you can glance at without reading a paragraph.
- **If the client asks…** boxes give crisp answers so you never scramble.
- Timing chips like `~8 min` are suggestions for a 45–60 minute call. Cut the Appendix and Deep Dive if you run long; expand them if the client wants detail.

> **Golden rule for this demo:** Every number on screen comes from their file  
> `v2.PPH Data 06-22-2026 TO 07-05-2026.xlsx`. The app’s fixed “today” is **2026-07-01**, so the current pay period is exactly **Jun 22 – Jul 5, 2026**.

---

# 1. Cover / Purpose

This is the single presenter’s script for walking the client through the **production-ready demo** of the PPH Stylist App.

You will:

1. Set the stage with their real pay period and real daily data.
2. Tour the product **role-by-role** (Admin → Manager/SDL → Include stylist → Exclude stylist).
3. Show the coaching tools (Team Dashboard, What-If).
4. Prove that their exact daily export format is natively supported in **Admin → Data Import → Daily performance**.
5. Close with clear next steps.

**What this guide is not:** a technical architecture document. For code/math deep dives, see `client_readme.md`, `payment_logic.md`, and `user_manual.md`.

---

# 2. Pre-Walkthrough Checklist

**Suggested prep time: 5–10 minutes before the call**

### Browser & screen share

1. Open a **clean Chromium browser** (Chrome or Edge) in a fresh window.
2. Go to **https://v1pph-salon.vercel.app**
3. Hard-refresh once (`Cmd/Ctrl + Shift + R`) so you are not on a stale cached build.
4. Zoom to **100–110%** so KPI cards remain readable on a shared screen.
5. Close Slack / email popups. Put this Markdown (or PDF) on monitor 2.
6. Start screen share on the browser window only (not the whole desktop, if possible).

### Confirm demo mode is alive

**Show this:** Top-right **account chip** (avatar + name + chevron).  
**Watch for:** If you see a login form instead of an account chip with a chevron, you are not on the demo build — stop and open the Vercel URL again.

### Personas to have ready (searchable in Account Switcher)

| Order | Persona | Role badge | PPH badge | Why you will use them |
| --- | --- | --- | --- | --- |
| 1 | **Admin (Demo)** | Admin | Off PPH | Org access, Admin panel, Data Import, Pay Logic |
| 2 | **Owner / SDL (Demo)** | SDL · Owner | Off PPH | All-salon Team Dashboard |
| 3 | **Linda Jones** (Burleson) *or* **Kellie Phillips** (Paris) | Salon Manager | Off PPH | Salon-scoped Team view |
| 4 | **Stephanie Montgomery** (Paris) | Stylist | **On PPH** | Full personal dashboard with real daily numbers |
| Alt On PPH | **Kelly Bryan**, **Justine Norris**, **Deann Motl**, **Tonya Jackson** | Stylist | On PPH | Backup if Stephanie’s week looks sparse |
| 5 | **Holliean Miller** (Burleson) | Stylist | **Off PPH** | “Not on the PPH pay plan” card |

### Key facts to memorize before you unmute

- Fixed app “today”: **Wednesday, July 1, 2026**
- Current pay period: **Jun 22 – Jul 5, 2026**
- Real daily weeks loaded: **Week of 6/22** and **Week of 6/29**
- Source file: **`v2.PPH Data 06-22-2026 TO 07-05-2026.xlsx`**
- **10** people are **Include / On PPH**; **~45** are **Exclude / Off PPH** — this matches their file, not a demo limitation
- Account Switcher badges: **green “On PPH”** / **grey “Off PPH”**
- Soft-disabled in this demo build (nav hidden): **Planner**, **Calendar**, **Goals**, **Notifications** — What-If coaching is still available from the Team Dashboard

### Suggested talking points to keep in your pocket

- “No login in this demo — Account Switcher lets us become anyone instantly.”
- “These are *your* daily numbers for the June 22 – July 5 pay period.”
- “Include / Exclude is operational status from your file — not a missing feature.”
- “Excluded people still appear in Team views for managers.”

---

# 3. Opening (2–3 min)

### Goal
Establish trust in the first 90 seconds: real data, real period, role-based product.

### Steps

1. **Show this:** Landed app with **PPH Stylist** logo (purple sparkles icon) top-left.
2. **Show this:** Role pill next to the logo (e.g. **Admin** or **Manager**).
3. **Show this:** Top-right account chip — click it once to open **“View any account”**, then close it again so they know where it lives.

**Say this:**

> “What you’re looking at is the live demo of the PPH Stylist App. It’s running in demo mode, so there’s no login — we can instantly become any stylist, manager, SDL/Owner, or Admin.  
>  
> Critically: this is not fake sample data. We’ve loaded your real daily performance file — `v2.PPH Data 06-22-2026 TO 07-05-2026` — for the weeks of June 22 and June 29. Inside the app, ‘today’ is fixed to July 1, 2026, so the current pay period is exactly your June 22 through July 5 period.  
>  
> I’ll walk you role by role: organization view first, then the manager Team Dashboard, then an Include stylist’s personal dashboard, then an Exclude stylist so you can see how that is handled correctly, then import and a quick tour of the supporting screens.”

**Talking points**
- Demo URL is shareable after the call.
- Role switch is instant and reversible.
- Numbers should look familiar because they came from their export.

> **If the client asks…**  
> *“Is this production?”*  
> → “This is the production-shaped demo on Vercel with your real period data. Production access with real auth is a next step after feedback.”  
>  
> *“Can people log in today?”*  
> → “Not in this demo build — Account Switcher replaces login so we can tour every role without credentials.”

---

# 4. Role-by-Role Guided Script

**Total for this section: ~35–45 minutes**

Recommended order (do not scramble unless they pull you):

1. Admin / Organization view  
2. Team Dashboard (Manager / SDL) — spend significant time  
3. Include stylist personal dashboard  
4. Exclude stylist  
5. Goal Planner / What-If  
6. Admin → Data Import (Daily / v2 format)  
7. Brief Board, Promotions, Calendar note, Pay Logic  

---

## 4a. Admin / Organization view `~5 min`

### Switch persona

1. Click the **top-right account chip**.
2. Modal title: **“View any account”**
3. Subtitle: **“No login needed — tap any salon, manager or stylist to view their real data.”**
4. Under **Organization**, click **Admin (Demo)**  
   - Badge: **Admin** (green)  
   - Badge: **Off PPH** (grey)  
   - Blurb: **“Full access · imports, config & payment logic”**

**Say this:**

> “I’ll start as Admin so you can see the full surface area of the product — Team, Board, Promotions, Pay Logic, and Admin.”

### Navigation to point out (Admin)

Top nav (desktop) should show approximately:

- Role pill: **Admin**
- **Team**
- **Board** (may show an unread count badge)
- **Promotions**
- **Pay Logic**
- **Admin**

**Show this:** Logo lockup **PPH** + purple **Stylist**.

**Say this:**

> “Admin is the only role that can manage salons, users, imports, and payment configuration. SDL/Owner can view team data and change Desired Pay Rate. Managers coach their salon. Stylists see their own numbers.”

### Open Admin panel

1. Click **Admin** in the nav.
2. Page title: **Admin**
3. Subtitle: **“Manage salons, provision users (single or bulk CSV), configure pay plans, import performance data, and review the audit trail.”**

**Show this:** The **Payment Logic** callout with **⚠ Danger Zone** — do *not* change anything yet; just acknowledge it.

**Show this:** Tab row:

1. **Salons**
2. **Users**
3. **Pay Plan**
4. **Data Import**
5. **Audit Log**

**Say this:**

> “We’ll come back to Data Import after we’ve walked the dashboards — that’s where your exact daily export format is now natively supported. For now, notice the Admin surface is organized the way an ops team would expect: people, pay plan, import, audit.”

**Talking points**
- Demo mode notice may appear (blue): reads are live for the session; persistence needs the FastAPI backend.
- You will prove Daily import later with their v2 columns.
- Do not edit Pay Logic mid-demo unless asked.

> **If the client asks…**  
> *“Who can change guarantee rates / exclude flags?”*  
> → “Admin. In Users you can edit a person and toggle **Excluded from the PPH pay plan**.”

---

## 4b. Team Dashboard (Manager / SDL) `~12–15 min`

**This is the heart of the management story. Slow down here.**

### Option A — Organization-wide (recommended first)

1. Open Account Switcher → **Owner / SDL (Demo)**  
   - Badge: **SDL · Owner**  
   - Badge: **Off PPH**  
   - Blurb: **“Views team data · can change Desired Pay Rate”**
2. You should land on **Team Dashboard** (or click **Team**).

**Show this:** Page title **Team Dashboard** in brand purple.

**Show this:** Subtitle pattern:  
`Week of 6/22 – 6/28 · All salons · N stylists`

**Say this:**

> “As SDL/Owner, Team Dashboard is home. You’re looking at the week of June 22–28 from your real export, rolled up across all salons. This is the coaching cockpit.”

### Option B — Salon-scoped manager (do this second)

1. Switch to **Linda Jones** (Burleson) *or* **Kellie Phillips** (Paris).
2. Subtitle becomes:  
   `Week of 6/22 – 6/28 · Your team · N stylists`

**Say this:**

> “Managers see only their salon. Same KPIs, same filters — just scoped to their people. Privacy and focus stay intact.”

### Top controls (point left → right)

| Control | Exact UI | What to say |
| --- | --- | --- |
| Target stepper | **Target $19/hr** with − / + | “This is the coaching target for the board. It drives On Track / Needs Attention / Behind.” |
| Export | **Export** | “Downloads the current filtered view as CSV.” |
| Refresh | **Refresh** | “Pulls a fresh derivation of the week.” |
| Auto-refresh | **Auto-refresh every 5 min** | “Optional for a wallboard / live coaching screen.” |

### KPI cards — name them out loud

Walk the six cards left to right:

1. **Total Stylists**
2. **Avg Effective Rate** (colored vs target; subline **Target $19.00/hr**)
3. **Total Production** (subline shows the week range, e.g. **6/22 – 6/28**)
4. **On Track** (subline like **`X at risk · Y behind`**)
5. **Team Utilization** (subline **`Nh worked`**)
6. **Scheduled Hours** (e.g. **`53h`**)

**Say this:**

> “These six KPIs answer the manager question in under five seconds: how many people, what’s the average effective rate versus target, how much production, who’s on track, are we utilizing the schedule, and how many hours were scheduled.”

**Watch for:** Avg Effective Rate often appears in **red/warning** early in the period or on a tough week — that is intentional signal, not a bug.

### Attention banner

If present, yellow/warning banner:

> **“N stylists need attention this week — Y behind, X at risk.”**  
> Action link: **View →**

**Show this:** Click **View →** — it filters toward people who need coaching.

### Effective rate distribution

**Show this:** Card titled **Effective rate distribution** (bar chart icon).

Bands (exact labels):

- **≤ $14**
- **$15–17**
- **$18–20**
- **$21–24**
- **$25+**

Brand-purple bars with counts on the right.

**Say this:**

> “This is the shape of the team’s effective pay rates. It’s the fastest way to see whether you’re clustered below target or spreading into higher tiers.”

### Filters & view toggles

**Show this:**

- Search: **Search name or ID…**
- Status chips with live counts: **All** · **On Track** · **Needs Attention** · **Behind**
- Sort dropdown defaults to **Effective Pay ↓** (also: Gap to Next Level ↑, Utilization ↓, Production ↓, Name A–Z)
- Segmented control: **Actual** | **Scheduled**
- Segmented control: **Cards** | **Table**

**Demo clicks (do these in order):**

1. Click **Behind** → show only people behind target.  
2. Click **Needs Attention** → show the mid-band coaching list.  
3. Click **All** to reset.  
4. Toggle **Table** → show denser ops view.  
5. Toggle back to **Cards**.  
6. Toggle **Scheduled** briefly, then return to **Actual**.

**Say this:**

> “Cards are for huddles. Table is for ops reviews. Actual versus Scheduled lets you coach either on what happened or on the plan.”

### Stylist card anatomy (pick one card and narrate)

On a card, point to:

- Name + employee code (e.g. **#VG1296**)
- Status badge: **On Track** (green) / **Needs Attention** (warning/orange) / **Behind** (danger/red)
- Role · date range
- Large **Effective Pay Rate** ($/hr) — color-coded vs target
- Small **PayRlt** badge
- **Target $19/hr**
- Optional **Guarantee $X** badge when on floor
- Progress toward next tier + coaching sentence
- Mini stats: **HOURS**, **UTIL**, **PRODUCTION**
- Daily mini trend bars
- Buttons: **Details** and **What If**

**Say this:**

> “Every card is a coaching brief: where they are, what the next tier costs in production, and a one-click path into detail or what-if planning.”

### Detail modal (must open)

1. Click **Details** on a card.
2. Tabs: **Week Summary** · **Week by Day** · **What If**

**Week Summary — point at:**

- **SCHEDULED** / **ACTUAL** / **UTILIZATION** / **PPH**
- **PRODUCTION** / **PAY RATE ($)** / **OVER / SHORT** / **EFFECTIVE**
- **Vs. team average**
- **Coaching note (private)** textarea (demo: local to session)

**Week by Day — point at columns:**

- **DAY**, **HRS**, **CUTS**, **COLORS**, **PRODUCTION**, **TARGET**

**Say this:**

> “Managers get the dollar truth and the day-by-day story. That’s how you coach Thursday before the week is lost.”

Footer buttons: **Close** · **Plan with What-If**

**Talking points**
- SDL/Admin = all salons; Manager = own salon.
- Status math is relative to the Target stepper.
- Excluded stylists can still appear in Team views; they simply don’t get a personal PPH dashboard.

> **If the client asks…**  
> *“Why is someone On Track in one view and Behind after I change Target?”*  
> → “Target is a coaching dial. Move it with − / + and statuses recompute against that goal.”  
>  
> *“Can stylists see teammates’ production?”*  
> → “No. Stylists only see their personal dashboard. Team roll-ups are manager and above.”

---

## 4c. Include stylist — full personal dashboard `~10–12 min`

### Switch persona

1. Account Switcher → search **Stephanie** (or **Kelly Bryan** / **Justine Norris**).
2. Confirm badges: **Stylist** (purple) + **On PPH** (green).
3. Blurb: **“{Salon} · sees only their own data”**

**Say this:**

> “Stephanie is marked Include in your file — On PPH. This is the personal dashboard a stylist on the plan sees every day.”

### Navigation (On PPH stylist)

- Role pill: **Stylist**
- **Dashboard** (home)
- **Board**
- **Promotions**

> Note: **Planner** / **Calendar** are soft-disabled in this demo build (hidden from nav). Personal planning story is covered via DPR on this dashboard + What-If from Team.

### Header (purple gradient card)

**Show this:**

- Salon line: e.g. **Paris · TX** (or the salon’s city line)
- Greeting: **Hi Stephanie 👋**
- Guarantee: **Your guaranteed Pay Rate is $X/hr**
- **Pay Period** selector (e.g. **Jun 22 – Jul 5 · Latest**)
- Week selector (e.g. **Week 1 · Jun 22 – Jun 28** / **Week 2 · Jun 29 – Jul 5**)
- Footer line: **Showing MM/DD/YY – MM/DD/YY**

**Demo click:** Switch Week 1 ↔ Week 2 so they see both loaded weeks from their file.

**Say this:**

> “Pay period and week selectors are historical. Because we fixed today to July 1, the current period is exactly your June 22–July 5 window, with both weekly slices already loaded.”

### Desired Pay Rate (DPR) control

White control strip inside the hero:

- Label: **Desired Pay Rate (DPR)**
- Dropdown options: **$8/hr … $20/hr** (tier ladder)
- Adjacent text: **Current Pay Rate $X/hr**

**Demo click:** Change DPR (e.g. from **$16/hr** to **$19/hr**) and pause while metrics recompute.

**Say this:**

> “Desired Pay Rate is the stylist’s aim. Change it, and every required-revenue and gap number below re-aims at that rate. Current Pay Rate is what their performance has actually earned so far.”

### Section A — Metrics per Desired Pay Rate (DPR) for the week

Hint text: **“What you're aiming for at the selected Desired Pay Rate”**

Metric tiles (exact labels):

1. **Desired Payrate (DPR)**
2. **Sched. Hrs**
3. **Req Svc Rev ($)**
4. **Req Svc Per Hr. (PPH)**
5. **Svcs Req** (e.g. `61 Haircuts or 17 Colors`)
6. **Svc Pay at DPR**

**Say this:**

> “This row is the plan: at the DPR you picked, here’s the scheduled hours, required service revenue, required PPH, and the service mix that gets you there.”

### Section B — Recap (Where you stand)

Hint: **“Your current performance so far this week”**

Tiles:

1. **Pay Rate at current Perf**
2. **Hrs To Date**
3. **Services To Date**
4. **Curr. PPH**
5. **Curr Svcs** (`N Haircuts & M Colors`)
6. **Potential Svc Pay**

**Say this:**

> “Recap is reality — hours and services to date, current PPH, and the pay rate that performance supports right now.”

### Section C — Gap (Over / Under)

Hint: **“Difference between where you stand and your DPR target”**

Tiles (negatives in red / accounting parentheses):

1. **Payrate** — e.g. **($4)**
2. **Hrs**
3. **Svcs ($)**
4. **PPH**
5. **Svcs** (haircuts & colors gap)
6. **Pay**

**Say this:**

> “Gap is the honest scoreboard. Green means ahead of the Desired Pay Rate plan; red means behind. This is the number a stylist can act on before the week closes.”

### Section D — Daily Breakdown

Title: **Daily Breakdown**  
Hint: **“Actual vs. goal for each day · updates as new data is imported”**

Exact columns:

| Date | Services ($) (Act vs. Goal) | Haircuts (Act vs. Goal) | Colors (Act vs. Goal) | Hours (Act vs Sched) | PPH |
| --- | --- | --- | --- | --- | --- |

**Show this:**

- Date format like **06/29 (Mon)**
- Services cell like **`104 vs. reqd 320`**
- Haircuts/Colors like **`4 out of 14`**
- Hours like **`7.57 hrs. out of 8 hrs.`**
- PPH like **`$14 vs $40`**
- Today’s row highlighted in brand soft purple when the date equals the fixed today
- Unscheduled / empty days show **—**

**Say this:**

> “Daily Breakdown mirrors the columns from your UAT spreadsheet — actual versus goal for services, haircuts, colors, hours, and PPH — updating as new daily files are imported.”

**Talking points**
- This is the Include / On PPH experience.
- DPR is interactive; Recap/Gap/Daily all respond.
- Numbers should feel familiar from their export.

> **If the client asks…**  
> *“Why doesn’t every day have numbers?”*  
> → “Blank days are unscheduled or have no imported activity — same idea as the spreadsheet leaving a day empty.”  
>  
> *“Who can change DPR?”*  
> → “On their own dashboard, the stylist can aim with DPR. SDL/Owner and Admin can also change it. Managers viewing a report see it as coaching context.”

---

## 4d. Exclude stylist — handle with care `~4–5 min`

### Switch persona

1. Account Switcher → search **Holliean** (Burleson).
2. Confirm badges: **Stylist** + **Off PPH** (grey).
3. Hover the grey badge if helpful — tooltip: **“Not on the PPH pay plan”**.

**Say this (frame positively before the click lands):**

> “About forty-five people in your file are marked Exclude — not on the PPH pay plan. That’s intentional and faithful to your data. The app doesn’t invent a PPH dashboard for someone who isn’t on the plan. Watch what Holliean sees.”

### What they see

Centered card:

- Title: **Not on the PPH pay plan**
- Body: **“Your account is marked as excluded from the PPH pay plan, so there's no personal PPH dashboard to show. Reach out to your manager or administrator if you believe this is a mistake.”**

### Navigation difference

- **Dashboard** tab is **hidden** for excluded stylists.
- They still get **Board** and **Promotions**.

**Show this:** Briefly reopen Account Switcher and scan green **On PPH** vs grey **Off PPH** across a salon group (e.g. Paris has several On PPH; Burleson Include/Exclude mix).

**Say this:**

> “Excluded stylists still appear in Team views for managers — you don’t lose visibility. They simply don’t get a personal PPH pay dashboard, because they’re not on that plan. Admin can flip Include/Exclude when someone’s status changes.”

**Watch for:** Client discomfort — go straight to Section 6 language if anyone sounds worried that people were “left out of the app.”

> **If the client asks…**  
> *“Can we put Holliean on the plan later?”*  
> → “Yes. Admin edits the user and clears **Excluded from the PPH pay plan**, or a future daily import with Include updates the flag.”  
>  
> *“Do excluded managers still see their team?”*  
> → “Yes — Exclude removes the *personal PPH dashboard*, not team leadership tools.”

---

## 4e. Goal Planner / What-If experience `~5–6 min`

> **Live-demo path:** From **Team Dashboard**, use **What If** on a stylist card (or the **What If** tab in the detail modal).  
> The dedicated **Planner** nav item is soft-disabled in this demo build; do not digress into a 404/unavailable page unless asked.

### Steps

1. Switch back to **Owner / SDL (Demo)** or **Linda Jones**.
2. Open **Team**.
3. On a card (ideally someone **Needs Attention**), click **What If**.
4. Confirm the modal opens on the **What If** tab.

### Controls to narrate

- **Target effective rate** slider  
  - Left anchor: **Guarantee $X**  
  - Right anchor: upper bound (e.g. **$30**)  
  - Selected value large in brand purple (e.g. **$15/hr**)  
  - Helper: **Requires NN PPH**
- Progress / **DONE** indicator
- **Production still needed this week** with banked amount
- Breakdown tiles: **PER DAY**, **HAIRCUTS**, **COLORS**
- Coaching message strip (e.g. already locked a rate → “aim higher”)

**Say this:**

> “What-If is the coaching sandbox. Slide the target effective rate and the app translates that into required PPH, remaining production, and a practical haircut/color booking picture — without changing the stylist’s historical numbers.”

**Demo move:** Drag the slider up one tier, pause on “production still needed,” drag down until the message flips to “already locked in,” then Close.

**Talking points**
- Safe sandbox — doesn’t rewrite imported history.
- Perfect for mid-week huddles.
- Works from Cards or from **Plan with What-If** in the detail modal.

> **If the client asks…**  
> *“Where is Goal Planner / Set a Goal?”*  
> → “The fuller Goal Planner screen exists in the product and can be re-enabled; in this demo build we kept the live coaching path on Team → What If so the call stays focused on your real period data.”

---

## 4f. Admin → Data Import (Daily / v2 format) `~6–8 min`

### Switch back to Admin

Account Switcher → **Admin (Demo)** → nav **Admin** → tab **Data Import**.

### Section: Import performance data

**Show this:** Heading **Import performance data** and the explanatory paragraph that mentions bulk pay-period import, `employee_id` routing, and daily aggregation into the parent week.

### Exact controls

1. Import type dropdown — select **Daily performance**  
   Options:
   - **Weekly data**
   - **Daily performance** ← use this
   - **Client / SSF export (roster + revenue)**
2. Template/source dropdown — **Native template**  
   (also lists Zenoti export / PayCor export for weekly/daily paths)
3. File picker (accepts **.csv / .xlsx**)
4. **Template** download button
5. Primary button: **Upload & import**

**Say this:**

> “This is the operational win. Daily performance import natively accepts your v2 daily export shape — the same family of columns as `v2.PPH Data 06-22-2026 TO 07-05-2026.xlsx`.”

### Columns to name (from the native daily template)

`employee_id`, `salon_name`, `sale_date`, `scheduled_hrs`, `actual_hrs`, `actual_haircuts`, `actual_colors`, `service_revenue`, `Employee Name`, `pay_period`, `Include/Exclude`

**Say this:**

> “A few details that matter operationally:  
> • `employee_id` routes the row — hyphen optional, so `VG-1426` and `VG1426` match.  
> • `salon_name` is a label; routing does **not** depend on salon matching.  
> • `service_revenue` is the authoritative daily production.  
> • `Include/Exclude` drives whether that person is on the PPH pay plan.  
> • Dates accept ISO or US `M/D/YYYY`.  
> • Daily rows aggregate into the parent week automatically.”

### What to demo live (safe)

**Preferred live click path (no destructive edits):**

1. Click **Template** and note that a `daily-template.csv` downloads.  
2. Open or describe that the sample rows look like their export (Holliean Exclude / example Include).  
3. If you will upload: use a tiny sanitized slice, click **Upload & import**, and show the success notice (rows imported / employees touched).  
4. Then switch to an Include stylist and show Daily Breakdown reflecting new/updated days.

**Watch for:** Don’t overwrite the whole org mid-call unless you intended to. The demo dataset is already loaded; the point is to *prove format support*.

### Also visible on Admin (optional glance)

Below/near import you may see the offline **Demo data playground** / **Data Management** panel with **Manual entry** and **Bulk import** — useful backup story if files are delayed (“ops can still key a day”).

**Talking points**
- Future cadence: export daily → Admin → Daily performance → Upload & import.
- Include/Exclude in the file keeps roster status honest.
- Weekly and Client/SSF paths exist for other operational moments.

> **If the client asks…**  
> *“Do we have to reformat the spreadsheet?”*  
> → “The v2 daily format is what the Daily importer is built for. That’s the point of this work.”  
>  
> *“Will imports wipe history?”*  
> → “Imports upsert by employee + date/week — you can back-fill historical periods alongside the current one.”

---

## 4g. Brief tour — Board, Promotions, Calendar, Pay Logic `~4–5 min`

### Board `~1.5 min`

1. Click **Board**.
2. Title: **Message Board** (megaphone / announcements framing).
3. Subtitle idea: announcements from salon/leadership; acknowledge flow.

**Show this:**

- Pinned / New badges
- Author + role + timestamp + salon scope (**All salons** vs a salon name)
- **Acknowledge** button vs **Acknowledged** state

**Say this:**

> “Board is how leadership pushes one message — campaign launches, huddles — and sees acknowledgment.”

### Promotions `~1 min`

1. Click **Promotions**.
2. Title: **Promotions**
3. Show a promotion card (badge **Promotion**, date, campaign copy).

**Say this:**

> “Promotions is the stylist-facing surface for live salon offers — the flash goal sits next to the message so the floor knows what to push.”

### Calendar `~30–45 sec` (honest)

**Say this:**

> “Calendar exists in the product for schedule context, but in this demo build it’s soft-disabled in the nav so we keep the call focused on pay performance and import. Happy to enable it for a follow-up walkthrough.”

**Watch for:** Don’t navigate to `/calendar` unless you want to show the lock card **“This feature is temporarily unavailable.”**

### Pay Logic `~1.5–2 min`

1. As **Admin (Demo)**, click **Pay Logic**.
2. Back link: **← Back to Admin**
3. Title: **Payment Logic**
4. Subtitle: organization-wide source of truth for every pay calculation.

**Show this:** Red **Danger Zone — organization-wide settings** warning.

**Show this:** Overview formulas in plain language:

- **PPH = production ÷ hours worked**
- Effective rate from tier table, floored at guarantee
- Pay = effective rate × hours
- Required production for a target rate
- Service projection using haircut/color prices

**Show this:** **Payment tier table** with columns **PAY RATE ($/HR)** and **PPH REQUIRED**, plus **+ Add tier**.

**Say this:**

> “I’m not changing anything live — I just want you to see that every dashboard number is driven by one global ladder. Change it here, and planners, goals, and team views all move together.”

---

# 5. Screen-by-Screen Deep Dive

Use this section when a stakeholder says “go slower on that screen.”

---

## 5.1 Account Switcher

| Item | Exact UI |
| --- | --- |
| Trigger | Top-right avatar chip + name + role + chevron |
| Modal title | **View any account** |
| Subtitle | **No login needed — tap any salon, manager or stylist to view their real data.** |
| Search | **Search by name or salon…** |
| Sections | **Organization**, then each salon group (`{Salon} · {City}`) |
| Role badges | **SDL · Owner**, **Admin**, **Salon Manager**, **Stylist** |
| PPH badges | Green **On PPH** / Grey **Off PPH** |
| Footer | `{N} salons · {N} managers · {N} stylists · 1 admin · 1 owner — all viewable without credentials` |

**Point at:** green vs grey badges before any dashboard.

**Spoken explanation:** Instant persona switching replaces login for the POC.

**Common Q:** *Will production have this switcher?* → No — production uses real auth; switcher is demo-only.

---

## 5.2 Team Dashboard

**Exact UI elements**

- Title: **Team Dashboard**
- Subtitle: `Week of {range} · All salons|Your team · {N} stylists`
- **Target $N/hr** −/+
- **Export**, **Refresh**, **Auto-refresh every 5 min**
- KPI labels: **Total Stylists**, **Avg Effective Rate**, **Total Production**, **On Track**, **Team Utilization**, **Scheduled Hours**
- Attention banner + **View →**
- **Effective rate distribution** bands: **≤ $14**, **$15–17**, **$18–20**, **$21–24**, **$25+**
- Filters: **All / On Track / Needs Attention / Behind**
- Sort: **Effective Pay ↓** (default)
- **Actual | Scheduled**, **Cards | Table**
- Card actions: **Details**, **What If**

**Point at:** KPI row first, then distribution, then one card’s Effective Pay Rate vs Target.

**Spoken explanation:** Five-second health check + one-click coaching.

**Common Q:** *Are these live Zenoti numbers?* → This demo is seeded from their v2 daily file for 6/22 and 6/29; ongoing daily uploads are via Admin → Data Import.

---

## 5.3 Stylist detail modal

Tabs: **Week Summary** · **Week by Day** · **What If**

Week Summary metrics: **SCHEDULED**, **ACTUAL**, **UTILIZATION**, **PPH**, **PRODUCTION**, **PAY RATE ($)**, **OVER / SHORT**, **EFFECTIVE**, plus **Vs. team average** and private coaching note.

**Point at:** OVER / SHORT in red when behind.

**Spoken explanation:** Modal is the manager’s drill-down without leaving Team.

---

## 5.4 StylistDashboard (Include / On PPH)

**Exact sections**

1. Hero: greeting, guarantee, pay period, week, DPR, Current Pay Rate  
2. **Metrics per Desired Pay Rate (DPR) for the week**  
3. **Recap (Where you stand)**  
4. **Gap (Over / Under)**  
5. **Daily Breakdown**

**Point at:** DPR change → Gap tiles flip — best “aha” moment for stylists.

**Spoken explanation:** Plan (DPR metrics) vs Reality (Recap) vs Delta (Gap) vs Days (Breakdown).

**Common Q:** *Why is Current Pay Rate stuck at guarantee?* → Performance hasn’t cleared the next tier’s required PPH yet; Gap/PPH explain the shortfall.

---

## 5.5 Excluded stylist home

Exact title: **Not on the PPH pay plan**  
Exact body (stylist self-view): account marked excluded; no personal PPH dashboard; contact manager/admin if mistake.

**Point at:** Missing **Dashboard** nav item.

**Spoken explanation:** Correct operational behavior from Include/Exclude.

---

## 5.6 What-If

**Target effective rate** slider, **Requires NN PPH**, production still needed, per-day / haircuts / colors.

**Point at:** Slider → required PPH text updating.

**Spoken explanation:** Coaching sandbox tied to the same pay ladder.

---

## 5.7 Admin → Data Import

Tabs on Admin: **Salons**, **Users**, **Pay Plan**, **Data Import**, **Audit Log**  
Import kinds: **Weekly data**, **Daily performance**, **Client / SSF export (roster + revenue)**  
Buttons: **Template**, **Upload & import**

**Point at:** **Daily performance** + **Native template**.

**Spoken explanation:** Native path for their v2 daily export.

---

## 5.8 Pay Logic

Danger Zone warning, formula overview, **Payment tier table**, **+ Add tier**, apply/save confirmation flows.

**Point at:** Global warning — no per-salon forks on this page.

**Spoken explanation:** One organization-wide truth.

---

## 5.9 Board & Promotions

Board: pin/new/acknowledge.  
Promotions: campaign cards for the floor.

**Point at:** Acknowledge → Acknowledged state change.

---

# 6. Handling the Include / Exclude Conversation

### Frame it positively and accurately

**Do say:**

> “Your file already distinguishes who’s on the PPH pay plan. We preserved that exactly: ten Includes get the personal PPH dashboard; Excludes see a clear message and still show up for managers in Team views.”

**Don’t say:**

- “We couldn’t load those people.”
- “The app doesn’t support them.”
- “They’re missing data.”

### Sample language that keeps trust high

> “If someone’s status changes in the business — they join or leave the PPH plan — Admin can update **Excluded from the PPH pay plan**, and daily imports that carry **Include/Exclude** keep the flag in sync. Nothing is hard-coded against a person forever.”

### Visual proof sequence (30 seconds)

1. Account Switcher: green **On PPH** vs grey **Off PPH**.  
2. Stephanie → full dashboard.  
3. Holliean → **Not on the PPH pay plan**.  
4. Manager Team view → people still listed for coaching visibility.

---

# 7. Data & Pay-Period Talking Points

### Why the numbers match their file

- Source: **`v2.PPH Data 06-22-2026 TO 07-05-2026.xlsx`**
- Weeks present: **6/22** and **6/29**
- App today fixed at **2026-07-01** so the open pay period is **06-22 → 07-05**
- Include/Exclude counts: **10 On PPH / ~45 Off PPH** from the file
- Team week label surfaces as **6/22 – 6/28** for the first week roll-up; stylist week picker can show **Week 2 · Jun 29 – Jul 5**

### How future daily files will be uploaded

1. Export the daily file in the v2 shape (or CSV equivalent).  
2. Sign in as Admin (production) / use Admin (Demo) today.  
3. **Admin → Data Import**  
4. Type: **Daily performance**  
5. Source: **Native template** (or matching source option)  
6. Choose file → **Upload & import**  
7. Stylists open Dashboard → pick pay period/week → Daily Breakdown updates  

### On PPH people currently in the demo data (quick reference)

| Name | Code | Salon area |
| --- | --- | --- |
| Justine Norris | VG1494 | Sherman |
| Stephanie Montgomery | VG1486 | Paris |
| Kelly Bryan | VG1499 | Paris |
| Deann Motl | VG1500 | Paris |
| Tonya Jackson | VG1475 | Paris |
| Amber Hatcher | VG1476 | Wichita Falls Lawrence |
| Keilea Mcmillan | VG1455 | Wichita Falls (appears in roster) |
| Sydney Whaley | VG1501 | Wichita Falls Lawrence |
| Addisyn Haynes | VG1477 | Wichita Falls Central |
| Rebeca Ortega | VG1313 | Wichita Falls Central |

---

# 8. Live Q&A / Troubleshooting During the Call

### If a number looks unexpected

1. Confirm persona (Account Switcher).  
2. Confirm **pay period** + **week** on the stylist hero.  
3. On Team, confirm **Actual** (not Scheduled) and Target stepper value.  
4. Compare employee code on the card (`#VGxxxx`) to the spreadsheet row.  
5. Remember Exclude people won’t show personal PPH metrics.  
6. If needed: switch to Admin → Users and confirm Include/Exclude + guarantee.

**Say this:**

> “Let’s verify identity, week, and Include flag first — nine times out of ten that’s the mismatch.”

### How to switch personas quickly

1. Top-right account chip  
2. Type 3–4 letters of the name  
3. Click the row  
4. Wait for nav + home screen to re-scope  

### How to reset the view

- Team filters: click **All**, clear search, set layout **Cards**, view **Actual**  
- Target back to **$19/hr** if you changed it  
- Stylist DPR: return to a mid-ladder value (e.g. **$16/hr**)  
- Hard refresh only as last resort (reloads demo state)

### Soft-disabled features

If someone pastes `/planner` or `/calendar`: you’ll see **“This feature is temporarily unavailable.”**  
Acknowledge calmly and return to Team / Dashboard / Import.

### Demo mode persistence note

Admin panels may show that demo writes are session-local unless the FastAPI backend is connected. Don’t over-promise durable server writes from the offline demo.

---

# 9. Closing the Walkthrough (3–5 min)

### Summarize value delivered

**Say this:**

> “In one pass you’ve seen:  
> 1) an organization Admin surface with native daily import for your v2 file,  
> 2) a manager/SDL Team Dashboard with KPIs, distribution, status coaching, and What-If,  
> 3) an Include stylist’s real personal dashboard — DPR, Recap, Gap, Daily Breakdown — on your June 22–July 5 period, and  
> 4) an Exclude stylist handled cleanly and honestly from your own Include/Exclude flags.”

### Clear next steps

1. **Next data file** — send the following pay period’s daily export; you’ll load it via **Daily performance**.  
2. **Production access** — real authentication, durable backend persistence, remove Account Switcher.  
3. **Feedback** — which Team KPIs matter most; which stylist dashboard tiles they’ll train on first.  
4. **Optional enablements** — Planner / Calendar / Goals flags when they want those surfaces in the next demo.  
5. **Pay Logic review** — confirm tier ladder + guarantee floors before go-live.

### Post-call checklist (for you, Danny)

- [ ] Stop screen share; leave demo URL in chat/email  
- [ ] Note any number the client disputed (name + week + metric)  
- [ ] Note Include/Exclude questions and who they care about converting  
- [ ] Capture feature requests (Planner, Calendar, Goals, notifications)  
- [ ] Confirm date of next file drop  
- [ ] Send short recap email: what we showed + next steps above  
- [ ] If they asked for PDF of this guide, export this Markdown to PDF  

### Recommended next steps (client-facing)

| Priority | Next step | Why |
| --- | --- | --- |
| 1 | Deliver next daily export | Proves ongoing import cadence |
| 2 | Validate 2–3 Include stylists’ numbers against payroll expectations | Builds trust in the ladder |
| 3 | Decide production auth + who gets Admin | Unlocks real usage |
| 4 | Train managers on Team filters + What-If | Adoption path |
| 5 | Soft-enable Planner/Goals when ready | Expands stylist planning |

---

# 10. Appendix

## 10.1 Quick reference — roles and what each can see

| Role | Home | Nav (current demo build) | Can do |
| --- | --- | --- | --- |
| **Stylist (On PPH)** | Dashboard | Dashboard, Board, Promotions | Personal PPH metrics, DPR aiming, acknowledge board |
| **Stylist (Off PPH)** | Not-on-plan card | Board, Promotions | Messaging only; no personal PPH dashboard |
| **Salon Manager** | Team Dashboard | Team, Board, Promotions | Salon-scoped team coaching, What-If, board posts (managers+) |
| **SDL · Owner** | Team Dashboard | Team, Board, Promotions | All-salon team view; can change DPR |
| **Admin** | Team Dashboard | Team, Board, Promotions, Pay Logic, Admin | Everything above + imports, users/salons, payment logic |

> Soft-disabled (code present, nav hidden): **Planner**, **Calendar**, **Goals**, **Notifications**.

---

## 10.2 Glossary

| Term | Meaning in this app |
| --- | --- |
| **PPH** | Production Per Hour — service revenue ÷ hours worked |
| **DPR** | Desired Pay Rate — the $/hr aim selected on the stylist dashboard |
| **Effective Rate** | The $/hr performance currently supports (tier lookup, floored by guarantee) |
| **Guarantee** | Minimum $/hr floor |
| **Gap (Over / Under)** | Difference between Recap reality and DPR plan |
| **Req Svc Rev ($)** | Service revenue required to hit the DPR for scheduled hours |
| **On PPH / Include** | Person is on the PPH pay plan → personal dashboard |
| **Off PPH / Exclude** | Not on the PPH pay plan → no personal PPH dashboard |
| **On Track / Needs Attention / Behind** | Team coaching statuses vs the Team target $/hr |
| **PayRlt** | Pay-rate tier marker shown on team cards |
| **What-If** | Sandbox to model a target effective rate and required production |
| **Daily Breakdown** | Day-level actual vs goal table on the stylist dashboard |
| **Native template** | First-party CSV/XLSX shape the importer expects for Daily/Weekly |
| **Danger Zone** | Pay Logic — global settings affecting every calculation |

---

## 10.3 One-page cheat sheet — recommended demo flow

**URL:** https://v1pph-salon.vercel.app  
**Timebox:** 45–60 min

| # | Minutes | Persona | Click path | One-line pitch |
| --- | --- | --- | --- | --- |
| 0 | 2–3 | whoever lands | Show logo + Account Switcher | Real data, fixed today 7/1, period 6/22–7/5 |
| 1 | 5 | **Admin (Demo)** | Admin tabs overview | Org control surface |
| 2 | 12–15 | **Owner / SDL** then **Linda/Kellie** | Team KPIs → distribution → filters → Details | Coaching cockpit |
| 3 | 10–12 | **Stephanie Montgomery** | DPR → Metrics → Recap → Gap → Daily Breakdown | Include stylist truth |
| 4 | 4–5 | **Holliean Miller** | Land on exclude card | Include/Exclude is correct |
| 5 | 5–6 | SDL/Manager | Team → **What If** | Mid-week coaching sandbox |
| 6 | 6–8 | **Admin (Demo)** | Admin → **Data Import** → **Daily performance** | v2 daily format native |
| 7 | 4–5 | Admin | Board → Promotions → Pay Logic | Supporting surfaces |
| 8 | 3–5 | — | Close + next steps | File, prod access, feedback |

**Emergency resets:** Account chip → search name · Team **All** + **Cards** + **Actual** · Target **$19/hr**

**Never say:** “Excluded means broken.”  
**Always say:** “Excluded means not on the PPH pay plan — per your file.”

---

## 10.4 Suggested full timing map (60-minute call)

| Block | Clock | Section |
| --- | --- | --- |
| Pre | −10:00 | Checklist |
| Open | 0:00–0:03 | Opening |
| Admin overview | 0:03–0:08 | 4a |
| Team Dashboard | 0:08–0:22 | 4b |
| Include stylist | 0:22–0:34 | 4c |
| Exclude stylist | 0:34–0:39 | 4d |
| What-If | 0:39–0:45 | 4e |
| Data Import | 0:45–0:52 | 4f |
| Brief tour | 0:52–0:56 | 4g |
| Close | 0:56–1:00 | Closing |
| Overflow | + | Deep Dive §5 + live Q&A §8 |

---

## 10.5 Presenter presence tips

- Narrate **labels**, not regions: say **“Avg Effective Rate”**, not “this box.”
- After every persona switch, pause one beat so the client sees the nav change.
- When Gap numbers are red, smile — that’s the product working.
- If finance joins late, jump to **Stephanie Daily Breakdown** + **Admin Daily Import**; don’t restart from zero.
- Keep Account Switcher search text selected so you can overwrite quickly between personas.

---

**End of guide.**  
Print or export to PDF; keep beside you for the entire client call.
