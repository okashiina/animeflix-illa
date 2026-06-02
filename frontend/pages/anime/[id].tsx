import { GetServerSideProps, InferGetServerSidePropsType } from 'next';

import { animePage, getKitsuEpisodes } from '@animeflix/api';
import {
  AnimeBannerFragment,
  AnimeInfoFragment,
  MediaStatus,
} from '@animeflix/api/aniList';
import { EpisodesListFragment } from '@animeflix/api/kitsu';
import { EmojiSadIcon } from '@heroicons/react/solid';
import { NextSeo } from 'next-seo';

import Banner from '@components/anime/Banner';
import EpisodeSection from '@components/anime/EpisodeSection';
import Section from '@components/anime/Section';
import Header from '@components/Header';

interface AnimeProps {
  anime: AnimeInfoFragment & AnimeBannerFragment;
  recommended: AnimeInfoFragment[];
  episodes: EpisodesListFragment;
}

export const getServerSideProps: GetServerSideProps<AnimeProps> = async (
  context
) => {
  let { id } = context.params;

  id = typeof id === 'string' ? id : id.join(' ');

  const data = await animePage({
    id: parseInt(id, 10),
    perPage: 12,
  });

  if (!data.Media) {
    return {
      notFound: true,
    };
  }

  let episodes: EpisodesListFragment = {
    episodeCount: 0,
    episodes: null,
  };

  // dont fetch episodes if the anime hasn't released
  if (data.Media.status !== MediaStatus.NotYetReleased) {
    // fetch episode list
    const { title, startDate, season } = data.Media;
    const english = getKitsuEpisodes(title.english, season, startDate.year);
    const romaji = getKitsuEpisodes(title.romaji, season, startDate.year);
    episodes = await Promise.all([english, romaji]).then((r) => {
      return r[0].episodeCount > 0 ? r[0] : r[1];
    });
  }

  return {
    props: {
      anime: data.Media,
      recommended: data.recommended.recommendations.map(
        (r) => r.mediaRecommendation
      ),
      episodes,
    },
  };
};

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="mt-10 px-4 sm:px-6 lg:px-8">
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-line/60 bg-surface/40 px-6 py-12 text-center">
      <EmojiSadIcon className="h-10 w-10 text-faint" aria-hidden />
      <p className="font-display text-lg font-semibold text-fg sm:text-xl">
        {message}
      </p>
    </div>
  </div>
);

const Anime = ({
  anime,
  recommended,
  episodes,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  return (
    <>
      <NextSeo
        title={`${anime.title.romaji || anime.title.english} | Animeflix`}
        description={anime.description}
        openGraph={{
          images: [
            {
              type: 'large',
              url: anime.bannerImage,
              alt: `Banner Image for ${
                anime.title.english || anime.title.romaji
              }`,
            },
            {
              type: 'small',
              url: anime.coverImage.large || anime.coverImage.medium,
              alt: `Cover Image for ${
                anime.title.english || anime.title.romaji
              }`,
            },
          ],
        }}
      />

      <Header />
      <Banner anime={anime} />

      <main className="mx-auto w-full max-w-screen-2xl pb-20">
        {/* Don't show episode section if format is movie */}
        {anime.format !== 'MOVIE' && episodes.episodeCount > 0 && (
          <EpisodeSection anime={anime} episodes={episodes} />
        )}

        {anime.format !== 'MOVIE' && episodes.episodeCount === 0 && (
          <EmptyState message="No episodes found" />
        )}

        {recommended.length > 0 ? (
          <Section animeList={recommended} title="Recommended" />
        ) : (
          <EmptyState message="No recommendations found" />
        )}
      </main>
    </>
  );
};

export default Anime;
