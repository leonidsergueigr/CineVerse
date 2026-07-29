"use client";

import {
  ArrowLeft,
  Check,
  LockKeyhole,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import {
  MAX_PROFILES,
  PROFILE_COLORS,
  PROFILE_PIN_LENGTH,
} from "@/lib/profile-constants";
import type { Profile } from "@/lib/types";

type HubMode = "select" | "manage" | "create" | "edit" | "delete" | "unlock";

type Props = {
  initialProfiles: Profile[];
  activeProfileId: string | null;
  nextPath: string;
  initialMode: HubMode;
  initialProfileId?: string;
};

export function ProfileHub({
  initialProfiles,
  activeProfileId: initialActiveProfileId,
  nextPath,
  initialMode,
  initialProfileId,
}: Props) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [activeProfileId, setActiveProfileId] = useState(
    initialActiveProfileId,
  );
  const initialProfile = initialProfiles.find(
    (profile) => profile.id === initialProfileId,
  );
  const [mode, setMode] = useState<HubMode>(
    initialProfile ? "unlock" : initialMode,
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialProfile?.id ?? null,
  );
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(PROFILE_COLORS[0]);
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [removePin, setRemovePin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  function resetForm() {
    setName("");
    setColor(PROFILE_COLORS[0]);
    setPin("");
    setNewPin("");
    setRemovePin(false);
    setError("");
    setSelectedId(null);
  }

  function openCreate() {
    resetForm();
    setMode("create");
  }

  function openEdit(profile: Profile) {
    resetForm();
    setSelectedId(profile.id);
    setName(profile.name);
    setColor(profile.color);
    setMode("edit");
  }

  function openDelete(profile: Profile) {
    resetForm();
    setSelectedId(profile.id);
    setMode("delete");
  }

  function returnToProfiles() {
    resetForm();
    setMode(profiles.length ? "manage" : "create");
  }

  function finishManaging() {
    if (activeProfileId) {
      window.location.assign(nextPath);
      return;
    }
    setMode("select");
  }

  async function chooseProfile(profile: Profile) {
    setSelectedId(profile.id);
    setError("");
    if (profile.hasPin) {
      setPin("");
      setMode("unlock");
      return;
    }
    await activateProfile(profile.id, "");
  }

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProfile) return;
    await activateProfile(selectedProfile.id, pin);
  }

  async function activateProfile(profileId: string, profilePin: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/profiles", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: profileId,
          activate: true,
          pin: profilePin,
        }),
      });
      await expectSuccess(response);
      window.location.assign(nextPath);
    } catch (activationError) {
      setError(errorMessage(activationError));
      setBusy(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const editing = mode === "edit" && selectedProfile;
      const response = await fetch("/api/profiles", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          editing
            ? {
                id: selectedProfile.id,
                name,
                color,
                pin,
                newPin,
                removePin,
              }
            : { name, color, pin: newPin },
        ),
      });
      const data = (await expectSuccess(response)) as { profile: Profile };
      if (!editing) {
        window.location.assign(nextPath);
        return;
      }

      setProfiles((items) =>
        items.map((profile) =>
          profile.id === data.profile.id ? data.profile : profile,
        ),
      );
      resetForm();
      setMode("manage");
      setBusy(false);
    } catch (saveError) {
      setError(errorMessage(saveError));
      setBusy(false);
    }
  }

  async function confirmDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProfile) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/profiles", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: selectedProfile.id, pin }),
      });
      await expectSuccess(response);
      const remaining = profiles.filter(
        (profile) => profile.id !== selectedProfile.id,
      );
      setProfiles(remaining);
      if (activeProfileId === selectedProfile.id) {
        setActiveProfileId(null);
      }
      resetForm();
      setMode(remaining.length ? "manage" : "create");
      setBusy(false);
    } catch (deleteError) {
      setError(errorMessage(deleteError));
      setBusy(false);
    }
  }

  const formMode = mode === "create" || mode === "edit";
  const heading =
    mode === "manage"
      ? "Gerer les profils"
      : mode === "create"
        ? profiles.length
          ? "Nouveau profil"
          : "Creez votre profil"
        : mode === "edit"
          ? "Modifier le profil"
          : mode === "delete"
            ? "Supprimer le profil"
            : mode === "unlock"
              ? selectedProfile?.name ?? "Profil protege"
              : "Qui regarde ?";

  return (
    <main className="flex min-h-screen flex-col overflow-hidden bg-[#050505] text-white">
      <header className="flex h-20 items-center justify-center border-b border-white/10 px-5">
        <div className="text-2xl font-black text-[#e50914] sm:text-3xl">
          CineVerse
        </div>
      </header>

      <section className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-5 py-10 sm:px-8">
        {(formMode || mode === "delete" || mode === "unlock") &&
        profiles.length ? (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setMode(initialActiveProfileId ? "manage" : "select");
            }}
            aria-label="Retour aux profils"
            className="absolute left-5 top-6 inline-flex h-10 w-10 items-center justify-center rounded border border-white/15 text-zinc-300 transition hover:bg-white/10 hover:text-white sm:left-8"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : null}

        <div className="w-full text-center">
          <h1 className="text-3xl font-bold sm:text-5xl">{heading}</h1>
          {mode === "create" && !profiles.length ? (
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">
              Vos recommandations, vos avis et vos reprises seront conserves
              dans ce profil.
            </p>
          ) : null}
        </div>

        {mode === "select" || mode === "manage" ? (
          <>
            <div className="mt-10 grid w-full grid-cols-2 justify-center gap-x-5 gap-y-8 sm:mt-14 sm:flex sm:flex-wrap sm:gap-8">
              {profiles.map((profile) => (
                <ProfileTile
                  key={profile.id}
                  profile={profile}
                  managing={mode === "manage"}
                  active={profile.id === activeProfileId}
                  onSelect={() =>
                    mode === "manage"
                      ? openEdit(profile)
                      : void chooseProfile(profile)
                  }
                  onDelete={() => openDelete(profile)}
                />
              ))}
              {profiles.length < MAX_PROFILES ? (
                <button
                  type="button"
                  onClick={openCreate}
                  className="group mx-auto w-full max-w-36 text-center sm:mx-0 sm:w-36"
                >
                  <span className="grid aspect-square w-full place-items-center rounded border border-dashed border-white/20 bg-white/[0.03] text-zinc-500 transition group-hover:border-white/45 group-hover:bg-white/[0.07] group-hover:text-white">
                    <Plus className="h-12 w-12" />
                  </span>
                  <span className="mt-3 block text-sm font-bold text-zinc-400 group-hover:text-white">
                    Ajouter
                  </span>
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() =>
                mode === "manage" ? finishManaging() : setMode("manage")
              }
              className="mt-12 h-11 rounded border border-white/20 px-6 text-sm font-bold text-zinc-300 transition hover:border-white/50 hover:text-white"
            >
              {mode === "manage" ? "Terminer" : "Gerer les profils"}
            </button>
          </>
        ) : null}

        {formMode ? (
          <form
            onSubmit={saveProfile}
            className="mt-9 w-full max-w-md rounded border border-white/12 bg-[#111] p-5 text-left shadow-2xl sm:p-7"
          >
            <ProfileFields
              name={name}
              color={color}
              newPin={newPin}
              removePin={removePin}
              hasExistingPin={Boolean(selectedProfile?.hasPin)}
              requiresCurrentPin={Boolean(
                selectedProfile?.hasPin &&
                  selectedProfile.id !== activeProfileId,
              )}
              currentPin={pin}
              onNameChange={setName}
              onColorChange={setColor}
              onNewPinChange={setNewPin}
              onCurrentPinChange={setPin}
              onRemovePinChange={setRemovePin}
            />
            <FormError error={error} />
            <button
              type="submit"
              disabled={
                busy ||
                name.trim().length < 2 ||
                (Boolean(newPin) && newPin.length !== PROFILE_PIN_LENGTH)
              }
              className="mt-6 h-11 w-full rounded bg-[#e50914] text-sm font-bold text-white transition hover:bg-[#f6121d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy
                ? "Enregistrement..."
                : mode === "edit"
                  ? "Enregistrer"
                  : "Creer le profil"}
            </button>
          </form>
        ) : null}

        {mode === "unlock" && selectedProfile ? (
          <form
            onSubmit={unlock}
            className="mt-9 w-full max-w-sm rounded border border-white/12 bg-[#111] p-6 text-center shadow-2xl"
          >
            <ProfileAvatar profile={selectedProfile} large />
            <label
              htmlFor="unlock-pin"
              className="mt-6 block text-sm font-bold text-zinc-300"
            >
              Code PIN
            </label>
            <PinInput id="unlock-pin" value={pin} onChange={setPin} autoFocus />
            <FormError error={error} />
            <button
              type="submit"
              disabled={busy || pin.length !== PROFILE_PIN_LENGTH}
              className="mt-5 h-11 w-full rounded bg-[#e50914] text-sm font-bold transition hover:bg-[#f6121d] disabled:opacity-50"
            >
              {busy ? "Verification..." : "Ouvrir le profil"}
            </button>
          </form>
        ) : null}

        {mode === "delete" && selectedProfile ? (
          <form
            onSubmit={confirmDelete}
            className="mt-9 w-full max-w-md rounded border border-red-500/30 bg-[#111] p-6 text-left shadow-2xl"
          >
            <p className="text-sm leading-6 text-zinc-300">
              L&apos;historique, les reprises, les likes, les dislikes et les
              recommandations de <strong>{selectedProfile.name}</strong>{" "}
              seront definitivement supprimes.
            </p>
            {selectedProfile.hasPin &&
            selectedProfile.id !== activeProfileId ? (
              <div className="mt-5">
                <label
                  htmlFor="delete-pin"
                  className="mb-2 block text-sm font-bold text-zinc-300"
                >
                  Code PIN actuel
                </label>
                <PinInput
                  id="delete-pin"
                  value={pin}
                  onChange={setPin}
                  autoFocus
                />
              </div>
            ) : null}
            <FormError error={error} />
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={returnToProfiles}
                className="h-11 rounded bg-white/[0.07] text-sm font-bold text-zinc-300 hover:bg-white/10"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={
                  busy ||
                  (selectedProfile.hasPin &&
                    selectedProfile.id !== activeProfileId &&
                    pin.length !== PROFILE_PIN_LENGTH)
                }
                className="h-11 rounded bg-[#e50914] text-sm font-bold hover:bg-[#f6121d] disabled:opacity-50"
              >
                {busy ? "Suppression..." : "Supprimer"}
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </main>
  );
}

function ProfileTile({
  profile,
  managing,
  active,
  onSelect,
  onDelete,
}: {
  profile: Profile;
  managing: boolean;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="relative mx-auto w-full max-w-36 sm:mx-0 sm:w-36">
      <button type="button" onClick={onSelect} className="group block w-full">
        <span className="relative block">
          <ProfileAvatar profile={profile} />
          {managing ? (
            <span className="absolute inset-0 grid place-items-center rounded bg-black/55 text-white">
              <Pencil className="h-8 w-8" />
            </span>
          ) : null}
          {active ? (
            <span className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-white text-black">
              <Check className="h-4 w-4" />
            </span>
          ) : null}
        </span>
        <span className="mt-3 flex min-w-0 items-center justify-center gap-1.5 text-sm font-bold text-zinc-400 transition group-hover:text-white">
          <span className="truncate">{profile.name}</span>
          {profile.hasPin ? (
            <LockKeyhole className="h-3.5 w-3.5 shrink-0" />
          ) : null}
        </span>
      </button>
      {managing ? (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Supprimer ${profile.name}`}
          title={`Supprimer ${profile.name}`}
          className="absolute right-2 top-2 z-10 grid h-9 w-9 place-items-center rounded bg-black/70 text-zinc-300 transition hover:bg-[#e50914] hover:text-white"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

function ProfileAvatar({
  profile,
  large = false,
}: {
  profile: Profile;
  large?: boolean;
}) {
  return (
    <span
      className={`relative mx-auto grid aspect-square place-items-center rounded font-black text-white ring-1 ring-white/10 transition ${
        large
          ? "w-28 text-5xl"
          : "w-full text-5xl hover:ring-2 hover:ring-white sm:text-6xl"
      }`}
      style={{ backgroundColor: profile.color }}
      aria-hidden="true"
    >
      {profile.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function ProfileFields({
  name,
  color,
  newPin,
  removePin,
  hasExistingPin,
  requiresCurrentPin,
  currentPin,
  onNameChange,
  onColorChange,
  onNewPinChange,
  onRemovePinChange,
  onCurrentPinChange,
}: {
  name: string;
  color: string;
  newPin: string;
  removePin: boolean;
  hasExistingPin: boolean;
  requiresCurrentPin: boolean;
  currentPin: string;
  onNameChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onNewPinChange: (value: string) => void;
  onRemovePinChange: (value: boolean) => void;
  onCurrentPinChange: (value: string) => void;
}) {
  return (
    <>
      <label htmlFor="profile-name" className="text-sm font-bold text-zinc-300">
        Nom
      </label>
      <input
        id="profile-name"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        autoFocus
        maxLength={24}
        placeholder="Nom du profil"
        className="mt-2 h-11 w-full rounded border border-white/15 bg-[#202020] px-3 text-sm outline-none placeholder:text-zinc-600 focus:border-[#e50914]"
      />

      <fieldset className="mt-5">
        <legend className="text-sm font-bold text-zinc-300">Couleur</legend>
        <div className="mt-3 flex flex-wrap gap-3">
          {PROFILE_COLORS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onColorChange(item)}
              aria-label={`Choisir la couleur ${item}`}
              aria-pressed={color === item}
              className={`h-9 w-9 rounded-full border-2 transition ${
                color === item
                  ? "border-white"
                  : "border-transparent opacity-70 hover:opacity-100"
              }`}
              style={{ backgroundColor: item }}
            />
          ))}
        </div>
      </fieldset>

      {requiresCurrentPin ? (
        <div className="mt-5">
          <label
            htmlFor="current-pin"
            className="text-sm font-bold text-zinc-300"
          >
            Code PIN actuel
          </label>
          <PinInput
            id="current-pin"
            value={currentPin}
            onChange={onCurrentPinChange}
          />
        </div>
      ) : null}

      <div className="mt-5">
        <label htmlFor="new-pin" className="text-sm font-bold text-zinc-300">
          {hasExistingPin ? "Nouveau code PIN" : "Code PIN facultatif"}
        </label>
        <div className="relative mt-2">
          <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            id="new-pin"
            type="password"
            inputMode="numeric"
            pattern={`[0-9]{${PROFILE_PIN_LENGTH}}`}
            maxLength={PROFILE_PIN_LENGTH}
            value={newPin}
            disabled={removePin}
            onChange={(event) =>
              onNewPinChange(event.target.value.replace(/\D/g, ""))
            }
            placeholder={
              hasExistingPin ? "Laisser vide pour conserver" : "4 chiffres"
            }
            className="h-11 w-full rounded border border-white/15 bg-[#202020] pl-10 pr-3 text-sm outline-none placeholder:text-zinc-600 focus:border-[#e50914] disabled:opacity-40"
          />
        </div>
      </div>

      {hasExistingPin ? (
        <label className="mt-4 flex cursor-pointer items-center gap-3 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={removePin}
            onChange={(event) => onRemovePinChange(event.target.checked)}
            className="h-4 w-4 accent-[#e50914]"
          />
          Retirer le code PIN
        </label>
      ) : null}
    </>
  );
}

function PinInput({
  id,
  value,
  onChange,
  autoFocus = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <input
      id={id}
      type="password"
      inputMode="numeric"
      pattern={`[0-9]{${PROFILE_PIN_LENGTH}}`}
      maxLength={PROFILE_PIN_LENGTH}
      value={value}
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
      placeholder="4 chiffres"
      className="mt-2 h-12 w-full rounded border border-white/15 bg-[#202020] px-4 text-center font-mono text-xl outline-none placeholder:text-sm placeholder:text-zinc-600 focus:border-[#e50914]"
    />
  );
}

function FormError({ error }: { error: string }) {
  return error ? (
    <p role="alert" className="mt-4 text-sm text-red-400">
      {error}
    </p>
  ) : null;
}

async function expectSuccess(response: Response) {
  const body = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Operation impossible.");
  return body;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operation impossible.";
}
