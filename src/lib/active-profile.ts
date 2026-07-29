import "server-only";

import { cookies } from "next/headers";
import { DEFAULT_PROFILE_ID, PROFILE_COOKIE_NAME } from "@/lib/profile-constants";
import { getProfile } from "@/lib/store";

export async function getActiveProfileId() {
  const requestedProfileId = (await cookies()).get(PROFILE_COOKIE_NAME)?.value;
  if (!requestedProfileId) return DEFAULT_PROFILE_ID;
  return getProfile(requestedProfileId)?.id ?? DEFAULT_PROFILE_ID;
}
