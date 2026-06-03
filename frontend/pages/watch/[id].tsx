import { useEffect, useRef } from 'react';

import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { useRouter } from 'next/router';

import { watchPage } from '@animeflix/api';
import {
  AnimeBannerFragment,
  AnimeInfoFragment,
  MediaType,
} from '@animeflix/api/aniList';
import { NextSeo } from 'next-seo';

import RelatedSection, {
  type RelationItem,
} from '@components/anime/RelatedSection';
import WatchlistButton from '@components/anime/WatchlistButton';
import Genre from '@components/Genre';
import Header from '@components/Header';
import progressBar from '@components/Progress';
import RecommendationCard from '@components/watch/Card';
import Episode from '@components/watch/Episode';
import SourcePlayer from '@components/watch/SourcePlayer';
import WatchControls from '@components/watch/WatchControls';
import { setAnime } from '@slices/anime';
import { setEpisode } from '@slices/episode';
import { setTotalEpisodes } from '@slices/gogoApi';
import { initialiseStore, useDispatch, useSelector } from '@store/store';
import { getResumeEpisode } from '@utility/progress';
import { convertToDate, convertToTime } from '@utility/time';
import { arrayToString } from '@utility/utils';

interface WatchProps {
  anime: AnimeInfoFragment & AnimeBannerFragment;
  recommended: (AnimeInfoFragment & AnimeBannerFragment)[];
  related: RelationItem[];
}

export const getServerSideProps: GetServerSideProps<WatchProps> = async (
  context
) => {
  const store = initialiseStore();

  const { id } = context.params;
  const { episode } = context.query;

  store.dispatch(setAnime(parseInt(arrayToString(id), 10)));

  if (episode) {
    store.dispatch(setEpisode(parseInt(arrayToString(episode), 10)));
  }

  const data = await watchPage({
    id: parseInt(arrayToString(id), 10),
    perPage: 20,
  });

  const recommended = data.recommended.recommendations.map(
    (anime) => anime.mediaRecommendation
  );

  // Related franchise entries (sequels / side stories / OVAs, ANIME nodes only)
  // so viewers can jump within a series without leaving the watch page.
  const related: RelationItem[] = (data.anime.relations?.edges ?? [])
    .filter(
      (e) => e && e.node && e.node.type === MediaType.Anime && e.relationType
    )
    .map((e) => ({
      relationType: e.relationType as string,
      node: e.node as AnimeInfoFragment,
    }));

  return {
    props: {
      anime: data.anime,
      recommended,
      related,
      initialReduxState: store.getState(),
    },
  };
};

const Watch = ({
  anime,
  recommended,
  related,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  // finish the progress bar
  progressBar.finish();

  const router = useRouter();

  const dispatch = useDispatch();
  const [animeId, episode] = useSelector((store) => [
    store.anime.anime,
    store.episode.episode,
  ]);
  const routerRef = useRef(router);

  useEffect(() => {
    // only run when the initial episode value was not supplied
    if (routerRef.current.query.episode) return;

    // resume from the saved progress entry (defaults to episode 1)
    dispatch(setEpisode(getResumeEpisode(animeId)));
  }, [animeId, dispatch]);

  // update the router url
  useEffect(() => {
    routerRef.current.replace(
      {
        pathname: '/watch/[id]',
        query: { id: animeId, episode },
      },
      `/watch/${animeId}/?episode=${episode}`,
      {
        shallow: true,
      }
    );
  }, [animeId, episode]);

  // total episode count comes from AniList: finished anime expose `episodes`,
  // while currently-airing ones expose the next airing episode instead.
  const totalEpisodes =
    anime.episodes ||
    (anime.nextAiringEpisode ? anime.nextAiringEpisode.episode - 1 : 0);

  useEffect(() => {
    dispatch(setTotalEpisodes(totalEpisodes));
  }, [dispatch, totalEpisodes]);

  // get data about next airing episode
  const { nextAiringEpisode } = anime;

  return (
    <>
      <NextSeo
        title={`${
          anime.title.romaji || anime.title.english
        } | Episode ${episode}`}
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
              url: anime.coverImage.large || anime.coverImage.medium,
              alt: `Cover Image for ${
                anime.title.english || anime.title.romaji
              }`,
            },
          ],
        }}
      />

      <Header />

      <main className="mx-auto w-full max-w-screen-2xl px-4 pb-20 pt-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
          {/* Player column */}
          <div className="min-w-0">
            <SourcePlayer
              titles={[anime.title.romaji, anime.title.english].filter(
                (t): t is string => Boolean(t)
              )}
              onNext={
                episode < totalEpisodes
                  ? () => dispatch(setEpisode(episode + 1))
                  : undefined
              }
            />

            <div className="mt-5">
              {anime.format !== 'MOVIE' && (
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                  Episode {episode}
                </p>
              )}
              <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
                <h1 className="font-display text-2xl font-bold leading-tight text-fg sm:text-3xl">
                  {anime.title.romaji || anime.title.english}
                </h1>
                <WatchlistButton id={anime.id} variant="labeled" />
              </div>
            </div>

            {anime.genres?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {anime.genres.map((genre) => (
                  <Genre key={genre} genre={genre} />
                ))}
              </div>
            )}

            {nextAiringEpisode ? (
              <p className="mt-4 rounded-xl border border-line/60 bg-surface/40 p-3 text-sm text-muted">
                <span className="font-semibold text-fg">
                  Episode {nextAiringEpisode.episode}
                </span>{' '}
                airs {convertToDate(nextAiringEpisode.airingAt * 1000)}. New
                episodes air every{' '}
                {convertToTime(nextAiringEpisode.airingAt * 1000)}.
              </p>
            ) : null}

            <div className="mt-4">
              <WatchControls />
            </div>

            <Episode
              title={anime.title.romaji || anime.title.english}
              altTitle={anime.title.english}
            />

            <div className="mt-6">
              <h2 className="font-display text-lg font-bold text-fg">
                Synopsis
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted line-clamp-6 md:line-clamp-none">
                {anime.description?.replace(/<\w*\\?>/g, '')}
              </p>
            </div>

            {/* Related franchise entries — jump to sequels/OVAs without leaving
                the watch page. flush: the column already has its own padding. */}
            <RelatedSection items={related} flush />
          </div>

          {/* Recommendations */}
          <aside className="mt-10 lg:mt-0">
            <h2 className="mb-3 font-display text-lg font-bold text-fg">
              Recommended
            </h2>
            <div className="space-y-2">
              {recommended.map((recommendation) => (
                <RecommendationCard
                  anime={recommendation}
                  key={recommendation.id}
                />
              ))}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
};

export default Watch;
