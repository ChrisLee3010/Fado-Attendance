"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppRail } from "@/components/app-rail";
import { SignOutButton } from "@/components/sign-out-button";
import { formatMonth } from "@/lib/admin-attendance";
import type { HonourTier } from "@/lib/honours";
import { HONOUR_TITLES } from "@/lib/honours";
import { initials, useMe } from "@/lib/session";

type Wall = {
  month: string;
  previous: string | null;
  next: string | null;
  tiers: { tier: HonourTier; title: string; description: string; icon: string; people: { name: string; department: string; you: boolean }[] }[];
  yourTier: HonourTier | null;
};

function useWall(month: string | null) {
  const [wall, setWall] = useState<Wall | null>(null);
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    fetch(month ? `/api/honours?month=${month}` : "/api/honours", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) router.replace("/login");
        if (response.status === 403) router.replace(((await response.json()) as { home?: string }).home ?? "/");
        return response.ok ? response.json() : null;
      })
      .then((data) => {
        if (!cancelled && data) setWall(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [month, router]);
  return wall;
}

export default function HonoursPage() {
  const me = useMe();
  const [month, setMonth] = useState<string | null>(null);
  const wall = useWall(month);
  const anyone = wall?.tiers.some((tier) => tier.people.length > 0) ?? false;

  return (
    <main className={`app-shell ${wall && me.loaded ? "" : "is-loading"}`}>
      <AppRail active="honours" />

      <section className="content">
        <header className="topbar">
          <p><span className="eyebrow-dot" /> Monthly honour wall</p>
          <SignOutButton className="text-button" />
        </header>

        <div className="hw-intro">
          <p className="section-kicker">VINH DANH CHUYÊN CẦN</p>
          <h1>Thank you for showing up.</h1>
          <p className="hw-note">
            Everyone who reached a level last month, listed together in alphabetical order.
            No rankings and no numbers: it&apos;s a thank-you, not a contest.
          </p>
        </div>

        {wall && (
          <>
            <div className="hw-month">
              <h2>{formatMonth(wall.month)}</h2>
              <div>
                <button className="text-button" disabled={!wall.previous} onClick={() => wall.previous && setMonth(wall.previous)}>← Earlier</button>
                <button className="text-button" disabled={!wall.next} onClick={() => wall.next && setMonth(wall.next)}>Later →</button>
              </div>
            </div>

            {wall.yourTier && (
              <p className="hw-you">
                {HONOUR_TITLES[wall.yourTier].icon} You&apos;re on the wall for {formatMonth(wall.month)}: <strong>{HONOUR_TITLES[wall.yourTier].title}</strong>. Thank you.
              </p>
            )}

            {wall.tiers.map((tier) => (
              <section className={`hw-tier ${tier.tier}`} key={tier.tier} aria-labelledby={`tier-${tier.tier}`}>
                <div className="hw-tier-head">
                  <h3 id={`tier-${tier.tier}`}>{tier.icon} {tier.title}</h3>
                  <p>{tier.description}</p>
                </div>
                {tier.people.length === 0 ? (
                  <p className="hw-empty">Nobody this month. Maybe you, next month.</p>
                ) : (
                  <ul className="hw-people">
                    {tier.people.map((person) => (
                      <li className={`hw-person ${person.you ? "you" : ""}`} key={person.name}>
                        <span className="avatar" aria-hidden="true">{initials(person.name)}</span>
                        <div>
                          <strong>{person.name}{person.you ? " (you)" : ""}</strong>
                          <span>{person.department}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            {!anyone && <p className="hw-empty">No one reached a level this month.</p>}
          </>
        )}

        <p className="hw-fine">
          Worked out automatically from attendance once a month is over. Each person gets their highest level only.
          Approved leave never counts against anyone. Your progress for the current month is on your Progress page, visible only to you.
        </p>
      </section>
    </main>
  );
}
