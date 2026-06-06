import { getPlayerHandle, subscribePlayerEvent } from './playerBus';
import type { RoomConnection } from './realtime';
import { recordActivity } from './roomChatStore';

// The co-watch sync engine: keeps every member's playback locked together. It is
// intent-based and symmetric — any member's own play / pause / seek broadcasts a
// snapshot, and everyone else drift-corrects toward it. No single "host" drives
// playback; the only host-ish role is emitting a low-frequency heartbeat so a
// late joiner (or a drifting tab) re-anchors, and that role is just "lowest
// clientId present", computed without any election.
//
// Two guards keep it from feeding back on itself:
//   - the player bus tags events we caused via the handle as `programmatic`, so
//     applying a remote action never re-broadcasts it;
//   - `echoMessages:false` on the connection means we never receive our own.

interface SyncMsg {
  paused: boolean;
  position: number;
  ts: number;
}

// Past this gap (seconds) we hard-seek to match; under it we leave playback
// alone so steady-state heartbeats don't cause constant micro-seeks.
const DRIFT_TOLERANCE = 0.75;
const HEARTBEAT_MS = 5000;

export const startSync = (
  conn: RoomConnection,
  getMemberIds: () => string[],
  selfId: string
): (() => void) => {
  const offs: (() => void)[] = [];

  const publishState = (pausedOverride?: boolean): void => {
    const h = getPlayerHandle();
    if (!h) return;
    const msg: SyncMsg = {
      paused: pausedOverride ?? h.isPaused(),
      position: h.getCurrentTime(),
      ts: Date.now(),
    };
    conn.publish('sync', msg);
  };

  // Local intent → broadcast playback state AND a human-readable activity line
  // (paused / resumed / jumped, with the episode position). Skip the echoes of
  // our own remote-applied actions so a synced pause isn't logged on everyone.
  const onLocal =
    (kind: 'play' | 'pause' | 'seek', paused?: boolean) =>
    (payload: { programmatic: boolean; time: number }): void => {
      if (payload.programmatic) return;
      publishState(paused);
      const pos = getPlayerHandle()?.getCurrentTime() ?? payload.time ?? 0;
      const at = Date.now();
      conn.publish('activity', { action: kind, position: pos, at });
      recordActivity({
        clientId: selfId,
        action: kind,
        posSec: pos,
        at,
        self: true,
      });
    };
  offs.push(subscribePlayerEvent('play', onLocal('play', false)));
  offs.push(subscribePlayerEvent('pause', onLocal('pause', true)));
  offs.push(subscribePlayerEvent('seek', onLocal('seek')));

  // Remote snapshot → apply, drift-corrected. If they're playing, account for the
  // time since their snapshot so we land where they actually are now.
  offs.push(
    conn.subscribe('sync', (data, from) => {
      if (from === selfId) return;
      const msg = data as SyncMsg | null;
      const h = getPlayerHandle();
      if (!h || !msg || typeof msg.position !== 'number') return;
      const elapsed = msg.paused
        ? 0
        : Math.max(0, (Date.now() - msg.ts) / 1000);
      const target = msg.position + elapsed;
      if (Math.abs(h.getCurrentTime() - target) > DRIFT_TOLERANCE)
        h.seek(target);
      if (msg.paused && !h.isPaused()) h.pause();
      else if (!msg.paused && h.isPaused()) h.play();
    })
  );

  // A newcomer says hello; everyone already in the room answers with their
  // current state so the newcomer anchors immediately instead of waiting for the
  // next heartbeat.
  offs.push(
    conn.subscribe('hello', (_data, from) => {
      if (from !== selfId) publishState();
    })
  );

  const heartbeat = setInterval(() => {
    const ids = getMemberIds();
    if (ids.length < 2) return;
    const host = [...ids].sort()[0];
    if (host === selfId) publishState();
  }, HEARTBEAT_MS);

  // Announce arrival + an immediate snapshot so existing members and we converge.
  conn.publish('hello', {});
  publishState();

  return () => {
    offs.forEach((off) => off());
    clearInterval(heartbeat);
  };
};
