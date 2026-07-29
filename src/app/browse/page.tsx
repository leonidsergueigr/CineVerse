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
        (item) => `${item.mediaType}-${item.tmdbId}`,
      )}
    />
  );
}

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
