"use client";

import { useState, type FormEvent } from "react";
import { addNetwork, removeNetwork, useAdminAttendance, type AttemptReason, type NetworkError } from "@/lib/admin";
import { formatStamp } from "@/lib/history";

const REASONS: Record<AttemptReason, string> = {
  ok_office: "Office network",
  ok_remote: "Remote work",
  not_office_network: "Not on an office network",
  no_client_ip: "Couldn't read the IP (check TRUSTED_PROXY)",
  already_clocked_in: "Already clocked in",
  already_clocked_out: "Already clocked out",
  no_clock_in: "Clock-out without a clock-in",
};

const NETWORK_ERRORS: Record<NetworkError, string> = {
  invalid_range: "That isn't a valid IP address or range, e.g. 203.0.113.7 or 203.0.113.0/24.",
  invalid_label: "Give the network a short name (up to 60 characters).",
  duplicate: "That network is already on the list.",
  no_client_ip: "Your own IP can't be read, so it can't be added automatically.",
};

function device(userAgent: string | null) {
  if (!userAgent) return "Unknown device";
  if (/iPhone|iPad/.test(userAgent)) return "iPhone/iPad";
  if (/Android/.test(userAgent)) return "Android";
  if (/Windows/.test(userAgent)) return "Windows";
  if (/Macintosh/.test(userAgent)) return "Mac";
  if (/node|curl|undici/i.test(userAgent)) return "Script";
  return "Other";
}

function ModeBanner({ mode }: { mode: "cloudflare" | "local-demo" | null }) {
  if (mode === "cloudflare") return null;
  if (mode === "local-demo") {
    return (
      <p className="desk-banner warn">
        <strong>Local demo mode.</strong> IP addresses are read without a trusted proxy, so a browser could fake them. Fine for trying it out; for the real trial, run behind the Cloudflare Tunnel with <code>TRUSTED_PROXY=cloudflare</code>.
      </p>
    );
  }
  return (
    <p className="desk-banner error">
      <strong>Not configured.</strong> The server doesn&apos;t know where visitor IPs come from, so every clock-in is refused. Set <code>TRUSTED_PROXY=cloudflare</code>.
    </p>
  );
}

export function ClockInDesk() {
  const { today, ipMode, you, networks, attempts } = useAdminAttendance();
  const [label, setLabel] = useState("Office Wi-Fi");
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
          <h2 id="networks-heading">Office networks</h2>
          <p>Clock-ins only count as &ldquo;in the office&rdquo; from these internet connections.</p>
        </div>
        <ModeBanner mode={ipMode} />

        <div className="desk-card">
          <div className="desk-you">
            <span>You&apos;re connecting from</span>
            <strong>{you.ip ?? "unknown"}</strong>
            {you.network && <small>{youAreListed ? "This network is already on the list." : `Network ${you.network}`}</small>}
          </div>
          <form className="desk-form" onSubmit={addTyped}>
            <label>
              <span>Name</span>
              <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={60} required />
            </label>
            <label>
              <span>IP or range</span>
              <input value={cidr} onChange={(event) => setCidr(event.target.value)} placeholder="203.0.113.0/24" />
            </label>
            <div className="desk-buttons">
              <button type="submit" className="desk-secondary" disabled={cidr.trim() === ""}>Add range</button>
              <button type="button" className="desk-primary" onClick={addCurrent} disabled={!you.network || youAreListed}>
                Add the network I&apos;m on
              </button>
            </div>
          </form>
          {error && <p className="desk-error" role="alert">{error}</p>}
        </div>

        <ul className="admin-list">
          {networks.length === 0 && <li className="admin-row desk-empty">No office networks yet. Nobody can clock in from the office until one is added.</li>}
          {networks.map((network) => (
            <li className="admin-row" key={network.id}>
              <div className="admin-who">
                <strong>{network.label}</strong>
                <span>{network.cidr}</span>
              </div>
              <div className="admin-detail">
                <span>{network.addedBy === "system" ? "Built in" : `Added by ${network.addedBy}`}</span>
                <span>{today ? formatStamp(network.addedAt, today) : network.addedAt}</span>
              </div>
              <div className="admin-actions">
                <button className="reject" aria-label={`Remove ${network.label}`} onClick={() => removeNetwork(network.id)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-section" aria-labelledby="attempts-heading">
        <div className="admin-section-head">
          <h2 id="attempts-heading">Clock-in log</h2>
          <p>Every attempt, including refused ones. The first place to look when someone can&apos;t clock in.</p>
        </div>
        <ul className="admin-list">
          {attempts.length === 0 && <li className="admin-row desk-empty">No clock-ins yet today.</li>}
          {attempts.map((attempt) => (
            <li className="admin-row" key={attempt.id}>
              <div className="admin-who">
                <strong>{attempt.name}</strong>
                <span>{attempt.kind === "clock_in" ? "Clock in" : "Clock out"} · {today ? formatStamp(attempt.at, today) : attempt.at}</span>
              </div>
              <div className="admin-detail">
                <span>{REASONS[attempt.reason]}</span>
                <span title={attempt.userAgent ?? undefined}>{attempt.ip ?? "no IP"} · {device(attempt.userAgent)}</span>
              </div>
              <div className="admin-decided">
                <span className={`chip ${attempt.accepted ? "approved" : "rejected"}`}>{attempt.accepted ? "Accepted" : "Refused"}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
