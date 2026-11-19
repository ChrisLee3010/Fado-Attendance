"use client";

import Link from "next/link";
import { AppRail } from "@/components/app-rail";
import { SignOutButton } from "@/components/sign-out-button";
import { useMe } from "@/lib/session";
import { COFFEE_COST } from "@/lib/reward-target";
import { redeemCoffee, useWallet } from "@/lib/wallet";

const togo = (cost: number, balance: number) => Math.max(0, cost - balance);

export default function RewardsPage() {
  const me = useMe();
  const { state, balance } = useWallet();
  const canRedeem = balance >= COFFEE_COST;

  return (
    <main className={`app-shell ${state.loaded && me.loaded ? "" : "is-loading"}`}>
      <AppRail active="rewards" />

      <section className="content rewards-page">
        <header className="topbar">
          <p><span className="eyebrow-dot" /> Kệ quà của bạn</p>
          <div className="topbar-actions">
            <Link className="wallet-balance" href="/#rewards"><WalletIcon /> {balance} credit</Link>
            <SignOutButton className="text-button" />
          </div>
        </header>

        <div className="reward-intro">
          <div>
            <p className="section-kicker">QUÀ TẶNG</p>
            <h1>Đổi những<br />chiến thắng nhỏ.</h1>
          </div>
          <p>Những khoảnh khắc thật, không phải huy hiệu trừu tượng.<br />Chọn thứ hữu ích với bạn hôm nay.</p>
        </div>

        {state.voucher ? (
          <section className={`voucher-card ${state.voucherUsedAt ? "used" : ""}`} aria-live="polite">
            <div className="voucher-stamp"><CheckIcon /></div>
            <div className="voucher-copy">
              <p className="section-kicker">{state.voucherUsedAt ? "ĐÃ DÙNG" : "SẴN SÀNG SỬ DỤNG"}</p>
              <h2>{state.voucherUsedAt ? "Chúc bạn ngon miệng." : "Ly cà phê này công ty mời."}</h2>
              <p>
                {state.voucherUsedAt
                  ? "Voucher này đã được dùng tại quán và không thể dùng lại."
                  : <>Đưa mã này cho <Link href="/cashier">quầy đổi quà (demo)</Link>. Chỉ dùng được một lần.</>}
              </p>
            </div>
            <div className="voucher-code"><span>MÃ VOUCHER</span><strong>{state.voucher}</strong></div>
            <div className="voucher-foot"><span>{state.voucherUsedAt ? `Đã dùng ${state.voucherUsedAt.toLowerCase()}` : `Phát hành ${(state.voucherIssuedAt ?? "").toLowerCase()}`}</span><span>Đã đổi {COFFEE_COST} credit</span></div>
          </section>
        ) : (
          <section className="featured-reward">
            <div className="featured-art"><span>☕</span><i>★</i></div>
            <div className="featured-copy">
              <p className="section-kicker">TRONG TẦM TAY</p>
              <h2>Giờ nghỉ cà phê</h2>
              <p>Một ly cà phê bất kỳ tại FADO Café. Dành mười lăm phút cho chính mình.</p>
              <div className="reward-meta"><span>{COFFEE_COST} credit</span><span>·</span><span>Còn 12 phần hôm nay</span></div>
              {!canRedeem && (
                <p className="reward-hint">
                  Cần thêm {togo(COFFEE_COST, balance)} credit. <Link href="/">Chấm ra ở trang Hôm nay</Link> để nhận credit Perfect Day.
                </p>
              )}
            </div>
            <button className="redeem-button" onClick={redeemCoffee} disabled={!canRedeem}>
              {canRedeem ? <>Đổi {COFFEE_COST} credit <span>↗</span></> : `Còn ${togo(COFFEE_COST, balance)} credit`}
            </button>
          </section>
        )}

        <section className="other-rewards">
          <div className="ledger-heading">
            <div><p className="section-kicker">TIẾP TỤC NÀO</p><h2>Đáng để cố gắng</h2></div>
            <span className="catalogue-note">Danh mục demo</span>
          </div>
          <div className="reward-grid">
            <article className="reward-card">
              <div className="reward-emoji yellow">🍱</div>
              <div><h3>Bữa trưa cho hai người</h3><p>75 credit · còn 4 phần</p></div>
              <span className="locked">Còn {togo(75, balance)}</span>
            </article>
            <article className="reward-card">
              <div className="reward-emoji pink">🎁</div>
              <div><h3>Túi quà FADO</h3><p>120 credit · còn 8 phần</p></div>
              <span className="locked">Còn {togo(120, balance)}</span>
            </article>
            <article className="reward-card leave-card">
              <div className="reward-emoji green">🌿</div>
              <div><h3>Xin một ngày nghỉ</h3><p>200 credit · HR duyệt</p></div>
              <span className="locked">Còn {togo(200, balance)}</span>
            </article>
          </div>
        </section>

        <p className="reward-disclaimer">Mọi phần thưởng, số lượng, credit và phê duyệt hiển thị ở đây đều là dữ liệu giả lập.</p>
      </section>
    </main>
  );
}

function CheckIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"><path d="m5 12 4.2 4.2L19 6.7"/></svg>; }
function WalletIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H19v14H5a2 2 0 0 1-2-2V7.5Z"/><path d="M3 8h16v8h-4.5a2.5 2.5 0 1 1 0-5H19"/><circle cx="14.5" cy="13.5" r=".6" fill="currentColor"/></svg>; }
