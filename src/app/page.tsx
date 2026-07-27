import { CineVerseHome } from "@/components/cineverse-home";
import { getContinueWatching } from "@/lib/store";
import { getHomeCatalog } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

export default async function Home() {
  const catalog = await getHomeCatalog();
  const continueWatching = getContinueWatching();

  return <CineVerseHome catalog={catalog} continueWatching={continueWatching} />;
}
