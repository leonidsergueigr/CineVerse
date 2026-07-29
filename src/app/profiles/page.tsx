import type { Metadata } from "next";
import { ProfileHub } from "@/components/profile-hub";
import { getActiveProfileId } from "@/lib/active-profile";
import { getProfiles } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profils",
};

type PageProps = {
  searchParams: Promise<{
    next?: string;
    manage?: string;
    create?: string;
    profile?: string;
  }>;
};

export default async function ProfilesPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const profiles = getProfiles();
  const activeProfileId = await getActiveProfileId();

  return (
    <ProfileHub
      initialProfiles={profiles}
      activeProfileId={activeProfileId}
      nextPath={safeNextPath(query.next)}
      initialMode={
        !profiles.length || query.create === "1"
          ? "create"
          : query.manage === "1"
            ? "manage"
            : "select"
      }
      initialProfileId={
        profiles.find(
          (profile) => profile.id === query.profile && profile.hasPin,
        )?.id
      }
    />
  );
}

function safeNextPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
