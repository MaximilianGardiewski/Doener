import { useEffect, useMemo, useState } from "react";

import { splitPublicLunchWeeks } from "../cms/lunch.ts";
import type { LunchWeek } from "../domain/cms.ts";
import { createLebtigPublicLunchRuntime } from "./lunch-runtime.ts";

const WEEKDAY_LABELS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"] as const;

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatPrice(value: number | null): string | null {
  if (value === null) return null;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function LunchWeekCard({ week, headingLevel = 2 }: { week: LunchWeek; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const items = (week.lunch_items ?? []).slice().sort((a, b) => a.weekday - b.weekday || a.sort - b.sort);

  return (
    <article className="lunch-week-card">
      <div className="lunch-week-heading">
        <div>
          <p className="eyebrow">Wochenkarte</p>
          <Heading>
            {formatDate(week.week_start)} – {formatDate(week.week_end)}
          </Heading>
        </div>
        <span className="publication-badge">Veröffentlicht</span>
      </div>

      {week.note ? <p className="lunch-note">{week.note}</p> : null}

      <ol className="lunch-day-list">
        {items.map((item) => (
          <li key={item.id} className="lunch-day-row">
            <div>
              <p className="lunch-day-label">{WEEKDAY_LABELS[item.weekday - 1] ?? `Tag ${item.weekday}`}</p>
              <p className="lunch-dish">{item.dish}</p>
              {item.description ? <p className="muted">{item.description}</p> : null}
              {item.allergens ? <p className="lunch-allergens">Allergene: {item.allergens}</p> : null}
            </div>
            {formatPrice(item.price) ? <strong className="lunch-price">{formatPrice(item.price)}</strong> : null}
          </li>
        ))}
      </ol>
    </article>
  );
}

export function LunchPublicPage() {
  const runtime = useMemo(() => createLebtigPublicLunchRuntime(), []);
  const [weeks, setWeeks] = useState<LunchWeek[]>([]);
  const [loading, setLoading] = useState(runtime.configured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Mittagstisch · Metzgerei Lebtig";
    if (!runtime.port) return;

    let active = true;
    runtime.port
      .listPublicWeeks(new Date().toISOString())
      .then((loaded) => {
        if (active) setWeeks(loaded);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Mittagstisch konnte nicht geladen werden.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [runtime]);

  const split = splitPublicLunchWeeks(weeks, new Date().toISOString());

  return (
    <>
      <section className="hero-section lunch-public-hero">
        <div className="container">
          <p className="eyebrow">Mittagstisch</p>
          <h1>Wochenkarte</h1>
          <p className="hero-summary">
            Veröffentlichte Wochenkarten werden direkt aus dem redaktionellen Datenbestand ausgespielt.
          </p>
        </div>
      </section>

      <section className="content-section">
        <div className="container lunch-public-stack">
          {!runtime.configured ? (
            <div className="cms-state-card" role="status">
              <h2>Lokales Preview ohne CMS-Datenbank</h2>
              <p className="muted">Die Route ist verfügbar; veröffentlichte Daten werden erst mit konfiguriertem Backend geladen.</p>
            </div>
          ) : loading ? (
            <div className="cms-state-card" role="status">Wochenkarte wird geladen…</div>
          ) : error ? (
            <div className="cms-state-card error-card" role="alert">
              <h2>Wochenkarte konnte nicht geladen werden</h2>
              <p>{error}</p>
            </div>
          ) : split.current ? (
            <LunchWeekCard week={split.current} />
          ) : (
            <div className="cms-state-card" role="status">
              <h2>Für den aktuellen Zeitraum ist keine Wochenkarte veröffentlicht</h2>
              <p className="muted">Bereits veröffentlichte weitere Wochen finden Sie gegebenenfalls darunter.</p>
            </div>
          )}

          {split.archive.length > 0 ? (
            <section aria-labelledby="weitere-wochen">
              <div className="section-heading-row">
                <div>
                  <p className="eyebrow">Weitere Karten</p>
                  <h2 id="weitere-wochen">Weitere veröffentlichte Wochen</h2>
                </div>
              </div>
              <div className="lunch-archive-grid">
                {split.archive.map((week) => (
                  <LunchWeekCard key={week.id} week={week} headingLevel={3} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </>
  );
}
