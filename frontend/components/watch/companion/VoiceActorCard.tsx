import Link from 'next/link';

import type { VoiceActorCard as VoiceActorCardData } from '@utility/companion/types';

import {
  Avatar,
  CardShell,
  PosterRail,
  relFor,
  type LinkTarget,
} from './cardKit';

// Inline card for a voice actor the companion looked up: portrait + name +
// occupation, then a scrollable rail of the other anime they have voiced (each
// links to the title). All AniList identity data, nothing about this show.

const VoiceActorCard: React.FC<{
  card: VoiceActorCardData;
  target?: LinkTarget;
}> = ({ card, target = '_blank' }) => (
  <CardShell>
    <Link href={`/staff/${card.staffId}`} passHref>
      <a
        target={target}
        rel={relFor(target)}
        className="group flex items-center gap-3"
      >
        <Avatar src={card.image} alt={card.name} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-fg transition group-hover:text-accent">
            {card.name}
          </span>
          {card.native && (
            <span className="block truncate text-xs text-muted">
              {card.native}
            </span>
          )}
          <span className="mt-0.5 block text-[11px] uppercase tracking-wide text-faint">
            {card.occupations?.[0] || 'Voice actor'}
          </span>
        </span>
      </a>
    </Link>

    {card.roles.length > 0 && (
      <div className="mt-3">
        <p className="mb-1.5 text-[11px] font-semibold text-muted">
          Also voices
        </p>
        <PosterRail
          items={card.roles}
          target={target}
          label={`Roles voiced by ${card.name}`}
        />
      </div>
    )}
  </CardShell>
);

export default VoiceActorCard;
