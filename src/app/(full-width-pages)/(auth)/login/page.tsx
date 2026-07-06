import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login | Competency Assessment",
  description: "เข้าสู่ระบบประเมิน Competency",
};

type LoginPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeRedirect(value: string | string[] | undefined) {
  const redirect = firstParam(value) || "/dashboard";
  if (!redirect.startsWith("/") || redirect.startsWith("//")) return "/dashboard";
  return redirect;
}

function getErrorMessage(value: string | string[] | undefined) {
  const error = firstParam(value);

  if (error === "required") return "กรุณากรอกรหัสเจ้าหน้าที่และรหัสผ่าน";
  if (error === "invalid") return "รหัสเจ้าหน้าที่หรือรหัสผ่านไม่ถูกต้อง หรือยังไม่มีสิทธิ์เข้าใช้งานระบบ";
  if (error === "system") return "ไม่สามารถเข้าสู่ระบบได้ กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูล";

  return "";
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await Promise.resolve(searchParams || {});

  return (
    <SignInForm
      initialRedirectTo={normalizeRedirect(params.redirect)}
      initialErrorMessage={getErrorMessage(params.error)}
    />
  );
}
