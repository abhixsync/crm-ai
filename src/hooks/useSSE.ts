"use client";

import { useEffect } from "react";

// Module-level singleton — one EventSource per browser tab
let es: EventSource | null = null;
const listeners = new Map<string, Set<() => void>>();

function getOrCreate(): EventSource {
  if (es && es.readyState !== EventSource.CLOSED) return es;

  // Stale closed instance — reset before creating fresh one
  es = null;

  const instance = new EventSource("/api/events");

  instance.onmessage = (event: MessageEvent) => {
    try {
      const { type } = JSON.parse(event.data) as { type: string };
      listeners.get(type)?.forEach((h) => h());
    } catch {}
  };

  instance.onerror = () => {
    if (instance.readyState === EventSource.CLOSED) {
      // Permanent close (e.g. 401 after logout) — reset so next mount reconnects
      es = null;
      listeners.clear();
    }
    // Transient errors: browser auto-reconnects; do nothing
  };

  es = instance;
  return instance;
}

/**
 * Subscribe to a named SSE event type.
 * `handler` is called with no arguments — it should trigger a refetch, not read event payload.
 * Pass a stable callback (useCallback or module-level function) to avoid re-registration on every render.
 */
export function useSSEEvent(type: string, handler: () => void): void {
  useEffect(() => {
    getOrCreate();
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(handler);
    return () => {
      listeners.get(type)?.delete(handler);
    };
  }, [type, handler]);
}
