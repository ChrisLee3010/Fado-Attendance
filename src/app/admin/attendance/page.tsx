"use client";

import { useState, type FormEvent } from "react";
import { AppRail } from "@/components/app-rail";
import { SignOutButton } from "@/components/sign-out-button";
import { formatMonth, useCorrections, useMonthReport, useTodayBoard, type BoardRow, type CorrectionError, type CorrectionInput } from "@/lib/admin-attendance";
import { formatWeekday } from "@/lib/history";
import { useMe } from "@/lib/session";

const CORRECTION_ERRORS: Record<CorrectionError, string> = {
  unknown_employee: "That person doesn't exist.",
  invalid_date: "Pick a valid date.",
  future: "You can't record a time that hasn't happened yet.",
  invalid_time: "Enter a time like 18:05.",
  invalid_reason: "Write a short reason (3–200 characters). It's kept with the record.",
  no_clock_in: "There's no clock-in that day. Add the clock-in first.",
  out_before_in: "Clock-out has to be after clock-in.",
  invalid_kind: "Choose clock in or clock out.",
};

function statusChip(row: BoardRow) {
  switch (row.status) {
    case "no_shift":
      return <span className="chip used">No shift</span>;
    case "on_leave":
      return <span className="chip issued">On leave</span>;
    case "not_yet":
      return <span className="chip used">Not yet</span>;
    case "not_in":
      return <span className="chip rejected">Not in · {row.minutesSinceStart} min</span>;
    case "working":
      return row.lateMinutes > 0 ? <span className="chip late">Late · {row.lateMinutes} min</span> : <span className="chip approved">On time</span>;
    case "left":
      return row.earlyMinutes > 0 ? <span className="chip late">Left {row.earlyMinutes} min early</span> : <span className="chip approved">Done</span>;
  }
}

export default function AttendancePage() {
  const me = useMe();
  const board = useTodayBoard();
  const [month, setMonth] = useState<string | null>(null);
  const corrections = useCorrections();
  const report = useMonthReport(month, corrections.version);
  const [draft, setDraft] = useState<CorrectionInput | null>(null);

  const total = board.rows.length;
  const startFix = (row: BoardRow) =>
    setDraft({
      employeeId: row.id,
      date: board.today,
      kind: row.clockIn ? "clock_out" : "clock_in",
      time: row.clockIn ? row.shift.end : row.shift.start,
      reason: "",
    });

  return (
    <main className={`app-shell ${board.loaded && me.loaded ? "" : "is-loading"}`}>
      <AppRail active="attendance" />

      <section className="content">
        <header className="topbar">
          <p><span className="eyebrow-dot" /> {board.today && formatWeekday(board.today)} · {board.now}</p>
          <SignOutButton className="text-button" />
        </header>

        <div className="admin-title">
          <p className="section-kicker">HR · ATTENDANCE</p>
          <h1>Who&apos;s in today</h1>
        </div>

        <div className="admin-stats attendance-stats">
          <div className="admin-stat"><strong>{board.counts.present}<small>/{total}</small></strong><span>In today{board.counts.remote > 0 ? ` · ${board.counts.remote} remote` : ""}</span></div>
          <div className="admin-stat"><strong>{board.counts.late}</strong><span>Arrived late</span></div>
          <div className="admin-stat"><strong>{board.counts.notIn}</strong><span>{board.scheduled ? "Not in yet, shift started" : "Weekend: no shift"}</span></div>
          <div className="admin-stat"><strong>{board.counts.onLeave}</strong><span>On leave</span></div>
        </div>

        <section className="admin-section" aria-labelledby="today-heading">
          <div className="admin-section-head">
            <h2 id="today-heading">Today</h2>
            <p>Updates every few seconds. Only HR sees this; employees only ever see their own records.</p>
          </div>
          <ul className="admin-list">
            {board.rows.map((row) => (
              <li className="admin-row attendance-row" key={row.id}>
                <div className="admin-who">
                  <strong>{row.name}</strong>
                  <span>{row.id} · {row.department} · shift {row.shift.start}–{row.shift.end}</span>
                </div>
                <div className="admin-detail">
                  <span>
                    {row.clockIn ? `In ${row.clockIn}` : "No clock-in"}
                    {row.clockOut ? ` · Out ${row.clockOut}` : ""}
                    {row.remote ? " · Remote" : ""}
                  </span>
                  {row.corrected && <span title={row.notes.join(" / ")}>Corrected: {row.notes.join(" / ")}</span>}
                </div>
                <div className="attendance-actions">
                  {statusChip(row)}
                  {row.status !== "on_leave" && row.status !== "no_shift" && (
                    <button className="text-button" onClick={() => startFix(row)} aria-label={`Correct ${row.name}'s record`}>Fix</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {draft && (
          <CorrectionForm
            key={`${draft.employeeId}-${draft.kind}`}
            initial={draft}
            today={board.today}
            people={board.rows}
            onCancel={() => setDraft(null)}
            onSubmit={corrections.submit}
          />
        )}

        <section className="admin-section" aria-labelledby="month-heading">
          <div className="admin-section-head">
            <h2 id="month-heading">{report ? formatMonth(report.month) : "This month"}</h2>
            <div className="month-controls">
              <button className="text-button" disabled={!report} onClick={() => report && setMonth(report.previous)} aria-label="Previous month">← Previous</button>
              <button className="text-button" disabled={!report?.next} onClick={() => report?.next && setMonth(report.next)} aria-label="Next month">Next →</button>
              {report && <a className="desk-export" href={`/api/admin/attendance/export?month=${report.month}`}>Export to Excel (CSV)</a>}
            </div>
          </div>
          <div className="admin-table month-table" role="table" aria-label="Attendance this month by person">
            <div className="admin-table-head" role="row">
              <span role="columnheader">Person</span>
              <span role="columnheader">Attended</span>
              <span role="columnheader">Late</span>
              <span role="columnheader">Absent</span>
              <span role="columnheader">Leave</span>
              <span role="columnheader">Left early</span>
              <span role="columnheader">No clock-out</span>
              <span role="columnheader">Perfect Days</span>
            </div>
            {report?.rows.map((row) => (
              <div className="admin-table-row" role="row" key={row.id}>
                <span role="cell"><strong>{row.name}</strong><small>{row.department}{row.remoteDays > 0 ? ` · ${row.remoteDays} remote` : ""}</small></span>
                <span role="cell">{row.attended} / {row.scheduled}</span>
                <span role="cell" className={row.lateDays > 0 ? "warn" : undefined}>{row.lateDays > 0 ? `${row.lateDays} ${row.lateDays === 1 ? "day" : "days"} · ${row.lateMinutes} min` : "—"}</span>
                <span role="cell" className={row.absent > 0 ? "bad" : undefined}>{row.absent || "—"}</span>
                <span role="cell">{row.leave || "—"}</span>
                <span role="cell">{row.leftEarly || "—"}</span>
                <span role="cell" className={row.missingClockOut > 0 ? "warn" : undefined}>{row.missingClockOut || "—"}</span>
                <span role="cell">{row.perfectDays}</span>
              </div>
            ))}
          </div>
          <p className="admin-note month-note">
            &ldquo;Attended&rdquo; counts working days so far this month, plus any weekend work. Today never counts as absent.
          </p>
        </section>
      </section>
    </main>
  );
}

function CorrectionForm(props: {
  initial: CorrectionInput;
  today: string;
  people: BoardRow[];
  onCancel: () => void;
  onSubmit: (input: CorrectionInput) => Promise<{ ok: true; creditAdded: boolean } | { ok: false; error: CorrectionError }>;
}) {
  const [input, setInput] = useState(props.initial);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<CorrectionInput>) => setInput((current) => ({ ...current, ...patch }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await props.onSubmit(input);
    setBusy(false);
    if (!result.ok) {
      setMessage({ kind: "error", text: CORRECTION_ERRORS[result.error] });
      return;
    }
    const person = props.people.find((row) => row.id === input.employeeId)?.name ?? input.employeeId;
    setMessage({ kind: "ok", text: `Saved ${person}'s ${input.kind === "clock_in" ? "clock-in" : "clock-out"} at ${input.time}.${result.creditAdded ? " That day now counts as a Perfect Day, so 2 credits were added." : ""}` });
    set({ reason: "" });
  }

  return (
    <section className="admin-section" aria-labelledby="fix-heading">
      <div className="admin-section-head">
        <h2 id="fix-heading">Correct a record</h2>
        <p>For a forgotten clock-in or clock-out. The reason is saved and the record is marked as corrected.</p>
      </div>
      <form className="desk-card correction-form" onSubmit={submit}>
        <label>
          <span>Person</span>
          <select value={input.employeeId} onChange={(event) => set({ employeeId: event.target.value })}>
            {props.people.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
        <label>
          <span>Date</span>
          <input type="date" value={input.date} max={props.today} onChange={(event) => set({ date: event.target.value })} required />
        </label>
        <label>
          <span>Which</span>
          <select value={input.kind} onChange={(event) => set({ kind: event.target.value as CorrectionInput["kind"] })}>
            <option value="clock_in">Clock in</option>
            <option value="clock_out">Clock out</option>
          </select>
        </label>
        <label>
          <span>Time</span>
          <input type="time" value={input.time} onChange={(event) => set({ time: event.target.value })} required />
        </label>
        <label className="wide">
          <span>Reason</span>
          <input value={input.reason} onChange={(event) => set({ reason: event.target.value })} placeholder="e.g. Forgot to clock out, confirmed by team lead" maxLength={200} required />
        </label>
        <div className="desk-buttons">
          <button type="button" className="desk-secondary" onClick={props.onCancel}>Close</button>
          <button type="submit" className="desk-primary" disabled={busy}>{busy ? "Saving…" : "Save correction"}</button>
        </div>
        {message && <p className={message.kind === "ok" ? "desk-ok" : "desk-error"} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p>}
      </form>
    </section>
  );
}
