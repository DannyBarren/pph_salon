# PPH Salon App — User Manual

> A complete, plain-language guide to using every feature of the PPH Salon web
> app, for every type of user (**Stylist**, **Salon Manager**, and
> **SDL / Owner / Admin**). No technical knowledge required.
>
> Documentation only (lives in the repo, not the app). See also `client_readme.md`
> (codebase) and `payment_logic.md` (the pay math).

---

## Table of contents

1. [Quick start & signing in](#1-quick-start--signing-in)
2. [Understanding your role](#2-understanding-your-role)
3. [Getting around (navigation)](#3-getting-around-navigation)
4. [Key terms in 30 seconds](#4-key-terms-in-30-seconds)
5. [For Stylists](#5-for-stylists)
6. [For Salon Managers](#6-for-salon-managers)
7. [For SDL / Owner / Admin](#7-for-sdl--owner--admin)
8. [Feature how-to recipes](#8-feature-how-to-recipes)
9. [Privacy: what each role can see](#9-privacy-what-each-role-can-see)
10. [Troubleshooting & tips](#10-troubleshooting--tips)
11. [FAQ](#11-faq)

---

## 1. Quick start & signing in

1. Open the app in a browser (works great on a phone).
2. In the **top-right corner**, tap the **account chip** (name + avatar) to open
   the **account switcher**.
3. Pick a person to use the app *as* them. The demo includes:
   - **Maya / Leo / Sofia** — Stylists
   - **Priya** — Salon Manager
   - **Jordan** — SDL / Owner
4. The whole app instantly re-scopes to that person's role and data. Your role is
   shown as a small label next to the logo.

> **Demo note:** there's no password in the demo — the account switcher *is* the
> login. In production this becomes a real sign-in.

---

## 2. Understanding your role

The app has three role levels. Each sees a different "home" screen and different
tools.

| Role | Home screen | Can do |
| --- | --- | --- |
| **Stylist** | My Dashboard | See their own numbers, plan & set goals, read/acknowledge announcements. |
| **Salon Manager** | Team Dashboard | Everything a stylist sees for their team + review goals + post announcements. |
| **SDL / Owner / Admin** | Team Dashboard | Full access to all salons, the org hierarchy, and Admin settings. |

**The golden privacy rule:** Stylists **never** see revenue or dollar production
totals — only their hours, pay rates, service counts, and progress. Managers and
above see the full dollar figures. (Details in [§9](#9-privacy-what-each-role-can-see).)

---

## 3. Getting around (navigation)

The menu is the bar at the top (desktop) or along the bottom (mobile). What you
see depends on your role:

- **Stylist:** **Dashboard**, **Planner**, **Board**
- **Manager:** **Team**, **Planner**, **Goals**, **Board**
- **SDL / Owner:** **Team**, **Planner**, **Goals**, **Board**, **Admin**

A small **number badge** appears on:
- **Board** — unread announcements.
- **Goals** — unread goal notifications (for managers/owners).

Managers and owners are taken straight to the **Team Dashboard** when they open
the app.

---

## 4. Key terms in 30 seconds

- **PPH (Production Per Hour):** your service revenue ÷ hours = the core number the
  pay plan runs on.
- **Pay rate ($/hr):** what you earn per hour. In this plan, **pay rate = 40% of
  your PPH**. To earn a rate you need **PPH = rate ÷ 0.4**.
- **Guarantee:** the minimum $/hr you're paid no matter what (your floor).
- **Effective / current pay rate:** the rate you've actually reached this week.
- **Tier / PayRt:** a target pay rate ($11–$29), each needing a specific PPH.
- **Over / Short:** how far ahead (green) or behind (red) you are vs. the target.
- **Haircut = $23, Color = $85:** the production value of each service.
- **Goal:** the target you set for the pay period (pay rate, hours, haircuts,
  colors). One active goal per period; you can update it any time.

---

## 5. For Stylists

Your three tabs: **Dashboard**, **Planner**, **Board**.

### 5.1 My Dashboard (your week at a glance)

This is your home screen. It shows:
- A **hero ring** with your current **effective pay rate** and how close you are to
  your goal rate.
- **Stat cards:** effective rate, pace, hours worked (and hours left), services.
- **"What you still need":** how many more services per day to reach your goal
  rate, and a progress bar.
- **Daily breakdown:** each day's hours, haircuts, colors, and a bar showing your
  activity (no dollar figures — that's the privacy rule).

**Change the time range:** use the **Current + Prior / Pay Period / Single Week**
buttons at the top to switch which weeks you're looking at.

### 5.2 Planner (plan and set your goal)

The **Planner** is where you plan your week and lock in a goal.

**Step-by-step to set a goal:**
1. Open **Planner**.
2. Drag **Desired effective pay rate** to your target $/hr ($11–$29).
3. Set **Planned hours this week** (drag the slider or type a number).
   - Set it to **0** for a full-week call-off / sick time.
   - Increase it if you're covering someone else's shifts.
4. Look at the **Service mix**: two linked sliders — **Total haircuts** and
   **Total colors**. Drag either one and the other adjusts automatically to stay
   on target. Tap **Auto-snap to best mix** for a suggested split.
5. Read the results panel: services per hour, whether the plan is realistic
   (you'll get a warning if it's a stretch), and how the plan pays.
6. When you're happy, tap **Set Goal for this Pay Period**.

**What happens when you set a goal:**
- It saves immediately and becomes your **active goal** (no drafts).
- Your **manager is notified** to review it.
- You'll see a status badge: **Pending review**, **Approved**, or **Needs changes**
  — plus any comment your manager leaves.

**Updating / replacing a goal:**
- Come back any time and change the sliders, then tap **Update Goal**. The planner
  pre-fills with your current goal so it's easy to tweak.
- A note reminds you: *updating replaces your current goal; the previous one moves
  to History.*
- The **Goal History** section lists every previous goal with its final status and
  any manager comment.

> **Privacy:** the Planner shows pay rates and service counts, never revenue
> dollars.

### 5.3 Board (announcements)

The **Board** is a one-way announcements feed (no replies).
1. Open **Board**. Pinned posts are at the top; **new** posts are highlighted and
   show on the Board badge.
2. Read a post (title, message, who posted it, date).
3. Tap the big **Acknowledge** (👍) button to confirm you've seen it. It changes
   to **Acknowledged**.

---

## 6. For Salon Managers

Your tabs: **Team**, **Planner**, **Goals**, **Board**. You see full dollar
figures for your team.

### 6.1 Team Dashboard (your team at a glance)

Opening the app takes you here. Top to bottom:
- **KPI cards:** total stylists, average effective pay rate, total production,
  on-track/at-risk/behind counts, team utilization, scheduled hours.
- **"Needs attention" callout:** tap it to filter to stylists who are behind.
- **Rate distribution:** how many stylists sit in each pay-rate band.
- **Filters row:** **search** by name/ID, **status chips** (All / On Track / Needs
  Attention / Behind), and a **sort** dropdown.
- **View toggles:**
  - **Cards ↔ Table** — a visual card grid or a dense sortable table.
  - **Actual ↔ Scheduled** — what's happened so far vs. the full-week plan.

**Per-stylist card shows:** name + ID, effective pay rate (color-coded), status
badge, progress to the next tier, exactly what's still needed, hours/utilization,
production, and a mini daily trend.

**Drill into a stylist:** tap **Details** on a card (or their name in the table)
to open a rich modal with:
- **Week Summary** — full metrics + how they compare to the team average + a
  private coaching note.
- **Week by Day** — daily hours, cuts, colors, production vs. target.
- **What If** — a pay-rate planner pre-filled for that stylist.

**Other controls:**
- **Target $** stepper (top-right) — set the salon's target pay rate for the week;
  it drives every stylist's progress/status.
- **Export** — download the current view as a CSV.
- **Refresh** — reload data; toggle **Auto-refresh every 5 min** for a live board.

### 6.2 Goals (review your team's goals)

The **Goals** tab is where you approve or coach your team's goals.
1. At the top, a **Notifications** panel lists recent activity (e.g. "Stylist Maya
   just set their goal"). Tap **Mark read** to clear one.
2. Each **direct report** appears with their **current goal** (and the **previous**
   goal if they overrode it this period) and a status badge.
3. To review: type an optional **comment**, then tap **Approve** or **Disapprove**.
   - The stylist is **notified instantly** and sees your decision + comment on
     their Planner.
   - You can **re-review** later ("Update your review") — it shows who last
     reviewed and when.

### 6.3 Board (post announcements)

Managers can post, not just read.
1. Open **Board** → **New Post**.
2. Enter a **Title** and **Message**.
3. **Audience:** as a manager, posts automatically go to **your salon** (all your
   stylists).
4. Optionally **Pin to top** and/or set an **Expiry** date.
5. Tap **Post announcement.**
6. On any post you sent, you'll see **acknowledgment stats** ("12/15 stylists
   acknowledged") and can expand to see who has/hasn't.

### 6.4 Planner (view a stylist's plan)

Managers can open the **Planner**, pick a stylist, and view/plan their week
(read-only for goal-setting — stylists set their own goals).

---

## 7. For SDL / Owner / Admin

You have everything managers have, across **all salons**, plus the **hierarchy
view** and **Admin**.

### 7.1 Team Dashboard & Goals (whole organization)

- **Team Dashboard** shows every stylist across all salons.
- **Goals** shows a **cascading hierarchy**: **Store → Manager → Stylists**. Expand
  a store, then a manager, to drill into each stylist's goal — and review any goal
  in the org.

### 7.2 Admin (settings & data)

Open the **Admin** tab. It has three areas:

**A) Data Management** — enter or fix data by hand (works even if Zenoti/PayCor are
down):
1. Pick a **Salon**, then **search/select a Stylist**.
2. Edit their **profile** (name, email, phone, guarantee rate).
3. Pick a **week**, then edit the **weekly grid**: scheduled/actual hours,
   haircuts, colors, other value. (Production is auto-calculated from services ×
   prices; you can override it.)
4. Tap **Save week** — it saves (upserts) immediately.

**B) Bulk import** (Zenoti-style):
1. In Data Management → **Bulk import**, tap **Download CSV template**.
2. Fill it (columns: `user_id, salon_name, week_start, guarantee_rate,
   scheduled_hrs, actual_hrs, actual_haircuts, actual_colors, actual_other_value,
   notes`). One row per stylist-week.
3. Upload the file (or paste rows). Rows are matched by **user_id + week_start**,
   so re-importing safely updates existing weeks.

**C) Pay & salon configuration:**
- Global **guarantee rate**, **commission rate**, average tickets, service mix.
- **Per-salon guarantee rates** and **per-salon service prices** (haircut/color).
- A **live formula preview** shows how a sample day pays.

> Only SDL/Owner/Admin can change pricing, guarantees, and configuration.

---

## 8. Feature how-to recipes

**Set my goal for the week (Stylist):** Planner → set sliders → **Set Goal for
this Pay Period**.

**Change my goal (Stylist):** Planner → adjust sliders (pre-filled with your
current goal) → **Update Goal**. Old goal moves to History.

**See if my manager approved my goal (Stylist):** Planner → the **Active goal**
box shows the status badge + comment.

**Approve a stylist's goal (Manager):** Goals → find the stylist → add a comment →
**Approve** / **Disapprove**.

**Find who needs help (Manager):** Team → tap the **Needs attention** callout, or
the **Behind** status chip.

**Coach one stylist in detail (Manager):** Team → **Details** on their card →
Week Summary / Week by Day / What If.

**Announce something to my salon (Manager):** Board → **New Post** → write it →
**Post announcement.**

**See the whole company's goals (Owner/SDL):** Goals → expand Store → Manager →
Stylist.

**Fix a stylist's hours/services (Admin):** Admin → Data Management → pick salon +
stylist + week → edit grid → **Save week**.

**Load a week of real data (Admin):** Admin → Data Management → Bulk import →
download template → fill → upload.

**Set the team's target for the week (Manager):** Team → **Target $** stepper.

**Export the team view (Manager):** Team → **Export**.

---

## 9. Privacy: what each role can see

| Item | Stylist | Manager | SDL / Owner |
| --- | --- | --- | --- |
| Own hours, pay rate, services, over/short | ✅ | ✅ | ✅ |
| **Revenue / production dollars** | ❌ **Hidden** | ✅ | ✅ |
| Other stylists' data | ❌ | ✅ (their team) | ✅ (everyone) |
| Post announcements | ❌ (read + acknowledge) | ✅ (their salon) | ✅ (any salon) |
| Review goals | ❌ | ✅ (direct reports) | ✅ (all) |
| Edit pricing / config / users | ❌ | ❌ | ✅ |

Stylists always see pay **rates** ($/hr) and service **counts** — just never the
revenue totals they generate.

---

## 10. Troubleshooting & tips

- **The screen looks blank or errors after loading:** tap **Reset demo data** on
  the recovery screen (or clear the browser's site data) to start from fresh
  seeded data. This clears any leftover demo state.
- **Numbers look off after switching accounts:** use **Refresh** on the Team
  Dashboard, or reload the page.
- **On a phone:** everything is mobile-first — the menu moves to the bottom and
  cards stack. Tables scroll sideways.
- **Nothing to acknowledge / no goals yet:** that's normal for a fresh account —
  set a goal on the Planner or post to the Board to see the flows.
- **Best demo experience:** use a fresh browser window (or incognito) so you start
  from clean seeded data.

---

## 11. FAQ

**Q: Why can't stylists see revenue?**
A: By design — stylists focus on hours, pay rate, and services; managers/owners
handle the business dollars.

**Q: How is my pay rate calculated?**
A: Pay rate = 40% of your PPH (production per hour). To hit a rate you need
PPH = rate ÷ 0.4. You never earn below your guarantee. (Full math in
`payment_logic.md`.)

**Q: Can I have more than one goal per week?**
A: No — one **active** goal per pay period. Setting a new one replaces the old one,
which moves to your Goal History.

**Q: Does setting a goal notify anyone?**
A: Yes — your direct manager is notified to review it, and you're notified back
when they approve/disapprove.

**Q: What do the green/red numbers mean?**
A: Green = you're at or over the target (Over); red = you're behind (Short).

**Q: Can a manager change my goal?**
A: Managers review and comment on goals; stylists set their own. Owners/Admins can
adjust anything.

**Q: What are the two service values?**
A: Each haircut counts as $23 of production and each color as $85 (configurable by
an Admin per salon).

---

*Keep this manual updated as features change. For the underlying code and math, see
`client_readme.md` and `payment_logic.md`.*
