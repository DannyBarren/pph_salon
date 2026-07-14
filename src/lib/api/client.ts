/**
 * Typed fetch client for the FastAPI backend.
 *
 * Responsibilities:
 *  - Attach the JWT `Authorization: Bearer` header from stored tokens.
 *  - Transparently refresh an expired access token (single-flight) on a 401 and
 *    retry the original request once.
 *  - Normalise errors into a rich `ApiError` (status + parsed detail).
 *
 * Token storage: access + refresh tokens live in `localStorage` (a secure-enough
 * fallback for this app; swap for httpOnly cookies behind a BFF if required). A
 * lightweight, non-sensitive presence cookie (`pph-authed`) is also written so
 * the Next.js middleware can gate routes server-side without reading the token.
 */

import { API_V1_URL } from "@/lib/featureFlags";

const ACCESS_KEY = "pph-access-token";
const REFRESH_KEY = "pph-refresh-token";
const AUTH_COOKIE = "pph-authed";

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export const tokenStore = {
  getAccess(): string | null {
    return isBrowser() ? localStorage.getItem(ACCESS_KEY) : null;
  },
  getRefresh(): string | null {
    return isBrowser() ? localStorage.getItem(REFRESH_KEY) : null;
  },
  set(access: string, refresh: string): void {
    if (!isBrowser()) return;
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    // Presence marker for middleware (no sensitive value). 14-day max-age.
    document.cookie = `${AUTH_COOKIE}=1; path=/; max-age=${14 * 24 * 3600}; SameSite=Lax`;
  },
  clear(): void {
    if (!isBrowser()) return;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  },
  isAuthenticated(): boolean {
    return !!tokenStore.getAccess();
  },
};

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refresh = tokenStore.getRefresh();
  if (!refresh) return false;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_V1_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) {
        tokenStore.clear();
        return false;
      }
      const data = (await res.json()) as { access_token: string; refresh_token: string };
      tokenStore.set(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Skip auth header + refresh (used by login/refresh themselves). */
  auth?: boolean;
  /** Return the raw Response instead of parsed JSON (e.g. CSV downloads). */
  raw?: boolean;
}

async function parseError(res: Response): Promise<ApiError> {
  let detail: unknown = null;
  let message = `Request failed (${res.status})`;
  try {
    const data = await res.json();
    detail = data;
    if (data && typeof data === "object" && "detail" in data) {
      const d = (data as { detail: unknown }).detail;
      message = typeof d === "string" ? d : JSON.stringify(d);
    }
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(res.status, message, detail);
}

async function doFetch(path: string, opts: RequestOptions): Promise<Response> {
  const { body, auth = true, headers, ...rest } = opts;
  delete (rest as { raw?: boolean }).raw;
  const finalHeaders = new Headers(headers);
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) finalHeaders.set("Content-Type", "application/json");
  if (auth) {
    const token = tokenStore.getAccess();
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  }
  return fetch(`${API_V1_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
}

/** Core request helper: JSON in, JSON (or raw) out, with 401 refresh+retry. */
export async function apiRequest<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await doFetch(path, opts);

  if (res.status === 401 && opts.auth !== false) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch(path, opts);
    }
  }

  if (!res.ok) throw await parseError(res);
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("application/json") ? JSON.parse(text) : text) as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => apiRequest<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "PUT", body }),
  del: <T>(path: string, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "DELETE" }),
};
