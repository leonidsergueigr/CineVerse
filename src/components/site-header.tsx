import Link from "next/link";
import { Clapperboard, Search, Tv } from "lucide-react";

type Props = {
  query?: string;
  fixed?: boolean;
};

export function SiteHeader({ query, fixed = true }: Props) {
  return (
    <header
      className={`${fixed ? "fixed" : "sticky"} inset-x-0 top-0 z-30 border-b border-white/5 bg-black/65 backdrop-blur-xl`}
    >
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-1 items-center gap-3 px-4 sm:px-6 md:grid-cols-[minmax(220px,360px)_auto_1fr] lg:px-8">
        <form action="/browse" className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Titre, acteur, realisateur..."
            className="h-10 w-full rounded border border-white/10 bg-white/[0.08] pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-[#e50914]"
          />
        </form>

        <Link href="/" className="text-2xl font-black tracking-[0.18em] text-[#e50914]">
          CineVerse
        </Link>

        <nav className="hidden items-center justify-end gap-5 text-sm font-medium text-zinc-300 md:flex">
          <Link
            href="/browse?type=movie"
            className="inline-flex items-center gap-2 transition hover:text-white"
          >
            <Clapperboard className="h-4 w-4 text-[#ff7a1a]" />
            Films
          </Link>
          <Link
            href="/browse?type=tv"
            className="inline-flex items-center gap-2 transition hover:text-white"
          >
            <Tv className="h-4 w-4 text-[#ff7a1a]" />
            Series
          </Link>
        </nav>
      </div>
    </header>
  );
}
