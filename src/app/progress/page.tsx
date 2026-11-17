"use client";

import Link from "next/link";
import { useState } from "react";
import { AppRail } from "@/components/app-rail";
import { SignOutButton } from "@/components/sign-out-button";
import { formatDay } from "@/lib/history";
import { weekdayIndex, type DayInfo, type DayKind } from "@/lib/progress";
import { useProgress } from "@/lib/progress-store";
import { useMe } from "@/lib/session";

const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const KIND_LABELS: Record<DayKind, string> = {
  perfect: "Perfect Day",
  attended: "Attended",
  in_progress: "Clocked in",
  no_record: "No record",
  leave: "Approved leave",
  holiday: "Holiday",
  upcoming: "Upcoming",
  weekend: "Weekend",
};

const LEGEND: DayKind[] = ["perfect", "attended", "leave", "no_record", "upcoming"];

function utcDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

const weekdayName = (date: string) => utcDate(date).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
const monthLabel = (month: string) => utcDate(`${month}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const shortDate = (date: string) => utcDate(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function dayNote(day: DayInfo, today: string, shift: { start: string; end: string }, window: { clockIn: string; clockOut: string }) {
  switch (day.kind) {
    case "perfect":
      return "You arrived and left inside your schedule window.";
    case "attended":
      if (day.reason === "late_arrival") return `You arrived after ${shift.start}, so there was no Perfect Day bonus. Your attendance still counts.`;
      if (day.reason === "arrived_outside_window") return `You arrived before the Perfect Day window (${window.clockIn}). Your attendance still counts.`;
      if (day.reason === "early_departure") return `You left before ${shift.end}, so there was no Perfect Day bonus. Your attendance still counts.`;
      if (day.reason === "left_outside_window") return `You stayed past the Perfect Day window (${window.clockOut}). Your attendance still counts.`;
      return "No clock-out was recorded for this day. HR can correct a missed punch.";
    case "in_progress":
      return `You're clocked in. A Perfect Day needs a clock-out ${window.clockOut}.`;
    case "no_record":
      return "No punches were recorded for this day.";
    case "leave":
      return "Approved leave. It doesn't affect your progress.";
    case "holiday":
      return "Company holiday. It doesn't affect your progress.";
    case "upcoming":
      return day.date === today ? "You haven't clocked in yet today." : "An upcoming scheduled shift.";
    default:
      return "Not a scheduled day.";
  }
}

export default function ProgressPage() {
  const me = useMe();
  const progress = useProgress();
  const [selected, setSelected] = useState<string | null>(null);

  const { stats, milestones, reward, days, today, shift, window } = progress;
  const selectedDay = days.find((day) => day.date === (selected ?? today));
  const percent = stats.scheduledToDate > 0 ? Math.round((stats.attended / stats.scheduledToDate) * 100) : 0;
  const leadingBlanks = days.length > 0 ? weekdayIndex(days[0].date) : 0;

  return (
    <main className={`app-shell ${progress.loaded && me.loaded ? "" : "is-loading"}`}>
      <AppRail active="progress" />

      <section className="content">
        <header className="topbar">
          <p><span className="eyebrow-dot" /> {today && formatDay(today)}</p>
          <SignOutButton className="text-button" />
        </header>

        <div className="pg-intro">
          <div>
            <p className="section-kicker">YOUR PROGRESS</p>
            <h1>{progress.month && monthLabel(progress.month)}</h1>
          </div>
          <span className="pg-pill">Personal progress</span>
        </div>
        <p className="pg-note">This page is just about you. It isn&apos;t compared with anyone else.</p>

        <div className="pg-stats">
          <div className="pg-stat"><strong>{stats.perfectDays}</strong><span>Perfect Days</span></div>
          <div className="pg-stat"><strong>{stats.scheduledShifts}</strong><span>Scheduled shifts</span></div>
          <div className="pg-stat"><strong>{stats.milestonesReached}</strong><span>Milestones reached</span></div>
        </div>

        <section className="pg-section" aria-labelledby="attendance-heading">
          <h2 id="attendance-heading">Monthly attendance</h2>
          <div className="pg-card">
            <div className="pg-meter-head">
              <span>{stats.attended} of {stats.scheduledToDate} scheduled shifts so far</span>
              <b>{percent}%</b>
            </div>
            <div className="pg-bar" role="img" aria-label={`${stats.attended} of ${stats.scheduledToDate} scheduled shifts attended so far`}>
              <i style={{ width: `${percent}%` }} />
            </div>

            <div className="cal-grid" role="group" aria-label={`Attendance calendar for ${progress.month && monthLabel(progress.month)}`}>
              {WEEKDAY_HEADERS.map((label) => (
                <span className="cal-head" key={label}>{label}</span>
              ))}
              {Array.from({ length: leadingBlanks }, (_, index) => (
                <span className="cal-blank" key={`blank-${index}`} aria-hidden="true" />
              ))}
              {days.map((day) => {
                const number = Number(day.date.slice(8));
                const isSelected = day.date === (selected ?? today);
                return (
                  <button
                    key={day.date}
                    className={`cal-day ${day.kind} ${day.date === today ? "today" : ""} ${isSelected ? "selected" : ""}`}
                    aria-pressed={isSelected}
                    aria-label={`${weekdayName(day.date)} ${number} ${monthLabel(progress.month)}: ${KIND_LABELS[day.kind]}`}
                    disabled={day.kind === "weekend"}
                    onClick={() => setSelected(day.date)}
                  >
                    <span>{number}</span>
                    <span className="cal-mark" aria-hidden="true"><DayMark kind={day.kind} /></span>
                  </button>
                );
              })}
            </div>

            <ul className="cal-legend" aria-label="Calendar key">
              {LEGEND.map((kind) => (
                <li key={kind}><i className={`cal-swatch ${kind}`} /> {KIND_LABELS[kind]}</li>
              ))}
            </ul>

            {selectedDay && (
              <div className="cal-detail" aria-live="polite">
                <div className="cal-detail-head">
                  <strong>{weekdayName(selectedDay.date)}, {formatDay(selectedDay.date)}</strong>
                  <span className={`cal-chip ${selectedDay.kind}`}>{KIND_LABELS[selectedDay.kind]}</span>
                </div>
                <dl>
                  <div><dt>Clocked in</dt><dd>{selectedDay.clockIn ?? "—"}</dd></div>
                  <div><dt>Clocked out</dt><dd>{selectedDay.clockOut ?? "—"}</dd></div>
                </dl>
                <p>{dayNote(selectedDay, today, shift, window)}</p>
              </div>
            )}
          </div>
        </section>

        <section className="pg-section" aria-labelledby="punctuality-heading">
          <h2 id="punctuality-heading">Perfect Days and punctuality</h2>
          <div className="pg-pair">
            <div className="pg-card">
              <p className="pg-big">{stats.perfectDays}</p>
              <p className="pg-label">Perfect Days this month</p>
              <p className="pg-hint">Clock in {window.clockIn} and out {window.clockOut}.</p>
            </div>
            <div className="pg-card">
              <p className="pg-big">{stats.arrivedByStart} <small>of {stats.attended}</small></p>
              <p className="pg-label">Days you arrived by {shift.start}</p>
              <p className="pg-hint">Based on your own shift, {shift.start}–{shift.end}.</p>
            </div>
          </div>
          <p className="pg-fine">Missing a Perfect Day never removes credits you&apos;ve already earned, and approved leave isn&apos;t counted against you.</p>
        </section>

        <section className="pg-section" aria-labelledby="milestones-heading">
          <h2 id="milestones-heading">Personal milestones</h2>
          <div className="pg-card">
            <ol className="ladder" aria-label="Perfect Days milestones this month">
              {milestones.ladder.map((step) => (
                <li className={`ladder-step ${step.reached ? "reached" : ""} ${milestones.next?.target === step.target ? "next" : ""}`} key={step.target}>
                  <span className="ladder-dot">{step.reached ? <CheckIcon /> : step.target}</span>
                  <span>{step.target} days</span>
                </li>
              ))}
            </ol>

            {milestones.next ? (
              <div className="pg-next">
                <p className="pg-next-title">{milestones.next.target} Perfect Days</p>
                <p>
                  {milestones.next.remaining} more Perfect {milestones.next.remaining === 1 ? "Day" : "Days"} to reach your next milestone.
                  It adds {milestones.next.credits} credits.
                </p>
                <div className="pg-bar" role="img" aria-label={`${stats.perfectDays} of ${milestones.next.target} Perfect Days`}>
                  <i style={{ width: `${Math.min(100, (stats.perfectDays / milestones.next.target) * 100)}%` }} />
                </div>
              </div>
            ) : (
              <div className="pg-next">
                <p className="pg-next-title">Every milestone reached</p>
                <p>You&apos;ve reached all of this month&apos;s Perfect Day milestones.</p>
              </div>
            )}

            <h3 className="pg-subhead">Reached this month</h3>
            {milestones.reached.length === 0 ? (
              <p className="pg-empty">Your first milestone is {milestones.next?.target ?? 5} Perfect Days away.</p>
            ) : (
              <ul className="pg-rows">
                {milestones.reached.map((item) => (
                  <li key={item.id}>
                    <span className="pg-row-icon"><TrophyIcon /></span>
                    <div><strong>{item.title}</strong><span>{shortDate(item.date)}</span></div>
                    <b>+{item.credits}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="pg-section" aria-labelledby="reward-heading">
          <h2 id="reward-heading">Next reward</h2>
          <div className="pg-card pg-reward">
            <span className="pg-reward-icon">{reward.icon}</span>
            <div className="pg-reward-main">
              <strong>{reward.name}</strong>
              <p>{reward.remaining === 0 ? "You have enough credits to redeem this." : `${reward.remaining} credits to go`} · {reward.balance} of {reward.cost}</p>
              <div className="pg-bar" role="img" aria-label={`${reward.balance} of ${reward.cost} credits`}>
                <i style={{ width: `${reward.cost > 0 ? Math.min(100, (reward.balance / reward.cost) * 100) : 0}%` }} />
              </div>
            </div>
            <Link className="pg-link" href="/rewards">See rewards</Link>
          </div>
        </section>

        <p className="history-note">Fictional prototype data.</p>
      </section>
    </main>
  );
}

function DayMark({ kind }: { kind: DayKind }) {
  if (kind === "perfect") return <CheckIcon />;
  if (kind === "attended") return <span className="cal-dot" />;
  if (kind === "in_progress") return <ClockIcon />;
  if (kind === "leave") return <>L</>;
  if (kind === "holiday") return <>H</>;
  if (kind === "no_record") return <>–</>;
  return null;
}

function CheckIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 4.2 4.2L19 6.7"/></svg>; }
function ClockIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></svg>; }
function TrophyIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4.5a3 3 0 0 0 3 4M16 6h3.5a3 3 0 0 1-3 4M12 13v4M8.5 20h7"/></svg>; }
