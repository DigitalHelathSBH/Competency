import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AppSession,
  createSessionToken,
  getSessionCookieName,
  getSessionMaxAgeSeconds,
  verifySessionToken,
} from "./session-core";

function shouldUseSecureCookie() {
  const cookieSecure = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (cookieSecure === "true") return true;
  if (cookieSecure === "false") return false;

  const appUrl = process.env.APP_URL?.trim().toLowerCase() || "";
  if (appUrl.startsWith("https://")) return true;

  return false;
}

export async function getSession(): Promise<AppSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  return verifySessionToken(token);
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdminSession() {
  const session = await requireSession();
  if (!session.is_admin) redirect("/dashboard");
  return session;
}

export async function setSessionCookie(session: Omit<AppSession, "exp">) {
  const token = await createSessionToken(session);
  const cookieStore = await cookies();

  cookieStore.set(getSessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    maxAge: getSessionMaxAgeSeconds(),
    path: "/",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(getSessionCookieName());
}
