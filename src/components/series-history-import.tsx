"use client";

import { Check, ChevronLeft, History, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  buildHistoryImportEpisodes,
  historyImportSummary,
  type HistoryImportMode,
} from "@/lib/history-import";
import type { MediaDetails, SeriesProgressSummary } from "@/lib/types";

type Props = {
  detail: MediaDetails;
  currentSeason: number;
  currentEpisode: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (input: {
    seriesProgress: SeriesProgressSummary | null;
    currentEpisodeImported: boolean;
    episodeCount: number;
  }) => void;
};

const MODE_OPTIONS: Array<{ id: HistoryImportMode; label: string }> = [
  { id: "previous-episodes", label: "Les episodes precedents" },
  { id: "current-season", label: "Toute cette saison" },
  { id: "previous-seasons", label: "Les saisons precedentes" },
  { id: "whole-series", label: "Toute la serie" },
  { id: "selected", label: "Choisir precisement" },
];

export function SeriesHistoryImport({
  detail,
  currentSeason,
  currentEpisode,
  open,
  onOpenChange,
  onImported,
}: Props) {
  const seasons = useMemo(
    () =>
      (detail.seasons ?? [])
        .filter((item) => item.seasonNumber > 0 && item.episodeCount > 0)
        .sort((left, right) => left.seasonNumber - right.seasonNumber),
    [detail.seasons],
  );
  const [mode, setMode] = useState<HistoryImportMode>("previous-episodes");
  const [sentiment, setSentiment] = useState<"liked" | "neutral" | "disliked">(
    "neutral",
  );
  const [preciseSeason, setPreciseSeason] = useState(currentSeason);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const preciseSeasonInfo =
    seasons.find((item) => item.seasonNumber === preciseSeason) ?? seasons[0];
  const selectedEpisodes = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, included]) => included)
        .map(([key]) => {
          const [seasonNumber, episodeNumber] = key.split(":").map(Number);
          return { seasonNumber, episodeNumber };
        }),
    [selected],
  );
  const episodes = useMemo(
    () =>
      buildHistoryImportEpisodes({
        mode,
        seasons,
        currentSeason,
        currentEpisode,
        selectedEpisodes,
      }),
    [currentEpisode, currentSeason, mode, seasons, selectedEpisodes],
  );
  const summary = historyImportSummary(episodes);

  if (!open) return null;

  function close() {
    if (submitting) return;
    setConfirming(false);
    setError("");
    onOpenChange(false);
  }

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/history/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tmdbId: detail.id,
          mode,
          currentSeason,
          currentEpisode,
          selectedEpisodes,
          sentiment,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        episodeCount?: number;
        seriesProgress?: SeriesProgressSummary | null;
      };
      if (!response.ok) throw new Error(payload.error ?? "Import impossible.");
      onImported({
        seriesProgress: payload.seriesProgress ?? null,
        currentEpisodeImported: episodes.some(
          (item) =>
            item.seasonNumber === currentSeason &&
            item.episodeNumber === currentEpisode,
        ),
        episodeCount: payload.episodeCount ?? episodes.length,
      });
      setConfirming(false);
      setError("");
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import impossible.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-import-title"
      className="fixed inset-0 z-[110] grid place-items-center bg-black/85 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/15 bg-[#141414] p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase text-zinc-500">
              Historique du profil
            </p>
            <h2 id="history-import-title" className="mt-1 text-2xl font-black">
              {confirming ? "Verifier l'import" : "J'ai deja regarde..."}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="inline-flex h-9 w-9 items-center justify-center rounded text-zinc-400 ring-1 ring-white/15 hover:bg-white/10 hover:text-white"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {confirming ? (
          <div className="mt-7">
            <div className="rounded border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm text-zinc-300">Cette action marquera :</p>
              <p className="mt-3 text-3xl font-black">
                {summary.episodeCount} episode{summary.episodeCount > 1 ? "s" : ""}
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                dans {summary.seasonCount} saison{summary.seasonCount > 1 ? "s" : ""}
              </p>
              <p className="mt-5 border-t border-white/10 pt-4 text-sm font-semibold text-[#f5c542]">
                Aucun temps de visionnage ne sera ajoute.
              </p>
            </div>
            <p className="mt-4 text-sm text-zinc-400">
              Le statut « vu » servira a la progression et retirera ces contenus
              des recommandations. Votre souvenir ne cree qu&apos;un signal global
              pour la serie.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {MODE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setMode(option.id);
                    setError("");
                  }}
                  className={`flex min-h-11 items-center justify-between rounded px-3 text-left text-sm font-semibold ring-1 transition ${
                    mode === option.id
                      ? "bg-white/15 text-white ring-white/30"
                      : "bg-white/[0.03] text-zinc-300 ring-white/10 hover:bg-white/[0.07]"
                  }`}
                >
                  {option.label}
                  {mode === option.id ? <Check className="h-4 w-4" /> : null}
                </button>
              ))}
            </div>

            {mode === "selected" && preciseSeasonInfo ? (
              <div className="mt-5 rounded border border-white/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold">Episodes a importer</p>
                  <select
                    value={preciseSeasonInfo.seasonNumber}
                    onChange={(event) => setPreciseSeason(Number(event.target.value))}
                    className="control-field h-9 min-w-28"
                    aria-label="Saison a selectionner"
                  >
                    {seasons.map((item) => (
                      <option key={item.id} value={item.seasonNumber}>
                        Saison {item.seasonNumber}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-8">
                  {Array.from(
                    { length: preciseSeasonInfo.episodeCount },
                    (_, index) => index + 1,
                  ).map((episodeNumber) => {
                    const key = `${preciseSeasonInfo.seasonNumber}:${episodeNumber}`;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() =>
                          setSelected((current) => ({
                            ...current,
                            [key]: !current[key],
                          }))
                        }
                        aria-pressed={Boolean(selected[key])}
                        className={`h-9 rounded text-xs font-bold ring-1 ${
                          selected[key]
                            ? "bg-[#e50914] text-white ring-[#e50914]"
                            : "bg-white/[0.04] text-zinc-300 ring-white/10 hover:bg-white/10"
                        }`}
                      >
                        E{episodeNumber}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <fieldset className="mt-6">
              <legend className="text-xs font-bold uppercase text-zinc-500">
                Quel souvenir en gardez-vous ?
              </legend>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {([
                  ["liked", "J'ai aime"],
                  ["neutral", "Neutre"],
                  ["disliked", "Pas pour moi"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSentiment(value)}
                    aria-pressed={sentiment === value}
                    className={`min-h-10 rounded px-2 text-xs font-bold ring-1 ${
                      sentiment === value
                        ? "bg-white/15 text-white ring-white/30"
                        : "text-zinc-400 ring-white/10 hover:bg-white/[0.05]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-5 flex items-center gap-3 rounded bg-[#f5c542]/10 p-3 text-sm text-[#f5c542] ring-1 ring-[#f5c542]/20">
              <History className="h-4 w-4 shrink-0" />
              {summary.episodeCount} episode{summary.episodeCount > 1 ? "s" : ""} selectionne{summary.episodeCount > 1 ? "s" : ""}. Aucun temps ne sera ajoute.
            </div>
          </>
        )}

        {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
        <div className="mt-7 flex flex-wrap justify-end gap-3">
          {confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="inline-flex h-10 items-center gap-2 rounded px-4 text-sm font-bold text-zinc-300 ring-1 ring-white/15 hover:bg-white/[0.06]"
            >
              <ChevronLeft className="h-4 w-4" />
              Modifier
            </button>
          ) : (
            <button
              type="button"
              onClick={close}
              className="h-10 rounded px-4 text-sm font-bold text-zinc-400 hover:text-white"
            >
              Annuler
            </button>
          )}
          <button
            type="button"
            disabled={!episodes.length || submitting}
            onClick={() => (confirming ? void submit() : setConfirming(true))}
            className="h-10 rounded bg-[#e50914] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting
              ? "Import..."
              : confirming
                ? "Confirmer l'import"
                : "Verifier l'import"}
          </button>
        </div>
      </div>
    </div>
  );
}
