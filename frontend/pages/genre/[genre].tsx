import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { useRouter } from 'next/router';

import { searchGenre } from '@animeflix/api';
import { AnimeInfoFragment } from '@animeflix/api/aniList';
import { CollectionIcon } from '@heroicons/react/outline';
import { NextSeo } from 'next-seo';

import Card from '@components/anime/Card';
import Header from '@components/Header';
import progressBar from '@components/Progress';

interface GenreProps {
  searchResults: AnimeInfoFragment[];
}

export const getServerSideProps: GetServerSideProps<GenreProps> = async (
  context
) => {
  let { genre } = context.params;

  genre = typeof genre === 'string' ? genre : genre.join('');

  const data = await searchGenre({
    genre,
    perPage: 25,
    page: 1,
  });

  return {
    props: {
      searchResults: data.Page.media,
    },
  };
};

const Genre = ({
  searchResults,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();
  const { genre } = router.query;

  progressBar.finish();

  const hasResults = searchResults.length > 0;
  const genreText = typeof genre === 'string' ? genre : '';

  return (
    <>
      <NextSeo title={`Animes for Genre ${genre} | Animeflix`} />

      <Header />

      <main className="mx-auto max-w-screen-2xl px-4 pb-16 sm:px-6 lg:px-8">
        <header className="mt-8 animate-rise">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.25em] text-accent">
            Browse
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span
              className="h-7 w-1 shrink-0 rounded-full bg-aurora"
              aria-hidden
            />
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg sm:text-3xl lg:text-4xl">
              Genre <span className="font-normal text-faint">·</span>{' '}
              <span className="text-accent">{genreText}</span>
            </h1>
          </div>
          {hasResults && (
            <p className="mt-2 pl-4 text-sm text-muted">
              {searchResults.length}{' '}
              {searchResults.length === 1 ? 'title' : 'titles'} found
            </p>
          )}
        </header>

        {hasResults ? (
          <div className="mt-8 grid animate-rise grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] justify-items-center gap-x-5 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
            {searchResults.map((anime) => (
              <Card key={anime.id} anime={anime} />
            ))}
          </div>
        ) : (
          <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-line/50 bg-surface/40 px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-faint">
              <CollectionIcon className="h-7 w-7" aria-hidden />
            </span>
            <h2 className="mt-5 font-display text-xl font-bold text-fg">
              Nothing here yet
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
              We couldn&apos;t find any titles in{' '}
              <span className="font-medium text-fg">{genreText}</span>. Try
              another genre.
            </p>
          </div>
        )}
      </main>
    </>
  );
};

export default Genre;
