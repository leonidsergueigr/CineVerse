import { CineVerseHome } from "@/components/cineverse-home";
import { getContinueWatching } from "@/lib/store";
import { getHomeCatalog } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const catalog = await getHomeCatalog({
    query: valueOf(params.q),
    mediaType: valueOf(params.type),
    genre: valueOf(params.genre),
    yearFrom: valueOf(params.yearFrom),
    yearTo: valueOf(params.yearTo),
    minRating: valueOf(params.minRating),
    language: valueOf(params.language),
  });
  const continueWatching = getContinueWatching();

  return <CineVerseHome catalog={catalog} continueWatching={continueWatching} />;
}

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
