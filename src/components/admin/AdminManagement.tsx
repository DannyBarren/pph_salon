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
  KeyRound,
  Info,
  Send,
  Copy,
} from "lucide-react";
import { Card, CardBody, Button, Badge, Select, Modal } from "@/components/ui/primitives";
import { adminApi, salonApi, userApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { DEMO_MODE } from "@/lib/featureFlags";
import type {
  AuditLogDTO,
  BackendRole,
  BulkUserResult,
  ClientImportResult,
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
function UserManager({
  salons,
  restrict,
}: {
  salons: SalonDTO[];
  /** Manager mode: lock creation to stylists in the given salon (reporting to the manager). */
  restrict?: { salonId: number };
}) {
  const [users, setUsers] = useState<UserDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<BackendRole>("stylist");
  const [salonId, setSalonId] = useState<number | "">(restrict ? restrict.salonId : "");
  const [managerId, setManagerId] = useState<number | "">("");
  const [excluded, setExcluded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const [bulkResult, setBulkResult] = useState<BulkUserResult | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [resetInfo, setResetInfo] = useState<{ email: string | null; password: string | null } | null>(null);
  const [resetBusyId, setResetBusyId] = useState<number | null>(null);
  const [inviteInfo, setInviteInfo] = useState<{ email: string | null; link: string | null; emailed: boolean } | null>(null);
  const [inviteBusyId, setInviteBusyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<UserDTO | null>(null);

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
    const effectiveSalon = restrict ? restrict.salonId : salonId;
    const effectiveRole: BackendRole = restrict ? "stylist" : role;
    if (effectiveSalon === "") {
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
        role: effectiveRole,
        salon_id: Number(effectiveSalon),
        manager_id: restrict ? undefined : managerId === "" ? undefined : Number(managerId),
        excluded,
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
      setExcluded(false);
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

  const resetPassword = async (id: number) => {
    setResetBusyId(id);
    setResetInfo(null);
    try {
      const r = await userApi.resetPassword(id);
      setResetInfo({ email: r.email, password: r.temporary_password });
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setResetBusyId(null);
    }
  };

  const sendSetupLink = async (u: UserDTO) => {
    let email = u.email ?? "";
    if (!email) {
      const entered = typeof window !== "undefined" ? window.prompt(`Enter ${u.name}'s email to send their setup link:`) : null;
      if (!entered || !entered.trim()) return;
      email = entered.trim();
    }
    setInviteBusyId(u.id);
    setError(null);
    setInviteInfo(null);
    try {
      const r = await userApi.invite(u.id, u.email ? undefined : email);
      setInviteInfo({ email: r.email, link: r.setup_link, emailed: r.emailed });
      void loadUsers();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setInviteBusyId(null);
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
              <Plus size={16} /> {restrict ? "Add a team member" : "Add a single user"}
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
              {restrict ? (
                <p className="text-xs text-[var(--color-ink-faint)]">
                  New team members are created as <b>stylists</b> in your salon and report to you.
                </p>
              ) : (
                <>
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
                  <label className="flex items-center gap-2 text-sm text-[var(--color-ink-soft)]">
                    <input type="checkbox" checked={excluded} onChange={(e) => setExcluded(e.target.checked)} />
                    Excluded from the PPH pay plan (no personal PPH dashboard — team views only)
                  </label>
                </>
              )}
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
              {restrict
                ? "Columns: email, name, password (+ optional title, phone, guarantee_rate). Everyone is imported as a stylist in your salon, reporting to you. Leave password blank to auto-generate."
                : "Columns: email, name, role, salon_id or salon_name, manager_id or manager_email, title, phone, guarantee_rate, password. Set an initial password per row (or leave blank to auto-generate). Provision hundreds of stylists/managers at once."}
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
          {resetInfo && (
            <div className="mb-3">
              <Notice kind="success">
                {resetInfo.password ? (
                  <>
                    New temporary password for {resetInfo.email ?? "user"}:{" "}
                    <code className="font-mono font-semibold">{resetInfo.password}</code>. Share it securely; they should change it on next sign-in.
                  </>
                ) : (
                  <>Password reset and emailed to {resetInfo.email}.</>
                )}
              </Notice>
            </div>
          )}
          {inviteInfo && (
            <div className="mb-3">
              <Notice kind="success">
                {inviteInfo.emailed ? (
                  <>Setup link emailed to {inviteInfo.email}. They&apos;ll set their own password and sign in with their email.</>
                ) : (
                  <>
                    Account unlocked for {inviteInfo.email ?? "user"}. Share this one-time setup link so they can set their password:
                    {inviteInfo.link && (
                      <span className="mt-1 flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded bg-[var(--color-surface-2)] px-2 py-1 font-mono text-xs">{inviteInfo.link}</code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { if (inviteInfo.link) void navigator.clipboard?.writeText(inviteInfo.link); }}
                        >
                          <Copy size={13} /> Copy
                        </Button>
                      </span>
                    )}
                  </>
                )}
              </Notice>
            </div>
          )}
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
                    <th>On PPH plan</th>
                    <th className="text-right">Actions</th>
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
                      <td>
                        {u.excluded ? (
                          <Badge tone="warning">Excluded</Badge>
                        ) : (
                          <span className="text-[var(--color-ink-faint)]">On plan</span>
                        )}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" disabled={inviteBusyId === u.id} onClick={() => sendSetupLink(u)}>
                            {inviteBusyId === u.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                            Send setup link
                          </Button>
                          <Button variant="ghost" size="sm" disabled={resetBusyId === u.id} onClick={() => resetPassword(u.id)}>
                            {resetBusyId === u.id ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                            Reset password
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {editing && (
        <UserEditModal
          user={editing}
          salons={salons}
          managers={managers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void loadUsers();
          }}
        />
      )}
    </div>
  );
}

// ── Edit an existing user (admin: every field) ──────────────────────────────────
function UserEditModal({
  user,
  salons,
  managers,
  onClose,
  onSaved,
}: {
  user: UserDTO;
  salons: SalonDTO[];
  managers: UserDTO[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? "");
  const [role, setRole] = useState<BackendRole>(user.role);
  const [salonId, setSalonId] = useState<number>(user.salon_id);
  const [managerId, setManagerId] = useState<number | "">(user.manager_id ?? "");
  const [title, setTitle] = useState(user.title ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [guarantee, setGuarantee] = useState(user.guarantee_rate != null ? String(user.guarantee_rate) : "");
  const [excluded, setExcluded] = useState(!!user.excluded);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await userApi.update(user.id, {
        name: name.trim(),
        email: email.trim() || undefined,
        role,
        salon_id: salonId,
        manager_id: managerId === "" ? null : Number(managerId),
        title: title.trim() || undefined,
        phone: phone.trim() || undefined,
        guarantee_rate: guarantee.trim() === "" ? null : Number(guarantee),
        excluded,
      });
      setOk("Saved.");
      onSaved();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    setBusy(true);
    setError(null);
    try {
      await userApi.deactivate(user.id);
      onSaved();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Edit ${user.name}`} size="lg">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--color-ink-soft)]">Full name</span>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--color-ink-soft)]">Email</span>
            <input className={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--color-ink-soft)]">Role / level</span>
            <Select value={role} onChange={(e) => setRole(e.target.value as BackendRole)}>
              <option value="stylist">Stylist</option>
              <option value="manager">Manager</option>
              <option value="owner">SDL / Owner</option>
              <option value="admin">Admin</option>
            </Select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--color-ink-soft)]">Salon</span>
            <Select value={salonId} onChange={(e) => setSalonId(Number(e.target.value))}>
              {salons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--color-ink-soft)]">Reports to (manager)</span>
            <Select value={managerId} onChange={(e) => setManagerId(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">— none —</option>
              {managers
                .filter((m) => m.id !== user.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.role})
                  </option>
                ))}
            </Select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--color-ink-soft)]">Guarantee $/hr</span>
            <input className={input} type="number" step="0.25" value={guarantee} onChange={(e) => setGuarantee(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--color-ink-soft)]">Title</span>
            <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--color-ink-soft)]">Phone</span>
            <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
        </div>

        <label className="flex items-start gap-2 rounded-lg bg-[var(--color-surface-2)] p-3 text-sm">
          <input type="checkbox" className="mt-0.5" checked={excluded} onChange={(e) => setExcluded(e.target.checked)} />
          <span>
            <b>Excluded from the PPH pay plan.</b> No personal PPH dashboard; team visibility only (if they manage
            people). Uncheck to put them on the plan with a personal dashboard.
          </span>
        </label>

        {error && <Notice kind="error">{error}</Notice>}
        {ok && <Notice kind="success">{ok}</Notice>}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={deactivate} disabled={busy}>
            Deactivate user
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : null} Save changes
            </Button>
          </div>
        </div>
      </div>
    </Modal>
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

// ── Data import (weekly / daily / client) ───────────────────────────────────────
type ImportKind = "weekly" | "daily" | "client";

/** Monday (ISO) of the current week — sensible default for the client export. */
function currentMondayIso(): string {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Mon=0 … Sun=6
  now.setDate(now.getDate() - day);
  return now.toISOString().slice(0, 10);
}

function ImportPanel() {
  const [kind, setKind] = useState<ImportKind>("weekly");
  const [source, setSource] = useState("native");
  const [weekStart, setWeekStart] = useState<string>(currentMondayIso());
  const [result, setResult] = useState<WeeklyImportResult | null>(null);
  const [clientResult, setClientResult] = useState<ClientImportResult | null>(null);
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
    setClientResult(null);
    try {
      if (kind === "client") {
        setClientResult(await adminApi.importClient(file, weekStart || undefined));
      } else if (kind === "weekly") {
        setResult(await adminApi.importWeekly(file, source));
      } else {
        setResult(await adminApi.importDaily(file, source));
      }
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const csv =
        kind === "client"
          ? await adminApi.clientTemplate()
          : kind === "weekly"
            ? await adminApi.weeklyTemplate()
            : await adminApi.dailyTemplate();
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
          The <b>Client / SSF export</b> auto-provisions salons + employees (with per-employee guarantee rates) and records each person&apos;s Net service Rev for the chosen week.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={kind} onChange={(e) => setKind(e.target.value as ImportKind)}>
              <option value="weekly">Weekly data</option>
              <option value="daily">Daily performance</option>
              <option value="client">Client / SSF export (roster + revenue)</option>
            </Select>
            {kind === "client" ? (
              <label className="flex items-center gap-2 text-sm text-[var(--color-ink-soft)]">
                <span className="whitespace-nowrap text-xs font-medium">Week starting</span>
                <input
                  type="date"
                  className={input}
                  value={weekStart}
                  onChange={(e) => setWeekStart(e.target.value)}
                />
              </label>
            ) : (
              <Select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="native">Native template</option>
                <option value="zenoti">Zenoti export</option>
                <option value="paycor">PayCor export</option>
              </Select>
            )}
          </div>
          {kind === "client" && (
            <p className="text-xs text-[var(--color-ink-faint)]">
              The client export has no date column, so its rows are recorded against the Monday you pick above. Safe to re-run — rows update in place.
            </p>
          )}
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
          {clientResult && (
            <Notice kind="success">
              Imported week of {clientResult.week_start}: {clientResult.salons_created} salons created ·{" "}
              {clientResult.users_created} employees created, {clientResult.users_updated} updated ·{" "}
              {clientResult.weeks_inserted} weeks inserted, {clientResult.weeks_updated} updated
              {clientResult.skipped > 0 ? ` · ${clientResult.skipped} skipped` : ""}.
              {clientResult.errors.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-xs text-red-600">
                  {clientResult.errors.slice(0, 5).map((e, i) => (
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
export function AdminManagement({
  mode = "admin",
  defaultSalonId,
}: {
  mode?: "admin" | "manager";
  /** Manager mode: the salon new hires are created in (their own salon). */
  defaultSalonId?: number;
} = {}) {
  const isManager = mode === "manager";
  const [tab, setTab] = useState<Tab>(isManager ? "users" : "salons");
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

  // Managers only manage their staff; the salon is their own.
  const managerSalonId = defaultSalonId ?? salons[0]?.id;
  const tabs = isManager ? TABS.filter((t) => t.id === "users") : TABS;

  if (isManager) {
    return (
      <Card>
        <CardBody>
          {error && !loaded && (
            <Notice kind="error">
              Couldn&apos;t reach the backend API. Confirm <code>NEXT_PUBLIC_API_BASE_URL</code> is set and the backend is running. ({error})
            </Notice>
          )}
          <div className={error && !loaded ? "pointer-events-none opacity-50" : ""}>
            {managerSalonId != null ? (
              <UserManager salons={salons} restrict={{ salonId: managerSalonId }} />
            ) : (
              <p className="text-sm text-[var(--color-ink-faint)]">Loading your salon…</p>
            )}
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardBody>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {tabs.map((t) => (
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

        {DEMO_MODE && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-[var(--color-brand-soft)] px-3 py-2 text-sm text-[var(--color-brand-ink)]">
            <Info size={16} className="mt-0.5 shrink-0" />
            <div>
              <b>Demo mode.</b> These panels run on the offline sample data — reads are live, and creating salons/users, editing pay
              tiers, or importing files work for this session (not saved to a server). Templates download instantly. Connect the
              FastAPI backend (credentialed build) to persist everything.
            </div>
          </div>
        )}

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
