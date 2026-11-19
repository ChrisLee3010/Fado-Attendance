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
          <p><span className="eyebrow-dot" /> Bảng vinh danh hằng tháng</p>
          <SignOutButton className="text-button" />
        </header>

        <div className="hw-intro">
          <p className="section-kicker">VINH DANH CHUYÊN CẦN</p>
          <h1>Cảm ơn vì đã luôn có mặt.</h1>
          <p className="hw-note">
            Tất cả những ai đạt một cấp độ trong tháng trước, được ghi tên cùng nhau theo thứ tự bảng chữ cái.
            Không xếp hạng, không con số: đây là lời cảm ơn, không phải một cuộc thi.
          </p>
        </div>

        {wall && (
          <>
            <div className="hw-month">
              <h2>{formatMonth(wall.month)}</h2>
              <div>
                <button className="text-button" disabled={!wall.previous} onClick={() => wall.previous && setMonth(wall.previous)}>← Trước</button>
                <button className="text-button" disabled={!wall.next} onClick={() => wall.next && setMonth(wall.next)}>Sau →</button>
              </div>
            </div>

            {wall.yourTier && (
              <p className="hw-you">
                {HONOUR_TITLES[wall.yourTier].icon} Bạn có tên trên bảng vinh danh {formatMonth(wall.month)}: <strong>{HONOUR_TITLES[wall.yourTier].title}</strong>. Cảm ơn bạn.
              </p>
            )}

            {wall.tiers.map((tier) => (
              <section className={`hw-tier ${tier.tier}`} key={tier.tier} aria-labelledby={`tier-${tier.tier}`}>
                <div className="hw-tier-head">
                  <h3 id={`tier-${tier.tier}`}>{tier.icon} {tier.title}</h3>
                  <p>{tier.description}</p>
                </div>
                {tier.people.length === 0 ? (
                  <p className="hw-empty">Tháng này chưa có ai. Biết đâu là bạn vào tháng sau.</p>
                ) : (
                  <ul className="hw-people">
                    {tier.people.map((person) => (
                      <li className={`hw-person ${person.you ? "you" : ""}`} key={person.name}>
                        <span className="avatar" aria-hidden="true">{initials(person.name)}</span>
                        <div>
                          <strong>{person.name}{person.you ? " (bạn)" : ""}</strong>
                          <span>{person.department}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            {!anyone && <p className="hw-empty">Tháng này chưa có ai đạt cấp độ nào.</p>}
          </>
        )}

        <p className="hw-fine">
          Được tính tự động từ dữ liệu chấm công khi tháng kết thúc. Mỗi người chỉ hiện ở cấp cao nhất đạt được.
          Nghỉ phép được duyệt không bao giờ bị tính là vắng. Tiến độ tháng hiện tại nằm ở trang Tiến độ, chỉ mình bạn thấy.
        </p>
      </section>
    </main>
  );
}
