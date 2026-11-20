"use client";

import { useState, type FormEvent } from "react";
import { addNetwork, removeNetwork, useAdminAttendance, type AttemptReason, type NetworkError } from "@/lib/admin";
import { formatStamp } from "@/lib/history";

const REASONS: Record<AttemptReason, string> = {
  ok_office: "Mạng văn phòng",
  ok_remote: "Làm việc từ xa",
  not_office_network: "Không ở mạng văn phòng",
  no_client_ip: "Không đọc được địa chỉ IP (kiểm tra TRUSTED_PROXY)",
  already_clocked_in: "Đã chấm vào trước đó",
  already_clocked_out: "Đã chấm ra trước đó",
  no_clock_in: "Chấm ra khi chưa chấm vào",
};

const NETWORK_ERRORS: Record<NetworkError, string> = {
  invalid_range: "Địa chỉ IP hoặc dải IP không hợp lệ, ví dụ 203.0.113.7 hoặc 203.0.113.0/24.",
  invalid_label: "Hãy đặt một cái tên ngắn cho mạng (tối đa 60 ký tự).",
  duplicate: "Mạng này đã có trong danh sách.",
  no_client_ip: "Không đọc được IP của bạn nên không thể thêm tự động.",
};

function device(userAgent: string | null) {
  if (!userAgent) return "Thiết bị không rõ";
  if (/iPhone|iPad/.test(userAgent)) return "iPhone/iPad";
  if (/Android/.test(userAgent)) return "Android";
  if (/Windows/.test(userAgent)) return "Windows";
  if (/Macintosh/.test(userAgent)) return "Mac";
  if (/node|curl|undici/i.test(userAgent)) return "Script";
  return "Khác";
}

function ModeBanner({ mode }: { mode: "cloudflare" | "vercel" | "local-demo" | null }) {
  if (mode === "cloudflare" || mode === "vercel") return null;
  if (mode === "local-demo") {
    return (
      <p className="desk-banner warn">
        <strong>Chế độ demo cục bộ.</strong> Địa chỉ IP được đọc mà không qua proxy tin cậy, nên trình duyệt có thể giả mạo. Dùng để thử là được; khi chạy thật, hãy chạy sau Cloudflare Tunnel với <code>TRUSTED_PROXY=cloudflare</code>.
      </p>
    );
  }
  return (
    <p className="desk-banner error">
      <strong>Chưa cấu hình.</strong> Máy chủ không biết lấy IP của người truy cập từ đâu nên mọi lần chấm công đều bị từ chối. Hãy đặt <code>TRUSTED_PROXY=cloudflare</code> (hoặc <code>vercel</code> khi chạy trên Vercel).
    </p>
  );
}

export function ClockInDesk() {
  const { today, ipMode, you, networks, attempts } = useAdminAttendance();
  const [label, setLabel] = useState("Wi-Fi văn phòng");
  const [cidr, setCidr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const youAreListed = networks.some((network) => network.cidr === you.network);

  async function addCurrent() {
    const failure = await addNetwork({ label, current: true });
    setError(failure ? NETWORK_ERRORS[failure] : null);
  }

  async function addTyped(event: FormEvent) {
    event.preventDefault();
    const failure = await addNetwork({ label, cidr });
    setError(failure ? NETWORK_ERRORS[failure] : null);
    if (!failure) setCidr("");
  }

  return (
    <>
      <section className="admin-section" aria-labelledby="networks-heading">
        <div className="admin-section-head">
          <h2 id="networks-heading">Mạng văn phòng</h2>
          <p>Chấm công chỉ được tính là &ldquo;ở văn phòng&rdquo; khi đến từ các kết nối internet này.</p>
        </div>
        <ModeBanner mode={ipMode} />

        <div className="desk-card">
          <div className="desk-you">
            <span>Bạn đang kết nối từ</span>
            <strong>{you.ip ?? "không rõ"}</strong>
            {you.network && <small>{youAreListed ? "Mạng này đã có trong danh sách." : `Mạng ${you.network}`}</small>}
          </div>
          <form className="desk-form" onSubmit={addTyped}>
            <label>
              <span>Tên</span>
              <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={60} required />
            </label>
            <label>
              <span>IP hoặc dải IP</span>
              <input value={cidr} onChange={(event) => setCidr(event.target.value)} placeholder="203.0.113.0/24" />
            </label>
            <div className="desk-buttons">
              <button type="submit" className="desk-secondary" disabled={cidr.trim() === ""}>Thêm dải IP</button>
              <button type="button" className="desk-primary" onClick={addCurrent} disabled={!you.network || youAreListed}>
                Thêm mạng tôi đang dùng
              </button>
            </div>
          </form>
          {error && <p className="desk-error" role="alert">{error}</p>}
        </div>

        <ul className="admin-list">
          {networks.length === 0 && <li className="admin-row desk-empty">Chưa có mạng văn phòng nào. Chưa ai chấm công từ văn phòng được cho đến khi thêm một mạng.</li>}
          {networks.map((network) => (
            <li className="admin-row" key={network.id}>
              <div className="admin-who">
                <strong>{network.label}</strong>
                <span>{network.cidr}</span>
              </div>
              <div className="admin-detail">
                <span>{network.addedBy === "system" ? "Có sẵn" : `Thêm bởi ${network.addedBy}`}</span>
                <span>{today ? formatStamp(network.addedAt, today) : network.addedAt}</span>
              </div>
              <div className="admin-actions">
                <button className="reject" aria-label={`Xoá ${network.label}`} onClick={() => removeNetwork(network.id)}>Xoá</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-section" aria-labelledby="attempts-heading">
        <div className="admin-section-head">
          <h2 id="attempts-heading">Nhật ký chấm công</h2>
          <p>Mọi lần chấm, kể cả bị từ chối. Nơi đầu tiên cần xem khi có người không chấm công được.</p>
        </div>
        <ul className="admin-list">
          {attempts.length === 0 && <li className="admin-row desk-empty">Hôm nay chưa có lần chấm công nào.</li>}
          {attempts.map((attempt) => (
            <li className="admin-row" key={attempt.id}>
              <div className="admin-who">
                <strong>{attempt.name}</strong>
                <span>{attempt.kind === "clock_in" ? "Chấm vào" : "Chấm ra"} · {today ? formatStamp(attempt.at, today) : attempt.at}</span>
              </div>
              <div className="admin-detail">
                <span>{REASONS[attempt.reason]}</span>
                <span title={attempt.userAgent ?? undefined}>{attempt.ip ?? "không có IP"} · {device(attempt.userAgent)}</span>
              </div>
              <div className="admin-decided">
                <span className={`chip ${attempt.accepted ? "approved" : "rejected"}`}>{attempt.accepted ? "Chấp nhận" : "Từ chối"}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
