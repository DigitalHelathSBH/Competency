import { NextResponse } from "next/server";
import { loginWithEmp } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = String(body.username || "").trim();
    const password = String(body.password || "").trim();

    if (!username || !password) {
      return NextResponse.json({ ok: false, message: "กรุณากรอกรหัสเจ้าหน้าที่และรหัสผ่าน" }, { status: 400 });
    }

    const user = await loginWithEmp(username, password);
    if (!user) {
      return NextResponse.json({ ok: false, message: "รหัสเจ้าหน้าที่หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
    }

    await setSessionCookie(user);
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, message: "ไม่สามารถเข้าสู่ระบบได้ กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูล" }, { status: 500 });
  }
}
