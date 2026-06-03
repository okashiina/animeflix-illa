import { useEffect, useState } from 'react';

import { getAnimeByIds } from '@animeflix/api';
import { AnimeInfoFragment } from '@animeflix/api/aniList';

import Section from '@components/anime/Section';
import useWatchlist from '@hooks/useWatchlist';

const MyListRail: React.FC = () => {
  const ids = useWatchlist();
  const [media, setMedia] = useState<AnimeInfoFragment[]>([]);

  const idKey = ids.join(',');

  useEffect(() => {
    const list = idKey
      .split(',')
      .filter(Boolean)
      .map((id) => Number(id));

    let cancelled = false;

    if (list.length === 0) {
      setMedia([]);
    } else {
      getAnimeByIds({ perPage: 30, page: 1, ids: list })
        .then((data) => {
          if (cancelled) return;
          const byId: Record<number, AnimeInfoFragment> = {};
          (data.Page?.media ?? []).forEach((anime) => {
            if (anime) byId[anime.id] = anime;
          });
          // Preserve the watchlist's most-recent-first ordering.
          setMedia(list.map((id) => byId[id]).filter(Boolean));
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [idKey]);

  if (ids.length === 0 || media.length === 0) return null;

  return <Section title="My List" animeList={media} />;
};

export default MyListRail;
