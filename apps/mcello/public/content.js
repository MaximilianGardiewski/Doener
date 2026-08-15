let snapshot = { editorialPosts: [], homepageSections: [] };
let directSessionCache = null;
const message = document.querySelector("#contentMessage");
const postTarget = document.querySelector("#postAdmin");
const sectionTarget = document.querySelector("#sectionAdmin");

const sectionDefinitions = [
  ["hero", "Hero / Einstieg", 10],
  ["quick_order", "Speisekarte & Bestellen", 20],
  ["story_team", "Über Mcello / Story", 30],
  ["news_events", "Aktuelles & Events", 40],
  ["gallery", "Galerie", 50],
  ["contact", "Kontakt & Anfahrt", 60],
];

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
    .slice(0, 80);
}

function localInput(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function isoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function getDirectAdminSession() {
  if (directSessionCache && directSessionCache.expiresAt > Date.now() + 60_000) return directSessionCache;
  const response = await fetch("/api/admin/realtime-session", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.websocketUrl || !data.accessToken || !data.locationId) {
    throw new Error(data.error || "Admin-Session nicht verfügbar");
  }
  const websocket = new URL(data.websocketUrl);
  const apiKey = websocket.searchParams.get("apikey");
  if (!apiKey) throw new Error("Öffentlicher Supabase-API-Key fehlt in der Session");
  const restProtocol = websocket.protocol === "wss:" ? "https:" : "http:";
  directSessionCache = {
    restBase: `${restProtocol}//${websocket.host}`,
    apiKey,
    accessToken: data.accessToken,
    expiresAt: Number(data.expiresAt || Date.now() + 5 * 60_000),
    locationId: data.locationId,
  };
  return directSessionCache;
}

async function adminRpc(name, args) {
  const session = await getDirectAdminSession();
  const response = await fetch(`${session.restBase}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: session.apiKey,
      authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(args),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    if (response.status === 401) directSessionCache = null;
    throw new Error(data?.message || data?.error || `Admin-RPC ${name} abgelehnt`);
  }
  return data;
}

function currentSections() {
  const byKey = new Map((snapshot.homepageSections || []).map((row) => [row.sectionKey, row]));
  return sectionDefinitions.map(([key, label, defaultSort]) => ({
    sectionKey: key,
    label,
    enabled: byKey.has(key) ? Boolean(byKey.get(key).enabled) : true,
    sort: Number(byKey.get(key)?.sort ?? defaultSort),
    settings: byKey.get(key)?.settings || {},
  }));
}

function renderSections() {
  sectionTarget.innerHTML = currentSections().map((row) => `
    <div class="section-row" data-section-key="${row.sectionKey}">
      <div><strong>${esc(row.label)}</strong><small>${esc(row.sectionKey)}</small></div>
      <input name="sort" type="number" value="${row.sort}" aria-label="Sortierung ${esc(row.label)}" />
      <label><input name="enabled" type="checkbox" ${row.enabled ? "checked" : ""}/> sichtbar</label>
    </div>
  `).join("");
}

function statusOptions(current = "draft") {
  return ["draft", "published", "archived"]
    .map((value) => `<option value="${value}" ${value === current ? "selected" : ""}>${value}</option>`)
    .join("");
}

function kindOptions(current = "news") {
  const labels = { news: "News", event: "Event", special: "Special", press: "Presse" };
  return Object.entries(labels)
    .map(([value, label]) => `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`)
    .join("");
}

function postForm(post = {}) {
  const id = post.id || "";
  return `<details class="post-card" ${id ? "" : "open"}>
    <summary><span><strong>${esc(post.title || "Neuer Beitrag")}</strong> <span class="badge">${esc(post.kind || "news")}</span></span><span class="badge">${esc(post.status || "draft")}</span></summary>
    <form class="cms-form post-form" data-id="${id}">
      <div class="form-row"><input name="title" value="${esc(post.title || "")}" placeholder="Titel" required/><input name="slug" value="${esc(post.slug || "")}" placeholder="slug" required/></div>
      <div class="form-row"><select name="kind">${kindOptions(post.kind || "news")}</select><select name="status">${statusOptions(post.status || "draft")}</select></div>
      <textarea name="teaser" placeholder="Kurzer Teaser für die Homepage">${esc(post.teaser || "")}</textarea>
      <textarea name="content" placeholder="Inhalt">${esc(post.content || "")}</textarea>
      <div class="form-row"><label>Veröffentlichen ab<input name="visibleFrom" type="datetime-local" value="${localInput(post.visibleFrom)}"/></label><label>Veröffentlichen bis<input name="visibleUntil" type="datetime-local" value="${localInput(post.visibleUntil)}"/></label></div>
      <div class="form-row"><label>Event beginnt<input name="eventStartsAt" type="datetime-local" value="${localInput(post.eventStartsAt)}"/></label><label>Event endet<input name="eventEndsAt" type="datetime-local" value="${localInput(post.eventEndsAt)}"/></label></div>
      <div class="checks"><label><input name="pinned" type="checkbox" ${post.pinned ? "checked" : ""}/> auf Homepage hervorheben</label></div>
      <p class="help">Ein veröffentlichtes Event braucht ein Event-Startdatum. Publikationsfenster steuert nur, wann der Beitrag sichtbar ist. Medien werden separat ergänzt.</p>
      <div class="actions"><button class="cms-btn primary" type="submit">Beitrag speichern</button>${id ? `<button class="cms-btn danger" type="button" data-delete-post="${id}">Löschen</button>` : ""}</div>
    </form>
  </details>`;
}

function renderPosts(extraNew = false) {
  postTarget.innerHTML = `${extraNew ? postForm({}) : ""}${(snapshot.editorialPosts || []).map(postForm).join("")}` || '<p class="help">Noch keine Beiträge. Es werden keine Demo-News erzeugt.</p>';
  postTarget.querySelectorAll(".post-form").forEach((form) => {
    const title = form.elements.title;
    const slug = form.elements.slug;
    title.addEventListener("input", () => {
      if (!form.dataset.id && !slug.dataset.touched) slug.value = slugify(title.value);
    });
    slug.addEventListener("input", () => { slug.dataset.touched = "1"; });
    form.addEventListener("submit", (event) => savePost(event, form));
  });
  postTarget.querySelectorAll("[data-delete-post]").forEach((button) => {
    button.addEventListener("click", () => deletePost(button.dataset.deletePost, button));
  });
}

async function loadContent() {
  try {
    const session = await getDirectAdminSession();
    snapshot = await adminRpc("admin_get_content", { _location_id: session.locationId });
    renderSections();
    renderPosts();
    message.textContent = "";
  } catch (error) {
    message.textContent = error.message;
  }
}

async function saveSections() {
  const button = document.querySelector("#saveSections");
  button.disabled = true;
  try {
    const session = await getDirectAdminSession();
    const rows = [...sectionTarget.querySelectorAll("[data-section-key]")].map((row) => ({
      sectionKey: row.dataset.sectionKey,
      enabled: row.querySelector('[name="enabled"]').checked,
      sort: Number(row.querySelector('[name="sort"]').value || 100),
      settings: {},
    }));
    await adminRpc("admin_replace_homepage_sections", { _location_id: session.locationId, _rows: rows });
    message.textContent = "Homepage-Module gespeichert.";
    await loadContent();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function savePost(event, form) {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const session = await getDirectAdminSession();
    await adminRpc("admin_save_editorial_post", {
      _id: form.dataset.id || null,
      _location_id: session.locationId,
      _slug: form.elements.slug.value.trim(),
      _kind: form.elements.kind.value,
      _title: form.elements.title.value.trim(),
      _teaser: form.elements.teaser.value.trim(),
      _content: form.elements.content.value.trim(),
      _status: form.elements.status.value,
      _pinned: form.elements.pinned.checked,
      _visible_from: isoOrNull(form.elements.visibleFrom.value),
      _visible_until: isoOrNull(form.elements.visibleUntil.value),
      _event_starts_at: isoOrNull(form.elements.eventStartsAt.value),
      _event_ends_at: isoOrNull(form.elements.eventEndsAt.value),
    });
    message.textContent = "Beitrag gespeichert.";
    await loadContent();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function deletePost(id, button) {
  button.disabled = true;
  try {
    const session = await getDirectAdminSession();
    await adminRpc("admin_delete_editorial_post", { _id: id, _location_id: session.locationId });
    message.textContent = "Beitrag gelöscht.";
    await loadContent();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

document.querySelector("#newPost").addEventListener("click", () => renderPosts(true));
document.querySelector("#saveSections").addEventListener("click", saveSections);
await loadContent();
