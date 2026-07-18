"use client";

// Data-loading effects intentionally set loading/error state when they fire;
// this is the standard fetch-on-mount pattern, so we opt out of the strict rule.
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Users,
  SlidersHorizontal,
  Upload,
  ScrollText,
  Plus,
  RefreshCw,
  Download,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Card, CardBody, Button, Badge, Select } from "@/components/ui/primitives";
import { adminApi, salonApi, userApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import type {
  AuditLogDTO,
  BackendRole,
  BulkUserResult,
  PayTierDTO,
  SalonDTO,
  UserDTO,
  WeeklyImportResult,
} from "@/lib/api/types";

type Tab = "salons" | "users" | "payplan" | "import" | "audit";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "salons", label: "Salons", icon: <Building2 size={16} /> },
  { id: "users", label: "Users", icon: <Users size={16} /> },
  { id: "payplan", label: "Pay Plan", icon: <SlidersHorizontal size={16} /> },
  { id: "import", label: "Data Import", icon: <Upload size={16} /> },
  { id: "audit", label: "Audit Log", icon: <ScrollText size={16} /> },
];

function errMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

const input =
  "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-brand)]";

function Notice({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
        kind === "error" ? "bg-red-50 text-red-700" : "bg-[var(--color-success-soft)] text-[var(--color-success)]"
      }`}
    >
      {kind === "error" ? <AlertTriangle size={16} className="mt-0.5" /> : <CheckCircle2 size={16} className="mt-0.5" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ── Salons ────────────────────────────────────────────────────────────────────
function SalonManager({ salons, reload }: { salons: SalonDTO[]; reload: () => void }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [guarantee, setGuarantee] = useState("");
  const [haircut, setHaircut] = useState("23");
  const [color, setColor] = useState("85");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await salonApi.create({
        name: name.trim(),
        city: city.trim() || undefined,
        guarantee_rate: guarantee ? Number(guarantee) : undefined,
        service_prices: { haircut: Number(haircut), color: Number(color) },
      });
      setOk(`Created salon “${name.trim()}”.`);
      setName("");
      setCity("");
      setGuarantee("");
      reload();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardBody>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Plus size={16} /> Create salon
          </h3>
          <form onSubmit={submit} className="space-y-3">
            <input className={input} placeholder="Salon name" required value={name} onChange={(e) => setName(e.target.value)} />
            <input className={input} placeholder="City (optional)" value={city} onChange={(e) => setCity(e.target.value)} />
            <div className="grid grid-cols-3 gap-2">
              <input className={input} type="number" step="0.5" placeholder="Guarantee $/hr" value={guarantee} onChange={(e) => setGuarantee(e.target.value)} />
              <input className={input} type="number" step="1" placeholder="Haircut $" value={haircut} onChange={(e) => setHaircut(e.target.value)} />
              <input className={input} type="number" step="1" placeholder="Color $" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
            {error && <Notice kind="error">{error}</Notice>}
            {ok && <Notice kind="success">{ok}</Notice>}
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Create salon
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 className="mb-3 text-sm font-semibold">Existing salons ({salons.length})</h3>
          <div className="space-y-2">
            {salons.length === 0 && <p className="text-sm text-[var(--color-ink-faint)]">No salons yet.</p>}
            {salons.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl border border-[var(--color-border)] px-3 py-2">
                <div>
                  <div className="text-sm font-semibold">{s.name}</div>
                  <div className="text-xs text-[var(--color-ink-faint)]">
                    #{s.id} · {s.city ?? "—"} · haircut ${s.service_prices.haircut} / color ${s.service_prices.color}
                    {s.guarantee_rate != null ? ` · guarantee $${s.guarantee_rate}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// ── Users (single + bulk) ──────────────────────────────────────────────────────
function UserManager({ salons }: { salons: SalonDTO[] }) {
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<BackendRole>("stylist");
  const [salonId, setSalonId] = useState<number | "">("");
  const [managerId, setManagerId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const [bulkResult, setBulkResult] = useState<BulkUserResult | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await userApi.list());
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const managers = useMemo(() => users.filter((u) => u.role === "manager" || u.role === "owner"), [users]);

  const submitSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salonId === "") {
      setError("Choose a salon");
      return;
    }
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const chosenPassword = password.trim();
      await userApi.create({
        name: name.trim(),
        email: email.trim() || undefined,
        role,
        salon_id: Number(salonId),
        manager_id: managerId === "" ? undefined : Number(managerId),
        password: chosenPassword || undefined,
      });
      setCreated(
        chosenPassword
          ? `Created ${name.trim()} with the initial password you set. They can change it after signing in.`
          : `Created ${name.trim()}. A temporary password was generated${email ? " and emailed (if SendGrid is configured)" : ""}.`,
      );
      setName("");
      setEmail("");
      setPassword("");
      void loadUsers();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setBulkError("Choose a CSV file first");
      return;
    }
    setBulkBusy(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      const result = await adminApi.importUsers(file);
      setBulkResult(result);
      void loadUsers();
    } catch (err) {
      setBulkError(errMessage(err));
    } finally {
      setBulkBusy(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const csv = await adminApi.usersTemplate();
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "users-template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setBulkError(errMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardBody>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Plus size={16} /> Add a single user
            </h3>
            <form onSubmit={submitSingle} className="space-y-3">
              <input className={input} placeholder="Full name" required value={name} onChange={(e) => setName(e.target.value)} />
              <input className={input} type="email" placeholder="Email (used to sign in)" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input
                className={input}
                type="text"
                autoComplete="new-password"
                placeholder="Initial password (optional — leave blank to auto-generate)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="-mt-1 text-xs text-[var(--color-ink-faint)]">
                Set a login password for the team member now, or leave blank to generate a temporary one. They can change it after signing in.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Select value={role} onChange={(e) => setRole(e.target.value as BackendRole)}>
                  <option value="stylist">Stylist</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </Select>
                <Select value={salonId} onChange={(e) => setSalonId(e.target.value === "" ? "" : Number(e.target.value))}>
                  <option value="">Salon…</option>
                  {salons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Select value={managerId} onChange={(e) => setManagerId(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">Manager (optional)…</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.role})
                  </option>
                ))}
              </Select>
              {error && <Notice kind="error">{error}</Notice>}
              {created && <Notice kind="success">{created}</Notice>}
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Create user
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Upload size={16} /> Bulk import (CSV)
              </h3>
              <Button variant="ghost" size="sm" onClick={downloadTemplate}>
                <Download size={14} /> Template
              </Button>
            </div>
            <p className="mb-3 text-xs text-[var(--color-ink-faint)]">
              Columns: email, name, role, salon_id or salon_name, manager_id or manager_email, title, phone, guarantee_rate, password.
              Set an initial password per row (or leave blank to auto-generate). Provision hundreds of stylists/managers at once.
            </p>
            <form onSubmit={submitBulk} className="space-y-3">
              <input ref={fileRef} type="file" accept=".csv,.xlsx" className={input} />
              {bulkError && <Notice kind="error">{bulkError}</Notice>}
              {bulkResult && (
                <Notice kind="success">
                  Created {bulkResult.created}, updated {bulkResult.updated}, skipped {bulkResult.skipped}.
                  {bulkResult.errors.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-xs text-red-600">
                      {bulkResult.errors.slice(0, 5).map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                  {Object.keys(bulkResult.credentials).length > 0 && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer font-semibold">Temporary passwords ({Object.keys(bulkResult.credentials).length})</summary>
                      <ul className="mt-1 max-h-40 overflow-auto font-mono">
                        {Object.entries(bulkResult.credentials).map(([em, pw]) => (
                          <li key={em}>
                            {em}: {pw}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </Notice>
              )}
              <Button type="submit" disabled={bulkBusy}>
                {bulkBusy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Upload &amp; import
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Users ({users.length})</h3>
            <Button variant="ghost" size="sm" onClick={() => void loadUsers()}>
              <RefreshCw size={14} /> Refresh
            </Button>
          </div>
          {loading ? (
            <p className="text-sm text-[var(--color-ink-faint)]">Loading…</p>
          ) : (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-[var(--color-ink-faint)]">
                  <tr>
                    <th className="py-1.5">Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Salon</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-[var(--color-border)]">
                      <td className="py-1.5 font-medium">{u.name}</td>
                      <td className="text-[var(--color-ink-faint)]">{u.email ?? "—"}</td>
                      <td>
                        <Badge tone={u.role === "stylist" ? "brand" : u.role === "manager" ? "warning" : "success"}>{u.role}</Badge>
                      </td>
                      <td>#{u.salon_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ── Pay plan config ─────────────────────────────────────────────────────────────
function PayPlanConfig({ salons }: { salons: SalonDTO[] }) {
  const [salonId, setSalonId] = useState<number | "">(salons[0]?.id ?? "");
  const [tiers, setTiers] = useState<PayTierDTO[]>([]);
  const [rows, setRows] = useState<{ desired_rate: string; pph: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async (id: number) => {
    try {
      const t = await salonApi.listPayTiers(id);
      setTiers(t);
      setRows(t.map((x) => ({ desired_rate: String(x.desired_rate), pph: String(x.pph) })));
    } catch (err) {
      setError(errMessage(err));
    }
  }, []);

  useEffect(() => {
    if (salonId !== "") void load(Number(salonId));
  }, [salonId, load]);

  const save = async () => {
    if (salonId === "") return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const payload = rows
        .filter((r) => r.desired_rate && r.pph)
        .map((r) => ({ salon_id: Number(salonId), desired_rate: Number(r.desired_rate), pph: Number(r.pph) }));
      const saved = await salonApi.replacePayTiers(Number(salonId), payload);
      setTiers(saved);
      setOk(`Saved ${saved.length} pay tiers.`);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Pay-tier ladder (desired $/hr → required PPH)</h3>
          <Select value={salonId} onChange={(e) => setSalonId(e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">Salon…</option>
            {salons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <p className="mb-3 text-xs text-[var(--color-ink-faint)]">
          The engine reads these tiers to translate production-per-hour into an effective pay rate. Leave empty to fall back to the app defaults.
        </p>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <input className={input} type="number" step="0.5" placeholder="Pay rate $/hr" value={r.desired_rate} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, desired_rate: e.target.value } : x)))} />
              <input className={input} type="number" step="0.5" placeholder="Required PPH" value={r.pph} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, pph: e.target.value } : x)))} />
              <Button variant="ghost" size="sm" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, { desired_rate: "", pph: "" }])}>
            <Plus size={14} /> Add tier
          </Button>
          <Button size="sm" onClick={save} disabled={busy || salonId === ""}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Save ladder
          </Button>
        </div>
        {error && <div className="mt-3"><Notice kind="error">{error}</Notice></div>}
        {ok && <div className="mt-3"><Notice kind="success">{ok}</Notice></div>}
        {tiers.length > 0 && (
          <p className="mt-3 text-xs text-[var(--color-ink-faint)]">Current: {tiers.map((t) => `$${t.desired_rate}@${t.pph}pph`).join(" · ")}</p>
        )}
      </CardBody>
    </Card>
  );
}

// ── Data import (weekly / daily) ────────────────────────────────────────────────
function ImportPanel() {
  const [kind, setKind] = useState<"weekly" | "daily">("weekly");
  const [source, setSource] = useState("native");
  const [result, setResult] = useState<WeeklyImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a CSV/XLSX file");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = kind === "weekly" ? await adminApi.importWeekly(file, source) : await adminApi.importDaily(file, source);
      setResult(r);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const csv = kind === "weekly" ? await adminApi.weeklyTemplate() : await adminApi.dailyTemplate();
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kind}-template.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errMessage(err));
    }
  };

  return (
    <Card>
      <CardBody>
        <h3 className="mb-1 text-sm font-semibold">Import performance data</h3>
        <p className="mb-3 text-xs text-[var(--color-ink-faint)]">
          Upload Zenoti/PayCor exports or the native template. Weekly imports upsert by (user, week); daily imports also aggregate the parent week.
          Any <b>week_start</b>/<b>date</b> is accepted, so you can back-fill historical or past-dated pay periods (e.g. June 8–21) alongside the current one.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={kind} onChange={(e) => setKind(e.target.value as "weekly" | "daily")}>
              <option value="weekly">Weekly data</option>
              <option value="daily">Daily performance</option>
            </Select>
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="native">Native template</option>
              <option value="zenoti">Zenoti export</option>
              <option value="paycor">PayCor export</option>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv,.xlsx" className={input} />
            <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate}>
              <Download size={14} /> Template
            </Button>
          </div>
          {error && <Notice kind="error">{error}</Notice>}
          {result && (
            <Notice kind="success">
              Inserted {result.inserted}, updated {result.updated}, skipped {result.skipped}.
              {result.errors.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-xs text-red-600">
                  {result.errors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </Notice>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Upload &amp; import
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

// ── Audit log ────────────────────────────────────────────────────────────────
function AuditViewer() {
  const [rows, setRows] = useState<AuditLogDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await adminApi.audit(100));
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent admin actions</h3>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        {loading ? (
          <p className="text-sm text-[var(--color-ink-faint)]">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-faint)]">No audit entries yet.</p>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-[var(--color-ink-faint)]">
                <tr>
                  <th className="py-1.5">When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--color-border)]">
                    <td className="py-1.5 text-xs text-[var(--color-ink-faint)]">{new Date(r.created_at).toLocaleString()}</td>
                    <td>{r.actor_email ?? r.actor_role ?? "—"}</td>
                    <td>
                      <Badge>{r.action}</Badge>
                    </td>
                    <td className="text-xs text-[var(--color-ink-faint)]">
                      {r.target_type ? `${r.target_type}${r.target_id ? `#${r.target_id}` : ""}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── Container ───────────────────────────────────────────────────────────────────
export function AdminManagement() {
  const [tab, setTab] = useState<Tab>("salons");
  const [salons, setSalons] = useState<SalonDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      setSalons(await salonApi.list());
      setError(null);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <Card>
      <CardBody>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                tab === t.id ? "bg-[var(--color-brand-soft)] text-[var(--color-brand-ink)]" : "text-[var(--color-ink-soft)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {error && !loaded && (
          <Notice kind="error">
            Couldn&apos;t reach the backend API. Confirm <code>NEXT_PUBLIC_API_BASE_URL</code> is set and the backend is running. ({error})
          </Notice>
        )}

        <div className={error && !loaded ? "pointer-events-none mt-4 opacity-50" : "mt-1"}>
          {tab === "salons" && <SalonManager salons={salons} reload={reload} />}
          {tab === "users" && <UserManager salons={salons} />}
          {tab === "payplan" && <PayPlanConfig salons={salons} />}
          {tab === "import" && <ImportPanel />}
          {tab === "audit" && <AuditViewer />}
        </div>
      </CardBody>
    </Card>
  );
}
