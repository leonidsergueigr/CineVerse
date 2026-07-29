import "server-only";

import { cookies } from "next/headers";
import { PROFILE_COOKIE_NAME } from "@/lib/profile-constants";
import { getProfileIdForSession } from "@/lib/store";

export async function getActiveProfileId() {
  const sessionToken = (await cookies()).get(PROFILE_COOKIE_NAME)?.value;
  return getProfileIdForSession(sessionToken);
}
