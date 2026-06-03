import { useEffect, useState } from 'react';

import { InferGetServerSidePropsType } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { AnimeInfoFragment } from '@animeflix/api/aniList';
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckCircleIcon,
  CollectionIcon,
  DeviceMobileIcon,
  FilterIcon,
  FireIcon,
  ServerIcon,
  SparklesIcon,
} from '@heroicons/react/outline';
import { PlayIcon } from '@heroicons/react/solid';
import { motion, useReducedMotion } from 'framer-motion';
import { NextSeo } from 'next-seo';

import AiringCard from '@components/anime/AiringCard';
import Section from '@components/anime/Section';
import Footer from '@components/Footer';
import Reveal, {
  EASE,
  RevealItem,
  RevealStagger,
} from '@components/motion/Reveal';
import progressBar from '@components/Progress';
import { AiringEntry, fetchSplashData, MediaInfo } from '@utility/anilist';
import { base64SolidImage } from '@utility/image';

export const getServerSideProps = async () => {
  const data = await fetchSplashData();
  return { props: { ...data } };
};

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

const Poster: React.FC<{ src: string }> = ({ src }) => (
  // eslint-disable-next-line @next/next/no-img-element -- decorative marquee art; next/image adds no value at this opacity
  <img
    src={src}
    alt=""
    aria-hidden
    className="h-36 w-24 shrink-0 rounded-xl object-cover sm:h-44 sm:w-28"
  />
);

const PosterMarquee: React.FC<{
  covers: string[];
  reverse?: boolean;
  reduced: boolean;
}> = ({ covers, reverse, reduced }) => {
  if (covers.length === 0) return null;
  const row = [...covers, ...covers];

  return (
    <motion.div
      className="flex w-max gap-3"
      animate={
        reduced ? undefined : { x: reverse ? ['-50%', '0%'] : ['0%', '-50%'] }
      }
      transition={
        reduced ? undefined : { duration: 70, ease: 'linear', repeat: Infinity }
      }
    >
      {row.map((src, i) => (
        <Poster key={`${src}-${i}`} src={src} />
      ))}
    </motion.div>
  );
};

const Chip: React.FC<{
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  children: React.ReactNode;
}> = ({ icon: Glyph, children }) => (
  <RevealItem>
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line/60 bg-surface/50 px-3.5 py-1.5 text-sm text-muted backdrop-blur-sm">
      <Glyph className="h-4 w-4 text-accent" aria-hidden />
      {children}
    </span>
  </RevealItem>
);

const FeatureEyebrow: React.FC<{
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  children: React.ReactNode;
}> = ({ icon: Glyph, children }) => (
  <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
    <Glyph className="h-4 w-4" aria-hidden />
    {children}
  </span>
);

const PosterFan: React.FC<{ items: MediaInfo[] }> = ({ items }) => {
  const picks = items.slice(0, 3);
  if (picks.length === 0) return null;

  const layout = [
    { x: '-58%', rotate: -9, z: 10 },
    { x: '0%', rotate: 0, z: 20 },
    { x: '58%', rotate: 9, z: 10 },
  ];

  return (
    <div className="relative mx-auto flex h-64 w-full max-w-md items-center justify-center sm:h-72">
      {picks.map((m, i) => {
        const pos = layout[i];
        const title = m.title.romaji || m.title.english || 'Cover';
        return (
          <Link key={m.id} href={`/anime/${m.id}`} passHref>
            <a
              className="group absolute transition-transform duration-300 ease-out hover:-translate-y-2"
              style={{
                transform: `translateX(${pos.x}) rotate(${pos.rotate}deg)`,
                zIndex: pos.z,
              }}
            >
              <div className="relative h-52 w-36 overflow-hidden rounded-2xl shadow-lift ring-1 ring-line/40 transition duration-300 group-hover:ring-2 group-hover:ring-accent/60 sm:h-60 sm:w-40">
                <Image
                  alt={`Cover for ${title}`}
                  src={m.coverImage.large || m.coverImage.medium || ''}
                  layout="fill"
                  objectFit="cover"
                  placeholder="blur"
                  blurDataURL={`data:image/svg+xml;base64,${base64SolidImage(
                    m.coverImage.color || '#1a1a2e'
                  )}`}
                />
              </div>
            </a>
          </Link>
        );
      })}
    </div>
  );
};

const ServerMock: React.FC = () => (
  <div className="mx-auto max-w-sm rounded-2xl border border-line/50 bg-surface/40 p-5 backdrop-blur-sm">
    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-faint">
      choose server
    </p>
    <div className="flex flex-wrap gap-2">
      {['Server 1', 'Server 2', 'Server 3'].map((label, i) => (
        <span
          key={label}
          className={
            i === 0
              ? 'rounded-full bg-aurora px-3.5 py-1.5 text-sm font-semibold text-accent-ink shadow-glow'
              : 'rounded-full border border-line/70 bg-surface/60 px-3.5 py-1.5 text-sm text-muted'
          }
        >
          {label}
        </span>
      ))}
    </div>
    <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted">
      <CheckCircleIcon className="h-4 w-4 text-accent" aria-hidden />
      now playing from Server 1
    </p>
  </div>
);

// ---------------------------------------------------------------------------
// Splash top nav (own minimal bar; the app Header lives on /home)
// ---------------------------------------------------------------------------

const SplashNav: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-colors duration-300 ${
        scrolled
          ? 'border-b border-line/50 bg-canvas/70 backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-screen-2xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" passHref>
          <a
            className="flex items-center gap-2 transition active:scale-95"
            aria-label="kessoku moe"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
            <img
              src="/kessoku-moe-icon.svg"
              alt="kessoku moe"
              className="h-8 w-8"
            />
            <span className="font-display text-lg font-bold lowercase tracking-tight text-fg">
              kessoku<span className="text-accent"> moe</span>
            </span>
          </a>
        </Link>

        <nav className="ml-2 hidden items-center gap-5 sm:flex">
          <Link href="/browse" passHref>
            <a className="text-sm font-medium text-muted transition hover:text-fg">
              Browse
            </a>
          </Link>
          <Link href="/schedule" passHref>
            <a className="text-sm font-medium text-muted transition hover:text-fg">
              Schedule
            </a>
          </Link>
        </nav>

        <Link href="/home" passHref>
          <a className="ml-auto inline-flex items-center gap-2 rounded-full bg-aurora px-4 py-2 text-sm font-semibold text-accent-ink shadow-glow transition duration-200 hover:brightness-110 active:scale-95">
            <PlayIcon className="h-4 w-4" />
            Start watching
          </a>
        </Link>
      </div>
    </header>
  );
};

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

const heroContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const heroItem = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

const Hero: React.FC<{ covers: string[] }> = ({ covers }) => {
  const reduced = useReducedMotion();
  const rowA = covers.slice(0, 8);
  const rowB = covers.slice(8, 16);

  return (
    <section className="relative isolate flex min-h-[88vh] w-full items-center overflow-hidden">
      {/* Atmosphere: faint poster wall + drifting stage-light glows + scrims. */}
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 flex flex-col justify-center gap-3 opacity-[0.13] blur-[1px]">
          <PosterMarquee covers={rowA} reduced={Boolean(reduced)} />
          <PosterMarquee covers={rowB} reverse reduced={Boolean(reduced)} />
        </div>

        <motion.div
          className="absolute -right-24 -top-28 h-[30rem] w-[30rem] rounded-full bg-accent/25 blur-3xl"
          animate={
            reduced
              ? undefined
              : { x: [0, 40, 0], y: [0, 30, 0], scale: [1, 1.12, 1] }
          }
          transition={
            reduced
              ? undefined
              : { duration: 20, repeat: Infinity, ease: 'easeInOut' }
          }
        />
        <motion.div
          className="absolute -left-28 top-1/3 h-[26rem] w-[26rem] rounded-full bg-accent-soft/20 blur-3xl"
          animate={
            reduced
              ? undefined
              : { x: [0, -30, 0], y: [0, 40, 0], scale: [1.1, 1, 1.1] }
          }
          transition={
            reduced
              ? undefined
              : { duration: 24, repeat: Infinity, ease: 'easeInOut' }
          }
        />

        <div className="via-canvas/85 absolute inset-0 bg-gradient-to-r from-canvas to-canvas/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-transparent to-canvas/60" />
      </div>

      <motion.div
        className="mx-auto w-full max-w-screen-2xl px-4 py-20 sm:px-6 lg:px-8"
        variants={heroContainer}
        initial={reduced ? 'show' : 'hidden'}
        animate="show"
      >
        <div className="max-w-3xl">
          <motion.div variants={heroItem}>
            <motion.img
              src="/kessoku-moe-icon.svg"
              alt=""
              aria-hidden
              className="h-14 w-14 sm:h-16 sm:w-16"
              animate={
                reduced ? undefined : { y: [0, -8, 0], rotate: [0, -3, 0] }
              }
              transition={
                reduced
                  ? undefined
                  : { duration: 5, repeat: Infinity, ease: 'easeInOut' }
              }
            />
          </motion.div>

          <motion.p
            variants={heroItem}
            className="mt-6 text-xs font-semibold uppercase tracking-[0.32em] text-accent"
          >
            dark · cute · a little rock
          </motion.p>

          <motion.h1
            variants={heroItem}
            className="mt-4 font-display text-4xl font-extrabold leading-[1.02] text-fg sm:text-6xl lg:text-7xl"
          >
            all your anime,
            <br />
            one stage.
          </motion.h1>

          <motion.p
            variants={heroItem}
            className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg"
          >
            Thousands of titles, no pop-ups, no sign-up. Hit play and it picks
            up right where you left off.
          </motion.p>

          <motion.div
            variants={heroItem}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Link href="/home" passHref>
              <a className="inline-flex items-center gap-2 rounded-full bg-aurora px-7 py-3.5 text-sm font-semibold text-accent-ink shadow-glow transition duration-200 ease-out hover:brightness-110 active:scale-95 sm:text-base">
                <PlayIcon className="h-5 w-5" />
                Start watching
              </a>
            </Link>
            <Link href="/browse" passHref>
              <a className="inline-flex items-center gap-2 rounded-full border border-line/70 bg-surface/40 px-7 py-3.5 text-sm font-semibold text-fg backdrop-blur-sm transition duration-200 ease-out hover:border-accent/60 hover:bg-surface-2 active:scale-95 sm:text-base">
                Browse the catalog
                <ArrowRightIcon className="h-4 w-4" />
              </a>
            </Link>
          </motion.div>

          <motion.p variants={heroItem} className="mt-5 text-sm text-faint">
            Catalog, art, and schedules all come from AniList.
          </motion.p>
        </div>
      </motion.div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const Splash = ({
  trending,
  airing,
  featured,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();

  useEffect(() => {
    progressBar.finish();
    // Warm the content home so "Start watching" feels instant.
    router.prefetch('/home');
  }, [router]);

  const covers = trending
    .map((m) => m.coverImage.medium || m.coverImage.large)
    .filter((c): c is string => Boolean(c));

  return (
    <>
      <NextSeo
        title="kessoku moe · all your anime, one stage"
        description="Free anime streaming with trending, seasonal, and top-rated picks, plus an airing schedule with live countdowns. Dark, cute, a little rock."
      />

      <SplashNav />

      <main>
        <Hero covers={covers} />

        {/* Credential strip */}
        <RevealStagger className="mx-auto -mt-4 flex max-w-screen-2xl flex-wrap gap-2.5 px-4 sm:px-6 lg:px-8">
          <Chip icon={CollectionIcon}>AniList catalog</Chip>
          <Chip icon={SparklesIcon}>fresh every season</Chip>
          <Chip icon={FilterIcon}>browse + filter</Chip>
          <Chip icon={CalendarIcon}>schedule + countdowns</Chip>
          <Chip icon={DeviceMobileIcon}>installable (PWA)</Chip>
        </RevealStagger>

        {/* Features */}
        <section className="mx-auto mt-24 max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mb-12 max-w-2xl">
            <h2 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
              Most anime sites make you work for it
            </h2>
            <p className="mt-3 text-muted">
              Pop-ups, dead links, five servers before one loads. kessoku moe
              skips all that so you can actually watch something.
            </p>
          </Reveal>

          <div className="space-y-20">
            {/* Block 1 */}
            <Reveal>
              <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-16">
                <div className="lg:w-1/2">
                  <FeatureEyebrow icon={FireIcon}>watch</FeatureEyebrow>
                  <h3 className="mt-3 font-display text-2xl font-bold text-fg sm:text-3xl">
                    Jump straight to the good stuff
                  </h3>
                  <p className="mt-4 max-w-md leading-relaxed text-muted">
                    Trending now, this season&apos;s biggest, and the all-time
                    favorites. It&apos;s all on the home page. Pick one and hit
                    play.
                  </p>
                </div>
                <div className="lg:w-1/2">
                  <PosterFan
                    items={featured.length > 0 ? featured : trending}
                  />
                </div>
              </div>
            </Reveal>

            {/* Block 2 */}
            <Reveal>
              <div className="flex flex-col gap-10 lg:flex-row-reverse lg:items-center lg:gap-16">
                <div className="lg:w-1/2">
                  <FeatureEyebrow icon={CalendarIcon}>schedule</FeatureEyebrow>
                  <h3 className="mt-3 font-display text-2xl font-bold text-fg sm:text-3xl">
                    Know exactly when the next episode drops
                  </h3>
                  <p className="mt-4 max-w-md leading-relaxed text-muted">
                    Every show airing this week, counted down to the minute. No
                    more guessing when a release lands.
                  </p>
                </div>
                <div className="lg:w-1/2">
                  {airing.length > 0 ? (
                    <div className="flex justify-center gap-4">
                      {airing.slice(0, 2).map((entry) => (
                        <AiringCard
                          key={`${entry.media?.id}-${entry.episode}`}
                          entry={entry}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="mx-auto max-w-sm rounded-2xl border border-line/50 bg-surface/40 p-6 text-center text-muted backdrop-blur-sm">
                      This week&apos;s airing schedule shows up here.
                    </div>
                  )}
                </div>
              </div>
            </Reveal>

            {/* Block 3 */}
            <Reveal>
              <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-16">
                <div className="lg:w-1/2">
                  <FeatureEyebrow icon={ServerIcon}>player</FeatureEyebrow>
                  <h3 className="mt-3 font-display text-2xl font-bold text-fg sm:text-3xl">
                    Plenty of servers, one click to switch
                  </h3>
                  <p className="mt-4 max-w-md leading-relaxed text-muted">
                    One source buffering? Switch to the next in a click. No
                    reload, no losing your place.
                  </p>
                </div>
                <div className="lg:w-1/2">
                  <ServerMock />
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Live proof */}
        {trending.length > 0 && (
          <Reveal className="mt-24">
            <Section
              title="Trending this week"
              animeList={trending as unknown as AnimeInfoFragment[]}
            />
          </Reveal>
        )}

        {/* Airing teaser */}
        {airing.length > 0 && (
          <Reveal className="mt-12">
            <div className="mb-3 flex items-center gap-2.5 px-4 sm:px-6 lg:px-8">
              <span className="h-5 w-1 rounded-full bg-aurora" aria-hidden />
              <h2 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
                Airing this week
              </h2>
              <Link href="/schedule" passHref>
                <a className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-muted transition hover:text-accent">
                  See all
                  <ArrowRightIcon className="h-4 w-4" aria-hidden />
                </a>
              </Link>
            </div>
            <div className="edge-fade-x">
              <div className="flex snap-x gap-4 overflow-x-auto overflow-y-hidden scroll-smooth px-4 pb-3 scrollbar-hide sm:px-6 lg:px-8">
                {airing.slice(0, 12).map((entry: AiringEntry) => (
                  <AiringCard
                    key={`${entry.media?.id}-${entry.episode}-${entry.airingAt}`}
                    entry={entry}
                  />
                ))}
              </div>
            </div>
          </Reveal>
        )}

        {/* Final CTA */}
        <Reveal>
          <section className="mx-auto my-24 max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-3xl border border-line/40 bg-canvas-2/60 px-6 py-16 text-center sm:py-20">
              <div aria-hidden className="absolute inset-0 -z-10">
                <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-accent/25 blur-3xl" />
              </div>
              <h2 className="font-display text-3xl font-extrabold tracking-tight text-fg sm:text-5xl">
                Ready for the show?
              </h2>
              <p className="mx-auto mt-4 max-w-md text-muted">
                Thousands of shows, zero hoops. Start with what&apos;s hot, or
                dig up the one you never finished.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link href="/home" passHref>
                  <a className="inline-flex items-center gap-2 rounded-full bg-aurora px-7 py-3.5 text-sm font-semibold text-accent-ink shadow-glow transition duration-200 hover:brightness-110 active:scale-95 sm:text-base">
                    <PlayIcon className="h-5 w-5" />
                    Start watching
                  </a>
                </Link>
                <Link href="/browse" passHref>
                  <a className="inline-flex items-center gap-2 rounded-full border border-line/70 bg-surface/40 px-7 py-3.5 text-sm font-semibold text-fg backdrop-blur-sm transition duration-200 hover:border-accent/60 hover:bg-surface-2 active:scale-95 sm:text-base">
                    Browse the catalog
                  </a>
                </Link>
              </div>
              <p className="mt-6 inline-flex items-center gap-2 text-xs text-faint">
                <DeviceMobileIcon className="h-4 w-4" aria-hidden />
                install it on your phone (PWA)
              </p>
            </div>
          </section>
        </Reveal>
      </main>

      <Footer />
    </>
  );
};

export default Splash;
