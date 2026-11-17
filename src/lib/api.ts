const refreshers = new Set<() => Promise<void>>();

async function redirectOnAuthFailure(response: Response) {
  if (response.status !== 401 && response.status !== 403) return false;
  const data = (await response.clone().json().catch(() => ({}))) as { home?: string };
  const target = response.status === 401 ? "/login" : data.home;
  if (target && window.location.pathname !== target) window.location.assign(target);
  return true;
}

export function createPolledStore<T>(url: string, initial: T, intervalMs = 2000) {
  let snapshot = initial;
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;
  const listeners = new Set<() => void>();

  async function refresh() {
    if (inFlight) return;
    inFlight = true;
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (await redirectOnAuthFailure(response)) return;
      if (response.ok) {
        const next = { ...(await response.json()), loaded: true } as T;
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

  return {
    initial,
    getSnapshot: () => snapshot,
    subscribe(notify: () => void) {
      listeners.add(notify);
      if (listeners.size === 1) {
        void refresh();
        timer = setInterval(refresh, intervalMs);
      }
      return () => {
        listeners.delete(notify);
        if (listeners.size === 0 && timer) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
  };
}

export async function post<T = Record<string, unknown>>(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await response.json().catch(() => ({}))) as T;
  if (await redirectOnAuthFailure(response)) return { ok: false, status: response.status, data };
  await Promise.all([...refreshers].map((refresh) => refresh()));
  return { ok: response.ok, status: response.status, data };
}
