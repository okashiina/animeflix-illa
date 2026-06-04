// A tiny cross-component bridge so the AI watch companion can read "what has been
// said so far this episode" straight from the player, without the player and the
// chat panel sharing a parent. The HLS player registers a getter while it is
// mounted; the companion calls it at send time.
//
// This is the data half of the anti-spoiler guarantee: the getter only ever
// returns subtitle lines whose start time is at or before the current playback
// position, so dialogue from later in the episode never leaves the browser. Only
// the DIRECT player registers — on the embed fallback `getAiredContext()` returns
// null and the companion drops to episode-level grounding.

export interface AiredContext {
  /** Subtitle lines whose start time is <= the current playback position. */
  lines: string[];
  /** Current playback position, in seconds. */
  current: number;
  /** Episode duration in seconds (0 if not known yet). */
  duration: number;
}

type Getter = () => AiredContext | null;

let getter: Getter | null = null;

/** The player calls this on mount (with a getter) and on unmount (with null). */
export const registerAiredSource = (g: Getter | null): void => {
  getter = g;
};

/** Pull the current spoiler-safe window, or null when no direct player is mounted. */
export const getAiredContext = (): AiredContext | null =>
  getter ? getter() : null;
