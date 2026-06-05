// A tiny cross-component bridge to the mounted direct player, mirroring
// `companionContext.ts`. Two features ride on it without ever re-touching the
// player: the companion's "look at this frame" vision, and Teleparty's synced
// co-watch (one pauses, all pause). The HLS player registers a single handle
// while mounted; consumers grab it with `getPlayerHandle()`.
//
// Only the DIRECT player registers. On the embed-iframe fallback there is no
// handle, so `getPlayerHandle()` returns null and both features degrade quietly
// (the 👁 button hides; a room shows a "needs the direct player" note).

export type PlayerEvent = 'play' | 'pause' | 'seek' | 'timeupdate';

export interface PlayerEventPayload {
  /** Playback position when the event fired, in seconds. */
  time: number;
  /**
   * True when the change came from a programmatic call (play/pause/seek via the
   * handle) rather than the viewer. Lets sync consumers ignore their own echoes
   * instead of bouncing a remote action back to everyone (loop guard).
   */
  programmatic: boolean;
}

export interface PlayerHandle {
  /**
   * The current displayed frame as a JPEG data URL (~512px long edge), or null
   * when the canvas would be tainted (a source without CORS) or no frame is
   * decoded yet. Spoiler-safe by construction: it is the moment already on
   * screen.
   */
  captureFrame: () => string | null;
  play: () => void;
  pause: () => void;
  seek: (t: number) => void;
  getCurrentTime: () => number;
  isPaused: () => boolean;
  /** Subscribe to a player event; returns an unsubscribe fn. */
  on: (
    evt: PlayerEvent,
    cb: (payload: PlayerEventPayload) => void
  ) => () => void;
}

type EventListener = (payload: PlayerEventPayload) => void;

const eventListeners: Record<PlayerEvent, Set<EventListener>> = {
  play: new Set(),
  pause: new Set(),
  seek: new Set(),
  timeupdate: new Set(),
};

/** Subscribe to a player event independently of which handle is mounted. */
export const subscribePlayerEvent = (
  evt: PlayerEvent,
  cb: EventListener
): (() => void) => {
  eventListeners[evt].add(cb);
  return () => eventListeners[evt].delete(cb);
};

/** The player calls this from its native listeners to fan an event out. */
export const emitPlayerEvent = (
  evt: PlayerEvent,
  payload: PlayerEventPayload
): void => {
  eventListeners[evt].forEach((cb) => cb(payload));
};

let handle: PlayerHandle | null = null;
const handleListeners = new Set<(h: PlayerHandle | null) => void>();

/** The player calls this on mount (with a handle) and on unmount (with null). */
export const registerPlayerHandle = (h: PlayerHandle | null): void => {
  handle = h;
  handleListeners.forEach((cb) => cb(h));
};

/** The mounted direct player's handle, or null on embed / before mount. */
export const getPlayerHandle = (): PlayerHandle | null => handle;

/**
 * Be told when a handle (un)registers, so a consumer that mounts before the
 * player can attach the moment it appears. Fires immediately with the current
 * value; returns an unsubscribe fn.
 */
export const subscribePlayerHandle = (
  cb: (h: PlayerHandle | null) => void
): (() => void) => {
  handleListeners.add(cb);
  cb(handle);
  return () => handleListeners.delete(cb);
};
