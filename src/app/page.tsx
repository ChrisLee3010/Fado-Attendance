"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppRail } from "@/components/app-rail";
import { SignOutButton } from "@/components/sign-out-button";
import { formatWeekday, formatWhen } from "@/lib/history";
import { weekdayIndex } from "@/lib/progress";
import { useProgress } from "@/lib/progress-store";
import { useMe } from "@/lib/session";
import { nextRewardTarget } from "@/lib/reward-target";
import { clockOut, useWallet } from "@/lib/wallet";

const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F"];

function weekOf(today: string) {
  const [year, month, day] = today.split("-").map(Number);
  const offset = weekdayIndex(today);
  return Array.from({ length: 5 }, (_, index) => new Date(Date.UTC(year, month - 1, day - offset + index)).toISOString().slice(0, 10));
}

function greeting(time: string) {
  if (time < "12:00") return "Good morning";
  if (time < "18:00") return "Good afternoon";
  return "Good evening";
}

// Leaving before the shift ends is allowed but costs the Perfect Day, so it takes a second tap.
function useClockOut(shiftEnd: string, now: string) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const early = now !== "" && now < shiftEnd;

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  async function press() {
    if (early && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setBusy(true);
    try {
      await clockOut();
    } finally {
      setBusy(false);
    }
  }

  return { press, confirming, busy, early };
}

export default function Home() {
  const me = useMe();
  const { state, balance: credits } = useWallet();
  const monthProgress = useProgress();
  const week = monthProgress.today ? weekOf(monthProgress.today).map((date) => monthProgress.days.find((day) => day.date === date)) : [];
  const weekPerfect = week.filter((day) => day?.kind === "perfect").length;
  const nextMilestone = monthProgress.milestones.next;
  const { clockedOut, voucher, ledger } = state;
  const target = nextRewardTarget(!!voucher);
  const progress = Math.min(100, Math.round((credits / target.cost) * 100));
  const showPending = !clockedOut && !!state.clockIn;
  const recent = ledger.slice(0, showPending ? 3 : 4);

  const clockedIn = !!state.clockIn;
  const punch = useClockOut(state.shift.end, state.now);
  const onTrack = state.arrival === "on_time";
  const arrivalNote = !clockedIn ? "Not yet" : onTrack ? "Right on time" : state.arrival === "late" ? `After ${state.shift.start}` : "Before the Perfect Day window";
  const heading = !clockedIn
    ? "Not clocked in yet."
    : clockedOut
      ? (state.perfectDay ? "A perfect day." : "Day complete.")
      : onTrack ? "You're on track." : "You're checked in.";
  const footer = !clockedIn
    ? `There's no clock-in for today yet. A Perfect Day starts with a clock-in ${state.window.clockIn}.`
    : clockedOut
      ? state.perfectDay
        ? "Your attendance window qualified. 2 credits added to your wallet."
        : `Your attendance is recorded. A Perfect Day needs a clock-in ${state.window.clockIn} and a clock-out ${state.window.clockOut}.`
      : punch.confirming
        ? `It's before ${state.shift.end}, so today won't count as a Perfect Day. Tap again to clock out anyway.`
        : onTrack
          ? `Clock out between ${state.window.clockOut} to earn your Perfect Day credit.`
          : `Today's Perfect Day needs a clock-in ${state.window.clockIn}, but your attendance still counts.`;
  const buttonLabel = clockedOut
    ? <><CheckIcon /> {state.perfectDay ? "2 credits earned" : "Attendance recorded"}</>
    : !clockedIn
      ? <><ClockIcon /> Waiting for clock-in</>
      : punch.confirming
        ? <><ClockIcon /> Tap again to leave early</>
        : <><ClockIcon /> {punch.early ? "Clock out early" : "Clock out"}</>;

  return (
    <main className={`app-shell ${state.loaded && me.loaded ? "" : "is-loading"}`}>
      <AppRail active="today" />

      <section className="content" id="top">
        <header className="topbar">
          <p><span className="eyebrow-dot" /> {state.today && formatWeekday(state.today)}</p>
          <SignOutButton className="text-button" />
        </header>

        <div className="welcome-row">
          <div>
            <p className="section-kicker">YOUR WORKDAY</p>
            <h1>{greeting(state.now)},<br />{me.firstName}.</h1>
          </div>
          <p className="quiet-note">Keep it steady.<br />Small wins add up.</p>
        </div>

        <section className={`punch-card ${clockedOut ? "complete" : ""}`} aria-live="polite">
          <div className="ticket-header">
            <div>
              <p className="section-kicker">TODAY&apos;S TIME CARD</p>
              <h2>{heading}</h2>
            </div>
            <div className="status-stamp">
              <span className="status-light" />
              {clockedOut ? "COMPLETE" : clockedIn ? "IN PROGRESS" : "NOT STARTED"}
            </div>
          </div>

          <div className="punch-grid">
            <div className="punch-time">
              <span>Clocked in</span>
              <strong>{state.clockIn ?? "— — : — —"}</strong>
              <em>{arrivalNote}</em>
            </div>
            <div className="route-line" aria-hidden="true"><span /><span /></div>
            <div className="punch-time">
              <span>Clocked out</span>
              <strong>{state.clockOut ?? "— — : — —"}</strong>
              <em>{clockedOut ? (state.perfectDay ? "Perfect Day earned" : "Attendance recorded") : `Eligible from ${state.shift.end}`}</em>
            </div>
          </div>

          <div className="punch-footer">
            <p>{footer}</p>
            <button
              className="clockout-button"
              onClick={punch.press}
              disabled={clockedOut || !clockedIn || punch.busy}
            >
              {buttonLabel}
            </button>
          </div>
        </section>

        <div className="dashboard-grid">
          <section className="streak-panel">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">THIS WEEK</p>
                <h2>Your week</h2>
              </div>
              <span className="streak-count">{weekPerfect} <small>Perfect {weekPerfect === 1 ? "Day" : "Days"}</small></span>
            </div>
            <div className="week-row" aria-label={`${weekPerfect} Perfect ${weekPerfect === 1 ? "Day" : "Days"} this week`}>
              {WEEKDAY_LETTERS.map((letter, index) => {
                const kind = week[index]?.kind ?? "upcoming";
                const style = kind === "perfect" ? "earned" : kind === "attended" ? "attended" : kind === "in_progress" ? "current" : "";
                return (
                  <div className={`day ${style}`} key={`${letter}-${index}`}>
                    <span>
                      {kind === "perfect" ? <CheckIcon /> : kind === "attended" ? <i className="cal-dot" /> : kind === "leave" ? "L" : kind === "no_record" ? "–" : letter}
                    </span>
                    <small>{letter}</small>
                  </div>
                );
              })}
            </div>
            <p className="panel-note">
              {nextMilestone
                ? `${nextMilestone.remaining} more Perfect ${nextMilestone.remaining === 1 ? "Day" : "Days"} to your next milestone. `
                : "You've reached every milestone this month. "}
              <Link href="/progress">See your progress</Link>
            </p>
          </section>

          <section className="wallet-panel" id="rewards">
            <div className="wallet-top">
              <div>
                <p className="section-kicker">WALLET</p>
                <h2>{credits} <span>credits</span></h2>
              </div>
              <span className="wallet-icon"><WalletIcon /></span>
            </div>
            <div className="reward-target">
              <div className="coffee-art">{target.icon}</div>
              <div>
                <strong>{target.name}</strong>
                <p>{credits >= target.cost ? "Ready to redeem" : `${target.cost - credits} credits to go`}</p>
              </div>
              <div className="target-ring" style={{ "--progress": `${progress}%` } as React.CSSProperties}>
                <span>{progress}%</span>
              </div>
            </div>
          </section>
        </div>

        <section className="ledger-preview">
          <div className="ledger-heading">
            <div>
              <p className="section-kicker">RECENT ACTIVITY</p>
              <h2>Your credit trail</h2>
            </div>
            <Link className="text-button" href="/history">View all <span>↗</span></Link>
          </div>
          {showPending && (
            <div className="ledger-entry">
              <span className="entry-icon green"><CheckIcon /></span>
              <div><strong>{onTrack ? "On-time arrival" : "Checked in"}</strong><p>Today · {state.clockIn}</p></div>
              <b className="pending">{onTrack ? "Pending" : "Recorded"}</b>
            </div>
          )}
          {recent.map((entry) => (
            <div className="ledger-entry" key={entry.id}>
              <span className={`entry-icon ${entry.amount > 0 ? "green" : "purple"}`}>
                {entry.amount > 0 ? <CheckIcon /> : <SparkIcon />}
              </span>
              <div><strong>{entry.title}</strong><p>{formatWhen(entry, state.today)}</p></div>
              <b className={entry.amount > 0 ? "positive" : "spent"}>
                {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
              </b>
            </div>
          ))}
        </section>
      </section>
    </main>
  );
}

function CheckIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"><path d="m5 12 4.2 4.2L19 6.7"/></svg>; }
function ClockIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></svg>; }
function WalletIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H19v14H5a2 2 0 0 1-2-2V7.5Z"/><path d="M3 8h16v8h-4.5a2.5 2.5 0 1 1 0-5H19"/><circle cx="14.5" cy="13.5" r=".6" fill="currentColor"/></svg>; }
function SparkIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Zm6 13 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z"/></svg>; }
