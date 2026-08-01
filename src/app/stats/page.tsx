import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileStatsDashboard } from "@/components/profile-stats-dashboard";
import { getActiveProfileId } from "@/lib/active-profile";
import { getProfileStats } from "@/lib/profile-statistics";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes statistiques",
};

export default async function StatsPage() {
  const profileId = await getActiveProfileId();
  if (!profileId) redirect("/profiles?next=%2Fstats");

  return <ProfileStatsDashboard stats={getProfileStats(profileId)} />;
}
