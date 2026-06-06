import { useEffect, useState } from 'react';

import { SparklesIcon, UserGroupIcon } from '@heroicons/react/outline';

import CompanionChat, {
  type CompanionSeed,
} from '@components/watch/CompanionChat';
import RoomUI from '@components/watch/RoomUI';
import { useRoom } from '@utility/room';

// The fullscreen "theater" dock. In fullscreen the page right-rail is gone, so
// this brings its two interactive tabs (Companion / Together) over the video.
// Recommended is left out — it's browsing, not something you do mid-scene. Both
// children render their `dock` variant (full height, no card chrome) and share
// the same animeId+episode / room as the right-rail instances, so nothing
// diverges between the two surfaces.

type Tab = 'companion' | 'room';

const TabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  label: string;
  dot?: boolean;
}> = ({ active, onClick, icon: Icon, label, dot }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
      active
        ? 'bg-aurora text-accent-ink shadow-glow'
        : 'text-muted hover:text-fg'
    }`}
  >
    <Icon className="h-3.5 w-3.5" />
    {label}
    {dot && (
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          active ? 'bg-accent-ink' : 'bg-accent'
        }`}
        aria-hidden
      />
    )}
  </button>
);

const FullscreenDock: React.FC<{
  seed: CompanionSeed;
  animeId: number;
  episode: number;
  total: number;
  roomInitialCode?: string;
}> = ({ seed, animeId, episode, total, roomInitialCode }) => {
  const room = useRoom();
  const inRoom = room.status === 'connected';
  // Open on whichever tab the viewer is most likely here for: the room if they
  // are already in one, otherwise the companion.
  const [tab, setTab] = useState<Tab>(inRoom ? 'room' : 'companion');

  // Joining a room while the dock is open pulls it forward.
  useEffect(() => {
    if (inRoom) setTab('room');
  }, [inRoom]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-line/50 px-2 py-2">
        <TabButton
          active={tab === 'companion'}
          onClick={() => setTab('companion')}
          icon={SparklesIcon}
          label="Companion"
        />
        <TabButton
          active={tab === 'room'}
          onClick={() => setTab('room')}
          icon={UserGroupIcon}
          label="Together"
          dot={inRoom}
        />
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'companion' ? (
          <CompanionChat
            seed={seed}
            animeId={animeId}
            episode={episode}
            total={total}
            variant="dock"
          />
        ) : (
          <RoomUI
            initialCode={roomInitialCode}
            companion={{ seed, episode, total }}
            variant="dock"
          />
        )}
      </div>
    </div>
  );
};

export default FullscreenDock;
