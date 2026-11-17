"use client";

import { AppRail } from "@/components/app-rail";
import { SignOutButton } from "@/components/sign-out-button";
import { decideLeave, useAdminOverview } from "@/lib/admin";
import { formatWeekday } from "@/lib/history";
import { useMe } from "@/lib/session";
import { resetDemo } from "@/lib/wallet";

export default function AdminPage() {
  const me = useMe();
  const { loaded, today, leave, redemptions, catalogue, stats } = useAdminOverview();

  return (
    <main className={`app-shell ${loaded && me.loaded ? "" : "is-loading"}`}>
      <AppRail active="admin" />

      <section className="content">
        <header className="topbar">
          <p><span className="eyebrow-dot" /> {today && formatWeekday(today)}</p>
          <div className="topbar-actions">
            <button className="text-button" onClick={resetDemo}>Reset demo</button>
            <SignOutButton className="text-button" />
          </div>
        </header>

        <div className="admin-title">
          <p className="section-kicker">HR OVERVIEW</p>
          <h1>Rewards desk</h1>
        </div>

        <div className="admin-stats">
          <div className="admin-stat"><strong>{stats.pendingLeave}</strong><span>Leave requests waiting</span></div>
          <div className="admin-stat"><strong>{stats.vouchersIssued}</strong><span>Vouchers issued</span></div>
          <div className="admin-stat"><strong>{stats.creditsRedeemed}</strong><span>Credits redeemed</span></div>
        </div>

        <section className="admin-section" aria-labelledby="leave-heading">
          <div className="admin-section-head">
            <h2 id="leave-heading">Personal day requests</h2>
            <p>Approve or reject. A decision can&apos;t be changed afterwards.</p>
          </div>
          <ul className="admin-list">
            {leave.map((request) => (
              <li className="admin-row" key={request.id}>
                <div className="admin-who">
                  <strong>{request.name}</strong>
                  <span>{request.empId} · {request.dept}</span>
                </div>
                <div className="admin-detail">
                  <span>{request.cost} credits · {request.note}</span>
                  <span>Asked {request.asked}</span>
                </div>
                {request.status === "pending" ? (
                  <div className="admin-actions">
                    <button className="approve" aria-label={`Approve ${request.name}'s request`} onClick={() => decideLeave(request.id, "approved")}>Approve</button>
                    <button className="reject" aria-label={`Reject ${request.name}'s request`} onClick={() => decideLeave(request.id, "rejected")}>Reject</button>
                  </div>
                ) : (
                  <div className="admin-decided">
                    <span className={`chip ${request.status}`}>{request.status === "approved" ? "Approved" : "Rejected"}</span>
                    <small>{request.decidedAt}</small>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="admin-section" aria-labelledby="redeem-heading">
          <div className="admin-section-head">
            <h2 id="redeem-heading">Recent redemptions</h2>
            <p>Vouchers move from issued to used when the cashier confirms them.</p>
          </div>
          <ul className="admin-list">
            {redemptions.map((item) => (
              <li className="admin-row" key={item.id}>
                <div className="admin-who">
                  <strong>{item.name}</strong>
                  <span>{item.empId}</span>
                </div>
                <div className="admin-detail">
                  <span>{item.reward} · {item.cost} credits</span>
                  <span>{item.code} · {item.when}</span>
                </div>
                <div className="admin-decided">
                  <span className={`chip ${item.status}`}>{item.status === "used" ? "Used" : "Issued"}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="admin-section" aria-labelledby="catalogue-heading">
          <div className="admin-section-head">
            <h2 id="catalogue-heading">Reward catalogue</h2>
            <p>What employees can spend credits on today.</p>
          </div>
          <div className="admin-table" role="table" aria-label="Reward catalogue">
            <div className="admin-table-head" role="row">
              <span role="columnheader">Reward</span>
              <span role="columnheader">Type</span>
              <span role="columnheader">Cost</span>
              <span role="columnheader">In stock</span>
            </div>
            {catalogue.map((reward) => (
              <div className="admin-table-row" role="row" key={reward.id}>
                <span role="cell"><strong>{reward.name}</strong></span>
                <span role="cell">{reward.kind}</span>
                <span role="cell">{reward.cost} credits</span>
                <span role="cell">{reward.stock ?? "—"}</span>
              </div>
            ))}
          </div>
        </section>

        <p className="admin-note">Fictional prototype data. No HR, payroll, or leave system is connected.</p>
      </section>
    </main>
  );
}
