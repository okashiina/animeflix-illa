import type { CompanionCard } from '@utility/companion/types';

import type { LinkTarget } from './cardKit';
import CharacterCard from './CharacterCard';
import StudioCard from './StudioCard';
import VoiceActorCard from './VoiceActorCard';

// Renders the entity cards attached to one assistant turn, above its text.
// Switches on the discriminated `kind`; unknown kinds are skipped so an older
// persisted thread can't crash a newer client.

const CompanionCards: React.FC<{
  cards?: CompanionCard[];
  // Default '_blank': companion links always open a new tab so the viewer never
  // leaves the episode they're streaming.
  target?: LinkTarget;
}> = ({ cards, target = '_blank' }) => {
  if (!cards || cards.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {cards.map((card, i) => {
        // eslint-disable-next-line react/no-array-index-key
        const key = i;
        switch (card.kind) {
          case 'voiceActor':
            return <VoiceActorCard key={key} card={card} target={target} />;
          case 'studio':
            return <StudioCard key={key} card={card} target={target} />;
          case 'character':
            return <CharacterCard key={key} card={card} target={target} />;
          default:
            return null;
        }
      })}
    </div>
  );
};

export default CompanionCards;
