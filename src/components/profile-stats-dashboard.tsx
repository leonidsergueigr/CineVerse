import Link from "next/link";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Compass,
  Film,
  Flame,
  Gauge,
  History,
  Info,
  PlayCircle,
  Repeat2,
  Search,
  Sparkles,
  Target,
  Timer,
  Tv,
} from "lucide-react";
import { AnimatedStatValue } from "@/components/animated-stat-value";
import { ProfilePoster } from "@/components/profile-poster";
import { SiteHeader } from "@/components/site-header";
import type { ProfileStats } from "@/lib/types";

export function ProfileStatsDashboard({ stats }: { stats: ProfileStats }) {
  const {
    overview,
    habits,
    tastes,
    progress,
    recap,
    tracking,
    profile,
    intelligence,
  } = stats;
  const hasActivity =
    overview.completedMovies > 0 ||
    overview.completedEpisodes > 0 ||
    overview.startedSeries > 0;
  const heatmapWeeks =
    habits.activeDays < 8 ? 5 : habits.activeDays < 45 ? 13 : 52;
  const heatmapDays = intelligence.regularity.calendar.slice(
    -(heatmapWeeks * 7),
  );
  const heatmapTitle =
    heatmapWeeks === 5
      ? "Vos 5 dernieres semaines"
      : heatmapWeeks === 13
        ? "Votre trimestre"
        : "Votre annee de visionnage";

  return (
    <main className="min-h-screen bg-[#050505] pt-16 text-white">
      <SiteHeader />

      <header className="border-b border-white/10 bg-[#0b0b0b]">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-8 sm:px-6 lg:px-8">
          <span
            className="grid h-14 w-14 shrink-0 place-items-center rounded text-2xl font-black ring-1 ring-white/15"
            style={{ backgroundColor: profile.color }}
            aria-hidden="true"
          >
            {profile.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-zinc-500">
              Activite du profil
            </p>
            <h1 className="mt-1 truncate text-2xl font-black sm:text-3xl">
              Statistiques de {profile.name}
            </h1>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {tracking.isPartial || tracking.estimatedWatchSeconds > 0 ? (
          <div className="mb-7 flex items-start gap-3 rounded border border-amber-400/25 bg-amber-400/[0.07] p-4 text-sm text-zinc-300">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div className="min-w-0 leading-6">
              <p>
                <strong className="text-white">
                  Qualite des donnees : {qualityLabel(tracking.dataQuality)}.
                </strong>{" "}
                Une partie de votre activite a ete estimee.
              </p>
              <details className="mt-2 text-xs text-zinc-400">
                <summary className="cursor-pointer font-bold text-zinc-300">
                  Voir les details
                </summary>
                <div className="mt-2 space-y-1 border-l border-white/10 pl-3">
                  <p>
                    Confirme : {formatDuration(tracking.confirmedWatchSeconds)}
                  </p>
                  <p>
                    Estime : {formatDuration(tracking.estimatedWatchSeconds)}
                  </p>
                  <p>Marquages manuels : {tracking.manualCompletions}</p>
                  {tracking.untrackedReasons.map((reason) => (
                    <p key={reason.id}>
                      {reason.label} : {reason.count}
                    </p>
                  ))}
                </div>
              </details>
            </div>
          </div>
        ) : null}

        <nav
          aria-label="Sections des statistiques"
          className="scrollbar-none sticky top-16 z-30 mb-8 flex gap-2 overflow-x-auto border-y border-white/10 bg-[#080808]/95 py-3 backdrop-blur"
        >
          {[
            ["#overview-heading", "Vue d'ensemble"],
            ["#habits-heading", "Habitudes"],
            ["#tastes-heading", "Gouts"],
            ["#regularity-heading", "Regularite"],
            ["#series-heading", "Progression"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="shrink-0 rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-white/30 hover:text-white"
            >
              {label}
            </a>
          ))}
        </nav>

        <section aria-labelledby="overview-heading">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase text-zinc-500">
                Vue d&apos;ensemble
              </p>
              <h2 id="overview-heading" className="mt-1 text-xl font-bold">
                Votre activite
              </h2>
            </div>
            <span className="text-xs text-zinc-500">
              {tracking.measuredSessions} session
              {tracking.measuredSessions > 1 ? "s" : ""} suivie
              {tracking.measuredSessions > 1 ? "s" : ""}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={Clock3}
              label="Temps suivi ce mois"
              value={measuredDuration(
                overview.monthWatchSeconds,
                tracking.measuredSessions,
              )}
            />
            <StatCard
              icon={Film}
              label="Films termines"
              value={String(overview.completedMovies)}
            />
            <StatCard
              icon={Tv}
              label="Episodes termines"
              value={String(overview.completedEpisodes)}
            />
            <StatCard
              icon={Gauge}
              label="Completion moyenne"
              value={`${overview.averageCompletionPercent} %`}
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <SmallMetric
              label="Temps suivi total"
              value={measuredDuration(
                overview.totalWatchSeconds,
                tracking.measuredSessions,
              )}
            />
            <SmallMetric
              label="Cette semaine"
              value={measuredDuration(
                overview.weekWatchSeconds,
                tracking.measuredSessions,
              )}
            />
            <SmallMetric
              label="Titres termines"
              value={String(overview.completedTitles)}
            />
          </div>
        </section>

        <section className="mt-14" aria-labelledby="profile-heading">
          <SectionHeading
            eyebrow="Profil cinematographique"
            title="Votre signature CineVerse"
            id="profile-heading"
          />
          <div className="grid border border-white/10 bg-[#101010] lg:grid-cols-[1.4fr_.6fr]">
            <div className="p-5 sm:p-7">
              <div className="flex items-center gap-3">
                <Compass className="h-6 w-6 text-[#e50914]" />
                <span className="text-xs font-bold uppercase text-zinc-500">
                  {intelligence.cinemaProfile.confidence === "established"
                    ? "Profil consolide"
                    : "Profil en apprentissage"}
                </span>
              </div>
              <h3 className="mt-5 text-2xl font-black sm:text-3xl">
                {intelligence.cinemaProfile.title}
              </h3>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
                {intelligence.cinemaProfile.summary}
              </p>
              {intelligence.cinemaProfile.traits.length ? (
                <ul className="mt-6 flex flex-wrap gap-2">
                  {intelligence.cinemaProfile.traits.map((trait) => (
                    <li
                      key={trait}
                      className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-zinc-300"
                    >
                      {trait}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="border-t border-white/10 p-5 lg:border-l lg:border-t-0 lg:p-7">
              <Timer className="h-5 w-5 text-zinc-500" />
              <p className="mt-5 text-xs font-bold uppercase text-zinc-500">
                Duree adaptee a votre rythme
              </p>
              <p className="mt-2 text-3xl font-black">
                {intelligence.cinemaProfile.suggestedMinutes
                  ? `${intelligence.cinemaProfile.suggestedMinutes} min`
                  : "A determiner"}
              </p>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Calculee depuis vos sessions mesurees et les durees des contenus
                suivis.
              </p>
            </div>
          </div>
        </section>

        <div className="mt-14 grid gap-10 lg:grid-cols-[1.1fr_.9fr]">
          <section aria-labelledby="recap-heading">
            <SectionHeading
              eyebrow="CineVerse Recap"
              title={capitalize(recap.label)}
              id="recap-heading"
            />
            <div className="border border-white/10 bg-[#101010] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-3xl font-black">
                    {measuredDuration(
                      recap.watchSeconds,
                      tracking.measuredSessions,
                    )}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {tracking.measuredSessions
                      ? "de lecture suivie"
                      : "duree indisponible avec les lecteurs actuels"}
                  </p>
                </div>
                <Sparkles className="h-7 w-7 text-[#e50914]" />
              </div>
              <dl className="mt-6 grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-2">
                <RecapItem
                  label="Titre dominant"
                  value={recap.topTitle ?? "Pas encore assez de donnees"}
                />
                <RecapItem
                  label="Genre dominant"
                  value={recap.topGenre ?? "Pas encore determine"}
                />
                <RecapItem
                  label="Termines ce mois"
                  value={String(recap.completedCount)}
                />
                <RecapItem
                  label="Evolution"
                  value={
                    recap.comparedToPreviousPercent === null
                      ? "Premier mois mesure"
                      : `${recap.comparedToPreviousPercent >= 0 ? "+" : ""}${
                          recap.comparedToPreviousPercent
                        } %`
                  }
                />
              </dl>
            </div>
          </section>

          <section aria-labelledby="habits-heading">
            <SectionHeading
              eyebrow="Habitudes"
              title="Votre rythme"
              id="habits-heading"
            />
            <div className="border border-white/10 bg-[#101010] p-5 sm:p-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <Habit icon={CalendarDays} label="Jour favori" value={habits.topDay} />
                <Habit
                  icon={Clock3}
                  label="Horaire habituel"
                  value={habits.usualTimeWindow}
                />
                <Habit
                  icon={Activity}
                  label="Session moyenne"
                  value={
                    habits.averageSessionSeconds
                      ? formatDuration(habits.averageSessionSeconds)
                      : null
                  }
                />
                <Habit
                  icon={Flame}
                  label="Plus longue serie"
                  value={
                    habits.longestStreakDays
                      ? `${habits.longestStreakDays} jour${
                          habits.longestStreakDays > 1 ? "s" : ""
                        }`
                      : null
                  }
                />
              </div>
              <div className="mt-6 space-y-4 border-t border-white/10 pt-5">
                <SplitBar
                  leftLabel="Films"
                  rightLabel="Series"
                  left={habits.moviePercent}
                  right={habits.seriesPercent}
                />
                <SplitBar
                  leftLabel="Semaine"
                  rightLabel="Week-end"
                  left={habits.weekdayPercent}
                  right={habits.weekendPercent}
                />
              </div>
              <p className="mt-5 text-xs text-zinc-500">
                {habits.activeDays} jour
                {habits.activeDays > 1 ? "s" : ""} actif
                {habits.activeDays > 1 ? "s" : ""}
              </p>
            </div>
          </section>
        </div>

        <section className="mt-16" aria-labelledby="tastes-heading">
          <SectionHeading
            eyebrow="Gouts du profil"
            title="Ce qui vous attire"
            id="tastes-heading"
          />
          <div className="grid gap-3 md:grid-cols-3">
            <Ranking
              title="Genres favoris"
              items={tastes.genres.map((item) => ({
                label: item.name,
                percent: item.percent,
              }))}
              empty="Terminez quelques titres pour faire emerger vos genres."
            />
            <Ranking
              title="Sources utilisees"
              items={tastes.providers.map((item) => ({
                label: item.name,
                percent: item.percent,
              }))}
              empty="Aucune source mesuree."
            />
            <Ranking
              title="Langues audio"
              items={tastes.audioLanguages.map((item) => ({
                label: item.name,
                percent: item.percent,
              }))}
              empty="Aucune langue mesuree."
            />
          </div>
        </section>

        <section className="mt-16" aria-labelledby="insights-heading">
          <SectionHeading
            eyebrow="Signaux utiles"
            title="Ce que vos choix racontent"
            id="insights-heading"
          />
          <div className="grid gap-3 lg:grid-cols-3">
            <InsightPanel icon={Target} title="Decouverte">
              <PrimaryInsight
                value={
                  intelligence.discovery.recommendationPercent === null
                    ? "En apprentissage"
                    : `${intelligence.discovery.recommendationPercent} %`
                }
                label="des contenus lances viennent des recommandations"
              />
              <MetricLine
                label="Nouveaux genres ce mois"
                value={String(intelligence.discovery.newGenresThisMonth)}
              />
              <MetricLine
                label="Titres avec origine mesuree"
                value={String(intelligence.discovery.playedTitles)}
              />
              {intelligence.discovery.sources.length ? (
                <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
                  {intelligence.discovery.sources.map((source) => (
                    <MetricLine
                      key={source.id}
                      label={source.label}
                      value={`${source.percent} %`}
                    />
                  ))}
                </div>
              ) : null}
            </InsightPanel>

            <InsightPanel icon={Repeat2} title="Continuation des series">
              <PrimaryInsight
                value={
                  intelligence.seriesLoyalty.completionRate === null
                    ? "A determiner"
                    : `${intelligence.seriesLoyalty.completionRate} %`
                }
                label="des episodes disponibles sont suivis par le suivant"
              />
              <MetricLine
                label="Serie la plus reguliere"
                value={
                  intelligence.seriesLoyalty.mostRegularTitle ??
                  "Pas assez d'episodes"
                }
              />
              <MetricLine
                label="Series reprises apres une pause"
                value={String(intelligence.seriesLoyalty.resumedSeries)}
              />
              <MetricLine
                label="Abandons probables"
                value={String(intelligence.seriesLoyalty.abandonedSeries)}
              />
              {intelligence.seriesLoyalty.longestPauseDays !== null ? (
                <p className="mt-5 border-t border-white/10 pt-4 text-xs leading-5 text-zinc-500">
                  Plus longue pause :{" "}
                  {intelligence.seriesLoyalty.longestPauseDays} jours
                  {intelligence.seriesLoyalty.longestPauseTitle
                    ? ` avant de reprendre ${intelligence.seriesLoyalty.longestPauseTitle}`
                    : ""}
                  .
                </p>
              ) : null}
            </InsightPanel>

            <InsightPanel icon={Search} title="Choix du prochain titre">
              <PrimaryInsight
                value={
                  intelligence.selection.averageDetailsBeforePlay === null
                    ? "En apprentissage"
                    : String(intelligence.selection.averageDetailsBeforePlay)
                }
                label="fiches consultees en moyenne avant lecture"
              />
              <MetricLine
                label="Temps moyen pour choisir"
                value={
                  intelligence.selection.averageDecisionSeconds === null
                    ? "Pas encore mesure"
                    : formatElapsed(
                        intelligence.selection.averageDecisionSeconds,
                      )
                }
              />
              <MetricLine
                label="Conversion des recommandations"
                value={
                  intelligence.selection.recommendationConversionPercent ===
                  null
                    ? "Pas encore mesuree"
                    : `${intelligence.selection.recommendationConversionPercent} %`
                }
              />
              <MetricLine
                label="Recherches enregistrees"
                value={String(intelligence.selection.searches)}
              />
              {intelligence.selection.topFilters.length ? (
                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="text-xs font-bold text-zinc-500">
                    Filtres frequents
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {intelligence.selection.topFilters.map((filter) => (
                      <span
                        key={filter.label}
                        className="rounded bg-white/[0.06] px-2.5 py-1.5 text-xs text-zinc-300"
                      >
                        {filter.label} · {filter.count}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </InsightPanel>
          </div>
        </section>

        <section className="mt-16" aria-labelledby="regularity-heading">
          <SectionHeading
            eyebrow="Regularite"
            title={heatmapTitle}
            id="regularity-heading"
          />
          <div className="border border-white/10 bg-[#101010] p-4 sm:p-6">
            <div className="overflow-x-auto pb-2">
              <div
                className="grid w-max grid-flow-col grid-rows-7 gap-1"
                aria-label={`Calendrier des jours actifs sur les ${heatmapWeeks} dernieres semaines`}
              >
                {heatmapDays.map((day) => (
                  <span
                    key={day.date}
                    title={`${formatDate(day.date)} : ${
                      day.watchSeconds
                        ? formatDuration(day.watchSeconds)
                        : day.intensity
                          ? "activite enregistree"
                          : "aucune activite"
                    }`}
                    className={`h-2.5 w-2.5 rounded-sm ${heatColor(
                      day.intensity,
                    )}`}
                  />
                ))}
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SmallMetric
                label="Semaines consecutives"
                value={String(intelligence.regularity.consecutiveWeeks)}
              />
              <SmallMetric
                label="Plus longue pause"
                value={`${intelligence.regularity.longestBreakDays} j`}
              />
              <SmallMetric
                label="Plus longue session"
                value={
                  intelligence.regularity.longestSessionSeconds
                    ? formatDuration(
                        intelligence.regularity.longestSessionSeconds,
                      )
                    : "Pas mesuree"
                }
              />
              <SmallMetric
                label="Mois le plus actif"
                value={
                  intelligence.regularity.busiestMonth?.label ??
                  "Pas encore determine"
                }
              />
            </div>
          </div>
        </section>

        <section className="mt-16" aria-labelledby="series-heading">
          <SectionHeading
            eyebrow="Progression"
            title="Series en cours"
            id="series-heading"
          />
          {progress.series.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {progress.series.map((series) => (
                <Link
                  key={series.tmdbId}
                  href={`/watch/tv/${series.tmdbId}`}
                  className="grid grid-cols-[64px_minmax(0,1fr)] gap-4 border border-white/10 bg-[#101010] p-3 transition hover:border-white/30 hover:bg-[#151515]"
                >
                  <ProfilePoster
                    posterPath={series.posterPath}
                    title={series.title}
                  />
                  <span className="min-w-0 self-center">
                    <span className="block truncate font-bold">
                      {series.title}
                    </span>
                    <span className="mt-1 block text-xs text-zinc-400">
                      {series.completedEpisodes}/{series.totalEpisodes || "?"}{" "}
                      episodes termines
                    </span>
                    <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-white/10">
                      <span
                        className="progress-fill block h-full rounded-full bg-[#e50914]"
                        style={{ width: `${series.percent}%` }}
                      />
                    </span>
                    <span className="mt-2 block text-xs text-zinc-500">
                      {series.remainingEpisodes
                        ? `${series.remainingEpisodes} episodes · environ ${formatDuration(
                            series.remainingSeconds,
                          )} restantes`
                        : "Nombre total d'episodes indisponible"}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={PlayCircle}
              text={
                hasActivity
                  ? "Aucune serie en cours."
                  : "Les series commencees apparaitront ici."
              }
            />
          )}
        </section>

        <section className="mt-16" aria-labelledby="abandoned-heading">
          <SectionHeading
            eyebrow="A revoir"
            title="Peut-etre abandonnes"
            id="abandoned-heading"
          />
          {progress.likelyAbandoned.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {progress.likelyAbandoned.map((item) => (
                <Link
                  key={`${item.mediaType}-${item.tmdbId}`}
                  href={`/watch/${item.mediaType}/${item.tmdbId}`}
                  className="flex items-center gap-3 border border-white/10 bg-[#101010] p-3 transition hover:border-white/30"
                >
                  <History className="h-5 w-5 shrink-0 text-zinc-500" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">
                      {item.title}
                    </span>
                    <span className="mt-1 block text-xs text-zinc-500">
                      {item.percent > 0
                        ? `${item.percent} % atteint`
                        : "Lance puis laisse de cote"}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              text="Aucun abandon probable pour le moment."
            />
          )}
        </section>
      </div>
    </main>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <article className="min-w-0 rounded border border-white/10 bg-[#111] p-4 sm:p-5">
      <Icon className="h-5 w-5 text-[#e50914]" />
      <p className="mt-5 break-words text-xl font-black sm:text-2xl">
        <AnimatedStatValue value={value} />
      </p>
      <p className="mt-1 text-xs leading-5 text-zinc-400">{label}</p>
    </article>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border border-white/10 bg-white/[0.03] px-4 py-3">
      <span className="text-xs text-zinc-400">{label}</span>
      <strong className="text-sm">{value}</strong>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  id,
}: {
  eyebrow: string;
  title: string;
  id: string;
}) {
  return (
    <div className="mb-4">
      <p className="text-xs font-bold uppercase text-zinc-400">{eyebrow}</p>
      <h2 id={id} className="mt-1 scroll-mt-32 text-xl font-bold">
        {title}
      </h2>
    </div>
  );
}

function RecapItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className="mt-1 text-sm font-bold">{value}</dd>
    </div>
  );
}

function Habit({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
      <div className="min-w-0">
        <p className="text-xs text-zinc-400">{label}</p>
        <p className="mt-1 truncate text-sm font-bold">
          {value ?? "Pas encore determine"}
        </p>
      </div>
    </div>
  );
}

function SplitBar({
  leftLabel,
  rightLabel,
  left,
  right,
}: {
  leftLabel: string;
  rightLabel: string;
  left: number;
  right: number;
}) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs text-zinc-400">
        <span>
          {leftLabel} {left} %
        </span>
        <span>
          {rightLabel} {right} %
        </span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-white/10">
        <span
          className="progress-fill bg-[#e50914]"
          style={{ width: `${left}%` }}
        />
        <span
          className="progress-fill bg-cyan-500"
          style={{ width: `${right}%` }}
        />
      </div>
    </div>
  );
}

function Ranking({
  title,
  items,
  empty,
}: {
  title: string;
  items: Array<{ label: string; percent: number }>;
  empty: string;
}) {
  return (
    <article className="border border-white/10 bg-[#101010] p-5">
      <h3 className="font-bold">{title}</h3>
      {items.length ? (
        <ol className="mt-5 space-y-4">
          {items.map((item, index) => (
            <li key={item.label}>
              <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
                <span className="truncate">
                  <span className="mr-2 text-zinc-600">{index + 1}.</span>
                  {item.label}
                </span>
                <strong>{item.percent} %</strong>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                <span
                  className="progress-fill block h-full rounded-full bg-[#e50914]"
                  style={{ width: `${item.percent}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-5 text-sm leading-6 text-zinc-500">{empty}</p>
      )}
    </article>
  );
}

function InsightPanel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Clock3;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="min-w-0 border border-white/10 bg-[#101010] p-5">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-[#e50914]" />
        <h3 className="font-bold">{title}</h3>
      </div>
      <div className="mt-6">{children}</div>
    </article>
  );
}

function PrimaryInsight({ value, label }: { value: string; label: string }) {
  return (
    <div className="mb-5">
      <p className="break-words text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{label}</p>
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 py-1.5 text-xs">
      <span className="text-zinc-500">{label}</span>
      <strong className="max-w-[55%] text-right text-zinc-200">{value}</strong>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  text,
}: {
  icon: typeof Clock3;
  text: string;
}) {
  return (
    <div className="flex min-h-32 items-center justify-center gap-3 border border-dashed border-white/10 text-sm text-zinc-500">
      <Icon className="h-5 w-5" />
      {text}
    </div>
  );
}

function formatDuration(seconds: number) {
  const roundedMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

function measuredDuration(seconds: number, measuredSessions: number) {
  return measuredSessions > 0 ? formatDuration(seconds) : "-";
}

function qualityLabel(value: ProfileStats["tracking"]["dataQuality"]) {
  return value === "high" ? "elevee" : value === "medium" ? "moyenne" : "faible";
}

function formatElapsed(seconds: number) {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  return formatDuration(seconds);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function heatColor(intensity: number) {
  if (intensity >= 4) return "bg-[#e50914]";
  if (intensity === 3) return "bg-[#a80b14]";
  if (intensity === 2) return "bg-[#671015]";
  if (intensity === 1) return "bg-[#351114]";
  return "bg-white/[0.06]";
}
