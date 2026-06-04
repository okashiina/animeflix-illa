import { useEffect, useState } from 'react';

import AniListBenefitsModal from '@components/AniListBenefitsModal';
import useAniListAuth from '@hooks/useAniListAuth';
import { clientId } from '@utility/anilistAuth';

// A signed-out nudge for the /watchlist page (and anywhere a list lives). Opens
// the same benefits modal as the header. Hides itself when logged in or when no
// AniList client id is configured. Mounted-guarded so a logged-in viewer never
// sees it flash on hydration.
const AniListSignInBanner: React.FC = () => {
  const { isLoggedIn, login } = useAniListAuth();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || !clientId() || isLoggedIn) return null;

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-line/50 bg-surface/40 p-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface ring-1 ring-line/50">
            {/* eslint-disable-next-line @next/next/no-img-element -- inline brand SVG */}
            <img src="/kessoku-moe-icon.svg" alt="" className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-base font-bold text-fg">
              Carry your list everywhere
            </p>
            <p className="mt-0.5 text-sm leading-relaxed text-muted">
              Sign in with AniList so your watchlist and progress follow you,
              phone to laptop.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 self-start rounded-full bg-aurora px-5 py-2 text-sm font-semibold text-accent-ink shadow-glow transition duration-200 hover:brightness-110 active:scale-95 sm:self-auto"
        >
          Sign in
        </button>
      </div>

      <AniListBenefitsModal
        open={open}
        onClose={() => setOpen(false)}
        onContinue={login}
      />
    </>
  );
};

export default AniListSignInBanner;
