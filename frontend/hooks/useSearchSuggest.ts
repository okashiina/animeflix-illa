import { useEffect, useRef, useState } from 'react';

// Lightweight, client-side search suggestions straight from AniList's public
// GraphQL endpoint (CORS-open, no key). Debounced and abortable so fast typing
// only ever shows the latest results and never piles up requests.

export interface Suggestion {
  id: number;
  title: { romaji: string | null; english: string | null };
  coverImage: { medium: string | null; color: string | null };
  format: string | null;
  seasonYear: number | null;
}

const ENDPOINT = 'https://graphql.anilist.co';
const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;
const PER_PAGE = 7;

const SUGGEST_QUERY = /* GraphQL */ `
  query Suggest($search: String!, $perPage: Int!) {
    Page(perPage: $perPage) {
      media(search: $search, type: ANIME, isAdult: false, sort: SEARCH_MATCH) {
        id
        title {
          romaji
          english
        }
        coverImage {
          medium
          color
        }
        format
        seasonYear
      }
    }
  }
`;

interface SuggestState {
  results: Suggestion[];
  loading: boolean;
}

const useSearchSuggest = (term: string): SuggestState => {
  const [state, setState] = useState<SuggestState>({
    results: [],
    loading: false,
  });
  const abortRef = useRef<AbortController>();

  useEffect(() => {
    const query = term.trim();

    if (query.length < MIN_CHARS) {
      abortRef.current?.abort();
      setState({ results: [], loading: false });
      return undefined;
    }

    setState((prev) => ({ ...prev, loading: true }));

    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            query: SUGGEST_QUERY,
            variables: { search: query, perPage: PER_PAGE },
          }),
          signal: controller.signal,
        });
        const json = await res.json();
        const media: Suggestion[] = json?.data?.Page?.media ?? [];
        if (abortRef.current === controller) {
          setState({ results: media, loading: false });
        }
      } catch (err) {
        // An aborted request was superseded — leave state for the newer one.
        if ((err as Error)?.name !== 'AbortError') {
          setState({ results: [], loading: false });
        }
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [term]);

  // Abort any in-flight request on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  return state;
};

export default useSearchSuggest;
