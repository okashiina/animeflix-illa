import { useEffect, useState } from 'react';

export interface Countdown {
  /** False during SSR / before the first client tick (avoids hydration drift). */
  ready: boolean;
  done: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Compact human label, e.g. "2d 5h", "3h 12m", "08m 30s". */
  label: string;
}

const PLACEHOLDER: Countdown = {
  ready: false,
  done: false,
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  label: '· · ·',
};

const pad = (n: number) => String(n).padStart(2, '0');

const breakdown = (target: number): Countdown => {
  const diff = Math.max(0, target - Math.floor(Date.now() / 1000));

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  let label: string;
  if (diff <= 0) label = 'airing';
  else if (days > 0) label = `${days}d ${hours}h`;
  else if (hours > 0) label = `${hours}h ${pad(minutes)}m`;
  else label = `${pad(minutes)}m ${pad(seconds)}s`;

  return { ready: true, done: diff <= 0, days, hours, minutes, seconds, label };
};

/**
 * Live countdown to a unix-seconds timestamp. Returns a placeholder until the
 * component mounts so server and client render the same first frame, then ticks
 * every second. Cleans up on unmount / target change.
 */
export const useCountdown = (target: number): Countdown => {
  const [state, setState] = useState<Countdown>(PLACEHOLDER);

  useEffect(() => {
    const tick = () => setState(breakdown(target));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  return state;
};

export default useCountdown;
