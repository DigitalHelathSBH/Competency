"use client";

import React, { useEffect, useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";

type CurrentUser = {
  full_name: string;
  emp_id: string;
  payroll_no: string;
  is_admin: boolean;
};

function getUserPhotoUrl(user: CurrentUser | null) {
  const empId = String(user?.emp_id || user?.payroll_no || "").trim().toUpperCase();
  if (!empId) return "/images/user/owner.jpg";
  return `http://10.0.255.1/pic/${encodeURIComponent(empId)}.jpg`;
}

export default function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => undefined);
  }, []);

  function toggleDropdown(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  }

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="relative">
      <button onClick={toggleDropdown} className="flex items-center text-gray-700 dark:text-gray-400 dropdown-toggle">
        <span className="mr-3 overflow-hidden rounded-full h-11 w-11 bg-gray-100 dark:bg-gray-800">
          <img
            src={getUserPhotoUrl(user)}
            alt={user?.full_name || "User"}
            className="h-11 w-11 object-cover"
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = "/images/user/owner.jpg";
            }}
          />
        </span>

        <span className="block mr-1 max-w-[160px] truncate font-medium text-theme-sm">
          {user?.full_name || "ผู้ใช้งาน"}
        </span>

        <svg
          className={`stroke-gray-500 transition-transform duration-200 dark:stroke-gray-400 ${isOpen ? "rotate-180" : ""}`}
          width="18"
          height="20"
          viewBox="0 0 18 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M4.3125 8.65625L9 13.3437L13.6875 8.65625" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="absolute right-0 mt-[17px] flex w-[280px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
      >
        <div className="border-b border-gray-200 pb-3 dark:border-gray-800">
          <span className="block font-medium text-gray-700 text-theme-sm dark:text-gray-400">
            {user?.full_name || "ผู้ใช้งาน"}
          </span>
          <span className="mt-0.5 block text-theme-xs text-gray-500 dark:text-gray-400">
            {user?.emp_id || "-"} {user?.is_admin ? "• Admin" : "• Evaluator"}
          </span>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="mt-3 flex items-center gap-3 rounded-lg px-3 py-2 text-left font-medium text-gray-700 text-theme-sm hover:bg-gray-100 hover:text-gray-700 disabled:opacity-60 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
        >
          <span>ออกจากระบบ</span>
        </button>
      </Dropdown>
    </div>
  );
}
