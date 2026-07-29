import { NextRequest, NextResponse } from "next/server";
import { getActiveProfileId } from "@/lib/active-profile";
import {
  DEFAULT_PROFILE_ID,
  PROFILE_COOKIE_NAME,
} from "@/lib/profile-constants";
import {
  createProfile,
  deleteProfile,
  getProfile,
  getProfiles,
  updateProfile,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return noStoreResponse({
    items: getProfiles(),
    activeProfileId: await getActiveProfileId(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const profile = createProfile({
      name: String(body.name ?? ""),
      color: typeof body.color === "string" ? body.color : undefined,
    });
    const response = noStoreResponse({ profile }, { status: 201 });
    setProfileCookie(response, request, profile.id);
    return response;
  } catch (error) {
    return profileError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const profileId = String(body.id ?? "");
    const current = getProfile(profileId);
    if (!current) {
      return noStoreResponse({ error: "Profil introuvable." }, { status: 404 });
    }

    const shouldUpdate =
      typeof body.name === "string" || typeof body.color === "string";
    const profile = shouldUpdate
      ? updateProfile(profileId, {
          name: typeof body.name === "string" ? body.name : undefined,
          color: typeof body.color === "string" ? body.color : undefined,
        })
      : current;
    const response = noStoreResponse({ profile });
    if (body.activate === true) {
      setProfileCookie(response, request, profileId);
    }
    return response;
  } catch (error) {
    return profileError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const profileId = String(body.id ?? "");
    const activeProfileId = await getActiveProfileId();
    const deleted = deleteProfile(profileId);
    if (!deleted) {
      return noStoreResponse({ error: "Profil introuvable." }, { status: 404 });
    }

    const response = noStoreResponse({ ok: true });
    if (profileId === activeProfileId) {
      setProfileCookie(response, request, DEFAULT_PROFILE_ID);
    }
    return response;
  } catch (error) {
    return profileError(error);
  }
}

function setProfileCookie(
  response: NextResponse,
  request: NextRequest,
  profileId: string,
) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  response.cookies.set(PROFILE_COOKIE_NAME, profileId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 5,
    secure:
      forwardedProtocol === "https" || request.nextUrl.protocol === "https:",
  });
}

function noStoreResponse(
  body: unknown,
  init?: { status?: number },
) {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "no-store" },
  });
}

function profileError(error: unknown) {
  return noStoreResponse(
    {
      error:
        error instanceof Error ? error.message : "Operation de profil impossible.",
    },
    { status: 400 },
  );
}
