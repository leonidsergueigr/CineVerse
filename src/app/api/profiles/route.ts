import { NextRequest, NextResponse } from "next/server";
import { getActiveProfileId } from "@/lib/active-profile";
import { PROFILE_COOKIE_NAME } from "@/lib/profile-constants";
import {
  createProfileSession,
  createProfile,
  deleteProfile,
  getProfile,
  getProfiles,
  updateProfile,
  revokeProfileSession,
  verifyProfilePin,
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
      pin: typeof body.pin === "string" ? body.pin : undefined,
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

    const activeProfileId = await getActiveProfileId();
    const suppliedPin = String(body.pin ?? "");
    const requiresPin =
      current.hasPin &&
      (body.activate === true || activeProfileId !== profileId);
    if (requiresPin && !verifyProfilePin(profileId, suppliedPin)) {
      return pinError();
    }

    const shouldUpdate =
      typeof body.name === "string" ||
      typeof body.color === "string" ||
      typeof body.newPin === "string" ||
      body.removePin === true;
    const profile = shouldUpdate
      ? updateProfile(profileId, {
          name: typeof body.name === "string" ? body.name : undefined,
          color: typeof body.color === "string" ? body.color : undefined,
          pin:
            body.removePin === true
              ? null
              : typeof body.newPin === "string" && body.newPin.trim()
                ? body.newPin
                : undefined,
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
    const profile = getProfile(profileId);
    if (!profile) {
      return noStoreResponse({ error: "Profil introuvable." }, { status: 404 });
    }
    if (
      profile.hasPin &&
      activeProfileId !== profileId &&
      !verifyProfilePin(profileId, String(body.pin ?? ""))
    ) {
      return pinError();
    }
    const deleted = deleteProfile(profileId);
    if (!deleted) {
      return noStoreResponse({ error: "Profil introuvable." }, { status: 404 });
    }

    const response = noStoreResponse({ ok: true });
    if (profileId === activeProfileId) {
      response.cookies.delete(PROFILE_COOKIE_NAME);
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
  revokeProfileSession(request.cookies.get(PROFILE_COOKIE_NAME)?.value);
  response.cookies.set(PROFILE_COOKIE_NAME, createProfileSession(profileId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
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

function pinError() {
  return noStoreResponse(
    { error: "Code PIN incorrect." },
    { status: 403 },
  );
}
