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
          <p><span className="eyebrow-dot" /> Your reward shelf</p>
          <div className="topbar-actions">
            <Link className="wallet-balance" href="/#rewards"><WalletIcon /> {balance} credits</Link>
            <SignOutButton className="text-button" />
          </div>
        </header>

        <div className="reward-intro">
          <div>
            <p className="section-kicker">REWARDS</p>
            <h1>Spend your<br />small wins.</h1>
          </div>
          <p>Real moments, not abstract badges.<br />Choose what feels useful today.</p>
        </div>

        {state.voucher ? (
          <section className={`voucher-card ${state.voucherUsedAt ? "used" : ""}`} aria-live="polite">
            <div className="voucher-stamp"><CheckIcon /></div>
            <div className="voucher-copy">
              <p className="section-kicker">{state.voucherUsedAt ? "USED" : "READY TO USE"}</p>
              <h2>{state.voucherUsedAt ? "Enjoy your coffee." : "Your coffee is on us."}</h2>
              <p>
                {state.voucherUsedAt
                  ? "This voucher was used at the café and can't be used again."
                  : <>Show this code at the <Link href="/cashier">demo cashier</Link>. One use only.</>}
              </p>
            </div>
            <div className="voucher-code"><span>VOUCHER CODE</span><strong>{state.voucher}</strong></div>
            <div className="voucher-foot"><span>{state.voucherUsedAt ? `Used ${state.voucherUsedAt.toLowerCase()}` : "Issued today · 18:05"}</span><span>{COFFEE_COST} credits redeemed</span></div>
          </section>
        ) : (
          <section className="featured-reward">
            <div className="featured-art"><span>☕</span><i>★</i></div>
            <div className="featured-copy">
              <p className="section-kicker">WITHIN REACH</p>
              <h2>Coffee break</h2>
              <p>Any regular coffee from FADO Café. Take fifteen minutes for yourself.</p>
              <div className="reward-meta"><span>{COFFEE_COST} credits</span><span>·</span><span>12 available today</span></div>
              {!canRedeem && (
                <p className="reward-hint">
                  Earn {togo(COFFEE_COST, balance)} more. <Link href="/">Clock out on Today</Link> to add your Perfect Day credit.
                </p>
              )}
            </div>
            <button className="redeem-button" onClick={redeemCoffee} disabled={!canRedeem}>
              {canRedeem ? <>Redeem {COFFEE_COST} credits <span>↗</span></> : `${togo(COFFEE_COST, balance)} credits to go`}
            </button>
          </section>
        )}

        <section className="other-rewards">
          <div className="ledger-heading">
            <div><p className="section-kicker">KEEP GOING</p><h2>Worth working toward</h2></div>
            <span className="catalogue-note">Demo catalogue</span>
          </div>
          <div className="reward-grid">
            <article className="reward-card">
              <div className="reward-emoji yellow">🍱</div>
              <div><h3>Lunch for two</h3><p>75 credits · 4 available</p></div>
              <span className="locked">{togo(75, balance)} to go</span>
            </article>
            <article className="reward-card">
              <div className="reward-emoji pink">🎁</div>
              <div><h3>FADO goodie bag</h3><p>120 credits · 8 available</p></div>
              <span className="locked">{togo(120, balance)} to go</span>
            </article>
            <article className="reward-card leave-card">
              <div className="reward-emoji green">🌿</div>
              <div><h3>Personal day request</h3><p>200 credits · Admin review</p></div>
              <span className="locked">{togo(200, balance)} to go</span>
            </article>
          </div>
        </section>

        <p className="reward-disclaimer">All rewards, stock, credits, and approvals shown here are fictional prototype data.</p>
      </section>
    </main>
  );
}

function CheckIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"><path d="m5 12 4.2 4.2L19 6.7"/></svg>; }
function WalletIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H19v14H5a2 2 0 0 1-2-2V7.5Z"/><path d="M3 8h16v8h-4.5a2.5 2.5 0 1 1 0-5H19"/><circle cx="14.5" cy="13.5" r=".6" fill="currentColor"/></svg>; }
