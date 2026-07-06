"use client";

import { useEffect, useState } from "react";

type ActionAlertType = "success" | "error" | "warning" | "info";

type ActionAlertProps = {
  type?: string;
  message?: string;
};

function getAlertStyle(type: ActionAlertType) {
  if (type === "success") {
    return {
      icon: "✓",
      iconClass:
        "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
      title: "สำเร็จ",
      buttonClass: "bg-green-600 hover:bg-green-700",
      borderClass: "border-green-200 dark:border-green-500/30",
      textClass: "text-green-700 dark:text-green-300",
    };
  }

  if (type === "warning") {
    return {
      icon: "!",
      iconClass:
        "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
      title: "แจ้งเตือน",
      buttonClass: "bg-yellow-500 hover:bg-yellow-600",
      borderClass: "border-yellow-200 dark:border-yellow-500/30",
      textClass: "text-yellow-700 dark:text-yellow-300",
    };
  }

  if (type === "info") {
    return {
      icon: "i",
      iconClass:
        "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
      title: "ข้อมูล",
      buttonClass: "bg-blue-600 hover:bg-blue-700",
      borderClass: "border-blue-200 dark:border-blue-500/30",
      textClass: "text-blue-700 dark:text-blue-300",
    };
  }

  return {
    icon: "×",
    iconClass: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    title: "ไม่สามารถดำเนินการได้",
    buttonClass: "bg-red-600 hover:bg-red-700",
    borderClass: "border-red-200 dark:border-red-500/30",
    textClass: "text-red-700 dark:text-red-300",
  };
}

export default function ActionAlert({ type, message }: ActionAlertProps) {
  const [open, setOpen] = useState(false);

  const alertType: ActionAlertType =
    type === "success" ||
    type === "warning" ||
    type === "info" ||
    type === "error"
      ? type
      : "info";

  const style = getAlertStyle(alertType);

  function clearAlertUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("alert_type");
    url.searchParams.delete("alert_message");

    window.history.replaceState({}, "", url.toString());
  }

  function closeAlert() {
    setOpen(false);
    clearAlertUrl();
  }

  useEffect(() => {
    if (!message) return;

    setOpen(true);

    if (alertType === "success") {
      const timer = window.setTimeout(() => {
        setOpen(false);
        clearAlertUrl();
      }, 2500);

      return () => window.clearTimeout(timer);
    }
  }, [message, alertType]);

  if (!message || !open) return null;

  if (alertType === "success") {
    return (
      <div className="fixed right-5 top-5 z-[99999] w-full max-w-sm">
        <div className="flex items-start gap-3 rounded-xl border border-[#1ab394] bg-[#1ab394] p-4 shadow-lg">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-bold text-white">
            {style.icon}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-white">
              {style.title}
            </h3>
            <p className="mt-1 text-sm leading-5 text-white/90">
              {message}
            </p>
          </div>

          <button
            type="button"
            onClick={closeAlert}
            className="text-lg leading-none text-white/80 hover:text-white"
            aria-label="ปิดแจ้งเตือน"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900">
        <div className="flex flex-col items-center text-center">
          <div
            className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl font-bold ${style.iconClass}`}
          >
            {style.icon}
          </div>

          <h3 className="mb-2 text-xl font-semibold text-gray-800 dark:text-white/90">
            {style.title}
          </h3>

          <p className="mb-6 whitespace-pre-line text-sm leading-6 text-gray-600 dark:text-gray-300">
            {message}
          </p>

          <button
            type="button"
            onClick={closeAlert}
            className={`h-11 min-w-28 rounded-lg px-5 text-sm font-medium text-white ${style.buttonClass}`}
          >
            ตกลง
          </button>
        </div>
      </div>
    </div>
  );
}