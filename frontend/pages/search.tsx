import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { useRouter } from 'next/router';

import { searchAnime } from '@animeflix/api';
import { SearchAnimeQuery } from '@animeflix/api/aniList';
import { SearchIcon } from '@heroicons/react/outline';
import { NextSeo } from 'next-seo';

import Card from '@components/anime/Card';
import Header from '@components/Header';
import progressBar from '@components/Progress';

interface SearchResult {
  searchResults: SearchAnimeQuery;
}

export const getServerSideProps: GetServerSideProps<SearchResult> = async (
  context
) => {
  const { keyword } = context.query;
  const data = await searchAnime({
    keyword: typeof keyword === 'string' ? keyword : keyword.join(' '),
    page: 1,
    perPage: 20,
  });

  return {
    props: {
      searchResults: data,
    },
  };
};

const Search = ({
  searchResults,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();
  const { keyword } = router.query;

  progressBar.finish();

  const results = searchResults.Page.media;
  const hasResults = results.length > 0;
  const keywordText = typeof keyword === 'string' ? keyword : '';

  return (
    <>
      <NextSeo title={`Results for ${keyword} | Animeflix`} />

      <Header />

      <main className="mx-auto max-w-screen-2xl px-4 pb-16 sm:px-6 lg:px-8">
        <header className="mt-8 animate-rise">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.25em] text-accent">
            Search
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span
              className="h-7 w-1 shrink-0 rounded-full bg-aurora"
              aria-hidden
            />
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg sm:text-3xl lg:text-4xl">
              Results for{' '}
              <span className="text-accent">&ldquo;{keywordText}&rdquo;</span>
            </h1>
          </div>
          {hasResults && (
            <p className="mt-2 pl-4 text-sm text-muted">
              {results.length} {results.length === 1 ? 'title' : 'titles'} found
            </p>
          )}
        </header>

        {hasResults ? (
          <div className="mt-8 grid animate-rise grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] justify-items-center gap-4">
            {results.map((anime) => (
              <Card key={anime.id} anime={anime} />
            ))}
          </div>
        ) : (
          <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-line/50 bg-surface/40 px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-faint">
              <SearchIcon className="h-7 w-7" aria-hidden />
            </span>
            <h2 className="mt-5 font-display text-xl font-bold text-fg">
              No matches found
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
              We couldn&apos;t find anything for{' '}
              <span className="font-medium text-fg">
                &ldquo;{keywordText}&rdquo;
              </span>
              . Try a different title, or check the spelling.
            </p>
          </div>
        )}
      </main>
    </>
  );
};

export default Search;
