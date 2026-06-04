import { useEffect, useRef, useState } from 'react';

import AniListBenefitsModal from '@components/AniListBenefitsModal';
import useAniListAuth from '@hooks/useAniListAuth';
import { clientId } from '@utility/anilistAuth';

// Header sign-in control. Hidden entirely until an AniList client id is built in
// (NEXT_PUBLIC_ANILIST_CLIENT_ID), so it never shows a dead button. Signed out,
// "Sign in" opens a short benefits modal before the redirect; signed in, it's an
// avatar with a small menu to log out.
const AniListAuthButton: React.FC = () => {
  const { session, isLoggedIn, login, logout } = useAniListAuth();
  const [open, setOpen] = useState(false);
  const [benefitsOpen, setBenefitsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Configured at build time only; no point showing a button that can't work.
  if (!clientId()) return null;

  if (!isLoggedIn) {
    return (
      <>
        <button
          type="button"
          onClick={() => setBenefitsOpen(true)}
          title="Sync your list with AniList"
          className="shrink-0 rounded-full border border-line/70 bg-surface/70 px-3.5 py-2 text-sm font-medium text-muted backdrop-blur-sm transition hover:border-accent/60 hover:text-fg"
        >
          Sign in
        </button>
        <AniListBenefitsModal
          open={benefitsOpen}
          onClose={() => setBenefitsOpen(false)}
          onContinue={login}
        />
      </>
    );
  }

  const { user } = session!;

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="block h-9 w-9 overflow-hidden rounded-full ring-1 ring-line/60 transition hover:ring-accent/60"
        title={user.name}
      >
        {user.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- small remote avatar; next/image adds no value here
          <img
            src={user.avatar}
            alt={user.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="grid h-full w-full place-items-center bg-surface-2 text-sm font-semibold text-fg">
            {user.name.charAt(0).toUpperCase()}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-line/60 bg-canvas/95 shadow-lift ring-1 ring-line/40 backdrop-blur-xl"
        >
          <div className="border-b border-line/50 px-4 py-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-faint">
              Signed in as
            </p>
            <p className="truncate text-sm font-semibold text-fg">
              {user.name}
            </p>
            <p className="mt-0.5 text-xs text-muted">Syncing with AniList</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="w-full px-4 py-2.5 text-left text-sm font-medium text-muted transition hover:bg-surface/60 hover:text-fg"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
};

export default AniListAuthButton;
