'use client';

import { useSyncExternalStore } from 'react';
import type { Alert } from '@/lib/math/alerts';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/env';

// ---------- dismissed alert ids (localStorage, per browser) ----------

const DISMISSED_KEY = 'omniscope.alerts.dismissed';
const dismissedListeners = new Set<() => void>();
let dismissedCache: { raw: string | null; ids: ReadonlySet<string> } = { raw: null, ids: new Set() };
const EMPTY: ReadonlySet<string> = new Set();

function readDismissed(): ReadonlySet<string> {
  const raw = window.localStorage.getItem(DISMISSED_KEY);
  if (raw !== dismissedCache.raw) {
    let ids: string[] = [];
    try {
      ids = raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      ids = [];
    }
    dismissedCache = { raw, ids: new Set(ids) };
  }
  return dismissedCache.ids;
}

function writeDismissed(ids: Set<string>) {
  // Keep the list bounded; old ids belong to situations that have changed.
  window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids].slice(-200)));
  dismissedListeners.forEach((l) => l());
}

function subscribeDismissed(listener: () => void) {
  dismissedListeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === DISMISSED_KEY && listener();
  window.addEventListener('storage', onStorage);
  return () => {
    dismissedListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useDismissedAlerts(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeDismissed, readDismissed, () => EMPTY);
}

export function dismissAlert(id: string) {
  const next = new Set(readDismissed());
  next.add(id);
  writeDismissed(next);
}

export function restoreAlert(id: string) {
  const next = new Set(readDismissed());
  next.delete(id);
  writeDismissed(next);
}

// ---------- the alerts feed for the bell (fetched once, cached for the session) ----------

type Feed = { status: 'idle' | 'loading' | 'ready' | 'signed-out' | 'error'; alerts: Alert[]; fetchedAt: number };
const FEED_KEY = 'omniscope.alerts.feed';
const FEED_TTL_MS = 10 * 60_000;
const feedListeners = new Set<() => void>();
let feed: Feed = { status: 'idle', alerts: [], fetchedAt: 0 };
const SERVER_FEED: Feed = { status: 'idle', alerts: [], fetchedAt: 0 };

function setFeed(next: Feed) {
  feed = next;
  if (next.status === 'ready') window.sessionStorage.setItem(FEED_KEY, JSON.stringify(next));
  feedListeners.forEach((l) => l());
}

/** Stores alerts the alerts page has just computed, so the bell agrees with it. */
export function primeAlertsFeed(alerts: Alert[]) {
  setFeed({ status: 'ready', alerts, fetchedAt: Date.now() });
}

const SIGNED_OUT = (): Feed => ({ status: 'signed-out', alerts: [], fetchedAt: Date.now() });
const isFresh = (f: Feed | null) => Boolean(f && f.status === 'ready' && Date.now() - f.fetchedAt < FEED_TTL_MS);
let inFlight = false;

/** True when this browser holds a Supabase session. Read from the session cookie, so no request is made. */
async function hasSession(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const { data } = await createClient().auth.getSession();
    return Boolean(data.session);
  } catch {
    return false;
  }
}

/**
 * Fetches alerts unless a fresh copy is already held. Visitors who are not signed in are recognised
 * locally and never request the feed, and a signed-out browser drops any cached alerts.
 */
export function ensureAlertsFeed() {
  if (inFlight) return;
  inFlight = true;
  hasSession()
    .then(async (signedIn) => {
      if (!signedIn) {
        window.sessionStorage.removeItem(FEED_KEY);
        if (feed.status !== 'signed-out') setFeed(SIGNED_OUT());
        return;
      }
      if (feed.status === 'idle' || feed.status === 'signed-out') {
        try {
          const cached = JSON.parse(window.sessionStorage.getItem(FEED_KEY) ?? 'null') as Feed | null;
          if (cached && isFresh(cached)) return setFeed(cached);
        } catch {
          /* ignore a corrupt cache */
        }
      }
      if (isFresh(feed)) return;
      setFeed({ ...feed, status: 'loading' });
      const res = await fetch('/api/alerts', { credentials: 'same-origin' });
      if (res.status === 401) return setFeed(SIGNED_OUT());
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { alerts: Alert[] };
      setFeed({ status: 'ready', alerts: body.alerts, fetchedAt: Date.now() });
    })
    .catch(() => setFeed({ status: 'error', alerts: [], fetchedAt: Date.now() }))
    .finally(() => {
      inFlight = false;
    });
}

export function useAlertsFeed(): Feed {
  return useSyncExternalStore(
    (l) => {
      feedListeners.add(l);
      return () => feedListeners.delete(l);
    },
    () => feed,
    () => SERVER_FEED
  );
}
