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
          <span>FADO Café<br />cashier</span>
        </div>
        <div className="cashier-top-right">
          <span className="demo-pill cashier-pill"><i /> Demo data</span>
          <span className="cashier-user">{me.name}</span>
          <SignOutButton className="cashier-back" />
        </div>
      </header>

      <section className="cashier-card">
        <h1>Check a voucher</h1>
        <p className="cashier-lead">Ask the employee for their voucher code and enter it here.</p>

        <form className="cashier-form" onSubmit={check}>
          <label htmlFor="voucher-code">Voucher code</label>
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
            <button className="cashier-check" type="submit" disabled={!input.trim() || busy}>Check code</button>
          </div>
        </form>

        <div aria-live="polite">
          {result?.status === "invalid" && (
            <div className="cashier-result bad">
              <strong>Code not found</strong>
              <p>No voucher matches {input.trim().toUpperCase()}. Check the code with the employee and try again.</p>
            </div>
          )}

          {result?.status === "issued" && (
            <div className="cashier-result ok">
              <strong>Valid voucher</strong>
              <dl>
                <div><dt>Reward</dt><dd>{result.reward}</dd></div>
                <div><dt>Employee</dt><dd>{result.employee} · {result.employeeId}</dd></div>
                <div><dt>Value</dt><dd>{result.cost} credits</dd></div>
              </dl>
              <button className="cashier-use" onClick={markUsed} disabled={busy}>Mark as used</button>
            </div>
          )}

          {result?.status === "used" && justUsed && (
            <div className="cashier-result done">
              <strong>Voucher used</strong>
              <p>Give the employee their {result.reward.toLowerCase()}. This code can&apos;t be used again.</p>
            </div>
          )}

          {result?.status === "used" && !justUsed && (
            <div className="cashier-result warn">
              <strong>Already used</strong>
              <p>Used {result.usedAt}. Don&apos;t serve another one.</p>
            </div>
          )}
        </div>
      </section>

      <p className="cashier-note">Fictional prototype data. No real café or payment system is connected.</p>
    </main>
  );
}
