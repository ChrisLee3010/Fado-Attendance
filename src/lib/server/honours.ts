import { firstDayOfNextMonth, HONOUR_TIERS, HONOUR_TITLES, honourTier, type HonourTier } from "../honours";
import { now } from "./clock";
import { getDb } from "./db";
import { loadMonth, shiftOf } from "./store";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const shiftMonth = (month: string, delta: number) => {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7);
};

// Only finished months go on the wall: from the first month with any attendance up to last month.
function wallRange() {
  const current = now().date.slice(0, 7);
  const first = getDb().prepare("SELECT MIN(work_date) AS first FROM attendance_events").get()?.first;
  const latest = shiftMonth(current, -1);
  const earliest = first ? String(first).slice(0, 7) : latest;
  return { earliest: earliest < latest ? earliest : latest, latest };
}

export function isWallMonth(month: string) {
  const { earliest, latest } = wallRange();
  return MONTH.test(month) && month >= earliest && month <= latest;
}

export function defaultWallMonth() {
  return wallRange().latest;
}

// Names and departments only, grouped by level and sorted alphabetically: no counts, no order of merit.
export function honourWall(month: string, viewerEmployeeId: string | null) {
  const db = getDb();
  const todayDate = now().date;
  const until = firstDayOfNextMonth(month);
  const people = db
    .prepare("SELECT id, name, department FROM employees ORDER BY name")
    .all()
    .map((row) => {
      const id = String(row.id);
      const shift = shiftOf(db, id);
      return { id, name: String(row.name), department: String(row.department), tier: honourTier(loadMonth(db, id, shift, todayDate, month), shift, until) };
    });

  const { earliest, latest } = wallRange();
  return {
    month,
    previous: month > earliest ? shiftMonth(month, -1) : null,
    next: month < latest ? shiftMonth(month, 1) : null,
    tiers: HONOUR_TIERS.map((tier) => ({
      tier,
      ...HONOUR_TITLES[tier],
      people: people.filter((person) => person.tier === tier).map((person) => ({ name: person.name, department: person.department, you: person.id === viewerEmployeeId })),
    })),
    yourTier: (people.find((person) => person.id === viewerEmployeeId)?.tier ?? null) as HonourTier | null,
  };
}
