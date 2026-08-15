import { connectPostgresRealtime } from "./realtime-client.js";

const SECTION_ORDER = ["hero", "quick_order", "story_team", "news_events", "gallery", "contact"];
const REQUIRED_SECTIONS = new Set(["hero", "quick_order"]);
const SECTION_LABELS = {
  hero: "Start / Hero",
  quick_order: "Speisekarte & Bestellen",
  story_team: "Über Mcello / Story",
  news_events: "Aktuelles & Events",
  gallery: "Galerie",
  contact: "Kontakt & Anfahrt",
};
const KIND_LABELS = { news: "News", event: "Event", special: "Special", press: "Presse" };

let state = { sections: [], posts: [] };
let dirty = false;
let loading = false;
const message = document.querySelector("#contentMessage");
const sectionList = document.querySelector("#sectionList");
const editorialList = document.querySelector("#editorialList");

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function toLocalDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeSections(raw) {
  const byKey = new Map((Array.isArray(raw) ? raw : []).map((section) => [section.key, section]));
  return SECTION_ORDER.map((key, index) => ({
    id: byKey.get(key)?.id || key,
    key,
    enabled: REQUIRED_SECTIONS.has(key) ? true : byKey.get(key)?.enabled !== false,
    sort: Number(byKey.get(key)?.sort ?? (index + 1) * 10),
  })).sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key));
}

function renderSections() {
  sectionList.innerHTML = state.sections.map((section, index) => {
    const required = REQUIRED_SECTIONS.has(section.key);
    return `<div class="section-row" data-section-key="${section.key}">
      <input type="checkbox" aria-label="${esc(SECTION_LABELS[section.key])} anzeigen" ${section.enabled ? "checked" : ""} ${required ? "disabled" : ""} />
      <div><strong>${esc(SECTION_LABELS[section.key])}</strong>${required ? '<div class="required-note">V1-Grundfunktion · immer aktiv</div>' : ""}</div>
      <div class="move-actions"><button class="icon-btn" data-move="up" aria-label="Nach oben" ${index === 0 ? "disabled" : ""}>↑</button><button class="icon-btn" data-move="down" aria-label="Nach unten" ${index === state.sections.length - 1 ? "disabled" : ""}>↓</button></div>
    </div>`;
  }).join("");

  sectionList.querySelectorAll(".section-row").forEach((row) => {
    const key = row.dataset.sectionKey;
    row.querySelector("input").addEventListener("change", (event) => {
      const section = state.sections.find((candidate) => candidate.key === key);
      if (!section || REQUIRED_SECTIONS.has(key)) return;
      section.enabled = event.target.checked;
      dirty = true;
    });
    row.querySelectorAll("[data-move]").forEach((button) => button.addEventListener("click", () => {
      const from = state.sections.findIndex((candidate) => candidate.key === key);
      const to = button.dataset.move === "up" ? from - 1 : from + 1;
      if (from < 0 || to < 0 || to >= state.sections.length) return;
      [state.sections[from], state.sections[to]] = [state.sections[to], state.sections[from]];
      dirty = true;
      renderSections();
    }));
  });
}

function statusOptions(current) {
  return ["draft", "published", "archived"].map((value) => `<option value="${value}" ${value === current ? "selected" : ""}>${value}</option>`).join("");
}

function kindOptions(current) {
  return Object.entries(KIND_LABELS).map(([value, label]) => `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`).join("");
}

function postForm(post = {}) {
  const id = post.id || "";
  return `<details class="editorial-card" ${id ? "" : "open"}>
    <summary><span><strong>${esc(post.title || "Neuer Beitrag")}</strong> <span class="badge">${esc(KIND_LABELS[post.kind] || "News")}</span></span><span class="badge">${esc(post.status || "draft")}${post.pinned ? " · angepinnt" : ""}</span></summary>
    <form class="content-form editorial-form" data-id="${id}">
      <div class="form-row"><select name="kind">${kindOptions(post.kind || "news")}</select><select name="status">${statusOptions(post.status || "draft")}</select></div>
      <input name="title" maxlength="180" value="${esc(post.title || "")}" placeholder="Titel" required />
      <input name="slug" maxlength="120" value="${esc(post.slug || "")}" placeholder="url-titel" required />
      <textarea name="teaser" maxlength="360" placeholder="Kurzer Teaser für die Startseite">${esc(post.teaser || "")}</textarea>
      <textarea name="content" rows="7" placeholder="Vollständiger Inhalt">${esc(post.content || "")}</textarea>
      <div class="form-row"><label>sichtbar ab<input name="visibleFrom" type="datetime-local" value="${toLocalDateTime(post.visibleFrom)}" /></label><label>sichtbar bis<input name="visibleUntil" type="datetime-local" value="${toLocalDateTime(post.visibleUntil)}" /></label></div>
      <div class="checks"><label><input name="pinned" type="checkbox" ${post.pinned ? "checked" : ""} /> auf Startseite anpinnen</label></div>
      <div class="actions"><button class="admin-btn primary" type="submit">Beitrag speichern</button>${id && post.status !== "archived" ? '<button class="admin-btn danger" type="button" data-archive>Archivieren</button>' : ""}</div>
    </form>
  </details>`;
}

function renderPosts({ includeNew = false } = {}) {
  editorialList.innerHTML = `${includeNew ? postForm({}) : ""}${state.posts.map(postForm).join("")}` || '<p class="empty">Noch keine Beiträge vorhanden.</p>';
  editorialList.querySelectorAll(".editorial-form").forEach((form) => {
    const title = form.elements.title;
    const slug = form.elements.slug;
    title.addEventListener("input", () => {
      dirty = true;
      if (!form.dataset.id && !slug.dataset.touched) slug.value = slugify(title.value);
    });
    slug.addEventListener("input", () => { dirty = true; slug.dataset.touched = "1"; });
    form.addEventListener("input", () => { dirty = true; });
    form.addEventListener("submit", (event) => savePost(event, form));
    form.querySelector("[data-archive]")?.addEventListener("click", () => {
      form.elements.status.value = "archived";
      form.requestSubmit();
    });
  });
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Änderung abgelehnt");
  return data;
}

async function loadContent({ force = false } = {}) {
  if (loading) return;
  if (dirty && !force) {
    message.textContent = "Auf einem anderen Gerät wurde etwas geändert. Speichere zuerst oder klicke „Neu laden“.";
    return;
  }
  loading = true;
  try {
    const response = await fetch("/api/admin/content", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Inhalte nicht verfügbar");
    state = {
      sections: normalizeSections(data.sections),
      posts: Array.isArray(data.posts) ? data.posts : [],
    };
    dirty = false;
    message.textContent = "";
    renderSections();
    renderPosts();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    loading = false;
  }
}

async function saveSections() {
  const button = document.querySelector("#saveSections");
  button.disabled = true;
  try {
    const sections = state.sections.map((section, index) => ({
      key: section.key,
      enabled: REQUIRED_SECTIONS.has(section.key) ? true : section.enabled,
      sort: (index + 1) * 10,
    }));
    await postJson("/api/admin/content/sections/save", { sections });
    dirty = false;
    message.textContent = "Startseiten-Reihenfolge gespeichert.";
    await loadContent({ force: true });
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function savePost(event, form) {
  event.preventDefault();
  const visibleFrom = toIsoOrNull(form.elements.visibleFrom.value);
  const visibleUntil = toIsoOrNull(form.elements.visibleUntil.value);
  if (visibleFrom && visibleUntil && Date.parse(visibleUntil) < Date.parse(visibleFrom)) {
    message.textContent = "Das Sichtbarkeitsende darf nicht vor dem Start liegen.";
    return;
  }
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await postJson("/api/admin/content/post/save", {
      id: form.dataset.id || null,
      kind: form.elements.kind.value,
      status: form.elements.status.value,
      title: form.elements.title.value.trim(),
      slug: form.elements.slug.value.trim(),
      teaser: form.elements.teaser.value.trim(),
      content: form.elements.content.value.trim(),
      visibleFrom,
      visibleUntil,
      pinned: form.elements.pinned.checked,
    });
    dirty = false;
    message.textContent = "Beitrag gespeichert.";
    await loadContent({ force: true });
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function setRealtimeStatus(status) {
  const dot = document.querySelector("#contentDot");
  const text = document.querySelector("#contentSync");
  dot.classList.toggle("offline", status !== "subscribed");
  text.textContent = ({
    connecting: "Realtime verbindet …",
    subscribed: "Realtime · live",
    reconnecting: "Realtime verbindet neu …",
    degraded: "Realtime gestört · Safety-Sync",
  })[status] || status;
}

document.querySelector("#saveSections").addEventListener("click", saveSections);
document.querySelector("#newPost").addEventListener("click", () => renderPosts({ includeNew: true }));
document.querySelector("#reloadContent").addEventListener("click", () => loadContent({ force: true }));

await loadContent({ force: true });
connectPostgresRealtime({
  sessionEndpoint: "/api/admin/realtime-session",
  topic: "realtime:mcello-content",
  changes: (session) => [
    { event: "*", schema: "public", table: "editorial_posts", filter: `location_id=eq.${session.locationId}` },
    { event: "*", schema: "public", table: "homepage_sections", filter: `location_id=eq.${session.locationId}` },
  ],
  onChange: () => loadContent(),
  onStatus: setRealtimeStatus,
  reconciliationMs: 30_000,
});
