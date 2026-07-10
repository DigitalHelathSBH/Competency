import { NextRequest, NextResponse } from "next/server";
import { getSessionCookieName, verifySessionToken } from "./lib/session-core";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const publicRoutes = ["/login", "/signin"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicRoute = publicRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  const token = request.cookies.get(getSessionCookieName())?.value;
  const session = await verifySessionToken(token);

  if (isPublicRoute && session) {
    return NextResponse.redirect(new URL(`${basePath}/dashboard`, request.url));
  }

  if (!isPublicRoute && !session) {
    const loginUrl = new URL(`${basePath}/login`, request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/admin") && session && !session.is_admin) {
    return NextResponse.redirect(new URL(`${basePath}/dashboard`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/auth/login|api/auth/logout|_next/static|_next/image|favicon.ico|images|.*\\..*).*)",
  ],
};
