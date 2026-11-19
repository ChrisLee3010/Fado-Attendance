"use client";

import { useState, type FormEvent } from "react";
import { AppRail } from "@/components/app-rail";
import { SignOutButton } from "@/components/sign-out-button";
import { formatMonth, useCorrections, useMonthReport, useTodayBoard, type BoardRow, type CorrectionError, type CorrectionInput } from "@/lib/admin-attendance";
import { formatWeekday } from "@/lib/history";
import { useMe } from "@/lib/session";

const CORRECTION_ERRORS: Record<CorrectionError, string> = {
  unknown_employee: "Không có người này.",
  invalid_date: "Hãy chọn một ngày hợp lệ.",
  future: "Không thể ghi một giờ chưa xảy ra.",
  invalid_time: "Hãy nhập giờ dạng 18:05.",
  invalid_reason: "Hãy ghi một lý do ngắn (3–200 ký tự). Lý do được lưu cùng bản ghi.",
  no_clock_in: "Ngày đó chưa có lần chấm vào. Hãy thêm giờ vào trước.",
  out_before_in: "Giờ ra phải sau giờ vào.",
  invalid_kind: "Hãy chọn chấm vào hoặc chấm ra.",
};

function statusChip(row: BoardRow) {
  switch (row.status) {
    case "no_shift":
      return <span className="chip used">Không có ca</span>;
    case "on_leave":
      return <span className="chip issued">Nghỉ phép</span>;
    case "not_yet":
      return <span className="chip used">Chưa đến giờ</span>;
    case "not_in":
      return <span className="chip rejected">Chưa vào · {row.minutesSinceStart} phút</span>;
    case "working":
      return row.lateMinutes > 0 ? <span className="chip late">Trễ · {row.lateMinutes} phút</span> : <span className="chip approved">Đúng giờ</span>;
    case "left":
      return row.earlyMinutes > 0 ? <span className="chip late">Về sớm {row.earlyMinutes} phút</span> : <span className="chip approved">Đã xong</span>;
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
          <p className="section-kicker">HR · CHẤM CÔNG</p>
          <h1>Hôm nay ai có mặt</h1>
        </div>

        <div className="admin-stats attendance-stats">
          <div className="admin-stat"><strong>{board.counts.present}<small>/{total}</small></strong><span>Có mặt hôm nay{board.counts.remote > 0 ? ` · ${board.counts.remote} từ xa` : ""}</span></div>
          <div className="admin-stat"><strong>{board.counts.late}</strong><span>Đến trễ</span></div>
          <div className="admin-stat"><strong>{board.counts.notIn}</strong><span>{board.scheduled ? "Chưa vào dù ca đã bắt đầu" : "Cuối tuần: không có ca"}</span></div>
          <div className="admin-stat"><strong>{board.counts.onLeave}</strong><span>Nghỉ phép</span></div>
        </div>

        <section className="admin-section" aria-labelledby="today-heading">
          <div className="admin-section-head">
            <h2 id="today-heading">Hôm nay</h2>
            <p>Tự cập nhật vài giây một lần. Chỉ HR thấy mục này; nhân viên chỉ thấy dữ liệu của chính mình.</p>
          </div>
          <ul className="admin-list">
            {board.rows.map((row) => (
              <li className="admin-row attendance-row" key={row.id}>
                <div className="admin-who">
                  <strong>{row.name}</strong>
                  <span>{row.id} · {row.department} · ca {row.shift.start}–{row.shift.end}</span>
                </div>
                <div className="admin-detail">
                  <span>
                    {row.clockIn ? `Vào ${row.clockIn}` : "Chưa chấm vào"}
                    {row.clockOut ? ` · Ra ${row.clockOut}` : ""}
                    {row.remote ? " · Từ xa" : ""}
                  </span>
                  {row.corrected && <span title={row.notes.join(" / ")}>Đã sửa: {row.notes.join(" / ")}</span>}
                </div>
                <div className="attendance-actions">
                  {statusChip(row)}
                  {row.status !== "on_leave" && row.status !== "no_shift" && (
                    <button className="text-button" onClick={() => startFix(row)} aria-label={`Sửa công của ${row.name}`}>Sửa</button>
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
            <h2 id="month-heading">{report ? formatMonth(report.month) : "Tháng này"}</h2>
            <div className="month-controls">
              <button className="text-button" disabled={!report} onClick={() => report && setMonth(report.previous)} aria-label="Tháng trước">← Tháng trước</button>
              <button className="text-button" disabled={!report?.next} onClick={() => report?.next && setMonth(report.next)} aria-label="Tháng sau">Tháng sau →</button>
              {report && <a className="desk-export" href={`/api/admin/attendance/export?month=${report.month}`}>Xuất Excel (CSV)</a>}
            </div>
          </div>
          <div className="admin-table month-table" role="table" aria-label="Chấm công trong tháng theo từng người">
            <div className="admin-table-head" role="row">
              <span role="columnheader">Họ tên</span>
              <span role="columnheader">Có mặt</span>
              <span role="columnheader">Trễ</span>
              <span role="columnheader">Vắng</span>
              <span role="columnheader">Nghỉ phép</span>
              <span role="columnheader">Về sớm</span>
              <span role="columnheader">Quên chấm ra</span>
              <span role="columnheader">Perfect Day</span>
            </div>
            {report?.rows.map((row) => (
              <div className="admin-table-row" role="row" key={row.id}>
                <span role="cell"><strong>{row.name}</strong><small>{row.department}{row.remoteDays > 0 ? ` · ${row.remoteDays} ngày từ xa` : ""}</small></span>
                <span role="cell">{row.attended} / {row.scheduled}</span>
                <span role="cell" className={row.lateDays > 0 ? "warn" : undefined}>{row.lateDays > 0 ? `${row.lateDays} ngày · ${row.lateMinutes} phút` : "—"}</span>
                <span role="cell" className={row.absent > 0 ? "bad" : undefined}>{row.absent || "—"}</span>
                <span role="cell">{row.leave || "—"}</span>
                <span role="cell">{row.leftEarly || "—"}</span>
                <span role="cell" className={row.missingClockOut > 0 ? "warn" : undefined}>{row.missingClockOut || "—"}</span>
                <span role="cell">{row.perfectDays}</span>
              </div>
            ))}
          </div>
          <p className="admin-note month-note">
            &ldquo;Có mặt&rdquo; tính các ngày làm việc đến nay trong tháng, cộng cả những ngày làm cuối tuần. Hôm nay không bao giờ bị tính là vắng.
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
    setMessage({ kind: "ok", text: `Đã lưu giờ ${input.kind === "clock_in" ? "vào" : "ra"} của ${person}: ${input.time}.${result.creditAdded ? " Ngày đó giờ được tính là Perfect Day nên đã cộng 2 credit." : ""}` });
    set({ reason: "" });
  }

  return (
    <section className="admin-section" aria-labelledby="fix-heading">
      <div className="admin-section-head">
        <h2 id="fix-heading">Sửa bản ghi công</h2>
        <p>Dành cho trường hợp quên chấm vào hoặc chấm ra. Lý do được lưu lại và bản ghi được đánh dấu &ldquo;đã sửa&rdquo;.</p>
      </div>
      <form className="desk-card correction-form" onSubmit={submit}>
        <label>
          <span>Nhân viên</span>
          <select value={input.employeeId} onChange={(event) => set({ employeeId: event.target.value })}>
            {props.people.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
        <label>
          <span>Ngày</span>
          <input type="date" value={input.date} max={props.today} onChange={(event) => set({ date: event.target.value })} required />
        </label>
        <label>
          <span>Loại</span>
          <select value={input.kind} onChange={(event) => set({ kind: event.target.value as CorrectionInput["kind"] })}>
            <option value="clock_in">Chấm vào</option>
            <option value="clock_out">Chấm ra</option>
          </select>
        </label>
        <label>
          <span>Giờ</span>
          <input type="time" value={input.time} onChange={(event) => set({ time: event.target.value })} required />
        </label>
        <label className="wide">
          <span>Lý do</span>
          <input value={input.reason} onChange={(event) => set({ reason: event.target.value })} placeholder="Ví dụ: Quên chấm ra, trưởng nhóm đã xác nhận" maxLength={200} required />
        </label>
        <div className="desk-buttons">
          <button type="button" className="desk-secondary" onClick={props.onCancel}>Đóng</button>
          <button type="submit" className="desk-primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu chỉnh sửa"}</button>
        </div>
        {message && <p className={message.kind === "ok" ? "desk-ok" : "desk-error"} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p>}
      </form>
    </section>
  );
}
