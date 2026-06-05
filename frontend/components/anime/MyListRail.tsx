import { useEffect, useState } from 'react';

import { AnimeInfoFragment } from '@animeflix/api/aniList';

import Section from '@components/anime/Section';
import useWatchlist from '@hooks/useWatchlist';
import { getAllAnimeByIds } from '@utility/animeByIds';

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
      // Already ordered to match `list` (most-recent-first), no 30-cap.
      getAllAnimeByIds(list)
        .then((resolved) => {
          if (!cancelled) setMedia(resolved);
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
