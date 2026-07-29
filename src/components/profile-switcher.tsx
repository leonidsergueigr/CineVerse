"use client";

import {
  Check,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Settings,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { MAX_PROFILES } from "@/lib/profile-constants";
import type { Profile } from "@/lib/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ProfilesResponse = {
  items: Profile[];
  activeProfileId: string | null;
};

export function ProfileSwitcher({ open, onOpenChange }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetchProfiles()
      .then((data) => {
        if (!active) return;
        setProfiles(data.items);
        setActiveProfileId(data.activeProfileId);
      })
      .catch((loadError) => {
        if (active) setError(errorMessage(loadError));
      });
    return () => {
      active = false;
    };
  }, []);

  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileId) ?? null;

  async function chooseProfile(profile: Profile) {
    if (profile.id === activeProfileId) {
      onOpenChange(false);
      return;
    }
    const nextPath = `${window.location.pathname}${window.location.search}`;
    if (profile.hasPin) {
      window.location.assign(
        `/profiles?profile=${encodeURIComponent(profile.id)}&next=${encodeURIComponent(nextPath)}`,
      );
      return;
    }

    setBusyId(profile.id);
    setError("");
    try {
      const response = await fetch("/api/profiles", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: profile.id, activate: true }),
      });
      await expectSuccess(response);
      window.location.reload();
    } catch (chooseError) {
      setError(errorMessage(chooseError));
      setBusyId(null);
    }
  }

  function openProfilePage(action: "create" | "manage") {
    const destination = `${window.location.pathname}${window.location.search}`;
    window.location.assign(
      `/profiles?${action}=1&next=${encodeURIComponent(destination)}`,
    );
  }

  return (
    <div className="relative ml-1 shrink-0">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label={`Profil actif : ${activeProfile?.name ?? "Profil"}`}
        aria-expanded={open}
        className={`inline-flex h-10 items-center gap-2 rounded-full px-1.5 transition sm:px-2.5 ${
          open ? "bg-white text-black" : "text-zinc-300 hover:bg-white/10"
        }`}
      >
        <ProfileAvatar
          name={activeProfile?.name ?? ""}
          color={activeProfile?.color ?? "#292929"}
          small
        />
        <span className="hidden max-w-24 truncate text-xs font-bold xl:block">
          {activeProfile?.name ?? "Profil"}
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(19rem,calc(100vw-1.5rem))] rounded border border-white/15 bg-[#111] p-2 shadow-2xl">
          <div className="px-2 pb-2 pt-1">
            <p className="text-[11px] font-bold uppercase text-zinc-500">
              Changer de profil
            </p>
          </div>

          <div className="grid gap-1">
            {profiles.map((profile) => {
              const active = profile.id === activeProfileId;
              const busy = busyId === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => void chooseProfile(profile)}
                  disabled={Boolean(busyId)}
                  className={`flex min-w-0 items-center gap-3 rounded px-2 py-2 text-left transition disabled:opacity-60 ${
                    active ? "bg-white/10" : "hover:bg-white/[0.06]"
                  }`}
                >
                  <ProfileAvatar name={profile.name} color={profile.color} />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">
                    {profile.name}
                  </span>
                  {busy ? (
                    <LoaderCircle className="h-4 w-4 animate-spin text-zinc-400" />
                  ) : active ? (
                    <Check className="h-4 w-4 text-[#e50914]" />
                  ) : profile.hasPin ? (
                    <LockKeyhole className="h-4 w-4 text-zinc-500" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-2 grid border-t border-white/10 pt-2">
            {profiles.length < MAX_PROFILES ? (
              <button
                type="button"
                onClick={() => openProfilePage("create")}
                className="inline-flex h-10 items-center gap-3 rounded px-3 text-sm font-bold text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
              >
                <Plus className="h-4 w-4" />
                Nouveau profil
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => openProfilePage("manage")}
              className="inline-flex h-10 items-center gap-3 rounded px-3 text-sm font-bold text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
            >
              <Settings className="h-4 w-4" />
              Gerer les profils
            </button>
          </div>

          {error ? (
            <p role="alert" className="px-2 pb-1 pt-2 text-xs text-red-400">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProfileAvatar({
  name,
  color,
  small = false,
}: {
  name: string;
  color: string;
  small?: boolean;
}) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-black text-white shadow-inner ${
        small ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-sm"
      }`}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase() || (
        <UserRound className="h-4 w-4" />
      )}
    </span>
  );
}

async function fetchProfiles() {
  const response = await fetch("/api/profiles", { cache: "no-store" });
  if (!response.ok) throw new Error("Impossible de charger les profils.");
  return (await response.json()) as ProfilesResponse;
}

async function expectSuccess(response: Response) {
  const body = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Operation impossible.");
  return body;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operation impossible.";
}
