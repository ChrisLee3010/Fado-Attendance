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
import { clockIn, clockOut, useWallet, type Location, type PunchError } from "@/lib/wallet";

const WEEKDAY_LETTERS = ["T2", "T3", "T4", "T5", "T6"];

function weekOf(today: string) {
  const [year, month, day] = today.split("-").map(Number);
  const offset = weekdayIndex(today);
  return Array.from({ length: 5 }, (_, index) => new Date(Date.UTC(year, month - 1, day - offset + index)).toISOString().slice(0, 10));
}

function greeting(time: string) {
  if (time < "12:00") return "Chào buổi sáng";
  if (time < "18:00") return "Chào buổi chiều";
  return "Chào buổi tối";
}

function refusalMessage(error: PunchError, ip: string | null) {
  if (error === "not_office_network") {
    return `Có vẻ bạn chưa kết nối mạng văn phòng${ip ? ` (kết nối của bạn hiện là ${ip})` : ""}. Hãy kết nối Wi-Fi văn phòng. Nếu đang dùng VPN, hãy tắt VPN rồi thử lại.`;
  }
  if (error === "no_client_ip") return "Không xác định được bạn đang ở mạng nào. Vui lòng báo HR để kiểm tra cài đặt ứng dụng.";
  if (error === "no_clock_in") return "Hôm nay chưa có lần chấm vào để chấm ra.";
  return "Không kết nối được máy chủ. Hãy kiểm tra mạng và thử lại.";
}

// One button: clock in, then clock out. Leaving before the shift ends costs the Perfect Day, so it takes a second tap.
function usePunch(clockedIn: boolean, shiftEnd: string, now: string) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const early = now !== "" && now < shiftEnd;

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  async function press() {
    if (clockedIn && early && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setRefusal(null);
    setBusy(true);
    try {
      const result = await (clockedIn ? clockOut() : clockIn());
      if (!result.ok) setRefusal(refusalMessage(result.error, result.ip));
    } finally {
      setBusy(false);
    }
  }

  return { press, confirming, busy, early, refusal };
}

function LocationNote({ location, clockedOut }: { location: Location; clockedOut: boolean }) {
  if (clockedOut) return null;
  if (location.verdict === "office") return <p className="location-note ok"><span /> Đang ở mạng văn phòng{location.network ? ` · ${location.network}` : ""}</p>;
  if (location.verdict === "remote") return <p className="location-note remote"><span /> Ngoài văn phòng · sẽ được ghi nhận là làm việc từ xa</p>;
  return <p className="location-note blocked"><span /> Chưa ở mạng văn phòng{location.ip ? ` · ${location.ip}` : ""}</p>;
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
  const punch = usePunch(clockedIn, state.shift.end, state.now);
  const onTrack = state.arrival === "on_time";
  const arrivalText = onTrack ? "Đúng giờ" : state.arrival === "late" ? `Sau ${state.shift.start}` : "Trước khung giờ Perfect Day";
  const arrivalNote = !clockedIn ? "Chưa chấm" : state.clockInMode === "remote" ? `Từ xa · ${arrivalText}` : arrivalText;
  const heading = !clockedIn
    ? "Bạn chưa chấm công."
    : clockedOut
      ? (state.perfectDay ? "Một ngày hoàn hảo." : "Hoàn thành ngày làm việc.")
      : onTrack ? "Bạn đang đúng hướng." : "Bạn đã chấm vào.";
  const footer = punch.refusal
    ? punch.refusal
    : !clockedIn
    ? `Chấm vào trong khung ${state.window.clockIn} để bắt đầu một Perfect Day. Ngày công vẫn được tính dù bạn đến lúc nào.`
    : clockedOut
      ? state.perfectDay
        ? "Bạn đạt khung giờ Perfect Day. Đã cộng 2 credit vào ví."
        : `Ngày công đã được ghi nhận. Perfect Day cần chấm vào trong khung ${state.window.clockIn} và chấm ra trong khung ${state.window.clockOut}.`
      : punch.confirming
        ? `Chưa đến ${state.shift.end}, nên hôm nay sẽ không tính là Perfect Day. Bấm lần nữa để vẫn chấm ra.`
        : onTrack
          ? `Chấm ra trong khung ${state.window.clockOut} để nhận credit Perfect Day.`
          : `Perfect Day hôm nay cần chấm vào trong khung ${state.window.clockIn}, nhưng ngày công của bạn vẫn được tính.`;
  const buttonLabel = clockedOut
    ? <><CheckIcon /> {state.perfectDay ? "Đã nhận 2 credit" : "Đã ghi nhận công"}</>
    : !clockedIn
      ? <><ClockIcon /> {punch.busy ? "Đang chấm vào…" : "Chấm vào"}</>
      : punch.confirming
        ? <><ClockIcon /> Bấm lần nữa để về sớm</>
        : <><ClockIcon /> {punch.early ? "Chấm ra sớm" : "Chấm ra"}</>;

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
            <p className="section-kicker">NGÀY LÀM VIỆC CỦA BẠN</p>
            <h1>{greeting(state.now)},<br />{me.firstName}.</h1>
          </div>
          <p className="quiet-note">Đều đặn nhé.<br />Từng bước nhỏ cộng lại thành điều lớn.</p>
        </div>

        <section className={`punch-card ${clockedOut ? "complete" : ""}`} aria-live="polite">
          <div className="ticket-header">
            <div>
              <p className="section-kicker">THẺ CÔNG HÔM NAY</p>
              <h2>{heading}</h2>
            </div>
            <div className="status-stamp">
              <span className="status-light" />
              {clockedOut ? "HOÀN THÀNH" : clockedIn ? "ĐANG LÀM VIỆC" : "CHƯA BẮT ĐẦU"}
            </div>
          </div>

          <div className="punch-grid">
            <div className="punch-time">
              <span>Giờ vào</span>
              <strong>{state.clockIn ?? "— — : — —"}</strong>
              <em>{arrivalNote}</em>
            </div>
            <div className="route-line" aria-hidden="true"><span /><span /></div>
            <div className="punch-time">
              <span>Giờ ra</span>
              <strong>{state.clockOut ?? "— — : — —"}</strong>
              <em>{clockedOut ? (state.perfectDay ? "Đạt Perfect Day" : "Đã ghi nhận công") : `Chấm ra được từ ${state.shift.end}`}</em>
            </div>
          </div>

          <div className="punch-footer">
            <div>
              <p className={punch.refusal ? "punch-refusal" : undefined} role={punch.refusal ? "alert" : undefined}>{footer}</p>
              <LocationNote location={state.location} clockedOut={clockedOut} />
            </div>
            <button
              className="clockout-button"
              onClick={punch.press}
              disabled={clockedOut || punch.busy || !state.loaded}
            >
              {buttonLabel}
            </button>
          </div>
        </section>

        <div className="dashboard-grid">
          <section className="streak-panel">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">TUẦN NÀY</p>
                <h2>Tuần của bạn</h2>
              </div>
              <span className="streak-count">{weekPerfect} <small>Perfect Day</small></span>
            </div>
            <div className="week-row" aria-label={`${weekPerfect} Perfect Day trong tuần này`}>
              {WEEKDAY_LETTERS.map((letter, index) => {
                const kind = week[index]?.kind ?? "upcoming";
                const style = kind === "perfect" ? "earned" : kind === "attended" ? "attended" : kind === "in_progress" ? "current" : "";
                return (
                  <div className={`day ${style}`} key={`${letter}-${index}`}>
                    <span>
                      {kind === "perfect" ? <CheckIcon /> : kind === "attended" ? <i className="cal-dot" /> : kind === "leave" ? "P" : kind === "no_record" ? "–" : letter}
                    </span>
                    <small>{letter}</small>
                  </div>
                );
              })}
            </div>
            <p className="panel-note">
              {nextMilestone
                ? `Còn ${nextMilestone.remaining} Perfect Day nữa là đến mốc tiếp theo. `
                : "Bạn đã đạt mọi mốc trong tháng này. "}
              <Link href="/progress">Xem tiến độ</Link>
            </p>
          </section>

          <section className="wallet-panel" id="rewards">
            <div className="wallet-top">
              <div>
                <p className="section-kicker">VÍ CREDIT</p>
                <h2>{credits} <span>credit</span></h2>
              </div>
              <span className="wallet-icon"><WalletIcon /></span>
            </div>
            <div className="reward-target">
              <div className="coffee-art">{target.icon}</div>
              <div>
                <strong>{target.name}</strong>
                <p>{credits >= target.cost ? "Sẵn sàng đổi quà" : `Còn ${target.cost - credits} credit`}</p>
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
              <p className="section-kicker">HOẠT ĐỘNG GẦN ĐÂY</p>
              <h2>Lịch sử credit của bạn</h2>
            </div>
            <Link className="text-button" href="/history">Xem tất cả <span>↗</span></Link>
          </div>
          {showPending && (
            <div className="ledger-entry">
              <span className="entry-icon green"><CheckIcon /></span>
              <div><strong>{onTrack ? "Đến đúng giờ" : "Đã chấm vào"}</strong><p>Hôm nay · {state.clockIn}</p></div>
              <b className="pending">{onTrack ? "Đang chờ" : "Đã ghi nhận"}</b>
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
