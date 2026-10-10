import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

// A 401 from the API lands here: drop the stale cookie, then go to the login page.
export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/login?expired=1", req.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}