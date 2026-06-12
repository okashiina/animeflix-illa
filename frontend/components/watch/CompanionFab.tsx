import { useEffect, useState } from 'react';

import { ChatAlt2Icon, XIcon } from '@heroicons/react/outline';
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
} from 'framer-motion';

import CompanionChat from '@components/watch/CompanionChat';
import type { CompanionSeed } from '@components/watch/CompanionChat';

// Mobile-only floating companion. On phones the right rail is gone and the
// companion lives far down the page, so you can't chat without scrolling away
// from the video. This pins a customer-service-style button bottom-right that
// pops the companion up as a bottom sheet — video stays visible above it.
// Desktop keeps the right-rail tab (this is `lg:hidden`), so nothing doubles up.

const HINT_KEY = 'kessoku.companion.fab.hint.v1';

const CompanionFab: React.FC<{
  seed: CompanionSeed;
  animeId: number;
  episode: number;
  total: number;
}> = ({ seed, animeId, episode, total }) => {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(false);
  const dragControls = useDragControls();

  // One-time nudge, mirroring the player's hint pattern: shown once ever, then
  // remembered so a returning viewer isn't pestered.
  useEffect(() => {
    let seen = true;
    try {
      seen = Boolean(window.localStorage.getItem(HINT_KEY));
    } catch {
      /* ignore */
    }
    if (seen) return undefined;
    const show = setTimeout(() => setHint(true), 1600);
    const hide = setTimeout(() => setHint(false), 7600);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);

  const dismissHint = () => {
    if (!hint) return;
    setHint(false);
    try {
      window.localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const openSheet = () => {
    dismissHint();
    setOpen(true);
  };

  // Lock the page behind the sheet + let Escape close it.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      {/* Floating button — hidden while the sheet is up so it doesn't peek
          through the backdrop. Sits above the iOS home indicator. */}
      {!open && (
        <div
          className="fixed right-4 z-40 lg:hidden"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
        >
          <AnimatePresence>
            {hint && (
              <motion.button
                type="button"
                onClick={openSheet}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                className="absolute bottom-1 right-16 w-max max-w-[60vw] rounded-2xl rounded-br-sm border border-line/60 bg-canvas-2/95 px-3.5 py-2 text-left text-sm text-fg shadow-card backdrop-blur"
              >
                tap me, i won&apos;t spoil a thing
              </motion.button>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={openSheet}
            aria-label="Open watch companion"
            className="relative grid h-14 w-14 place-items-center rounded-full bg-aurora text-accent-ink shadow-glow transition active:scale-95"
          >
            {/* Breathing ring — the "someone's here to help" pulse. Off when the
                viewer asked for reduced motion. */}
            {!reduced && (
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-full bg-accent/40"
                animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }}
                transition={{
                  duration: 2.6,
                  repeat: Infinity,
                  ease: 'easeOut',
                }}
              />
            )}
            <ChatAlt2Icon className="relative h-7 w-7" />
          </button>
        </div>
      )}

      {/* Bottom sheet. Backdrop + panel are direct motion children of
          AnimatePresence so each plays its own exit (the panel slides back down
          on close rather than vanishing). */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="companion-backdrop"
            className="fixed inset-0 z-50 bg-canvas/70 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
        )}
        {open && (
          <motion.div
            key="companion-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Watch companion"
            className="supports-[height:1dvh]:h-[85dvh] fixed inset-x-0 bottom-0 z-50 flex h-[85vh] flex-col overflow-hidden rounded-t-3xl border-t border-line/60 bg-canvas-2 shadow-card lg:hidden"
            initial={reduced ? { opacity: 0 } : { y: '100%' }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            drag={reduced ? false : 'y'}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) setOpen(false);
            }}
          >
            {/* Grab handle — the drag-to-dismiss affordance. The chat below
                keeps its own header, so this stays just a handle + close. */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="relative flex shrink-0 cursor-grab touch-none items-center justify-center pb-1 pt-3 active:cursor-grabbing"
            >
              <span className="h-1.5 w-10 rounded-full bg-line" aria-hidden />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close watch companion"
                className="absolute right-3 top-2.5 grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-surface hover:text-fg"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1">
              <CompanionChat
                seed={seed}
                animeId={animeId}
                episode={episode}
                total={total}
                variant="dock"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default CompanionFab;
