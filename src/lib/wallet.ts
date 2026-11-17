import { useSyncExternalStore } from "react";
import { createPolledStore, post } from "./api";
import type { HistoryEntry } from "./history";

export type WalletState = {
  loaded: boolean;
  today: string;
  now: string;
  clockedOut: boolean;
  clockIn: string | null;
  clockOut: string | null;
  arrival: "on_time" | "late" | "early" | null;
  perfectDay: boolean;
  shift: { start: string; end: string };
  window: { clockIn: string; clockOut: string };
  balance: number;
  voucher: string | null;
  voucherIssuedAt: string | null;
  voucherUsedAt: string | null;
  ledger: HistoryEntry[];
};

const walletStore = createPolledStore<WalletState>("/api/wallet", {
  loaded: false,
  today: "",
  now: "",
  clockedOut: false,
  clockIn: null,
  clockOut: null,
  arrival: null,
  perfectDay: false,
  shift: { start: "09:00", end: "18:00" },
  window: { clockIn: "08:50–09:00", clockOut: "18:00–18:10" },
  balance: 0,
  voucher: null,
  voucherIssuedAt: null,
  voucherUsedAt: null,
  ledger: [],
});

export function useWallet() {
  const state = useSyncExternalStore(walletStore.subscribe, walletStore.getSnapshot, () => walletStore.initial);
  return { state, balance: state.balance };
}

export function clockOut() {
  return post("/api/clock-out");
}

export function redeemCoffee() {
  return post("/api/redeem", { rewardId: "coffee" });
}

export function resetDemo() {
  return post("/api/reset");
}

export type VoucherInfo =
  | { status: "invalid" }
  | { status: "issued" | "used"; code: string; reward: string; employee: string; employeeId: string; cost: number; usedAt: string | null };

export async function checkVoucher(code: string): Promise<VoucherInfo> {
  const response = await fetch(`/api/vouchers/${encodeURIComponent(code.trim())}`, { cache: "no-store" });
  return response.json();
}

export async function consumeVoucher(code: string) {
  const { data } = await post<{ consumed: boolean; voucher: VoucherInfo }>(`/api/vouchers/${encodeURIComponent(code.trim())}/consume`);
  return data;
}
