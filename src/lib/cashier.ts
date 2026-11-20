import { useSyncExternalStore } from "react";
import { createPolledStore } from "./api";
import { HR_POLL_MS } from "./polling";

export type CashierReward = { id: string; name: string; kind: string; cost: number; stock: number | null };

export type CashierRedemption = {
  id: string;
  name: string;
  empId: string;
  rewardId: string;
  reward: string;
  code: string;
  cost: number;
  issuedAt: string;
  usedAt: string | null;
  status: "issued" | "used";
};

export type CashierOverview = {
  loaded: boolean;
  today: string;
  catalogue: CashierReward[];
  redemptions: CashierRedemption[];
  stats: { issued: number; used: number; creditsRedeemed: number };
};

const cashierStore = createPolledStore<CashierOverview>(
  "/api/cashier/overview",
  {
    loaded: false,
    today: "",
    catalogue: [],
    redemptions: [],
    stats: { issued: 0, used: 0, creditsRedeemed: 0 },
  },
  HR_POLL_MS,
);

export function useCashierOverview() {
  return useSyncExternalStore(cashierStore.subscribe, cashierStore.getSnapshot, () => cashierStore.initial);
}
