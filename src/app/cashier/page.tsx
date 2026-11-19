"use client";

import { useState } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { useRoleGate } from "@/lib/session";
import { checkVoucher, consumeVoucher, type VoucherInfo } from "@/lib/wallet";

export default function CashierPage() {
  const { me, allowed } = useRoleGate("cashier");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<VoucherInfo | null>(null);
  const [justUsed, setJustUsed] = useState(false);
  const [busy, setBusy] = useState(false);

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

  return (
    <main className={`cashier-shell ${allowed ? "" : "is-loading"}`}>
      <header className="cashier-top">
        <div className="brand cashier-brand">
          <span className="brand-mark">W</span>
          <span>FADO Café<br />quầy thu ngân</span>
        </div>
        <div className="cashier-top-right">
          <span className="demo-pill cashier-pill"><i /> Dữ liệu demo</span>
          <span className="cashier-user">{me.name}</span>
          <SignOutButton className="cashier-back" />
        </div>
      </header>

      <section className="cashier-card">
        <h1>Kiểm tra voucher</h1>
        <p className="cashier-lead">Hỏi nhân viên mã voucher và nhập vào đây.</p>

        <form className="cashier-form" onSubmit={check}>
          <label htmlFor="voucher-code">Mã voucher</label>
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
            <button className="cashier-check" type="submit" disabled={!input.trim() || busy}>Kiểm tra mã</button>
          </div>
        </form>

        <div aria-live="polite">
          {result?.status === "invalid" && (
            <div className="cashier-result bad">
              <strong>Không tìm thấy mã</strong>
              <p>Không có voucher nào khớp {input.trim().toUpperCase()}. Hãy kiểm tra lại mã với nhân viên và thử lại.</p>
            </div>
          )}

          {result?.status === "issued" && (
            <div className="cashier-result ok">
              <strong>Voucher hợp lệ</strong>
              <dl>
                <div><dt>Phần quà</dt><dd>{result.reward}</dd></div>
                <div><dt>Nhân viên</dt><dd>{result.employee} · {result.employeeId}</dd></div>
                <div><dt>Giá trị</dt><dd>{result.cost} credit</dd></div>
              </dl>
              <button className="cashier-use" onClick={markUsed} disabled={busy}>Đánh dấu đã dùng</button>
            </div>
          )}

          {result?.status === "used" && justUsed && (
            <div className="cashier-result done">
              <strong>Đã dùng voucher</strong>
              <p>Hãy đưa nhân viên phần quà: {result.reward}. Mã này không thể dùng lại.</p>
            </div>
          )}

          {result?.status === "used" && !justUsed && (
            <div className="cashier-result warn">
              <strong>Voucher đã được dùng</strong>
              <p>Đã dùng {result.usedAt}. Đừng phục vụ thêm lần nữa.</p>
            </div>
          )}
        </div>
      </section>

      <p className="cashier-note">Dữ liệu giả lập. Không kết nối với quán café hay hệ thống thanh toán thật nào.</p>
    </main>
  );
}
