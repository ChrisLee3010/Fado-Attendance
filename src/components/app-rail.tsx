"use client";

import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { initials, useMe } from "@/lib/session";

export function AppRail({ active }: { active: "today" | "progress" | "rewards" | "history" | "admin" }) {
  const me = useMe();
  const isEmployee = me.roles.includes("employee");
  const isAdmin = me.roles.includes("admin");

  return (
    <aside className="rail" aria-label="Primary navigation">
      <Link className="brand" href={me.home} aria-label="Workday Quest home">
        <span className="brand-mark">W</span>
        <span>workday<br />quest</span>
      </Link>

      <nav className="nav-list">
        {isEmployee && (
          <>
            <Link className={`nav-item ${active === "today" ? "active" : ""}`} href="/">
              <HomeIcon />
              <span>Today</span>
            </Link>
            <Link className={`nav-item ${active === "progress" ? "active" : ""}`} href="/progress">
              <ChartIcon />
              <span>Progress</span>
            </Link>
            <Link className={`nav-item ${active === "rewards" ? "active" : ""}`} href="/rewards">
              <GiftIcon />
              <span>Rewards</span>
            </Link>
            <Link className={`nav-item ${active === "history" ? "active" : ""}`} href="/history">
              <HistoryIcon />
              <span>History</span>
            </Link>
          </>
        )}
        {isAdmin && (
          <Link className={`nav-item ${active === "admin" ? "active" : ""}`} href="/admin">
            <BriefcaseIcon />
            <span>Admin</span>
          </Link>
        )}
      </nav>

      <div className="rail-bottom">
        <span className="demo-pill"><i /> Demo data</span>
        <div className="rail-user">
          <div className="avatar" role="img" aria-label={me.name}>{initials(me.name)}</div>
          <SignOutButton className="rail-signout" />
        </div>
      </div>
    </aside>
  );
}

function HomeIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z"/><path d="M9 21v-7h6v7"/></svg>; }
function ChartIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/></svg>; }
function GiftIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 12v9H4v-9m-1-5h18v5H3V7Zm9 0v14M12 7H8.5A2.5 2.5 0 1 1 11 4.5L12 7Zm0 0h3.5a2.5 2.5 0 1 0-2.5-2.5L12 7Z"/></svg>; }
function HistoryIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4"/><path d="M12 8v4l3 2"/></svg>; }
function BriefcaseIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/></svg>; }
