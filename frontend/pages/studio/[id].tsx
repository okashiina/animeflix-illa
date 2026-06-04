import { GetServerSideProps, InferGetServerSidePropsType } from 'next';

import { studioPage } from '@animeflix/api';
import { AnimeInfoFragment, StudioPageQuery } from '@animeflix/api/aniList';
import { EmojiSadIcon } from '@heroicons/react/solid';
import { NextSeo } from 'next-seo';

import Card from '@components/anime/Card';
import Header from '@components/Header';
import progressBar from '@components/Progress';

type Studio = NonNullable<StudioPageQuery['Studio']>;

interface StudioProps {
  studio: { id: number; name: string };
  media: AnimeInfoFragment[];
}

export const getServerSideProps: GetServerSideProps<StudioProps> = async (
  context
) => {
  let { id } = context.params;

  id = typeof id === 'string' ? id : id.join(' ');

  const numericId = parseInt(id, 10);
  if (!Number.isFinite(numericId)) {
    return { notFound: true };
  }

  const data = await studioPage({ id: numericId, perPage: 30 });

  if (!data.Studio) {
    return { notFound: true };
  }

  const studio: Studio = data.Studio;

  // Keep only fully-shaped nodes — the poster Card reads title + coverImage,
  // and AniList can hand back a sparse node now and then.
  const media: AnimeInfoFragment[] = (studio.media?.nodes ?? []).filter(
    (node): node is AnimeInfoFragment =>
      Boolean(node && node.title && node.coverImage)
  );

  return {
    props: {
      studio: { id: studio.id, name: studio.name },
      media,
    },
  };
};

const StudioPage = ({
  studio,
  media,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  progressBar.finish();

  const hasMedia = media.length > 0;

  return (
    <>
      <NextSeo title={`Anime by ${studio.name} | kessoku moe`} />

      <Header />

      <main className="mx-auto w-full max-w-screen-2xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        <header className="mb-8 animate-rise">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.25em] text-accent">
            Studio
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span
              className="h-7 w-1 shrink-0 rounded-full bg-aurora"
              aria-hidden
            />
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg sm:text-3xl lg:text-4xl">
              Anime by <span className="text-accent">{studio.name}</span>
            </h1>
          </div>
          {hasMedia && (
            <p className="mt-2 pl-4 text-sm text-muted">
              {media.length} {media.length === 1 ? 'title' : 'titles'}
            </p>
          )}
        </header>

        {hasMedia ? (
          <div className="grid animate-rise grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] justify-items-center gap-x-5 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
            {media.map((anime) => (
              <Card key={anime.id} anime={anime} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-line/60 bg-surface/40 px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-faint">
              <EmojiSadIcon className="h-7 w-7" aria-hidden />
            </span>
            <h2 className="mt-5 font-display text-xl font-bold text-fg">
              Nothing on the shelf
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
              We couldn&apos;t pull any titles for this studio. Try another name
              from a show&apos;s credits.
            </p>
          </div>
        )}
      </main>
    </>
  );
};

export default StudioPage;
