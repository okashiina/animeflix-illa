import { LRUCache } from 'lru-cache';
import { config } from './config.js';
import type { ResolveResult } from './types.js';

// Caches resolved sources (SOP #6) to cut latency, load and anti-bot exposure.
export const sourceCache = new LRUCache<string, ResolveResult>({
  max: 2000,
  ttl: config.sourceTtlMs,
});

export const sourceKey = (anilistId: number, ep: number, category: string) =>
  `${anilistId}:${ep}:${category}`;
