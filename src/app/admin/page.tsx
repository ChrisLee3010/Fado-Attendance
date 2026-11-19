"use client";

import { AppRail } from "@/components/app-rail";
import { ClockInDesk } from "@/components/clock-in-desk";
import { SignOutButton } from "@/components/sign-out-button";
import { decideLeave, useAdminOverview } from "@/lib/admin";
import { formatWeekday } from "@/lib/history";
import { useMe } from "@/lib/session";
import { resetDemo } from "@/lib/wallet";

// Reward kinds are code values in the database; this is how people read them.
const REWARD_KINDS: Record<string, string> = { Voucher: "Voucher", Gift: "Quà tặng", "Needs approval": "Cần HR duyệt" };

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
            <button className="text-button" onClick={resetDemo}>Đặt lại demo</button>
            <SignOutButton className="text-button" />
          </div>
        </header>

        <div className="admin-title">
          <p className="section-kicker">TỔNG QUAN HR</p>
          <h1>Quản trị</h1>
        </div>

        <div className="admin-stats">
          <div className="admin-stat"><strong>{stats.pendingLeave}</strong><span>Yêu cầu nghỉ đang chờ</span></div>
          <div className="admin-stat"><strong>{stats.vouchersIssued}</strong><span>Voucher đã phát hành</span></div>
          <div className="admin-stat"><strong>{stats.creditsRedeemed}</strong><span>Credit đã đổi</span></div>
        </div>

        <ClockInDesk />

        <section className="admin-section" aria-labelledby="leave-heading">
          <div className="admin-section-head">
            <h2 id="leave-heading">Yêu cầu xin nghỉ</h2>
            <p>Duyệt hoặc từ chối. Quyết định không thể thay đổi sau đó.</p>
          </div>
          <ul className="admin-list">
            {leave.map((request) => (
              <li className="admin-row" key={request.id}>
                <div className="admin-who">
                  <strong>{request.name}</strong>
                  <span>{request.empId} · {request.dept}</span>
                </div>
                <div className="admin-detail">
                  <span>{request.cost} credit · {request.note}</span>
                  <span>Gửi {request.asked}</span>
                </div>
                {request.status === "pending" ? (
                  <div className="admin-actions">
                    <button className="approve" aria-label={`Duyệt yêu cầu của ${request.name}`} onClick={() => decideLeave(request.id, "approved")}>Duyệt</button>
                    <button className="reject" aria-label={`Từ chối yêu cầu của ${request.name}`} onClick={() => decideLeave(request.id, "rejected")}>Từ chối</button>
                  </div>
                ) : (
                  <div className="admin-decided">
                    <span className={`chip ${request.status}`}>{request.status === "approved" ? "Đã duyệt" : "Đã từ chối"}</span>
                    <small>{request.decidedAt}</small>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="admin-section" aria-labelledby="redeem-heading">
          <div className="admin-section-head">
            <h2 id="redeem-heading">Đổi quà gần đây</h2>
            <p>Voucher chuyển từ &ldquo;đã phát hành&rdquo; sang &ldquo;đã dùng&rdquo; khi quầy xác nhận.</p>
          </div>
          <ul className="admin-list">
            {redemptions.map((item) => (
              <li className="admin-row" key={item.id}>
                <div className="admin-who">
                  <strong>{item.name}</strong>
                  <span>{item.empId}</span>
                </div>
                <div className="admin-detail">
                  <span>{item.reward} · {item.cost} credit</span>
                  <span>{item.code} · {item.when}</span>
                </div>
                <div className="admin-decided">
                  <span className={`chip ${item.status}`}>{item.status === "used" ? "Đã dùng" : "Đã phát hành"}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="admin-section" aria-labelledby="catalogue-heading">
          <div className="admin-section-head">
            <h2 id="catalogue-heading">Danh mục quà tặng</h2>
            <p>Những gì nhân viên có thể đổi bằng credit hôm nay.</p>
          </div>
          <div className="admin-table" role="table" aria-label="Danh mục quà tặng">
            <div className="admin-table-head" role="row">
              <span role="columnheader">Quà tặng</span>
              <span role="columnheader">Loại</span>
              <span role="columnheader">Giá</span>
              <span role="columnheader">Còn lại</span>
            </div>
            {catalogue.map((reward) => (
              <div className="admin-table-row" role="row" key={reward.id}>
                <span role="cell"><strong>{reward.name}</strong></span>
                <span role="cell">{REWARD_KINDS[reward.kind] ?? reward.kind}</span>
                <span role="cell">{reward.cost} credit</span>
                <span role="cell">{reward.stock ?? "—"}</span>
              </div>
            ))}
          </div>
        </section>

        <p className="admin-note">Dữ liệu giả lập. Không kết nối với hệ thống nhân sự, tính lương hay nghỉ phép nào.</p>
      </section>
    </main>
  );
}
