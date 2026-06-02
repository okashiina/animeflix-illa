import { useSelector } from '@store/store';
import { getProvider } from '@utility/embedProviders';

const EmbedPlayer: React.FC = () => {
  const [animeId, episode] = useSelector((store) => [
    store.anime.anime,
    store.episode.episode,
  ]);
  const { useDub, provider } = useSelector((store) => store.videoSettings);

  const src = getProvider(provider).build(animeId, episode, useDub);

  // NOTE: this project disables Tailwind's core aspectRatio plugin
  // (corePlugins.aspectRatio = false) and uses @tailwindcss/aspect-ratio
  // instead, so the ratio box must use `aspect-w-* / aspect-h-*`, not
  // `aspect-video`. The plugin absolutely-positions the direct child to fill.
  return (
    <div className="aspect-w-16 aspect-h-9 w-full overflow-hidden rounded-md bg-black">
      <iframe
        key={src}
        src={src}
        title="Anime video player"
        className="border-0"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        referrerPolicy="no-referrer"
      />
    </div>
  );
};

export default EmbedPlayer;
