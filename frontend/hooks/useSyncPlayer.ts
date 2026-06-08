import { useEffect } from 'react';

import { subscribePlayerHandle } from '@utility/playerBus';
import {
  getRoomConnection,
  getRoomLeaderId,
  getRoomMembers,
  useRoom,
} from '@utility/room';
import { startSync } from '@utility/syncPlayer';

// Glue: while a room is connected, run the sync engine against whatever direct
// player is mounted. Mounted ONCE at the watch-page level (not inside the room
// tab) so playback stays in sync even when the viewer is looking at another tab.
// It restarts cleanly if the player remounts (e.g. an episode change) by keying
// off the bus's handle (un)registration.
export const useSyncPlayer = (): void => {
  const room = useRoom();
  const connected = room.status === 'connected';
  const { selfId } = room;

  useEffect(() => {
    if (!connected || !selfId) return undefined;
    const conn = getRoomConnection();
    if (!conn) return undefined;

    let stop: (() => void) | null = null;
    const off = subscribePlayerHandle((handle) => {
      stop?.();
      stop = null;
      if (handle) {
        stop = startSync(
          conn,
          () => getRoomMembers().map((m) => m.clientId),
          selfId,
          () => getRoomLeaderId()
        );
      }
    });

    return () => {
      off();
      stop?.();
    };
  }, [connected, selfId]);
};
