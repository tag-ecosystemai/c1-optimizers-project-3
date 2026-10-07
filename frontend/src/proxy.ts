import { NextResponse, type NextRequest } from "next/server";
import { canAccess, homeFor, isAppPath } from "@/lib/auth/routes";
import { decrypt, SESSION_COOKIE } from "@/lib/auth/session";

// Optimistic redirects from the cookie alone (no fetching). The role layouts and the backend are the real gates.
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await decrypt(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    return session ? NextResponse.redirect(new URL(homeFor(session.role, session.viewAs), req.url)) : NextResponse.next();
  }
  if (!isAppPath(pathname)) return NextResponse.next();

  if (!session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (!canAccess(pathname, session.role, session.viewAs)) {
    return NextResponse.redirect(new URL(homeFor(session.role, session.viewAs), req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/ops/:path*", "/warehouse/:path*", "/my/:path*", "/observability/:path*"],
};
