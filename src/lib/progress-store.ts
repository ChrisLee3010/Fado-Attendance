import { useSyncExternalStore } from "react";
import { createPolledStore } from "./api";
import type { HonourTier } from "./honours";
import type { DayInfo } from "./progress";

export type ProgressState = {
  loaded: boolean;
  today: string;
  month: string;
  shift: { start: string; end: string };
  window: { clockIn: string; clockOut: string };
  days: DayInfo[];
  stats: {
    perfectDays: number;
    scheduledShifts: number;
    scheduledToDate: number;
    attended: number;
    arrivedByStart: number;
    milestonesReached: number;
  };
  milestones: {
    reached: { id: string; title: string; credits: number; date: string }[];
    ladder: { target: number; reached: boolean }[];
    next: { target: number; remaining: number; credits: number } | null;
  };
  reward: { name: string; icon: string; cost: number; balance: number; remaining: number };
  honour: { tier: HonourTier | null; daysSoFar: number; daysLeft: number };
};

const progressStore = createPolledStore<ProgressState>("/api/progress", {
  loaded: false,
  today: "",
  month: "",
  shift: { start: "09:00", end: "18:00" },
  window: { clockIn: "08:50–09:00", clockOut: "18:00–18:10" },
  days: [],
  stats: { perfectDays: 0, scheduledShifts: 0, scheduledToDate: 0, attended: 0, arrivedByStart: 0, milestonesReached: 0 },
  milestones: { reached: [], ladder: [], next: null },
  reward: { name: "", icon: "", cost: 0, balance: 0, remaining: 0 },
  honour: { tier: null, daysSoFar: 0, daysLeft: 0 },
});

export function useProgress() {
  return useSyncExternalStore(progressStore.subscribe, progressStore.getSnapshot, () => progressStore.initial);
}
