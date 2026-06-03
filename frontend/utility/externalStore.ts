// A tiny localStorage-backed store with a CACHED, referentially-stable snapshot,
// designed for React 18's useSyncExternalStore. The cache is load-bearing: getSnapshot
// must return the same reference until the data actually changes, or the hook loops
// ("getSnapshot should be cached"). Mutators build a new value, cache it, persist, and
// notify — so a new reference appears only on a real change. Cross-tab edits invalidate
// the cache via the window 'storage' event.

export interface ExternalStore<T> {
  /** Cached snapshot (parses localStorage once, then reuses the reference). */
  get: () => T;
  /** Replace the value: cache → persist → notify. */
  set: (next: T) => void;
  /** Functional update built from the current value. */
  update: (fn: (prev: T) => T) => void;
  /** Drop the cache without notifying (used after an external/direct write). */
  invalidate: () => void;
  /** Subscribe to changes; returns an unsubscribe fn. */
  subscribe: (listener: () => void) => () => void;
}

export function createStore<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T = (raw) => JSON.parse(raw) as T,
  serialize: (value: T) => string = (value) => JSON.stringify(value)
): ExternalStore<T> {
  let cache: T | undefined;
  let loaded = false;
  const listeners = new Set<() => void>();

  const read = (): T => {
    if (loaded) return cache as T;
    if (typeof window === 'undefined') return fallback; // SSR: never cache
    try {
      const raw = window.localStorage.getItem(key);
      cache = raw ? parse(raw) : fallback;
    } catch {
      cache = fallback;
    }
    loaded = true;
    return cache as T;
  };

  const notify = (): void => listeners.forEach((l) => l());

  const set = (next: T): void => {
    cache = next;
    loaded = true;
    try {
      window.localStorage.setItem(key, serialize(next));
    } catch {
      /* quota / unavailable — keep the in-memory value */
    }
    notify();
  };

  const update = (fn: (prev: T) => T): void => set(fn(read()));

  const invalidate = (): void => {
    cache = undefined;
    loaded = false;
  };

  const onStorage = (e: StorageEvent): void => {
    if (e.key !== key) return;
    invalidate();
    notify();
  };

  const subscribe = (listener: () => void): (() => void) => {
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage);
      }
    };
  };

  return { get: read, set, update, invalidate, subscribe };
}
