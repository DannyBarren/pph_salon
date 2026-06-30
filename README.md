# PPH Stylist App — V1 Prototype

A responsive web app that helps hair stylists understand and plan their earnings
based on scheduled hours and production. Built with **Next.js 16 (App Router) +
TypeScript + Tailwind CSS v4** and a custom, lightweight UI component library.

> This is a front-end prototype: all data is mocked in-memory and persisted to
> `localStorage`. There is **no backend, login, or real credentials** — switching
> accounts is instant for demos.

## Quick start

```bash
npm install
npm run dev      # http://localhost:3000
# or
npm run build && npm run start
```

## Demo accounts (top-right switcher)

No login required — tap the avatar in the top bar to switch personas instantly.
The whole app re-scopes to that role's data and permissions:

| Persona            | Role          | Sees                                            |
| ------------------ | ------------- | ----------------------------------------------- |
| Maya Patel         | Stylist       | Only her own data + planner (Aria Studio)       |
| Leo Martins        | Stylist       | Only his own data + planner (Aria Studio)       |
| Sofia Reyes        | Stylist       | Only her own data + planner (Lumière Salon)     |
| Priya Shah         | Salon Manager | Her 5 direct reports only (clean team switcher) |
| Jordan Avery       | SDL / Owner   | Everyone across all salons + Admin config       |

Role-based access is enforced in `src/lib/mockData.ts` (`stylistsForUser`).

## Features

- **Demo account switcher** — prominent, instant role switching (no auth).
- **Strict role hierarchy** — Stylist → self, Manager → direct reports, SDL → all.
- **Time navigation** — Current + Prior (biweekly), Pay Period, Single Week, and
  the What-If Planner.
- **Configurable pay engine** — the SDL/Admin controls guarantee rates (global +
  per salon), commission rate, average tickets, service mix, and minimum
  services. Every dashboard and the planner recalculate **instantly**.
- **What-If Planner** — main slider for target effective pay rate, plus extra
  hours and service-focus sliders. Live: required remaining production, daily
  targets, projected haircuts + colors, and a feasibility meter.
- **Manager / SDL views** — hierarchy-aware stylist switcher + team performance
  and light adoption/usage stats (days opened, planner uses, streaks).
- **Admin data input** — CSV/XLSX (CSV parser included) upload with preview and
  column mapping, assignment to a stylist/week, plus a manual entry form.
- **Mobile-first** — works great on phones (bottom tab bar) and desktop.
- Light gamification: streaks, goals hit, and motivational "flash goals".

## Pay model

```
commissionPay = production × commissionRate
guaranteePay  = hoursWorked × guaranteeRate         (per-salon override allowed)
pay           = max(commissionPay, guaranteePay)
effectiveRate = pay ÷ hoursWorked

# Planner (solve for the production needed to hit a target $/hr):
requiredProduction = targetRate × planHours ÷ commissionRate
```

## Project structure

```
src/
  app/                 # routes: / (dashboard), /planner, /team, /admin
  components/          # AppShell, AccountSwitcher, dashboards, planner, admin, ui/
  lib/                 # types, mockData, payEngine, time, selection, csv, format
  store/AppContext.tsx # current user/role, config, time selection, data overrides
```

Everything reads from a single `AppContext`, so changing the admin config or
switching accounts flows through the entire UI reactively.
