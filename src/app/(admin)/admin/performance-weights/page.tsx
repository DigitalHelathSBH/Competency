import { requireAdminSession } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PerformanceWeightsRedirectPage() {
  await requireAdminSession();
  redirect("/admin/site-percents");
}