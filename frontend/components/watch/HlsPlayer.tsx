import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

// Our own player chrome for the self-hosted (Option B) HLS stream. Native
// `<video controls>` can't be restyled and has no skip / PiP / settings, so we
// hide it and draw a kessoku-styled control layer over the raw <video>:
// scrubber w/ buffered range, configurable skip, volume, speed, quality, PiP,
// fullscreen, a keyboard-shortcut guide, and user-customizable subtitles
// (size / colour / background) rendered ourselves so styling is fully ours.
// No new dependency — hls.js is already a dep; icons are hand-rolled SVG.
// (The legacy Vime VideoPlayer.tsx is the dead GogoAnime player; untouched.)

interface Source {
  url: string;
  quality?: string;
}
export interface Subtitle {
  url: string;
  lang: string;
  label?: string;
}

interface HlsPlayerProps {
  sources: Source[];
  qIdx: number;
  onQuality: (i: number) => void;
  provider: string;
  subtitles?: Subtitle[];
  onUseEmbed: () => void;
  onUnplayable: () => void;
  onNext?: () => void;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SKIPS = [5, 10, 15];
// Caption sizes scale with the player width (cqw — the stage is a container, see
// `containerType` on the stage element) and are clamped so they stay sane from a
// small windowed player up to a 4K fullscreen. Bigger than fixed px on hi-DPI.
const CAP_SIZES: { k: string; css: string }[] = [
  { k: 'S', css: 'clamp(13px, 1.8cqw, 36px)' },
  { k: 'M', css: 'clamp(15px, 2.2cqw, 46px)' },
  { k: 'L', css: 'clamp(18px, 2.8cqw, 64px)' },
  { k: 'XL', css: 'clamp(22px, 3.8cqw, 88px)' },
];
const PREFS_KEY = 'kessoku.player.v2';
const HIDE_MS = 2600;

type CapColor = 'white' | 'yellow';
type CapBg = 'solid' | 'semi' | 'none';
const CAP_BG: Record<CapBg, string> = {
  solid: 'rgba(8,8,18,0.82)',
  semi: 'rgba(8,8,18,0.5)',
  none: 'transparent',
};
interface Prefs {
  skip: number;
  rate: number;
  volume: number;
  muted: boolean;
  capSize: string; // one of CAP_SIZES keys
  capColor: CapColor;
  capBg: CapBg;
  subOffset: number; // subtitle delay in seconds (+ = subs later)
  capPos: { x: number; y: number } | null; // drag position (% of stage); null = default bottom-centre
}

const loadPrefs = (): Prefs => {
  const base: Prefs = {
    skip: 10,
    rate: 1,
    volume: 1,
    muted: false,
    capSize: 'M',
    capColor: 'white',
    capBg: 'semi',
    subOffset: 0,
    capPos: null,
  };
  if (typeof window === 'undefined') return base;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? { ...base, ...(JSON.parse(raw) as Partial<Prefs>) } : base;
  } catch {
    return base;
  }
};

const fmt = (s: number): string => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const total = Math.floor(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
};

// Chrome can't addSourceBuffer for AAC Main ('mp4a.40.1'), but AnimePahe/kwik
// mis-signals AAC-LC audio as Main. Remap the codec at the MSE boundary so the
// buffer is created; the bytes decode either way. Scoped to this document.
function patchAacMainCodec(): void {
  if (typeof window === 'undefined' || typeof MediaSource === 'undefined')
    return;
  const w = window as unknown as { kessokuAacPatched?: boolean };
  if (w.kessokuAacPatched) return;
  w.kessokuAacPatched = true;
  const fix = (mime: string): string =>
    mime.replace(/mp4a\.40\.1\b/g, 'mp4a.40.2');
  const isSupported = MediaSource.isTypeSupported.bind(MediaSource);
  MediaSource.isTypeSupported = (mime: string) => isSupported(fix(mime));
  const add = MediaSource.prototype.addSourceBuffer;
  MediaSource.prototype.addSourceBuffer = function patched(mime: string) {
    return add.call(this, fix(mime));
  };
}

// ---- Hand-rolled SVG icons (consistent 2px stroke, currentColor) ----
type IconProps = { className?: string };
const S = (className?: string) => `h-[22px] w-[22px] ${className || ''}`;
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const PlayIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    className={className || 'h-[22px] w-[22px]'}
    aria-hidden="true"
  >
    <path d="M7 4.5v15l13-7.5z" fill="currentColor" />
  </svg>
);
const PauseIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    className={className || 'h-[22px] w-[22px]'}
    aria-hidden="true"
  >
    <rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" />
    <rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" />
  </svg>
);
// Circular arrow (Lucide rotate-ccw / -cw) with the interval centred inside —
// roomy enough that two digits never collide with the arrow.
const SkipBackIcon = ({ seconds }: { seconds: number }) => (
  <svg viewBox="0 0 24 24" className={S()} aria-hidden="true" {...stroke}>
    <path d="M3 12a9 9 0 1 0 9-9 9.8 9.8 0 0 0-6.7 2.7L3 8" />
    <path d="M3 3v5h5" />
    <text
      x="12"
      y="13"
      fill="currentColor"
      stroke="none"
      fontSize="7.5"
      fontWeight="700"
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {seconds}
    </text>
  </svg>
);
const SkipFwdIcon = ({ seconds }: { seconds: number }) => (
  <svg viewBox="0 0 24 24" className={S()} aria-hidden="true" {...stroke}>
    <path d="M21 12a9 9 0 1 1-9-9 9.8 9.8 0 0 1 6.7 2.7L21 8" />
    <path d="M21 3v5h-5" />
    <text
      x="12"
      y="13"
      fill="currentColor"
      stroke="none"
      fontSize="7.5"
      fontWeight="700"
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {seconds}
    </text>
  </svg>
);
const VolumeIcon = ({ muted }: { muted: boolean }) => (
  <svg viewBox="0 0 24 24" className={S()} aria-hidden="true" {...stroke}>
    <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" />
    {muted ? (
      <path d="M22 9l-6 6M16 9l6 6" />
    ) : (
      <>
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 6a9 9 0 0 1 0 12" />
      </>
    )}
  </svg>
);
const CcIcon = ({ active }: { active: boolean }) => (
  <svg viewBox="0 0 24 24" className={S()} aria-hidden="true" {...stroke}>
    <rect
      x="3"
      y="5"
      width="18"
      height="14"
      rx="3"
      fill={active ? 'currentColor' : 'none'}
    />
    <path
      d="M9.5 10.5a2.4 2.4 0 1 0 0 3M16.5 10.5a2.4 2.4 0 1 0 0 3"
      stroke={active ? 'oklch(var(--accent-ink))' : 'currentColor'}
    />
  </svg>
);
const KeyboardIcon = () => (
  <svg viewBox="0 0 24 24" className={S()} aria-hidden="true" {...stroke}>
    <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
    <path d="M6 10h0M9.5 10h0M13 10h0M16.5 10h0M6 13h0M16.5 13h0M9 13.5h6" />
  </svg>
);
const SettingsIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    className={`${S()} transition-transform duration-300 ${
      active ? 'rotate-90' : ''
    }`}
    aria-hidden="true"
    {...stroke}
  >
    <path d="M4 8h8M17 8h3M4 16h3M12 16h8" />
    <circle cx="14" cy="8" r="2.2" />
    <circle cx="9" cy="16" r="2.2" />
  </svg>
);
const PipIcon = () => (
  <svg viewBox="0 0 24 24" className={S()} aria-hidden="true" {...stroke}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <rect
      x="11.5"
      y="11"
      width="7"
      height="5"
      rx="1.2"
      fill="currentColor"
      stroke="none"
    />
  </svg>
);
const NextIcon = () => (
  <svg viewBox="0 0 24 24" className={S()} aria-hidden="true" {...stroke}>
    <path d="M6 5l9 7-9 7z" fill="currentColor" />
    <path d="M18 5v14" />
  </svg>
);
const FullEnterIcon = () => (
  <svg viewBox="0 0 24 24" className={S()} aria-hidden="true" {...stroke}>
    <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
  </svg>
);
const FullExitIcon = () => (
  <svg viewBox="0 0 24 24" className={S()} aria-hidden="true" {...stroke}>
    <path d="M9 4v3a2 2 0 0 1-2 2H4M15 4v3a2 2 0 0 0 2 2h3M9 20v-3a2 2 0 0 0-2-2H4M15 20v-3a2 2 0 0 1 2-2h3" />
  </svg>
);

// A control-bar icon button: 40px hit area, clear hover + press feedback.
const CtrlButton: React.FC<{
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}> = ({ label, onClick, children, active }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className={`grid h-10 w-10 place-items-center rounded-full transition duration-150 active:scale-90 ${
      active ? 'text-accent' : 'text-fg/85 hover:bg-fg/10 hover:text-fg'
    }`}
  >
    {children}
  </button>
);

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="inline-grid min-w-[1.6rem] place-items-center rounded-md border border-line/70 bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-fg shadow-sm">
    {children}
  </kbd>
);

const HlsPlayer: React.FC<HlsPlayerProps> = ({
  sources,
  qIdx,
  onQuality,
  provider,
  subtitles = [],
  onUseEmbed,
  onUnplayable,
  onNext,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const resumeTime = useRef(0);
  const wasPlaying = useRef(true);
  const onUnplayableRef = useRef(onUnplayable);
  onUnplayableRef.current = onUnplayable;

  const src = sources[qIdx]?.url;

  const initial = useRef<Prefs>(loadPrefs());
  const [skip, setSkip] = useState(initial.current.skip);
  const [rate, setRate] = useState(initial.current.rate);
  const [muted, setMuted] = useState(initial.current.muted);
  const [volume, setVolume] = useState(initial.current.volume);
  const [capSize, setCapSize] = useState(initial.current.capSize);
  const [capColor, setCapColor] = useState<CapColor>(initial.current.capColor);
  const [capBg, setCapBg] = useState<CapBg>(initial.current.capBg);
  const [subOffset, setSubOffset] = useState(initial.current.subOffset);
  const [capPos, setCapPos] = useState(initial.current.capPos);
  const capDrag = useRef<{
    px: number;
    py: number;
    sx: number;
    sy: number;
    w: number;
    h: number;
  } | null>(null);

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isFs, setIsFs] = useState(false);
  const [showUi, setShowUi] = useState(true);
  const [settings, setSettings] = useState(false);
  const [help, setHelp] = useState(false);
  const [subIdx, setSubIdx] = useState(-1);
  const [cueText, setCueText] = useState('');

  // Persist preferences whenever they change.
  useEffect(() => {
    try {
      const prefs: Prefs = {
        skip,
        rate,
        volume,
        muted,
        capSize,
        capColor,
        capBg,
        subOffset,
        capPos,
      };
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [skip, rate, volume, muted, capSize, capColor, capBg, subOffset, capPos]);

  // ---- hls.js wiring (codec shim + media-error recovery + embed fallback) ----
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;

    patchAacMainCodec();
    let destroyed = false;
    let hls: { destroy: () => void } | null = null;
    let mediaRecover = 0;

    import('hls.js').then(({ default: Hls }) => {
      if (destroyed || !videoRef.current) return;
      const v = videoRef.current;
      const resume = () => {
        if (resumeTime.current > 0) v.currentTime = resumeTime.current;
        if (wasPlaying.current) v.play().catch(() => undefined);
      };
      if (Hls.isSupported()) {
        const inst = new Hls({ enableWorker: true });
        inst.on(Hls.Events.BUFFER_CODECS, (_e, data) => {
          // eslint-disable-next-line no-console
          console.info('[hls] codecs', {
            video: data.video?.codec,
            audio: data.audio?.codec,
          });
        });
        inst.on(Hls.Events.MANIFEST_PARSED, resume);
        inst.on(Hls.Events.ERROR, (_e, data) => {
          // eslint-disable-next-line no-console
          console.error(
            '[hls]',
            data.type,
            data.details,
            data.fatal ? 'FATAL' : ''
          );
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            inst.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            mediaRecover += 1;
            if (mediaRecover === 1) inst.recoverMediaError();
            else if (mediaRecover === 2) {
              inst.swapAudioCodec();
              inst.recoverMediaError();
            } else {
              inst.destroy();
              hls = null;
              onUnplayableRef.current();
            }
          } else {
            inst.destroy();
            hls = null;
            onUnplayableRef.current();
          }
        });
        inst.loadSource(src);
        inst.attachMedia(v);
        hls = inst;
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        v.src = src;
        v.addEventListener('loadedmetadata', resume, { once: true });
      }
    });

    return () => {
      destroyed = true;
      const v = videoRef.current;
      if (v) {
        resumeTime.current = v.currentTime;
        wasPlaying.current = !v.paused;
      }
      if (hls) hls.destroy();
    };
  }, [src]);

  // ---- <video> -> state wiring (attach once) ----
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    v.volume = volume;
    v.muted = muted;
    v.playbackRate = rate;

    const onTime = () => setCurrent(v.currentTime);
    const onDur = () => setDuration(v.duration || 0);
    const onProg = () => {
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onWait = () => setWaiting(true);
    const onPlaying = () => setWaiting(false);
    const onVol = () => {
      setMuted(v.muted);
      setVolume(v.volume);
    };

    v.addEventListener('timeupdate', onTime);
    v.addEventListener('durationchange', onDur);
    v.addEventListener('loadedmetadata', onDur);
    v.addEventListener('progress', onProg);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('waiting', onWait);
    v.addEventListener('playing', onPlaying);
    v.addEventListener('canplay', onPlaying);
    v.addEventListener('volumechange', onVol);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('durationchange', onDur);
      v.removeEventListener('loadedmetadata', onDur);
      v.removeEventListener('progress', onProg);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('waiting', onWait);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('canplay', onPlaying);
      v.removeEventListener('volumechange', onVol);
    };
    // Run once per mount; live updates flow through the setters below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect UI-driven rate / volume / muted onto the element.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, [rate]);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
  }, [volume, muted]);

  // Keep the chosen subtitle index in range as the track list changes.
  useEffect(() => {
    if (subIdx >= subtitles.length) setSubIdx(-1);
  }, [subtitles.length, subIdx]);

  // ---- Subtitles: drive the native TextTracks but render cues ourselves so the
  // styling (size / colour / background) is entirely user-controlled. ----
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const tracks = v.textTracks;
    for (let i = 0; i < tracks.length; i += 1) {
      tracks[i].mode = i === subIdx ? 'hidden' : 'disabled';
    }
    setCueText('');
    const t = subIdx >= 0 ? tracks[subIdx] : undefined;
    if (!t) return undefined;

    // Render the cue active at (currentTime + subOffset) by scanning the cue list
    // ourselves, so a user-set subtitle delay works even though the browser's
    // own activeCues are tied to the raw currentTime. Driven by both cuechange
    // (precise boundaries at offset 0) and timeupdate (covers the shifted case).
    const render = () => {
      const list = t.cues;
      if (!list || !list.length) {
        setCueText('');
        return;
      }
      const time = v.currentTime + subOffset;
      let text = '';
      for (let i = 0; i < list.length; i += 1) {
        const c = list[i] as VTTCue;
        if (c.startTime <= time && time < c.endTime) {
          text = text ? `${text}\n${c.text}` : c.text;
        }
      }
      setCueText(text);
    };

    t.addEventListener('cuechange', render);
    v.addEventListener('timeupdate', render);
    render();
    return () => {
      t.removeEventListener('cuechange', render);
      v.removeEventListener('timeupdate', render);
    };
  }, [subIdx, subtitles.length, src, subOffset]);

  // Fullscreen state sync. Refocus the stage on enter so keyboard keeps working.
  useEffect(() => {
    const onFs = () => {
      const fs = document.fullscreenElement === stageRef.current;
      setIsFs(fs);
      if (fs) stageRef.current?.focus();
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // ---- actions ----
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => undefined);
    else v.pause();
  }, []);
  const seekBy = useCallback((d: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(v.currentTime + d, 0), v.duration || 0);
  }, []);
  const toggleFs = useCallback(() => {
    if (document.fullscreenElement)
      document.exitFullscreen().catch(() => undefined);
    else stageRef.current?.requestFullscreen().catch(() => undefined);
  }, []);
  const togglePip = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement)
        await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {
      /* ignore */
    }
  }, []);
  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (v) v.muted = !v.muted;
  }, []);
  const toggleCaptions = useCallback(() => {
    if (!subtitles.length) return;
    setSubIdx((i) => (i >= 0 ? -1 : 0));
  }, [subtitles.length]);

  // Auto-hide chrome after inactivity while playing.
  const poke = useCallback(() => {
    setShowUi(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused && !settings && !help) setShowUi(false);
    }, HIDE_MS);
  }, [settings, help]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    []
  );

  const chromeVisible = showUi || !playing || settings || help;

  // ---- scrubbing ----
  const seekToClientX = useCallback((clientX: number) => {
    const v = videoRef.current;
    const el = trackRef.current;
    if (!v || !el || !v.duration) return;
    const r = el.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
    v.currentTime = ratio * v.duration;
    setCurrent(v.currentTime);
  }, []);
  const onTrackDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    seekToClientX(e.clientX);
  };
  const onTrackMove = (e: ReactPointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      seekToClientX(e.clientX);
  };

  // ---- keyboard ----
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setHelp(false);
      setSettings(false);
      return;
    }
    if (e.key === '?') {
      e.preventDefault();
      setHelp((h) => !h);
      return;
    }
    // Let the volume range handle its own arrows when it has keyboard focus.
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const map: Record<string, () => void> = {
      ' ': togglePlay,
      k: togglePlay,
      ArrowLeft: () => seekBy(-skip),
      j: () => seekBy(-skip),
      ArrowRight: () => seekBy(skip),
      l: () => seekBy(skip),
      ArrowUp: () => setVolume((x) => Math.min(1, +(x + 0.1).toFixed(2))),
      ArrowDown: () => setVolume((x) => Math.max(0, +(x - 0.1).toFixed(2))),
      m: toggleMute,
      c: toggleCaptions,
      f: toggleFs,
      p: togglePip,
      n: () => onNext?.(),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      poke();
      fn();
    } else if (/^[0-9]$/.test(e.key)) {
      const v = videoRef.current;
      if (v && v.duration) {
        e.preventDefault();
        v.currentTime = (Number(e.key) / 10) * v.duration;
      }
    }
  };

  const pct = duration ? (current / duration) * 100 : 0;
  const bufPct = duration ? (buffered / duration) * 100 : 0;
  const hasSubs = subtitles.length > 0;

  const menuChip = (label: string, on: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
        on
          ? 'bg-aurora text-accent-ink shadow-glow'
          : 'text-muted hover:bg-surface-2 hover:text-fg'
      }`}
    >
      {label}
    </button>
  );

  // Drag the caption box anywhere over the video (YouTube-style); position is a
  // percentage of the stage so it survives resize / fullscreen, and persists.
  const onCapDown = (e: ReactPointerEvent) => {
    const stage = stageRef.current;
    if (!stage) return;
    e.stopPropagation();
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    const start = capPos ?? { x: 50, y: 84 };
    capDrag.current = {
      px: e.clientX,
      py: e.clientY,
      sx: start.x,
      sy: start.y,
      w: r.width || 1,
      h: r.height || 1,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onCapMove = (e: ReactPointerEvent) => {
    const d = capDrag.current;
    if (!d) return;
    const clamp = (v: number) => Math.min(95, Math.max(5, v));
    setCapPos({
      x: clamp(d.sx + ((e.clientX - d.px) / d.w) * 100),
      y: clamp(d.sy + ((e.clientY - d.py) / d.h) * 100),
    });
  };
  const onCapUp = (e: ReactPointerEvent) => {
    capDrag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const shortcuts: [string[], string][] = [
    [['Space', 'K'], 'Play / pause'],
    [['J', '←'], `Back ${skip}s`],
    [['L', '→'], `Forward ${skip}s`],
    [['↑', '↓'], 'Volume'],
    [['M'], 'Mute'],
    [['C'], 'Subtitles'],
    [['F'], 'Fullscreen'],
    [['P'], 'Picture in picture'],
    [['N'], 'Next episode'],
    [['0', '–', '9'], 'Jump to %'],
    [['?'], 'This guide'],
  ];

  return (
    <div className="space-y-2.5">
      <div className="aspect-w-16 aspect-h-9 w-full overflow-hidden rounded-2xl bg-black shadow-card ring-1 ring-line/40">
        {/* The aspect plugin makes this single child absolute inset-0 — it is our
            stage + the fullscreen target. */}
        <div
          ref={stageRef}
          tabIndex={0}
          role="group"
          aria-label="Video player"
          onKeyDown={onKey}
          onPointerDown={() => stageRef.current?.focus()}
          onPointerMove={poke}
          onPointerLeave={() =>
            playing && !settings && !help && setShowUi(false)
          }
          // container-type lets the caption layer size itself in `cqw` (1% of the
          // stage width), so captions scale with the player and with fullscreen.
          // (cast: containerType predates this csstype version.)
          style={{ containerType: 'inline-size' } as React.CSSProperties}
          className={`group bg-black outline-none ${
            chromeVisible ? '' : 'cursor-none'
          }`}
        >
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            crossOrigin="anonymous"
            onClick={togglePlay}
            onDoubleClick={toggleFs}
            className="absolute inset-0 h-full w-full bg-black object-contain"
          >
            {subtitles.map((s) => (
              <track
                key={s.url}
                kind="subtitles"
                src={s.url}
                srcLang={s.lang}
                label={s.label || s.lang}
              />
            ))}
          </video>

          {/* Our own caption layer (native rendering is suppressed to 'hidden').
              The box is draggable anywhere over the stage; default is bottom-centre. */}
          {subIdx >= 0 && cueText && (
            <div className="pointer-events-none absolute inset-0">
              <span
                onPointerDown={onCapDown}
                onPointerMove={onCapMove}
                onPointerUp={onCapUp}
                className="pointer-events-auto absolute max-w-[90%] cursor-move touch-none select-none text-center font-semibold leading-snug"
                style={{
                  ...(capPos
                    ? {
                        left: `${capPos.x}%`,
                        top: `${capPos.y}%`,
                        transform: 'translate(-50%, -50%)',
                      }
                    : {
                        left: '50%',
                        bottom: chromeVisible ? '16%' : '7%',
                        transform: 'translateX(-50%)',
                        transition: 'bottom 0.2s ease',
                      }),
                  fontSize:
                    CAP_SIZES.find((c) => c.k === capSize)?.css ??
                    CAP_SIZES[1].css,
                  whiteSpace: 'pre-line',
                  color: capColor === 'yellow' ? '#F2D43D' : '#F6F6F8',
                  background: CAP_BG[capBg],
                  padding: capBg === 'none' ? 0 : '0.12em 0.5em',
                  borderRadius: 8,
                  textShadow:
                    capBg === 'none'
                      ? '0 1px 3px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.95)'
                      : 'none',
                }}
              >
                {cueText}
              </span>
            </div>
          )}

          {/* Buffering */}
          {waiting && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <span className="h-11 w-11 animate-spin rounded-full border-[3px] border-fg/20 border-t-accent" />
            </div>
          )}

          {/* Center play when paused */}
          {!playing && !waiting && (
            <button
              type="button"
              aria-label="Play"
              onClick={togglePlay}
              className="absolute inset-0 grid place-items-center"
            >
              <span className="grid h-[68px] w-[68px] place-items-center rounded-full bg-aurora text-accent-ink shadow-glow transition duration-200 hover:scale-105 active:scale-95">
                <PlayIcon className="ml-0.5 h-8 w-8" />
              </span>
            </button>
          )}

          {/* Keyboard shortcuts overlay */}
          {help && (
            <div className="absolute inset-0 z-30 grid place-items-center bg-canvas/80 px-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border border-line/60 bg-canvas-2/95 p-5 shadow-lift">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-fg">
                    Keyboard shortcuts
                  </h3>
                  <button
                    type="button"
                    onClick={() => setHelp(false)}
                    className="rounded-full px-2 py-0.5 text-xs font-medium text-faint hover:text-fg"
                  >
                    Close
                  </button>
                </div>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                  {shortcuts.map(([keys, label]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-3"
                    >
                      <dt className="flex items-center gap-1">
                        {keys.map((key) => (
                          <Kbd key={key}>{key}</Kbd>
                        ))}
                      </dt>
                      <dd className="text-xs text-muted">{label}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}

          {/* Bottom scrim + controls */}
          <div
            className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-canvas/95 via-canvas/40 to-transparent pb-2 pt-10 transition-opacity duration-300 ${
              chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            {/* Scrubber */}
            <div className="px-3">
              <div
                ref={trackRef}
                role="slider"
                tabIndex={-1}
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={Math.floor(duration)}
                aria-valuenow={Math.floor(current)}
                onPointerDown={onTrackDown}
                onPointerMove={onTrackMove}
                className="group/sb relative flex h-4 cursor-pointer items-center"
              >
                <div className="absolute inset-x-0 h-1 overflow-hidden rounded-full bg-fg/20">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-fg/25"
                    style={{ width: `${bufPct}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-accent"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div
                  className="group-hover/sb:opacity-100 absolute h-3 w-3 -translate-x-1/2 rounded-full bg-accent opacity-0 shadow-glow transition-opacity"
                  style={{ left: `${pct}%` }}
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-0.5 px-2">
              <CtrlButton
                label={playing ? 'Pause' : 'Play'}
                onClick={togglePlay}
              >
                {playing ? <PauseIcon /> : <PlayIcon />}
              </CtrlButton>
              {onNext && (
                <CtrlButton label="Next episode (n)" onClick={onNext}>
                  <NextIcon />
                </CtrlButton>
              )}
              <CtrlButton label={`Back ${skip}s`} onClick={() => seekBy(-skip)}>
                <SkipBackIcon seconds={skip} />
              </CtrlButton>
              <CtrlButton
                label={`Forward ${skip}s`}
                onClick={() => seekBy(skip)}
              >
                <SkipFwdIcon seconds={skip} />
              </CtrlButton>

              <div className="flex items-center">
                <CtrlButton
                  label={muted ? 'Unmute' : 'Mute'}
                  onClick={toggleMute}
                >
                  <VolumeIcon muted={muted || volume === 0} />
                </CtrlButton>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  aria-label="Volume"
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    setVolume(Number(e.target.value));
                    setMuted(false);
                  }}
                  className="ml-0.5 hidden h-1 w-16 cursor-pointer accent-accent sm:block"
                />
              </div>

              <span className="ml-1 select-none text-xs font-medium tabular-nums text-fg/90">
                {fmt(current)}
                <span className="text-fg/45"> / {fmt(duration)}</span>
              </span>

              <div className="flex-1" />

              <CtrlButton
                label="Keyboard shortcuts (?)"
                onClick={() => setHelp((h) => !h)}
              >
                <KeyboardIcon />
              </CtrlButton>

              {hasSubs && (
                <CtrlButton
                  label={subIdx >= 0 ? 'Subtitles on' : 'Subtitles off'}
                  active={subIdx >= 0}
                  onClick={toggleCaptions}
                >
                  <CcIcon active={subIdx >= 0} />
                </CtrlButton>
              )}

              {/* Settings popover */}
              <div className="relative">
                <CtrlButton
                  label="Settings"
                  active={settings}
                  onClick={() => setSettings((s) => !s)}
                >
                  <SettingsIcon active={settings} />
                </CtrlButton>
                {settings && (
                  <>
                    <button
                      type="button"
                      aria-label="Close settings"
                      tabIndex={-1}
                      onClick={() => setSettings(false)}
                      className="fixed inset-0 z-10 cursor-default"
                    />
                    <div className="absolute bottom-full right-0 z-20 mb-2 max-h-[60vh] w-60 space-y-3 overflow-y-auto rounded-xl border border-line/60 bg-canvas-2/95 p-3 shadow-lift backdrop-blur-md">
                      {sources.length > 1 && (
                        <div>
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                            Quality
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {sources.map((s, i) =>
                              menuChip(s.quality || 'auto', i === qIdx, () =>
                                onQuality(i)
                              )
                            )}
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                          Speed
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {SPEEDS.map((sp) =>
                            menuChip(
                              sp === 1 ? '1x' : `${sp}x`,
                              sp === rate,
                              () => setRate(sp)
                            )
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                          Skip interval
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {SKIPS.map((sk) =>
                            menuChip(`${sk}s`, sk === skip, () => setSkip(sk))
                          )}
                        </div>
                      </div>
                      {hasSubs ? (
                        <div className="space-y-2 border-t border-line/40 pt-2.5">
                          <div>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                              Subtitles
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {menuChip('Off', subIdx < 0, () => setSubIdx(-1))}
                              {subtitles.map((s, i) =>
                                menuChip(s.label || s.lang, subIdx === i, () =>
                                  setSubIdx(i)
                                )
                              )}
                            </div>
                          </div>
                          {subIdx >= 0 && (
                            <div>
                              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                                Subtitle delay
                              </p>
                              <div className="flex items-center gap-1.5">
                                {menuChip('-0.5s', false, () =>
                                  setSubOffset((o) =>
                                    Math.max(
                                      -60,
                                      Math.round((o - 0.5) * 10) / 10
                                    )
                                  )
                                )}
                                <span className="min-w-[3.25rem] text-center text-xs font-semibold tabular-nums text-fg">
                                  {subOffset > 0 ? '+' : ''}
                                  {subOffset.toFixed(1)}s
                                </span>
                                {menuChip('+0.5s', false, () =>
                                  setSubOffset((o) =>
                                    Math.min(
                                      60,
                                      Math.round((o + 0.5) * 10) / 10
                                    )
                                  )
                                )}
                                {subOffset !== 0 &&
                                  menuChip('Reset', false, () =>
                                    setSubOffset(0)
                                  )}
                              </div>
                            </div>
                          )}
                          <div>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                              Caption size
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {CAP_SIZES.map((c) =>
                                menuChip(c.k, capSize === c.k, () =>
                                  setCapSize(c.k)
                                )
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                              Caption colour
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {menuChip('White', capColor === 'white', () =>
                                setCapColor('white')
                              )}
                              {menuChip('Yellow', capColor === 'yellow', () =>
                                setCapColor('yellow')
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                              Caption background
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {menuChip('Solid', capBg === 'solid', () =>
                                setCapBg('solid')
                              )}
                              {menuChip('Dim', capBg === 'semi', () =>
                                setCapBg('semi')
                              )}
                              {menuChip('None', capBg === 'none', () =>
                                setCapBg('none')
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                              Caption position
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              {capPos
                                ? menuChip('Reset to bottom', false, () =>
                                    setCapPos(null)
                                  )
                                : null}
                              <span className="text-[11px] text-faint">
                                Drag the caption to move it
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="border-t border-line/40 pt-2.5 text-[11px] leading-relaxed text-faint">
                          No subtitles for this source yet. Indonesian / English
                          subs are coming, and the styling controls will appear
                          here.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>

              <span className="hidden sm:block">
                <CtrlButton label="Picture in picture" onClick={togglePip}>
                  <PipIcon />
                </CtrlButton>
              </span>
              <CtrlButton
                label={isFs ? 'Exit fullscreen' : 'Fullscreen'}
                onClick={toggleFs}
              >
                {isFs ? <FullExitIcon /> : <FullEnterIcon />}
              </CtrlButton>
            </div>
          </div>
        </div>
      </div>

      {/* Meta row below the player: source badge + embed escape hatch. */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-aurora px-2.5 py-1 font-semibold text-accent-ink shadow-glow">
          <PlayIcon className="h-3 w-3" />
          our player{provider ? ` · ${provider}` : ''}
        </span>
        <button
          type="button"
          onClick={onUseEmbed}
          className="rounded-full border border-line/70 bg-surface px-2.5 py-1 font-medium text-muted transition hover:bg-surface-2 hover:text-fg"
        >
          Use embed instead
        </button>
      </div>
    </div>
  );
};

export default HlsPlayer;
