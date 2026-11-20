"use client";

import Link from "next/link";
import { useState } from "react";
import { AppRail } from "@/components/app-rail";
import { SignOutButton } from "@/components/sign-out-button";
import { formatDay, formatMonth as monthLabel, formatShort as shortDate, weekdayName } from "@/lib/history";
import { weekdayIndex, type DayInfo, type DayKind } from "@/lib/progress";
import { useProgress } from "@/lib/progress-store";
import { useMe } from "@/lib/session";

const WEEKDAY_HEADERS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

const KIND_LABELS: Record<DayKind, string> = {
  perfect: "Perfect Day",
  attended: "Có đi làm",
  in_progress: "Đã chấm vào",
  no_record: "Không có dữ liệu",
  leave: "Nghỉ phép đã duyệt",
  holiday: "Nghỉ lễ",
  upcoming: "Sắp tới",
  weekend: "Cuối tuần",
};

const LEGEND: DayKind[] = ["perfect", "attended", "leave", "no_record", "upcoming"];

function dayNote(day: DayInfo, today: string, shift: { start: string; end: string }, window: { clockIn: string; clockOut: string }) {
  switch (day.kind) {
    case "perfect":
      return "Bạn đến và về đúng trong khung giờ làm việc.";
    case "attended":
      if (day.reason === "late_arrival") return `Bạn đến sau ${shift.start} nên không có thưởng Perfect Day. Ngày công vẫn được tính.`;
      if (day.reason === "arrived_outside_window") return `Bạn đến trước khung giờ Perfect Day (${window.clockIn}). Ngày công vẫn được tính.`;
      if (day.reason === "early_departure") return `Bạn về trước ${shift.end} nên không có thưởng Perfect Day. Ngày công vẫn được tính.`;
      if (day.reason === "left_outside_window") return `Bạn ở lại quá khung giờ Perfect Day (${window.clockOut}). Ngày công vẫn được tính.`;
      return "Ngày này chưa có lần chấm ra. HR có thể sửa nếu bạn quên chấm.";
    case "in_progress":
      return `Bạn đã chấm vào. Perfect Day cần chấm ra trong khung ${window.clockOut}.`;
    case "no_record":
      return "Ngày này không có lần chấm công nào.";
    case "leave":
      return "Nghỉ phép đã duyệt. Không ảnh hưởng đến tiến độ của bạn.";
    case "holiday":
      return "Nghỉ lễ của công ty. Không ảnh hưởng đến tiến độ của bạn.";
    case "upcoming":
      return day.date === today ? "Hôm nay bạn chưa chấm vào." : "Ca làm việc sắp tới.";
    default:
      return "Không phải ngày làm việc.";
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
            <p className="section-kicker">TIẾN ĐỘ CỦA BẠN</p>
            <h1>{progress.month && monthLabel(progress.month)}</h1>
          </div>
          <span className="pg-pill">Tiến độ cá nhân</span>
        </div>
        <p className="pg-note">Trang này chỉ nói về bạn. Không so sánh với bất kỳ ai khác.</p>

        <div className="pg-stats">
          <div className="pg-stat"><strong>{stats.perfectDays}</strong><span>Perfect Day</span></div>
          <div className="pg-stat"><strong>{stats.scheduledShifts}</strong><span>Ca làm việc</span></div>
          <div className="pg-stat"><strong>{stats.milestonesReached}</strong><span>Mốc đã đạt</span></div>
        </div>

        <section className="pg-section" aria-labelledby="attendance-heading">
          <h2 id="attendance-heading">Chuyên cần trong tháng</h2>
          <div className="pg-card">
            <div className="pg-meter-head">
              <span>{stats.attended} / {stats.scheduledToDate} ca làm việc tính đến nay</span>
              <b>{percent}%</b>
            </div>
            <div className="pg-bar" role="img" aria-label={`Đã đi làm ${stats.attended} trên ${stats.scheduledToDate} ca tính đến nay`}>
              <i style={{ width: `${percent}%` }} />
            </div>

            <div className="cal-grid" role="group" aria-label={`Lịch chuyên cần ${progress.month && monthLabel(progress.month)}`}>
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
                    aria-label={`${weekdayName(day.date)} ngày ${number}, ${monthLabel(progress.month)}: ${KIND_LABELS[day.kind]}`}
                    disabled={day.kind === "weekend"}
                    onClick={() => setSelected(day.date)}
                  >
                    <span>{number}</span>
                    <span className="cal-mark" aria-hidden="true"><DayMark kind={day.kind} /></span>
                  </button>
                );
              })}
            </div>

            <ul className="cal-legend" aria-label="Chú thích lịch">
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
                  <div><dt>Giờ vào</dt><dd>{selectedDay.clockIn ?? "—"}</dd></div>
                  <div><dt>Giờ ra</dt><dd>{selectedDay.clockOut ?? "—"}</dd></div>
                </dl>
                <p>{dayNote(selectedDay, today, shift, window)}</p>
              </div>
            )}
          </div>
        </section>

        <section className="pg-section" aria-labelledby="punctuality-heading">
          <h2 id="punctuality-heading">Perfect Day và đúng giờ</h2>
          <div className="pg-pair">
            <div className="pg-card">
              <p className="pg-big">{stats.perfectDays}</p>
              <p className="pg-label">Perfect Day trong tháng này</p>
              <p className="pg-hint">Chấm vào {window.clockIn} và chấm ra {window.clockOut}.</p>
            </div>
            <div className="pg-card">
              <p className="pg-big">{stats.arrivedByStart} <small>/ {stats.attended}</small></p>
              <p className="pg-label">Ngày bạn đến trước {shift.start}</p>
              <p className="pg-hint">Tính theo ca của riêng bạn, {shift.start}–{shift.end}.</p>
            </div>
          </div>
          <p className="pg-fine">Lỡ một Perfect Day không bao giờ làm mất credit bạn đã nhận, và nghỉ phép được duyệt không bị tính là vắng.</p>
        </section>

        <section className="pg-section" aria-labelledby="milestones-heading">
          <h2 id="milestones-heading">Mốc cá nhân</h2>
          <div className="pg-card">
            <ol className="ladder" aria-label="Các mốc Perfect Day trong tháng này">
              {milestones.ladder.map((step) => (
                <li className={`ladder-step ${step.reached ? "reached" : ""} ${milestones.next?.target === step.target ? "next" : ""}`} key={step.target}>
                  <span className="ladder-dot">{step.reached ? <CheckIcon /> : step.target}</span>
                  <span>{step.target} ngày</span>
                </li>
              ))}
            </ol>

            {milestones.next ? (
              <div className="pg-next">
                <p className="pg-next-title">{milestones.next.target} Perfect Day</p>
                <p>
                  Còn {milestones.next.remaining} Perfect Day nữa là đến mốc tiếp theo.
                  Mốc này thưởng thêm {milestones.next.credits} credit.
                </p>
                <div className="pg-bar" role="img" aria-label={`${stats.perfectDays} trên ${milestones.next.target} Perfect Day`}>
                  <i style={{ width: `${Math.min(100, (stats.perfectDays / milestones.next.target) * 100)}%` }} />
                </div>
              </div>
            ) : (
              <div className="pg-next">
                <p className="pg-next-title">Đã đạt mọi mốc</p>
                <p>Bạn đã đạt tất cả các mốc Perfect Day của tháng này.</p>
              </div>
            )}

            <h3 className="pg-subhead">Đã đạt trong tháng này</h3>
            {milestones.reached.length === 0 ? (
              <p className="pg-empty">Mốc đầu tiên của bạn là {milestones.next?.target ?? 5} Perfect Day.</p>
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
          <h2 id="reward-heading">Phần thưởng tiếp theo</h2>
          <div className="pg-card pg-reward">
            <span className="pg-reward-icon">{reward.icon}</span>
            <div className="pg-reward-main">
              <strong>{reward.name}</strong>
              <p>{reward.remaining === 0 ? "Bạn đã đủ credit để đổi phần thưởng này." : `Còn ${reward.remaining} credit`} · {reward.balance} / {reward.cost}</p>
              <div className="pg-bar" role="img" aria-label={`${reward.balance} trên ${reward.cost} credit`}>
                <i style={{ width: `${reward.cost > 0 ? Math.min(100, (reward.balance / reward.cost) * 100) : 0}%` }} />
              </div>
            </div>
            <Link className="pg-link" href="/rewards">Xem quà tặng</Link>
          </div>
        </section>

        <p className="history-note">Dữ liệu giả lập.</p>
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
