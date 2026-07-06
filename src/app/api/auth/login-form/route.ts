import { NextResponse } from "next/server";
import { loginWithEmp } from "@/lib/auth";
import {
  createSessionToken,
  getSessionCookieName,
  getSessionMaxAgeSeconds,
} from "@/lib/session-core";

function shouldUseSecureCookie() {
  const cookieSecure = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (cookieSecure === "true") return true;
  if (cookieSecure === "false") return false;

  const appUrl = process.env.APP_URL?.trim().toLowerCase() || "";
  return appUrl.startsWith("https://");
}

function normalizeRedirect(value: FormDataEntryValue | null) {
  const redirect = String(value || "/dashboard").trim();
  if (!redirect.startsWith("/") || redirect.startsWith("//")) return "/dashboard";
  return redirect;
}

function redirectToLogin(request: Request, error: "required" | "invalid" | "system", redirect: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", error);
  url.searchParams.set("redirect", redirect);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: Request) {
  let redirect = "/dashboard";

  try {
    const formData = await request.formData();
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "").trim();
    redirect = normalizeRedirect(formData.get("redirect"));

    if (!username || !password) {
      return redirectToLogin(request, "required", redirect);
    }

    const user = await loginWithEmp(username, password);
    if (!user) {
      return redirectToLogin(request, "invalid", redirect);
    }

    const token = await createSessionToken(user);
    const response = NextResponse.redirect(new URL(redirect, request.url), { status: 303 });

    response.cookies.set(getSessionCookieName(), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: shouldUseSecureCookie(),
      maxAge: getSessionMaxAgeSeconds(),
      path: "/",
    });

    return response;
  } catch (error) {
    console.error(error);
    return redirectToLogin(request, "system", redirect);
  }
}
