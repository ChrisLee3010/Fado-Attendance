import { useSyncExternalStore } from "react";
import { createPolledStore, post } from "./api";

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
});

export function useAdminOverview() {
  return useSyncExternalStore(adminStore.subscribe, adminStore.getSnapshot, () => adminStore.initial);
}

export function decideLeave(id: string, decision: "approved" | "rejected") {
  return post(`/api/admin/leave/${encodeURIComponent(id)}`, { decision });
}
