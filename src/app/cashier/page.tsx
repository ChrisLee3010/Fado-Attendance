"use client";

import { useState } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { useCashierOverview } from "@/lib/cashier";
import { useRoleGate } from "@/lib/session";
import { checkVoucher, consumeVoucher, type VoucherInfo } from "@/lib/wallet";

// Reward kinds are code values in the database; this is how the counter reads them.
const REWARD_KINDS: Record<string, string> = { Voucher: "Voucher", Gift: "Quà tặng", "Needs approval": "Cần HR duyệt" };

// A small visual for each reward. The database has no images, so the counter uses one emoji per reward.
const REWARD_ART: Record<string, string> = { coffee: "☕", lunch: "🍱", "goodie-bag": "🎁", "personal-day": "🌿" };
const artFor = (rewardId: string | undefined) => (rewardId && REWARD_ART[rewardId]) || "🎁";

const RECENT_COUNT = 5;

export default function CashierPage() {
  const { me, allowed } = useRoleGate("cashier");
  const { loaded, catalogue, redemptions } = useCashierOverview();
  const [input, setInput] = useState("");
  const [result, setResult] = useState<VoucherInfo | null>(null);
  const [justUsed, setJustUsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  async function check(event: React.FormEvent) {
    event.preventDefault();
    if (!input.trim() || busy) return;
    setBusy(true);
    setJustUsed(false);
    setResult(await checkVoucher(input));
    setBusy(false);
  }

  async function markUsed() {
    if (result?.status !== "issued" || busy) return;
    setBusy(true);
    const outcome = await consumeVoucher(result.code);
    setJustUsed(outcome.consumed);
    setResult(outcome.voucher);
    setBusy(false);
  }

  const recent = showAll ? redemptions : redemptions.slice(0, RECENT_COUNT);

  return (
    <main className={`cashier-shell ${allowed ? "" : "is-loading"}`}>
      <header className="cashier-top">
        <div className="brand cashier-brand">
          <span className="brand-mark">W</span>
          <span className="cashier-brand-text">
            <strong>FADO Café</strong>
            <small>Quầy thu ngân</small>
          </span>
        </div>
        <div className="cashier-top-right">
          <span className="cashier-demo"><i /> Chế độ demo</span>
          <span className="cashier-user">{me.name}</span>
          <SignOutButton className="cashier-back" />
        </div>
      </header>

      <div className="cashier-body">
        <p className="cashier-kicker">TRAO QUÀ BẰNG VOUCHER</p>
        <h1>Xác nhận phần quà.</h1>
        <p className="cashier-lead">Quét voucher của nhân viên hoặc nhập mã thủ công.</p>

        <section className="cashier-card">
          <form className="cashier-form" onSubmit={check}>
            <div className="cashier-form-head">
              <label htmlFor="voucher-code">Mã voucher</label>
              <span>Nhập thủ công</span>
            </div>
            <div className="cashier-field">
              <input
                id="voucher-code"
                className="cashier-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="WQ-0000"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />
              <button className="cashier-check" type="submit" disabled={!input.trim() || busy} aria-label="Kiểm tra mã">
                <SearchIcon />
              </button>
            </div>
          </form>

          <div aria-live="polite">
            {result?.status === "invalid" && (
              <div className="cashier-result">
                <span className="cashier-state bad">Không tìm thấy mã</span>
                <p>Không có voucher nào khớp <strong>{input.trim().toUpperCase()}</strong>. Hãy kiểm tra lại mã với nhân viên và thử lại.</p>
              </div>
            )}

            {result?.status === "issued" && (
              <div className="cashier-result">
                <span className="cashier-state ok">Sẵn sàng nhận</span>
                <RewardSummary voucher={result} />
                <div className="cashier-issued">
                  <span>CẤP CHO</span>
                  <strong>{result.employee} · {result.employeeId}</strong>
                </div>
                <button className="cashier-use" onClick={markUsed} disabled={busy}>Xác nhận trao quà</button>
                <p className="cashier-fineprint">Minh hoạ trạng thái voucher hợp lệ, không phải giao dịch thật.</p>
              </div>
            )}

            {result?.status === "used" && (
              <div className="cashier-result">
                <span className={`cashier-state ${justUsed ? "ok" : "warn"}`}>{justUsed ? "Đã trao quà" : "Đã được dùng"}</span>
                <RewardSummary voucher={result} />
                <div className="cashier-issued">
                  <span>CẤP CHO</span>
                  <strong>{result.employee} · {result.employeeId}</strong>
                </div>
                <p className="cashier-fineprint">
                  {justUsed
                    ? "Đã trao quà và đánh dấu voucher là đã dùng."
                    : `Voucher đã được dùng ${result.usedAt ?? ""}. Không trao thêm lần nữa.`}
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="cashier-recent" aria-labelledby="recent-heading">
          <div className="cashier-section-head">
            <h2 id="recent-heading">Lượt trao gần đây</h2>
            {redemptions.length > RECENT_COUNT && (
              <button className="cashier-view-all" onClick={() => setShowAll((value) => !value)}>
                {showAll ? "Thu gọn" : "Xem tất cả →"}
              </button>
            )}
          </div>
          {loaded && redemptions.length === 0 ? (
            <p className="cashier-empty">Chưa có lượt trao quà nào.</p>
          ) : (
            <ul className="cashier-handovers">
              {recent.map((item) => (
                <li className="cashier-handover" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.reward} · {item.code}</span>
                  </div>
                  <span className={`cashier-state ${item.status === "used" ? "ok" : "warn"}`}>
                    {item.status === "used" ? "Đã trao" : "Chờ trao"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="cashier-stock" aria-labelledby="stock-heading">
          <div className="cashier-section-head">
            <h2 id="stock-heading">Tồn kho quà</h2>
            <span className="cashier-section-note">{loaded ? `${catalogue.length} mục` : "Đang tải…"}</span>
          </div>
          <ul className="cashier-stock-list">
            {catalogue.map((reward) => (
              <li key={reward.id}>
                <span className="cashier-stock-art">{artFor(reward.id)}</span>
                <div>
                  <strong>{reward.name}</strong>
                  <span>{REWARD_KINDS[reward.kind] ?? reward.kind} · {reward.cost} credit</span>
                </div>
                <b>{reward.stock === null ? "—" : `còn ${reward.stock}`}</b>
              </li>
            ))}
          </ul>
        </section>

        <p className="cashier-note">Bản mô phỏng giao diện quầy thu ngân. Dữ liệu giả lập, không kết nối hệ thống thật.</p>
      </div>
    </main>
  );
}

function RewardSummary({ voucher }: { voucher: Extract<VoucherInfo, { status: "issued" | "used" }> }) {
  return (
    <div className="cashier-reward">
      <div className="cashier-reward-art">{artFor(voucher.rewardId)}</div>
      <div>
        <strong>{voucher.reward}</strong>
        <span>Số lượng: 1</span>
        <span>Voucher {voucher.code}</span>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}
