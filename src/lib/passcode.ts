/**
 * Fast-access passcode: device-side "remember me" + daily unlock bookkeeping.
 *
 * The passcode itself is NEVER stored on the device (only its hash lives on the
 * server). What we persist locally is:
 *   - which user this browser last signed in as (so we can greet them), and
 *   - the last calendar day (device-local) the passcode gate was satisfied.
 *
 * Day boundary: we use the device's LOCAL calendar date (YYYY-MM-DD). Each new
 * local day the app requires the passcode again before opening the main shell,
 * even though the refresh token still identifies the user. This is intentional
 * and documented for the deployer; it is a UX gate, not the security boundary
 * (the JWT + password remain the real auth).
 */

const UNLOCK_KEY = "pph-passcode-unlocked";
const REMEMBERED_KEY = "pph-remembered-user";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** Device-local calendar day as an ISO date string (YYYY-MM-DD). */
export function localDayStamp(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Record that the passcode gate was satisfied for `userId` today. */
export function markUnlockedToday(userId: number): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(UNLOCK_KEY, JSON.stringify({ userId, day: localDayStamp() }));
  } catch {
    /* storage unavailable (private mode) — the gate just shows again */
  }
}

/** True when the passcode gate was already satisfied for `userId` on this local day. */
export function isUnlockedToday(userId: number): boolean {
  if (!isBrowser()) return false;
  try {
    const raw = localStorage.getItem(UNLOCK_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { userId?: number; day?: string };
    return parsed.userId === userId && parsed.day === localDayStamp();
  } catch {
    return false;
  }
}

/** Clear the daily-unlock marker (on logout or passcode disable). */
export function clearUnlock(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(UNLOCK_KEY);
  } catch {
    /* ignore */
  }
}

/** Remember (non-sensitive) who last used this device, for a friendlier gate. */
export function rememberUser(userId: number, label: string): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(REMEMBERED_KEY, JSON.stringify({ userId, label }));
  } catch {
    /* ignore */
  }
}

export function getRememberedUser(): { userId: number; label: string } | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(REMEMBERED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: number; label?: string };
    if (typeof parsed.userId === "number" && typeof parsed.label === "string") {
      return { userId: parsed.userId, label: parsed.label };
    }
    return null;
  } catch {
    return null;
  }
}

export function forgetUser(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(REMEMBERED_KEY);
  } catch {
    /* ignore */
  }
}
