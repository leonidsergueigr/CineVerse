"use client";

import {
  Check,
  LoaderCircle,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
  DEFAULT_PROFILE_ID,
  MAX_PROFILES,
  PROFILE_COLORS,
} from "@/lib/profile-constants";
import type { Profile } from "@/lib/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ProfilesResponse = {
  items: Profile[];
  activeProfileId: string;
};

export function ProfileSwitcher({ open, onOpenChange }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] =
    useState(DEFAULT_PROFILE_ID);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PROFILE_COLORS[0]);
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
        if (!active) return;
        setError(errorMessage(loadError));
      });
    return () => {
      active = false;
    };
  }, []);

  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];

  async function activateProfile(profileId: string) {
    if (profileId === activeProfileId || busyId) {
      onOpenChange(false);
      return;
    }
    setBusyId(profileId);
    setError("");
    try {
      const response = await fetch("/api/profiles", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: profileId, activate: true }),
      });
      await expectSuccess(response);
      window.location.reload();
    } catch (activateError) {
      setError(errorMessage(activateError));
      setBusyId(null);
    }
  }

  async function createNewProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyId) return;
    setBusyId("new");
    setError("");
    try {
      const response = await fetch("/api/profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      await expectSuccess(response);
      window.location.reload();
    } catch (createError) {
      setError(errorMessage(createError));
      setBusyId(null);
    }
  }

  async function removeProfile(profile: Profile) {
    if (
      profile.id === DEFAULT_PROFILE_ID ||
      busyId ||
      !window.confirm(
        `Supprimer le profil « ${profile.name} » et toutes ses donnees personnelles ?`,
      )
    ) {
      return;
    }
    setBusyId(profile.id);
    setError("");
    try {
      const response = await fetch("/api/profiles", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: profile.id }),
      });
      await expectSuccess(response);
      if (profile.id === activeProfileId) {
        window.location.reload();
        return;
      }
      const data = await fetchProfiles();
      setProfiles(data.items);
      setActiveProfileId(data.activeProfileId);
      setBusyId(null);
    } catch (deleteError) {
      setError(errorMessage(deleteError));
      setBusyId(null);
    }
  }

  return (
    <div className="relative ml-1 shrink-0">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label={`Profil actif : ${activeProfile?.name ?? "Principal"}`}
        aria-expanded={open}
        className={`inline-flex h-10 items-center gap-2 rounded-full px-1.5 transition sm:px-2.5 ${
          open ? "bg-white text-black" : "text-zinc-300 hover:bg-white/10"
        }`}
      >
        <ProfileAvatar
          name={activeProfile?.name ?? "Principal"}
          color={activeProfile?.color ?? PROFILE_COLORS[0]}
          small
        />
        <span className="hidden max-w-24 truncate text-xs font-bold xl:block">
          {activeProfile?.name ?? "Principal"}
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(19rem,calc(100vw-1.5rem))] rounded border border-white/15 bg-[#111] p-2 shadow-2xl">
          <div className="px-2 pb-2 pt-1">
            <p className="text-[11px] font-bold uppercase text-zinc-500">
              Qui regarde ?
            </p>
          </div>

          <div className="grid gap-1">
            {profiles.map((profile) => {
              const active = profile.id === activeProfileId;
              const busy = busyId === profile.id;
              return (
                <div
                  key={profile.id}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center rounded ${
                    active ? "bg-white/10" : "hover:bg-white/[0.06]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void activateProfile(profile.id)}
                    disabled={Boolean(busyId)}
                    className="flex min-w-0 items-center gap-3 px-2 py-2 text-left disabled:opacity-60"
                  >
                    <ProfileAvatar name={profile.name} color={profile.color} />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">
                      {profile.name}
                    </span>
                    {busy ? (
                      <LoaderCircle className="h-4 w-4 animate-spin text-zinc-400" />
                    ) : active ? (
                      <Check className="h-4 w-4 text-[#e50914]" />
                    ) : null}
                  </button>
                  {profile.id !== DEFAULT_PROFILE_ID ? (
                    <button
                      type="button"
                      onClick={() => void removeProfile(profile)}
                      disabled={Boolean(busyId)}
                      aria-label={`Supprimer ${profile.name}`}
                      title={`Supprimer ${profile.name}`}
                      className="mr-1 inline-flex h-9 w-9 items-center justify-center rounded text-zinc-500 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          {creating ? (
            <form
              onSubmit={createNewProfile}
              className="mt-2 border-t border-white/10 px-2 pb-1 pt-3"
            >
              <label
                htmlFor="new-profile-name"
                className="mb-2 block text-xs font-bold text-zinc-400"
              >
                Nouveau profil
              </label>
              <input
                id="new-profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
                maxLength={24}
                placeholder="Nom du profil"
                className="h-10 w-full rounded border border-white/15 bg-[#202020] px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-[#e50914]"
              />
              <div className="mt-3 flex items-center gap-2">
                {PROFILE_COLORS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setColor(item)}
                    aria-label={`Choisir la couleur ${item}`}
                    aria-pressed={color === item}
                    className={`h-7 w-7 rounded-full border-2 transition ${
                      color === item
                        ? "border-white"
                        : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                    style={{ backgroundColor: item }}
                  />
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setError("");
                  }}
                  className="h-9 rounded bg-white/[0.06] text-xs font-bold text-zinc-300 hover:bg-white/10"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={name.trim().length < 2 || Boolean(busyId)}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded bg-[#e50914] text-xs font-bold text-white transition hover:bg-[#f6121d] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyId === "new" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Creer
                </button>
              </div>
            </form>
          ) : profiles.length < MAX_PROFILES ? (
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setError("");
              }}
              className="mt-2 inline-flex h-10 w-full items-center gap-3 border-t border-white/10 px-3 pt-2 text-sm font-bold text-zinc-300 transition hover:text-white"
            >
              <Plus className="h-4 w-4" />
              Nouveau profil
            </button>
          ) : (
            <p className="mt-2 border-t border-white/10 px-3 pt-3 text-xs text-zinc-500">
              Limite de {MAX_PROFILES} profils atteinte.
            </p>
          )}

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

async function expectSuccess(response: Response) {
  const body = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Operation impossible.");
  return body;
}

async function fetchProfiles() {
  const response = await fetch("/api/profiles", { cache: "no-store" });
  if (!response.ok) throw new Error("Impossible de charger les profils.");
  return (await response.json()) as ProfilesResponse;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operation impossible.";
}
