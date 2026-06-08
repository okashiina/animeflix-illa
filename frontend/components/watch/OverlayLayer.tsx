import { useEffect, useRef, useState } from 'react';

import {
  onDanmaku,
  onReaction,
  useDanmakuOn,
  type DanmakuItem,
  type ReactionItem,
} from '@utility/roomOverlayStore';

// On-video overlay for co-watch rooms: danmaku (scrolling bullet comments) +
// reaction floaties (rising emoji). Mounted inside the player's video region via
// HlsPlayer's `overlaySlot`, so it tracks the picture windowed AND fullscreen.
// Render-only and non-interactive — the send controls live in the Together panel
// (RoomChat), so the player stays clean. Live-only for v1 (everyone is
// playback-synced, so an arriving comment is "at this moment").

interface FlyingDanmaku extends DanmakuItem {
  lane: number;
}
interface FloatingReaction extends ReactionItem {
  left: number;
}

const LANES = 8; // vertical tracks; round-robin to avoid stacking

const OverlayLayer: React.FC = () => {
  const danmakuOn = useDanmakuOn();
  const [danmaku, setDanmaku] = useState<FlyingDanmaku[]>([]);
  const [floaties, setFloaties] = useState<FloatingReaction[]>([]);

  const laneRef = useRef(0);
  const reducedRef = useRef(false);

  useEffect(() => {
    reducedRef.current =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }, []);

  // Incoming danmaku → assign a lane, cap the on-screen count for perf.
  useEffect(
    () =>
      onDanmaku((d) => {
        if (reducedRef.current) return;
        const lane = laneRef.current % LANES;
        laneRef.current += 1;
        setDanmaku((list) => [...list.slice(-39), { ...d, lane }]);
      }),
    []
  );

  // Incoming reaction → a floaty at a random-ish horizontal spot.
  useEffect(
    () =>
      onReaction((r) => {
        if (reducedRef.current) return;
        setFloaties((list) => [
          ...list.slice(-29),
          { ...r, left: 6 + Math.random() * 80 },
        ]);
      }),
    []
  );

  return (
    <>
      {/* Danmaku lanes */}
      {danmakuOn &&
        danmaku.map((d) => (
          <span
            key={d.id}
            onAnimationEnd={() =>
              setDanmaku((list) => list.filter((x) => x.id !== d.id))
            }
            className="absolute left-full animate-danmaku whitespace-nowrap font-semibold text-white/95 drop-shadow-[0_1px_3px_rgba(0,0,0,0.92)]"
            style={{
              top: `${8 + d.lane * 7}%`,
              fontSize: 'clamp(13px, 2cqw, 40px)',
            }}
          >
            {d.name ? (
              <span className="mr-1.5 text-accent">{d.name}</span>
            ) : null}
            {d.text}
          </span>
        ))}

      {/* Reaction floaties */}
      {floaties.map((f) => (
        <span
          key={f.id}
          onAnimationEnd={() =>
            setFloaties((list) => list.filter((x) => x.id !== f.id))
          }
          className="absolute bottom-[14%] animate-floaty select-none"
          style={{ left: `${f.left}%`, fontSize: 'clamp(22px, 3cqw, 48px)' }}
        >
          {f.emoji}
        </span>
      ))}
    </>
  );
};

export default OverlayLayer;
