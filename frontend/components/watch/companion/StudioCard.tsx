import Link from 'next/link';

import type { StudioCard as StudioCardData } from '@utility/companion/types';

import { CardShell, PosterRail, relFor, type LinkTarget } from './cardKit';

// Inline card for an animation studio: name + a scrollable rail of its other
// titles. Identity data only; says nothing about this show's plot.

const StudioCard: React.FC<{
  card: StudioCardData;
  target?: LinkTarget;
}> = ({ card, target = '_blank' }) => (
  <CardShell>
    <Link href={`/studio/${card.studioId}`} passHref>
      <a
        target={target}
        rel={relFor(target)}
        className="group flex items-baseline justify-between gap-2"
      >
        <span className="min-w-0">
          <span className="block text-[11px] uppercase tracking-wide text-faint">
            Studio
          </span>
          <span className="block truncate text-sm font-bold text-fg transition group-hover:text-accent">
            {card.name}
          </span>
        </span>
        {card.media.length > 0 && (
          <span className="shrink-0 text-[11px] text-muted">
            {card.media.length} {card.media.length === 1 ? 'title' : 'titles'}
          </span>
        )}
      </a>
    </Link>

    <div className="mt-3">
      <PosterRail
        items={card.media}
        target={target}
        label={`Anime by ${card.name}`}
      />
    </div>
  </CardShell>
);

export default StudioCard;
