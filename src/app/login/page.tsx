"use client";

import { useEffect, useRef, useState } from "react";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-accounts";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((me: { home: string } | null) => {
        if (me) window.location.replace(me.home);
      })
      .catch(() => {});
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        window.location.assign(data.home);
        return;
      }
      setError(
        response.status === 401
          ? "Email hoặc mật khẩu chưa đúng. Hãy kiểm tra và thử lại."
          : response.status === 429
            ? "Bạn đã thử quá nhiều lần. Hãy đợi vài phút rồi thử lại."
            : "Đã có lỗi xảy ra. Hãy thử lại.",
      );
    } catch {
      setError("Không kết nối được máy chủ. Hãy kiểm tra mạng và thử lại.");
    }
    setBusy(false);
  }

  function fillDemo(accountEmail: string) {
    setEmail(accountEmail);
    setPassword(DEMO_PASSWORD);
    setError(null);
    submitRef.current?.focus();
  }

  return (
    <main className="login-shell">
      <div className="login-brand">
        <span className="brand-mark">W</span>
        <span>workday<br />quest</span>
      </div>

      <section className="login-card">
        <h1>Đăng nhập</h1>
        <p className="login-lead">Dùng tài khoản FADO để xem ngày làm việc của bạn.</p>

        <form className="login-form" onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <label htmlFor="password">Mật khẩu</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error && <p className="login-error" role="alert">{error}</p>}
          <button ref={submitRef} className="login-submit" type="submit" disabled={busy}>
            {busy ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
        </form>

        <div className="login-demo">
          <p>Tài khoản demo. Chọn một tài khoản để điền sẵn vào biểu mẫu.</p>
          <ul>
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.id}>
                <button type="button" onClick={() => fillDemo(account.email)}>
                  <strong>{account.name}</strong>
                  <span>{account.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <p className="login-note">Dữ liệu giả lập. Không kết nối với hệ thống nhân sự của FADO.</p>
    </main>
  );
}
