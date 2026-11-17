"use client";

import { useState } from "react";
import { AppRail } from "@/components/app-rail";
import { SelectMenu } from "@/components/select-menu";
import { SignOutButton } from "@/components/sign-out-button";
import {
  applyFilters,
  CATEGORIES,
  CATEGORY_LABELS,
  DEFAULT_FILTERS,
  extraFilterCount,
  formatDay,
  groupByDay,
  hasCustomRange,
  monthTotals,
  PERIOD_LABELS,
  STATUS_LABELS,
  STATUSES,
  type Category,
  type Filters,
  type Period,
  type QuickFilter,
} from "@/lib/history";
import { useMe } from "@/lib/session";
import { useWallet } from "@/lib/wallet";

const QUICK_FILTERS: { id: QuickFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "earned", label: "Earned" },
  { id: "spent", label: "Spent" },
  { id: "adjustments", label: "Adjustments" },
];

const PERIODS = Object.keys(PERIOD_LABELS) as Period[];

function toggle<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export default function HistoryPage() {
  const me = useMe();
  const { state, balance } = useWallet();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [panelOpen, setPanelOpen] = useState(false);

  const update = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));

  const visible = applyFilters(state.ledger, filters, state.today);
  const groups = groupByDay(visible);
  const totals = monthTotals(state.ledger, state.today);
  const extras = extraFilterCount(filters);
  const isDefault = filters.quick === "all" && filters.period === "month" && extras === 0;
  const invalidRange = filters.from !== "" && filters.to !== "" && filters.from > filters.to;

  return (
    <main className={`app-shell ${state.loaded && me.loaded ? "" : "is-loading"}`}>
      <AppRail active="history" />

      <section className="content">
        <header className="topbar">
          <p><span className="eyebrow-dot" /> {state.today && formatDay(state.today)}</p>
          <SignOutButton className="text-button" />
        </header>

        <div className="history-intro">
          <p className="section-kicker">YOUR ACCOUNT</p>
          <h1>Credit history</h1>
        </div>

        <section className="history-balance" aria-label="Current balance">
          <p className="section-kicker">CURRENT BALANCE</p>
          <h2>{balance} <span>credits</span></h2>
          <div className="history-balance-foot">
            <span>Earned this month: {totals.earned > 0 ? `+${totals.earned}` : "0"}</span>
            <span>Spent this month: {totals.spent > 0 ? `−${totals.spent}` : "0"}</span>
          </div>
        </section>

        <div className="history-head">
          <h2>Transactions</h2>
          <p className="history-count" aria-live="polite">{visible.length} {visible.length === 1 ? "transaction" : "transactions"}</p>
        </div>

        <div className="chip-row" role="group" aria-label="Quick filters">
          {QUICK_FILTERS.map((chip) => (
            <button
              key={chip.id}
              className={`chip-btn ${filters.quick === chip.id ? "on" : ""}`}
              aria-pressed={filters.quick === chip.id}
              onClick={() => update({ quick: chip.id })}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="filter-row">
          <SelectMenu
            label="Date range"
            icon={<CalendarIcon />}
            value={hasCustomRange(filters) ? null : filters.period}
            fallbackLabel="Custom range"
            options={PERIODS.map((period) => ({ value: period, label: PERIOD_LABELS[period] }))}
            onChange={(period) => update({ period: period as Period, from: "", to: "" })}
          />
          <button
            className="filter-toggle"
            aria-label="More filters"
            aria-expanded={panelOpen}
            aria-controls="filter-panel"
            onClick={() => setPanelOpen((open) => !open)}
          >
            <SlidersIcon />
            {extras > 0 && <i className="filter-badge">{extras}</i>}
          </button>
        </div>

        {panelOpen && (
          <div className="filter-panel" id="filter-panel">
            <fieldset>
              <legend>Transaction category</legend>
              <div className="filter-options">
                {CATEGORIES.map((category: Category) => (
                  <button
                    key={category}
                    className={`chip-btn ${filters.categories.includes(category) ? "on" : ""}`}
                    aria-pressed={filters.categories.includes(category)}
                    onClick={() => update({ categories: toggle(filters.categories, category) })}
                  >
                    {CATEGORY_LABELS[category]}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Status</legend>
              <div className="filter-options">
                {STATUSES.map((status) => (
                  <button
                    key={status}
                    className={`chip-btn ${filters.statuses.includes(status) ? "on" : ""}`}
                    aria-pressed={filters.statuses.includes(status)}
                    onClick={() => update({ statuses: toggle(filters.statuses, status) })}
                  >
                    {STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Custom date range</legend>
              <div className="date-inputs">
                <label>
                  From
                  <input type="date" value={filters.from} max={state.today} onChange={(event) => update({ from: event.target.value })} />
                </label>
                <label>
                  To
                  <input type="date" value={filters.to} max={state.today} onChange={(event) => update({ to: event.target.value })} />
                </label>
              </div>
              {invalidRange && <p className="filter-hint" role="alert">The start date is after the end date.</p>}
            </fieldset>

            <button className="filter-clear" onClick={() => setFilters(DEFAULT_FILTERS)} disabled={isDefault}>
              Clear filters
            </button>
          </div>
        )}

        {groups.length === 0 ? (
          <div className="history-empty">
            <strong>No transactions match these filters</strong>
            <p>Try a wider date range or clear the filters.</p>
            <button className="filter-clear" onClick={() => setFilters(DEFAULT_FILTERS)} disabled={isDefault}>Clear filters</button>
          </div>
        ) : (
          groups.map((group) => (
            <section className="history-day" key={group.date} aria-label={formatDay(group.date)}>
              <h3>{formatDay(group.date)}</h3>
              <ul className="tx-list">
                {group.entries.map((entry) => (
                  <li className="tx-row" key={entry.id}>
                    <span className={`tx-icon ${entry.category}`}><CategoryIcon category={entry.category} /></span>
                    <div className="tx-main">
                      <strong>{entry.title}</strong>
                      <span>
                        {CATEGORY_LABELS[entry.category]} · {entry.time}
                        {entry.category === "redemption" && ` · ${STATUS_LABELS[entry.status]}`}
                      </span>
                    </div>
                    <b className={entry.amount > 0 ? "tx-plus" : "tx-minus"}>
                      {entry.amount > 0 ? `+${entry.amount}` : `−${-entry.amount}`}
                    </b>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        <p className="history-note">Fictional prototype data.</p>
      </section>
    </main>
  );
}

function CategoryIcon({ category }: { category: Category }) {
  if (category === "attendance") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></svg>;
  if (category === "achievement") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4.5a3 3 0 0 0 3 4M16 6h3.5a3 3 0 0 1-3 4M12 13v4M8.5 20h7"/></svg>;
  if (category === "redemption") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M5 9h11v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V9ZM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c0 1.5 1.5 1.5 1.5 3M12 3.5c0 1.5 1.5 1.5 1.5 3"/></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>;
}

function CalendarIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>; }
function SlidersIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>; }
