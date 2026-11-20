import { EMPLOYEE_POLL_MS } from "./polling";

const refreshers = new Set<() => Promise<void>>();

// Signed out → login page; wrong role (a 403 that names your home) → your home page.
// Any other 403, like a clock-in refused off the office network, is an ordinary answer for the caller to show.
function redirectOnAuthFailure(status: number, data: unknown) {
  const home = (data as { home?: unknown } | null)?.home;
  const target = status === 401 ? "/login" : status === 403 && typeof home === "string" ? home : null;
  if (!target) return false;
  if (window.location.pathname !== target) window.location.assign(target);
  return true;
}

// Asks the server for fresh data every `intervalMs`, but only while the page is actually on screen: a tab in the
// background costs the server nothing, and the data is refreshed the moment the person comes back to it.
export function createPolledStore<T>(url: string, initial: T, intervalMs = EMPLOYEE_POLL_MS) {
  let snapshot = initial;
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;
  const listeners = new Set<() => void>();

  async function refresh() {
    if (inFlight) return;
    inFlight = true;
    try {
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (redirectOnAuthFailure(response.status, data)) return;
      if (response.ok) {
        const next = { ...data, loaded: true } as T;
        if (JSON.stringify(next) !== JSON.stringify(snapshot)) {
          snapshot = next;
          listeners.forEach((notify) => notify());
        }
      }
    } catch {
      // Keep the last known data and try again on the next tick.
    } finally {
      inFlight = false;
    }
  }

  refreshers.add(refresh);

  const tick = () => {
    if (!document.hidden) void refresh();
  };
  const onVisible = () => {
    if (!document.hidden) void refresh();
  };

  return {
    initial,
    getSnapshot: () => snapshot,
    subscribe(notify: () => void) {
      listeners.add(notify);
      if (listeners.size === 1) {
        void refresh();
        timer = setInterval(tick, intervalMs);
        document.addEventListener("visibilitychange", onVisible);
      }
      return () => {
        listeners.delete(notify);
        if (listeners.size === 0 && timer) {
          clearInterval(timer);
          timer = null;
          document.removeEventListener("visibilitychange", onVisible);
        }
      };
    },
  };
}

export const post = <T = Record<string, unknown>>(url: string, body?: unknown) => send<T>("POST", url, body);
export const remove = <T = Record<string, unknown>>(url: string) => send<T>("DELETE", url);

async function send<T>(method: "POST" | "DELETE", url: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as T;
  if (redirectOnAuthFailure(response.status, data)) return { ok: false, status: response.status, data };
  await Promise.all([...refreshers].map((refresh) => refresh()));
  return { ok: response.ok, status: response.status, data };
}
