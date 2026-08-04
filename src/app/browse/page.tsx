import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrowseExperience } from "@/components/cineverse-home";
import { getActiveProfileId } from "@/lib/active-profile";
import { getDislikes, getLikes } from "@/lib/store";
import { getBrowseCatalog } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BrowsePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const profileId = await getActiveProfileId();
  if (!profileId) {
    const destination = browseDestination(params);
    redirect(`/profiles?next=${encodeURIComponent(destination)}`);
  }
  const likes = getLikes(profileId);
  const dislikes = getDislikes(profileId);
  const catalog = await getBrowseCatalog({
    query: valueOf(params.q),
    catalog: valueOf(params.catalog),
    mediaType: valueOf(params.type),
    genre: valueOf(params.genre),
    yearFrom: valueOf(params.yearFrom),
    yearTo: valueOf(params.yearTo),
    minRating: valueOf(params.minRating),
    originalLanguage: valueOf(params.originalLanguage),
    person: valueOf(params.person),
    personName: valueOf(params.personName),
    personRole: valueOf(params.personRole),
    personJob: valueOf(params.personJob),
    sort: valueOf(params.sort),
    page: valueOf(params.page),
  });

  return (
    <BrowseExperience
      catalog={catalog}
      initialLikedKeys={likes.map((like) => `${like.mediaType}-${like.tmdbId}`)}
      initialDislikedKeys={dislikes.map(
        (item) => item.exactExclusion ? `${item.mediaType}-${item.tmdbId}` : "",
      ).filter(Boolean)}
    />
  );
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = valueOf(params.q)?.trim();
  if (query) return { title: `Recherche : ${query}` };
  if (valueOf(params.catalog) === "anime") return { title: "Animes" };
  return { title: valueOf(params.type) === "tv" ? "Series" : "Films" };
}

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function browseDestination(
  params: Record<string, string | string[] | undefined>,
) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    const firstValue = Array.isArray(value) ? value[0] : value;
    if (firstValue) search.set(key, firstValue);
  });
  const query = search.toString();
  return query ? `/browse?${query}` : "/browse";
}
