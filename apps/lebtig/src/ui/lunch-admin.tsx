import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  followingWeekStartIso,
  nextMondayIso,
  validateLunchWeekForPublication,
  type LunchItemDraft,
  type LunchWeekDraft,
} from "../cms/lunch.ts";
import type { LunchWeek } from "../domain/cms.ts";
import { hasLebtigPermission } from "../domain/roles.ts";
import { createLebtigBrowserAuthRuntime } from "./auth-runtime.ts";
import { createLebtigStaffLunchRuntime } from "./lunch-runtime.ts";

const WEEKDAY_LABELS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"] as const;

interface EditorItem {
  weekday: number;
  dish: string;
  description: string;
  price: string;
  allergens: string;
  sort: number;
}

interface EditorDraft {
  note: string;
  items: EditorItem[];
}

function statusLabel(status: LunchWeek["status"]): string {
  if (status === "published") return "Veröffentlicht";
  if (status === "archived") return "Archiviert";
  if (status === "scheduled") return "Geplant";
  return "Entwurf";
}

function weekLabel(week: LunchWeek): string {
  return `${week.week_start} – ${week.week_end}`;
}

function draftFromWeek(week: LunchWeek): EditorDraft {
  const byWeekday = new Map((week.lunch_items ?? []).map((item) => [item.weekday, item]));
  return {
    note: week.note ?? "",
    items: [1, 2, 3, 4, 5].map((weekday) => {
      const item = byWeekday.get(weekday);
      return {
        weekday,
        dish: item?.dish ?? "",
        description: item?.description ?? "",
        price: item?.price === null || item?.price === undefined ? "" : String(item.price),
        allergens: item?.allergens ?? "",
        sort: item?.sort ?? weekday,
      };
    }),
  };
}

function portDraft(draft: EditorDraft): LunchWeekDraft {
  const items: LunchItemDraft[] = draft.items.map((item) => {
    const parsed = item.price.trim() === "" ? null : Number(item.price.replace(",", "."));
    return {
      weekday: item.weekday,
      dish: item.dish,
      description: item.description.trim() || null,
      price: parsed === null || Number.isFinite(parsed) ? parsed : Number.NaN,
      allergens: item.allergens.trim() || null,
      sort: item.sort,
    };
  });
  return { note: draft.note.trim() || null, items };
}

function previewWeek(week: LunchWeek, draft: EditorDraft): LunchWeek {
  return {
    ...week,
    note: draft.note.trim() || null,
    lunch_items: portDraft(draft).items.map((item, index) => ({
      id: `preview-${week.id}-${item.weekday}`,
      week_id: week.id,
      weekday: item.weekday,
      dish: item.dish,
      description: item.description,
      price: Number.isNaN(item.price) ? null : item.price,
      allergens: item.allergens,
      image_url: null,
      sort: item.sort ?? index + 1,
    })),
  };
}

function formatPrice(value: number | null): string | null {
  if (value === null) return null;
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export function LebtigLunchAdminPage() {
  const navigate = useNavigate();
  const auth = useMemo(() => createLebtigBrowserAuthRuntime(), []);
  const runtime = useMemo(() => createLebtigStaffLunchRuntime(), []);
  const [ready, setReady] = useState(false);
  const [weeks, setWeeks] = useState<LunchWeek[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = weeks.find((week) => week.id === selectedId) ?? null;

  const reload = useCallback(async (preferredId?: string) => {
    if (!runtime.port) return;
    const loaded = await runtime.port.listStaffWeeks();
    setWeeks(loaded);
    const nextId = preferredId && loaded.some((week) => week.id === preferredId)
      ? preferredId
      : selectedId && loaded.some((week) => week.id === selectedId)
        ? selectedId
        : loaded[0]?.id ?? null;
    setSelectedId(nextId);
  }, [runtime.port, selectedId]);

  useEffect(() => {
    document.title = "Mittagstisch – Redaktion · Metzgerei Lebtig";
    let active = true;

    async function authorize() {
      if (!auth.configured || !runtime.port) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      try {
        const access = await auth.getEditorialAccess();
        const allowed = access?.roles.some((role) => hasLebtigPermission(role, "content:edit")) ?? false;
        if (!allowed) {
          navigate({ to: "/auth", replace: true });
          return;
        }
        await reload();
        if (active) setReady(true);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Redaktionszugriff konnte nicht geprüft werden.");
      }
    }

    void authorize();
    return () => {
      active = false;
    };
  }, [auth, navigate, reload, runtime.port]);

  useEffect(() => {
    if (selected) setDraft(draftFromWeek(selected));
    else setDraft(null);
  }, [selected]);

  function updateItem(weekday: number, patch: Partial<EditorItem>) {
    setDraft((current) => current
      ? { ...current, items: current.items.map((item) => item.weekday === weekday ? { ...item, ...patch } : item) }
      : current);
  }

  async function runAction(action: () => Promise<LunchWeek>, success: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const week = await action();
      await reload(week.id);
      setMessage(success);
      return week;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Aktion fehlgeschlagen.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createWeek() {
    if (!runtime.port) return;
    const nextMonday = nextMondayIso(new Date().toISOString());
    const latestStart = weeks[0]?.week_start;
    const following = latestStart ? followingWeekStartIso(latestStart) : nextMonday;
    const start = following > nextMonday ? following : nextMonday;
    await runAction(() => runtime.port!.createWeek(start), "Neue Entwurfswoche angelegt.");
  }

  async function saveDraft() {
    if (!runtime.port || !selected || !draft) return null;
    const normalized = portDraft(draft);
    if (normalized.items.some((item) => item.price !== null && !Number.isFinite(item.price))) {
      setError("Bitte prüfen Sie die Preise. Erlaubt sind Zahlen oder ein leeres Preisfeld.");
      return null;
    }
    return runAction(() => runtime.port!.saveWeek(selected.id, normalized), "Entwurf gespeichert.");
  }

  async function publish() {
    if (!runtime.port || !selected || !draft) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await runtime.port.saveWeek(selected.id, portDraft(draft));
      const issues = validateLunchWeekForPublication(saved);
      if (issues.length > 0) {
        setError(issues[0]?.message ?? "Die Woche ist noch nicht veröffentlichungsfähig.");
        await reload(saved.id);
        return;
      }
      const published = await runtime.port.setStatus(saved.id, "published");
      await reload(published.id);
      setMessage("Wochenkarte veröffentlicht. Die Public-Route liest jetzt denselben Datenbestand.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Veröffentlichung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function setDraftStatus() {
    if (!runtime.port || !selected) return;
    await runAction(() => runtime.port!.setStatus(selected.id, "draft"), "Woche ist wieder ein Entwurf.");
  }

  async function archive() {
    if (!runtime.port || !selected) return;
    await runAction(() => runtime.port!.setStatus(selected.id, "archived"), "Woche archiviert und aus der Public-Ausgabe entfernt.");
  }

  async function copyWeek() {
    if (!runtime.port || !selected) return;
    await runAction(() => runtime.port!.copyToFollowingWeek(selected.id), "Folgewoche als Entwurf kopiert.");
  }

  async function signOut() {
    await auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (!ready && !error) {
    return <main className="admin-shell"><div className="admin-state" role="status">Redaktionszugriff wird geprüft…</div></main>;
  }

  const preview = selected && draft ? previewWeek(selected, draft) : null;

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">Lebtig CMS</p>
          <h1>Mittagstisch-Redaktion</h1>
        </div>
        <div className="admin-topbar-actions">
          <Link to="/mittagstisch" className="button secondary-button">Public ansehen</Link>
          <button type="button" className="button secondary-button" onClick={signOut}>Abmelden</button>
        </div>
      </header>

      {message ? <p className="admin-message success-card" role="status">{message}</p> : null}
      {error ? <p className="admin-message error-card" role="alert">{error}</p> : null}

      <div className="admin-layout">
        <aside className="admin-week-list" aria-label="Mittagstischwochen">
          <button type="button" className="button primary-button full-button" disabled={busy} onClick={createWeek}>
            Neue Woche
          </button>
          {weeks.length === 0 ? <p className="muted">Noch keine Wochen angelegt.</p> : null}
          {weeks.map((week) => (
            <button
              key={week.id}
              type="button"
              className={`week-list-button${week.id === selectedId ? " active" : ""}`}
              onClick={() => setSelectedId(week.id)}
            >
              <span>{weekLabel(week)}</span>
              <small>{statusLabel(week.status)}</small>
            </button>
          ))}
        </aside>

        <section className="admin-editor">
          {!selected || !draft ? (
            <div className="admin-state"><h2>Woche auswählen oder anlegen</h2></div>
          ) : (
            <>
              <div className="editor-heading">
                <div>
                  <p className="eyebrow">{statusLabel(selected.status)}</p>
                  <h2>{weekLabel(selected)}</h2>
                </div>
                <div className="editor-actions">
                  <button type="button" className="button secondary-button" disabled={busy} onClick={saveDraft}>Speichern</button>
                  {selected.status !== "published" ? (
                    <button type="button" className="button primary-button" disabled={busy} onClick={publish}>Veröffentlichen</button>
                  ) : (
                    <button type="button" className="button secondary-button" disabled={busy} onClick={setDraftStatus}>Auf Entwurf setzen</button>
                  )}
                  <button type="button" className="button secondary-button" disabled={busy} onClick={copyWeek}>Folgewoche kopieren</button>
                  <button type="button" className="button danger-button" disabled={busy || selected.status === "archived"} onClick={archive}>Archivieren</button>
                </div>
              </div>

              <label className="editor-field">
                <span>Hinweis zur Woche</span>
                <textarea value={draft.note} rows={2} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
              </label>

              <div className="editor-days">
                {draft.items.map((item) => (
                  <fieldset key={item.weekday} className="editor-day-card">
                    <legend>{WEEKDAY_LABELS[item.weekday - 1]}</legend>
                    <label className="editor-field">
                      <span>Gericht</span>
                      <input value={item.dish} onChange={(event) => updateItem(item.weekday, { dish: event.target.value })} />
                    </label>
                    <label className="editor-field">
                      <span>Beschreibung</span>
                      <input value={item.description} onChange={(event) => updateItem(item.weekday, { description: event.target.value })} />
                    </label>
                    <div className="editor-field-row">
                      <label className="editor-field">
                        <span>Preis</span>
                        <input inputMode="decimal" value={item.price} onChange={(event) => updateItem(item.weekday, { price: event.target.value })} />
                      </label>
                      <label className="editor-field">
                        <span>Allergene</span>
                        <input value={item.allergens} onChange={(event) => updateItem(item.weekday, { allergens: event.target.value })} />
                      </label>
                    </div>
                  </fieldset>
                ))}
              </div>

              <section className="editor-preview" data-testid="lunch-preview" aria-labelledby="preview-heading">
                <div className="section-heading-row">
                  <div><p className="eyebrow">Vorschau</p><h2 id="preview-heading">Wochenkarte vor Veröffentlichung</h2></div>
                  <span className="publication-badge">{statusLabel(selected.status)}</span>
                </div>
                {preview?.note ? <p className="lunch-note">{preview.note}</p> : null}
                <ol className="lunch-day-list">
                  {(preview?.lunch_items ?? []).map((item) => (
                    <li key={item.id} className="lunch-day-row">
                      <div>
                        <p className="lunch-day-label">{WEEKDAY_LABELS[item.weekday - 1]}</p>
                        <p className="lunch-dish">{item.dish.trim() || "Noch kein Gericht eingetragen"}</p>
                        {item.description ? <p className="muted">{item.description}</p> : null}
                        {item.allergens ? <p className="lunch-allergens">Allergene: {item.allergens}</p> : null}
                      </div>
                      {formatPrice(item.price) ? <strong className="lunch-price">{formatPrice(item.price)}</strong> : null}
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
