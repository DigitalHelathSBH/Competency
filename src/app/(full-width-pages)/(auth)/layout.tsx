import GridShape from "@/components/common/GridShape";
import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";
import Image from "next/image";
import React from "react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  return (
    <div className="relative z-1 bg-white p-6 dark:bg-gray-900 sm:p-0">
      <div className="relative flex h-screen w-full flex-col justify-center dark:bg-gray-900 lg:flex-row sm:p-0">
        {children}
        <div className="hidden h-full w-full items-center bg-brand-950 dark:bg-white/5 lg:grid lg:w-1/2">
          <div className="relative z-1 flex items-center justify-center">
            <GridShape />
            <div className="flex max-w-xs flex-col items-center">
              <Image
                width={80}
                height={80}
                src={`${basePath}/images/logo/logo-icon.svg`}
                alt="Competency"
                className="mb-5"
              />
              <h2 className="mb-3 text-center text-2xl font-semibold text-white">
                Competency Assessment
              </h2>
              <p className="text-center text-gray-400 dark:text-white/60">
                ระบบประเมินสมรรถนะบุคลากร แยกตามรอบการประเมินและผู้ประเมิน
              </p>
            </div>
          </div>
        </div>
        <div className="fixed bottom-6 right-6 z-50 hidden sm:block">
          <ThemeTogglerTwo />
        </div>
      </div>
    </div>
  );
}