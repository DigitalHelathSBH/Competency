"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebar } from "../context/SidebarContext";

type IconProps = React.SVGProps<SVGSVGElement>;

const IconBase = ({ children, ...props }: IconProps & { children: React.ReactNode }) => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
);


const BrandLogo = ({ compact = false }: { compact?: boolean }) => (
  <div className="flex items-center gap-3">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white shadow-sm">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect x="5" y="11" width="3" height="7" rx="1.2" fill="currentColor" />
        <rect x="10.5" y="6" width="3" height="12" rx="1.2" fill="currentColor" />
        <rect x="16" y="9" width="3" height="9" rx="1.2" fill="currentColor" />
      </svg>
    </span>

    {!compact && (
      <span className="min-w-0">
        <span className="block truncate text-lg font-semibold leading-5 text-gray-900 dark:text-white">
          Competency
        </span>
        <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
          Assessment
        </span>
      </span>
    )}
  </div>
);

const DashboardIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path
      d="M4.75 4.75h5.5v5.5h-5.5v-5.5ZM13.75 4.75h5.5v5.5h-5.5v-5.5ZM4.75 13.75h5.5v5.5h-5.5v-5.5ZM13.75 13.75h5.5v5.5h-5.5v-5.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </IconBase>
);

const EvaluateIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path
      d="M8.4 4.75h7.2M9 3.75h6a1.2 1.2 0 0 1 1.2 1.2v1.3H7.8v-1.3A1.2 1.2 0 0 1 9 3.75Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M6.25 6.25h11.5a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5H6.25a1.5 1.5 0 0 1-1.5-1.5v-11a1.5 1.5 0 0 1 1.5-1.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M8.4 13.1l2 2 5.2-5.2"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </IconBase>
);

const CalendarIcon = (props: IconProps) => (
  <IconBase {...props}>
    <rect x="4.75" y="5.75" width="14.5" height="13.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 3.75v4M16 3.75v4M4.75 10h14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M8 13.25h2.2M13.8 13.25H16M8 16.4h2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </IconBase>
);

const UserAdminIcon = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="9.5" cy="8.5" r="3" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M4.25 18.5c.9-3 2.75-4.45 5.25-4.45 1.35 0 2.5.42 3.45 1.25"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M16.25 13.4l3.25 1.25v2.2c0 2.05-1.2 3.3-3.25 4.15-2.05-.85-3.25-2.1-3.25-4.15v-2.2l3.25-1.25Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </IconBase>
);

const ReadinessIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path
      d="M12 3.75 19.25 7v5.35c0 4.1-2.7 6.7-7.25 8.05-4.55-1.35-7.25-3.95-7.25-8.05V7L12 3.75Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M8.5 12.25 11 14.75l4.75-5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </IconBase>
);

const IssueIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path
      d="M7 3.75h7.2L19 8.55v11.7H7V3.75Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M14 4v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M12 11.25v3.25M12 17.2h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </IconBase>
);

const RankGroupIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path
      d="M12 4.25 20 8.5l-8 4.25L4 8.5l8-4.25Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M4 12.25 12 16.5l8-4.25M4 16 12 20.25 20 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </IconBase>
);

const QuestionIcon = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M9.55 9.15c.35-1.25 1.35-2.05 2.75-2.05 1.55 0 2.7.95 2.7 2.35 0 1.15-.65 1.8-1.75 2.45-.85.5-1.25.95-1.25 1.85v.25M12 17.1h.01"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </IconBase>
);

const DescriptionIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path
      d="M6.5 4.25h8.25l2.75 2.75v12.75h-11V4.25Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path d="M14.5 4.5v3h3M9 11.25h6M9 14.35h6M9 17.45h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </IconBase>
);

const EmployeeIcon = (props: IconProps) => (
  <IconBase {...props}>
    <rect x="4.75" y="5.25" width="14.5" height="13.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="10" cy="10.1" r="2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M7.25 15.25c.55-1.65 1.5-2.45 2.75-2.45s2.2.8 2.75 2.45M14.8 10.25h2.1M14.8 13.25h2.1M14.8 16.25h2.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </IconBase>
);

const AssignmentIcon = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="8.75" cy="8.25" r="2.75" stroke="currentColor" strokeWidth="1.6" />
    <path d="M4.25 18.25c.8-3 2.3-4.45 4.5-4.45 1.5 0 2.7.68 3.55 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M14.25 8.25h5.5M14.25 12h5.5M15 17.1l1.65 1.65 3.1-3.25" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </IconBase>
);

const WeightIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M12 4.25v15.5M7 7.25h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M7 7.25 4.75 12h4.5L7 7.25ZM17 7.25 14.75 12h4.5L17 7.25Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M8.25 19.75h7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </IconBase>
);

const ReportIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M5 19.25h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <rect x="6" y="11" width="2.75" height="6.25" rx="1" stroke="currentColor" strokeWidth="1.6" />
    <rect x="10.65" y="7" width="2.75" height="10.25" rx="1" stroke="currentColor" strokeWidth="1.6" />
    <rect x="15.3" y="4.75" width="2.75" height="12.5" rx="1" stroke="currentColor" strokeWidth="1.6" />
  </IconBase>
);


type NavItem = {
  name: string;
  path: string;
  badgeType?: "readiness" | "issues";
};

type NavGroup = {
  name: string;
  icon: React.ReactNode;
  items: NavItem[];
};

type RoundStatusSummary = {
  ok: boolean;
  has_draft_round: boolean;
  readiness_ready: boolean;
  blocking_issue_count: number;
  warning_issue_count: number;
  issue_count: number;
};

type CurrentUser = {
  full_name: string;
  emp_id: string;
  is_admin: boolean;
};

const mainItems: Array<NavItem & { icon: React.ReactNode }> = [
  { icon: <DashboardIcon />, name: "หน้าหลัก", path: "/dashboard" },
  { icon: <EvaluateIcon />, name: "รายการประเมิน", path: "/evaluations" },
];

const evaluatorReportItem: NavItem & { icon: React.ReactNode } = {
  icon: <ReportIcon />,
  name: "รายงานผล",
  path: "/reports",
};

const adminGroups: NavGroup[] = [
  {
    name: "รอบและความพร้อม",
    icon: <ReadinessIcon />,
    items: [
      { name: "รอบประเมิน", path: "/admin/rounds" },
      {
        name: "ตรวจสอบความพร้อมเปิดรอบ",
        path: "/admin/round-readiness",
        badgeType: "readiness",
      },
      {
        name: "รายการที่ต้องแก้ไข",
        path: "/admin/round-issues",
        badgeType: "issues",
      },
      { name: "ผู้ใช้งานระบบ", path: "/admin/admin-users" },
    ],
  },
  {
    name: "ตั้งค่าการประเมิน",
    icon: <QuestionIcon />,
    items: [
      { name: "หัวข้อประเมิน", path: "/admin/questions" },
      { name: "คำอธิบายหัวข้อ", path: "/admin/question-descriptions" },
      { name: "น้ำหนักคะแนน", path: "/admin/evaluator-weights" },
    ],
  },
  {
    name: "บุคลากรและสิทธิ์",
    icon: <EmployeeIcon />,
    items: [
      { name: "กลุ่มระดับ", path: "/admin/rank-groups" },
      { name: "หน่วยเบิกที่ไม่ประเมิน", path: "/admin/section-exclusions" },
      { name: "ผู้ถูกประเมิน", path: "/admin/round-employees" },
      { name: "กำหนดผู้ประเมิน", path: "/admin/assignments" },
    ],
  },
  {
    name: "รายงาน",
    icon: <ReportIcon />,
    items: [{ name: "รายงานผล", path: "/admin/reports" }],
  },
];

const ChevronDownIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path
      d="m7.5 9.25 4.5 4.5 4.5-4.5"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </IconBase>
);

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [roundStatusSummary, setRoundStatusSummary] =
    useState<RoundStatusSummary | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data?.user) setUser(data.user);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user?.is_admin) {
      setRoundStatusSummary(null);
      return;
    }

    let active = true;
    fetch("/api/admin/round-status-summary", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data?.ok) setRoundStatusSummary(data);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [user?.is_admin]);

  const showText = isExpanded || isHovered || isMobileOpen;

  const visibleMainItems = useMemo(() => {
    if (user && !user.is_admin) return [...mainItems, evaluatorReportItem];
    return mainItems;
  }, [user]);

  const visibleAdminGroups = useMemo(() => {
    if (!user?.is_admin) return [];
    return adminGroups;
  }, [user?.is_admin]);

  const isActive = (path: string) =>
    pathname === path || pathname.startsWith(`${path}/`);

  const isGroupActive = (group: NavGroup) =>
    group.items.some((item) => isActive(item.path));

  const getItemBadge = (item: NavItem) => {
    if (!roundStatusSummary?.has_draft_round) return null;

    if (item.badgeType === "readiness" && !roundStatusSummary.readiness_ready) {
      return "ไม่พร้อม";
    }

    if (
      item.badgeType === "issues" &&
      Number(roundStatusSummary.issue_count || 0) > 0
    ) {
      const issueCount = Number(roundStatusSummary.issue_count || 0);
      return issueCount > 99 ? "99+" : issueCount.toLocaleString();
    }

    return null;
  };

  const getGroupBadge = (group: NavGroup) => {
    for (const item of group.items) {
      const badge = getItemBadge(item);
      if (badge) return badge;
    }
    return null;
  };

  const renderMainItem = (item: NavItem & { icon: React.ReactNode }) => {
    const active = isActive(item.path);

    return (
      <li key={item.path}>
        <Link
          href={item.path}
          className={`menu-item group relative ${active ? "menu-item-active" : "menu-item-inactive"} ${
            !isExpanded && !isHovered ? "lg:justify-center" : "lg:justify-start"
          }`}
        >
          <span
            className={active ? "menu-item-icon-active" : "menu-item-icon-inactive"}
          >
            {item.icon}
          </span>

          {showText && <span className="menu-item-text flex-1">{item.name}</span>}
        </Link>
      </li>
    );
  };

  const renderChildItem = (item: NavItem) => {
    const active = isActive(item.path);
    const badgeText = getItemBadge(item);

    return (
      <li key={item.path}>
        <Link
          href={item.path}
          className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            active
              ? "bg-brand-50 text-brand-500 dark:bg-brand-500/[0.12] dark:text-brand-400"
              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
          }`}
        >
          <span className="truncate">{item.name}</span>
          {badgeText && (
            <span className="ml-2 rounded-full bg-[#ed5565] px-2 py-0.5 text-[10px] font-semibold leading-4 text-white">
              {badgeText}
            </span>
          )}
        </Link>
      </li>
    );
  };

  const renderAdminGroup = (group: NavGroup) => {
    const active = isGroupActive(group);
    const badgeText = getGroupBadge(group);
    const groupOpen = showText && (openGroups[group.name] ?? active);

    return (
      <li key={group.name}>
        <button
          type="button"
          onClick={() =>
            setOpenGroups((current) => ({
              ...current,
              [group.name]: !(current[group.name] ?? active),
            }))
          }
          className={`menu-item group relative w-full ${active ? "menu-item-active" : "menu-item-inactive"} ${
            !isExpanded && !isHovered ? "lg:justify-center" : "lg:justify-start"
          }`}
          title={!showText ? group.name : undefined}
        >
          <span
            className={active ? "menu-item-icon-active" : "menu-item-icon-inactive"}
          >
            {group.icon}
          </span>

          {showText && (
            <>
              <span className="menu-item-text flex-1 text-left">{group.name}</span>
              {badgeText && (
                <span className="ml-2 rounded-full bg-[#ed5565] px-2 py-0.5 text-[10px] font-semibold leading-4 text-white">
                  {badgeText}
                </span>
              )}
              <span
                className={`ml-2 text-gray-400 transition-transform ${
                  groupOpen ? "rotate-180" : ""
                }`}
              >
                <ChevronDownIcon className="h-4 w-4" />
              </span>
            </>
          )}

          {!showText && badgeText && (
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#ed5565] ring-2 ring-white dark:ring-gray-900" />
          )}
        </button>

        {groupOpen && (
          <ul className="mt-2 flex flex-col gap-1 pl-9 pr-1">
            {group.items.map(renderChildItem)}
          </ul>
        )}
      </li>
    );
  };

  return (
    <aside
      className={`fixed left-0 top-0 z-50 mt-16 flex h-screen flex-col border-r border-gray-200 bg-white px-5 text-gray-900 transition-all duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-900 lg:mt-0 ${
        isExpanded || isMobileOpen
          ? "w-[290px]"
          : isHovered
            ? "w-[290px]"
            : "w-[90px]"
      } ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`flex py-8 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
      >
        <Link href="/dashboard" aria-label="Competency Assessment">
          <BrandLogo compact={!(isExpanded || isHovered || isMobileOpen)} />
        </Link>
      </div>

      <div className="no-scrollbar flex flex-col overflow-y-auto duration-300 ease-linear">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2
                className={`mb-4 flex text-xs uppercase leading-5 text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
              >
                {showText ? "เมนูหลัก" : "..."}
              </h2>
              <ul className="flex flex-col gap-4">
                {visibleMainItems.map(renderMainItem)}
              </ul>
            </div>

            {visibleAdminGroups.length > 0 && (
              <div>
                <h2
                  className={`mb-4 flex text-xs uppercase leading-5 text-gray-400 ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-start"}`}
                >
                  {showText ? "ผู้ดูแลระบบ" : "..."}
                </h2>
                <ul className="flex flex-col gap-3">
                  {visibleAdminGroups.map(renderAdminGroup)}
                </ul>
              </div>
            )}
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
