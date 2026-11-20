import { useSyncExternalStore } from "react";
import { createPolledStore, post, remove } from "./api";
import { HR_POLL_MS } from "./polling";

export type LeaveRequest = {
  id: string;
  name: string;
  empId: string;
  dept: string;
  note: string;
  cost: number;
  asked: string;
  status: "pending" | "approved" | "rejected";
  decidedAt: string | null;
};

export type AdminRedemption = {
  id: string;
  name: string;
  empId: string;
  reward: string;
  code: string;
  cost: number;
  when: string;
  status: "issued" | "used";
};

export type CatalogueItem = { id: string; name: string; kind: string; cost: number; stock: number | null };

export type AdminOverview = {
  loaded: boolean;
  today: string;
  leave: LeaveRequest[];
  redemptions: AdminRedemption[];
  catalogue: CatalogueItem[];
  stats: { pendingLeave: number; vouchersIssued: number; creditsRedeemed: number };
};

const adminStore = createPolledStore<AdminOverview>("/api/admin/overview", {
  loaded: false,
  today: "",
  leave: [],
  redemptions: [],
  catalogue: [],
  stats: { pendingLeave: 0, vouchersIssued: 0, creditsRedeemed: 0 },
}, HR_POLL_MS);

export function useAdminOverview() {
  return useSyncExternalStore(adminStore.subscribe, adminStore.getSnapshot, () => adminStore.initial);
}

export function decideLeave(id: string, decision: "approved" | "rejected") {
  return post(`/api/admin/leave/${encodeURIComponent(id)}`, { decision });
}

export type OfficeNetwork = { id: number; cidr: string; label: string; addedAt: string; addedBy: string };

export type AttemptReason =
  | "ok_office"
  | "ok_remote"
  | "not_office_network"
  | "no_client_ip"
  | "already_clocked_in"
  | "already_clocked_out"
  | "no_clock_in";

export type ClockAttempt = {
  id: number;
  kind: "clock_in" | "clock_out";
  at: string;
  ip: string | null;
  userAgent: string | null;
  accepted: boolean;
  reason: AttemptReason;
  name: string;
  employeeId: string;
};

export type AdminAttendance = {
  loaded: boolean;
  today: string;
  ipMode: "cloudflare" | "local-demo" | null;
  you: { ip: string | null; network: string | null };
  networks: OfficeNetwork[];
  attempts: ClockAttempt[];
};

const attendanceStore = createPolledStore<AdminAttendance>("/api/admin/attendance", {
  loaded: false,
  today: "",
  ipMode: "local-demo",
  you: { ip: null, network: null },
  networks: [],
  attempts: [],
}, HR_POLL_MS);

export function useAdminAttendance() {
  return useSyncExternalStore(attendanceStore.subscribe, attendanceStore.getSnapshot, () => attendanceStore.initial);
}

export type NetworkError = "invalid_range" | "invalid_label" | "duplicate" | "no_client_ip";

export async function addNetwork(input: { label: string; cidr: string } | { label: string; current: true }) {
  const { ok, data } = await post<{ error?: NetworkError }>("/api/admin/networks", input);
  return ok ? null : (data.error ?? "invalid_range");
}

export function removeNetwork(id: number) {
  return remove(`/api/admin/networks/${id}`);
}
