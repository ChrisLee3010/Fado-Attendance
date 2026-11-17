import { useEffect, useSyncExternalStore } from "react";
import { createPolledStore, post } from "./api";
import type { Role } from "./demo-accounts";

export type Me = {
  loaded: boolean;
  name: string;
  firstName: string;
  roles: Role[];
  home: string;
};

const meStore = createPolledStore<Me>("/api/auth/me", { loaded: false, name: "", firstName: "", roles: [], home: "/" }, 30000);

export function useMe() {
  return useSyncExternalStore(meStore.subscribe, meStore.getSnapshot, () => meStore.initial);
}

export function useRoleGate(expected: Role) {
  const me = useMe();
  const allowed = me.loaded && me.roles.includes(expected);
  useEffect(() => {
    if (me.loaded && !me.roles.includes(expected)) window.location.replace(me.home);
  }, [me.loaded, me.roles, me.home, expected]);
  return { me, allowed };
}

export const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export async function signOut() {
  await post("/api/auth/logout");
  // A full reload is intentional: it drops the previous user's cached data from memory.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/login";
}
