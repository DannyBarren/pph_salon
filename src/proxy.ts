import { NextRequest, NextResponse } from "next/server";
import { DEMO_MODE } from "@/lib/featureFlags";

/**
 * Route protection (live mode). When Demo is off (the default — only the exact
 * string `NEXT_PUBLIC_DEMO_MODE=true` turns it on), users without the
 * `pph-authed` presence cookie are redirected to `/login`. This is a
 * server-side backstop; the authoritative check is the JWT on every API call and
 * the client-side `AuthGate`. The cookie carries no sensitive value.
 */

// Paths that never require auth.
const PUBLIC_PATHS = ["/login", "/register", "/setup", "/accept-invite"];

export function proxy(req: NextRequest) {
  if (DEMO_MODE) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const authed = req.cookies.get("pph-authed")?.value === "1";
  if (!authed) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Skip Next internals, API routes, and static assets (incl. PWA files).
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons|robots.txt).*)",
  ],
};
