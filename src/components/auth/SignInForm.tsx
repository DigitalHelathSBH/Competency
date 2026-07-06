"use client";

import Label from "@/components/form/Label";
import { useRouter } from "next/navigation";
import React, { FormEvent, useState } from "react";

type SignInFormProps = {
  initialRedirectTo?: string;
  initialErrorMessage?: string;
};

function normalizeRedirect(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function EyeOpenIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 4.25C5.95 4.25 3.35 7.08 2.3 8.56C1.69 9.43 1.69 10.57 2.3 11.44C3.35 12.92 5.95 15.75 10 15.75C14.05 15.75 16.65 12.92 17.7 11.44C18.31 10.57 18.31 9.43 17.7 8.56C16.65 7.08 14.05 4.25 10 4.25ZM10 13.25C8.21 13.25 6.75 11.79 6.75 10C6.75 8.21 8.21 6.75 10 6.75C11.79 6.75 13.25 8.21 13.25 10C13.25 11.79 11.79 13.25 10 13.25ZM10 11.75C10.97 11.75 11.75 10.97 11.75 10C11.75 9.03 10.97 8.25 10 8.25C9.03 8.25 8.25 9.03 8.25 10C8.25 10.97 9.03 11.75 10 11.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

function EyeClosedIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.28 2.22C2.99 1.93 2.51 1.93 2.22 2.22C1.93 2.51 1.93 2.99 2.22 3.28L16.72 17.78C17.01 18.07 17.49 18.07 17.78 17.78C18.07 17.49 18.07 17.01 17.78 16.72L15.28 14.22C16.36 13.42 17.18 12.43 17.7 11.69C18.31 10.82 18.31 9.68 17.7 8.81C16.65 7.33 14.05 4.5 10 4.5C8.73 4.5 7.6 4.78 6.62 5.22L3.28 2.22ZM8.08 6.68C8.65 6.4 9.3 6.25 10 6.25C12.9 6.25 15.04 8.15 16.48 10.03C16.59 10.17 16.59 10.33 16.48 10.47C15.98 11.12 15.23 11.9 14.28 12.56L12.6 10.88C12.7 10.61 12.75 10.31 12.75 10C12.75 8.48 11.52 7.25 10 7.25C9.69 7.25 9.39 7.3 9.12 7.4L8.08 6.68ZM3.52 8.81C4.04 8.07 4.86 7.08 5.94 6.28L7.08 7.42C5.98 8.13 5.25 9.37 5.25 10.75C5.25 12.82 6.93 14.5 9 14.5C10.38 14.5 11.62 13.77 12.33 12.67L13.47 13.81C12.49 14.25 11.32 14.5 10 14.5C7.1 14.5 4.96 12.6 3.52 10.72C3.41 10.58 3.41 10.42 3.52 10.28C3.85 9.85 4.25 9.38 4.72 8.94L3.52 8.81ZM7.75 10.75C7.75 10.06 8.06 9.44 8.55 9.03L10.72 11.2C10.31 11.69 9.69 12 9 12C8.31 12 7.75 11.44 7.75 10.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function SignInForm({
  initialRedirectTo = "/dashboard",
  initialErrorMessage = "",
}: SignInFormProps) {
  const router = useRouter();
  const redirectTo = normalizeRedirect(initialRedirectTo);
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState(initialErrorMessage);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);
    const formUsername = String(formData.get("username") || "").trim();
    const formPassword = String(formData.get("password") || "").trim();

    if (!formUsername || !formPassword) {
      setErrorMessage("กรุณากรอกรหัสเจ้าหน้าที่และรหัสผ่าน");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: formUsername, password: formPassword }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        setErrorMessage(data.message || "เข้าสู่ระบบไม่สำเร็จ");
        return;
      }

      router.replace(redirectTo);
      router.refresh();
    } catch {
      setErrorMessage("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full flex-1 flex-col lg:w-1/2">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              เข้าสู่ระบบ Competency
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              ใช้รหัสเจ้าหน้าที่และรหัสผ่านจากตาราง Emp
            </p>
          </div>

          {errorMessage && (
            <div className="mb-5 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
              {errorMessage}
            </div>
          )}

          <form method="post" action="/api/auth/login-form" onSubmit={handleSubmit}>
            <input type="hidden" name="redirect" value={redirectTo} />

            <div className="space-y-6">
              <div>
                <Label htmlFor="username">
                  รหัสเจ้าหน้าที่ <span className="text-error-500">*</span>
                </Label>
                <input
                  id="username"
                  name="username"
                  placeholder="เช่น 12345"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                />
              </div>

              <div>
                <Label htmlFor="password">
                  รหัสผ่าน <span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="กรอกรหัสผ่าน"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-12 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 z-30 -translate-y-1/2 cursor-pointer text-gray-500 dark:text-gray-400"
                    aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  >
                    {showPassword ? <EyeOpenIcon /> : <EyeClosedIcon />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 py-3.5 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300 disabled:opacity-50"
              >
                {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
