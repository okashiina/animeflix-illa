import Link from 'next/link';

import type { CharacterCard as CharacterCardData } from '@utility/companion/types';

import {
  Avatar,
  CardShell,
  PosterRail,
  relFor,
  type LinkTarget,
} from './cardKit';

// Inline card for a character the companion looked up: portrait + name + generic
// role label + who voices them (links to the VA), then a scrollable rail of the
// other anime the character appears in ("what else is Gojo in"). Role is a label
// only ("main"); the rail is titles/posters only — never a relationship, plot,
// or backstory.

const CharacterCard: React.FC<{
  card: CharacterCardData;
  target?: LinkTarget;
}> = ({ card, target = '_blank' }) => {
  const va =
    card.vaId && card.vaName ? (
      <Link href={`/staff/${card.vaId}`} passHref>
        <a
          target={target}
          rel={relFor(target)}
          className="group inline-flex items-center gap-1.5 text-accent transition hover:text-accent-soft"
        >
          {card.vaImage && (
            <Avatar src={card.vaImage} alt={card.vaName} size={20} />
          )}
          <span className="truncate">{card.vaName}</span>
        </a>
      </Link>
    ) : (
      card.vaName && <span className="text-muted">{card.vaName}</span>
    );

  return (
    <CardShell>
      <div className="flex items-center gap-3">
        <Avatar src={card.image} alt={card.name} rounded="xl" size={48} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-fg">{card.name}</p>
          {card.role && (
            <p className="text-[11px] uppercase tracking-wide text-faint">
              {card.role}
            </p>
          )}
          {va && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
              <span className="text-faint">voiced by</span> {va}
            </p>
          )}
        </div>
      </div>

      {card.media && card.media.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-semibold text-muted">
            Appears in
          </p>
          <PosterRail
            items={card.media}
            target={target}
            label={`Anime ${card.name} appears in`}
          />
        </div>
      )}
    </CardShell>
  );
};

export default CharacterCard;
