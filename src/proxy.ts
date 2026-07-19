import { NextRequest, NextResponse } from "next/server";

/**
 * Route protection (production only). When `NEXT_PUBLIC_DEMO_MODE=false`, users
 * without the `pph-authed` presence cookie are redirected to `/login`. This is a
 * server-side backstop; the authoritative check is the JWT on every API call and
 * the client-side `AuthGate`. The cookie carries no sensitive value.
 */

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

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
