import { NextRequest, NextResponse } from "next/server";
import { getSessionCookieName, isStaffOnly, STAFF_HOME_PATH, verifySessionToken } from "./lib/session-core";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const publicRoutes = ["/login"];

// บุคลากรทั่วไปเข้าได้เฉพาะหน้าแบบสรุปผลของตัวเอง และ API ที่ใช้ดูข้อมูล session
const staffAllowedRoutes = [STAFF_HOME_PATH, "/api/auth/me"];

function matches(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicRoute = publicRoutes.some((route) => matches(pathname, route));
  const token = request.cookies.get(getSessionCookieName())?.value;
  const session = await verifySessionToken(token);
  const homePath = session && isStaffOnly(session) ? STAFF_HOME_PATH : "/dashboard";

  if (isPublicRoute && session) {
    return NextResponse.redirect(new URL(`${basePath}${homePath}`, request.url));
  }

  if (!isPublicRoute && !session) {
    const loginUrl = new URL(`${basePath}/login`, request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (session && isStaffOnly(session) && !staffAllowedRoutes.some((route) => matches(pathname, route))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, message: "ไม่มีสิทธิ์" }, { status: 403 });
    }
    return NextResponse.redirect(new URL(`${basePath}${STAFF_HOME_PATH}`, request.url));
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
