"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type LoadingSource = "navigation" | "form";

const MIN_VISIBLE_MS = 450;
const SLOW_NOTICE_MS = 12000;
const MAX_VISIBLE_MS = 120000;

function isModifiedClick(event: MouseEvent) {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

function isInsideOverlay(node: Node | null) {
  if (!(node instanceof Element)) return false;

  return Boolean(
    node.closest("[data-global-loading-overlay='true']"),
  );
}

export default function GlobalLoadingOverlay() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(
    "ระบบได้รับคำสั่งแล้ว กำลังประมวลผล กรุณารอสักครู่",
  );

  const sourceRef = useRef<LoadingSource>("navigation");
  const startedAtRef = useRef(0);
  const startUrlRef = useRef("");
  const mutationTimerRef = useRef<number | null>(null);

  const finishLoading = useCallback(() => {
    if (mutationTimerRef.current !== null) {
      window.clearTimeout(mutationTimerRef.current);
      mutationTimerRef.current = null;
    }

    setIsLoading(false);
    setMessage(
      "ระบบได้รับคำสั่งแล้ว กำลังประมวลผล กรุณารอสักครู่",
    );
  }, []);

  const beginLoading = useCallback(
    (
      source: LoadingSource,
      nextMessage = "ระบบได้รับคำสั่งแล้ว กำลังประมวลผล กรุณารอสักครู่",
    ) => {
      sourceRef.current = source;
      startedAtRef.current = Date.now();
      startUrlRef.current = window.location.href;
      setMessage(nextMessage);
      setIsLoading(true);
    },
    [],
  );

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (event.defaultPrevented || isModifiedClick(event)) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      if (
        anchor.dataset.noGlobalLoading === "true" ||
        anchor.hasAttribute("download") ||
        anchor.target === "_blank"
      ) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      let destination: URL;

      try {
        destination = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (destination.origin !== window.location.origin) {
        return;
      }

      const current = new URL(window.location.href);

      if (
        destination.pathname === current.pathname &&
        destination.search === current.search &&
        destination.hash === current.hash
      ) {
        return;
      }

      beginLoading(
        "navigation",
        "กำลังเปิดหน้าใหม่ ระบบกำลังประมวลผล กรุณารอสักครู่",
      );
    }

    function handleDocumentSubmit(event: SubmitEvent) {
      if (event.defaultPrevented) return;

      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      if (form.dataset.noGlobalLoading === "true") {
        return;
      }

      beginLoading(
        "form",
        "ระบบได้รับคำสั่งแล้ว กำลังบันทึกและประมวลผล กรุณารอสักครู่",
      );
    }

    function handlePageShow() {
      finishLoading();
    }

    function handlePopState() {
      beginLoading(
        "navigation",
        "กำลังเปิดหน้าที่เลือก ระบบกำลังประมวลผล กรุณารอสักครู่",
      );
    }

    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("submit", handleDocumentSubmit, true);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener(
        "click",
        handleDocumentClick,
        true,
      );
      document.removeEventListener(
        "submit",
        handleDocumentSubmit,
        true,
      );
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [beginLoading, finishLoading]);

  useEffect(() => {
    if (!isLoading) return;

    const urlTimer = window.setInterval(() => {
      if (
        startUrlRef.current &&
        window.location.href !== startUrlRef.current
      ) {
        window.setTimeout(finishLoading, 120);
      }
    }, 50);

    const slowTimer = window.setTimeout(() => {
      setMessage(
        "รายการนี้ใช้เวลานานกว่าปกติ ระบบยังคงประมวลผลอยู่ กรุณารอสักครู่",
      );
    }, SLOW_NOTICE_MS);

    const maximumTimer = window.setTimeout(() => {
      finishLoading();
    }, MAX_VISIBLE_MS);

    let observer: MutationObserver | null = null;
    let observerStartTimer: number | null = null;

    /*
      Server Action บางรายการประมวลผลเสร็จในหน้าเดิม
      URL จึงไม่เปลี่ยน ใช้การเปลี่ยนแปลงของเนื้อหาหน้าเป็นสัญญาณ
      สำหรับซ่อน Loading หลังผลลัพธ์ถูกแสดงแล้ว
    */
    if (sourceRef.current === "form") {
      observerStartTimer = window.setTimeout(() => {
        observer = new MutationObserver((mutations) => {
          const hasPageMutation = mutations.some((mutation) => {
            if (isInsideOverlay(mutation.target)) return false;

            return (
              Array.from(mutation.addedNodes).some(
                (node) => !isInsideOverlay(node),
              ) ||
              Array.from(mutation.removedNodes).some(
                (node) => !isInsideOverlay(node),
              ) ||
              mutation.type === "characterData" ||
              mutation.type === "attributes"
            );
          });

          if (!hasPageMutation) return;

          if (mutationTimerRef.current !== null) {
            window.clearTimeout(mutationTimerRef.current);
          }

          const elapsed = Date.now() - startedAtRef.current;
          const remaining = Math.max(
            MIN_VISIBLE_MS - elapsed,
            0,
          );

          mutationTimerRef.current = window.setTimeout(
            finishLoading,
            remaining + 180,
          );
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
        });
      }, 250);
    }

    return () => {
      window.clearInterval(urlTimer);
      window.clearTimeout(slowTimer);
      window.clearTimeout(maximumTimer);

      if (observerStartTimer !== null) {
        window.clearTimeout(observerStartTimer);
      }

      observer?.disconnect();
    };
  }, [finishLoading, isLoading]);

  if (!isLoading) return null;

  return (
    <div
      data-global-loading-overlay="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-950/35 px-4 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/70 bg-white p-7 text-center shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-500/15">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-brand-100 border-t-brand-500 dark:border-brand-500/20 dark:border-t-brand-400" />
        </div>

        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          กำลังประมวลผล
        </h2>

        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
          {message}
        </p>

        <div className="mt-5 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500 [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500 [animation-delay:300ms]" />
        </div>

        <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
          กรุณาอย่าปิดหน้าต่างหรือกดปุ่มซ้ำ
        </p>
      </div>
    </div>
  );
}