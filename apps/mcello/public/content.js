let snapshot = { editorialPosts: [], homepageSections: [] };
let gallerySnapshot = { items: [] };
let directSessionCache = null;
let previewUrls = [];
const message = document.querySelector("#contentMessage");
const postTarget = document.querySelector("#postAdmin");
const sectionTarget = document.querySelector("#sectionAdmin");
const galleryTarget = document.querySelector("#galleryAdmin");
const galleryUploadForm = document.querySelector("#galleryUploadForm");

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

function encodedStoragePath(bucketId, objectPath) {
  return [bucketId, ...String(objectPath).split("/")]
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function storageRequest(bucketId, objectPath, options = {}) {
  const session = await getDirectAdminSession();
  const objectRoute = !options.method || options.method === "GET" ? "object/authenticated" : "object";
  const response = await fetch(
    `${session.restBase}/storage/v1/${objectRoute}/${encodedStoragePath(bucketId, objectPath)}`,
    {
      ...options,
      headers: {
        apikey: session.apiKey,
        authorization: `Bearer ${session.accessToken}`,
        ...(options.headers || {}),
      },
    },
  );
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`Medien-Storage abgelehnt (${response.status}): ${raw || "unbekannter Fehler"}`);
  }
  return response;
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

function galleryCategoryOptions(current = "food") {
  const labels = { food: "Food", venue: "Lokal", team: "Team", events: "Events" };
  return Object.entries(labels)
    .map(([value, label]) => `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`)
    .join("");
}

function sourceKindOptions(current = "owner_upload") {
  const labels = {
    owner_upload: "Vom Betrieb hochgeladen",
    user_supplied: "Bereitgestelltes Original",
    licensed: "Lizenziert",
  };
  return Object.entries(labels)
    .map(([value, label]) => `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`)
    .join("");
}

function galleryItemCard(item) {
  const media = item.media || {};
  return `<article class="gallery-admin-card">
    <div>
      <img data-media-preview data-bucket="${esc(media.bucketId || "")}" data-path="${esc(media.objectPath || "")}" alt="${esc(media.altText || "Vorschau")}" />
      <p class="help media-meta">${esc(media.originalFilename || "")}<br/>${Math.round(Number(media.byteSize || 0) / 1024)} KiB</p>
    </div>
    <form class="cms-form gallery-item-form" data-id="${esc(item.id)}">
      <div class="form-row"><label>Kategorie<select name="category">${galleryCategoryOptions(item.category)}</select></label><label>Status<select name="status">${statusOptions(item.status)}</select></label></div>
      <label>Alternativtext<input name="altText" maxlength="250" value="${esc(media.altText || "")}" required /></label>
      <div class="form-row"><label>Herkunft<select name="sourceKind">${sourceKindOptions(media.sourceKind)}</select></label><label>Sortierung<input name="sort" type="number" value="${Number(item.sort || 100)}" /></label></div>
      <input name="title" maxlength="160" value="${esc(item.title || "")}" placeholder="Optionaler Titel" />
      <textarea name="caption" maxlength="1000" placeholder="Optionale Bildunterschrift">${esc(item.caption || "")}</textarea>
      <div class="form-row"><label>Sichtbar ab<input name="visibleFrom" type="datetime-local" value="${localInput(item.visibleFrom)}" /></label><label>Sichtbar bis<input name="visibleUntil" type="datetime-local" value="${localInput(item.visibleUntil)}" /></label></div>
      <div class="checks"><label><input name="rightsConfirmed" type="checkbox" ${media.rightsConfirmed ? "checked" : ""}/> Bildrechte bestätigt</label><label><input name="featured" type="checkbox" ${item.featured ? "checked" : ""}/> hervorgehoben</label></div>
      <div class="actions"><button class="cms-btn primary" type="submit">Galerieeintrag speichern</button><button class="cms-btn danger" type="button" data-delete-gallery="${esc(item.id)}">Löschen</button></div>
    </form>
  </article>`;
}

function renderGallery() {
  for (const url of previewUrls) URL.revokeObjectURL(url);
  previewUrls = [];
  const items = gallerySnapshot.items || [];
  galleryTarget.innerHTML = items.map(galleryItemCard).join("") || '<p class="help">Noch keine Originalmedien hinterlegt. Es werden keine Demo-Fotos erzeugt.</p>';
  galleryTarget.querySelectorAll(".gallery-item-form").forEach((form) => {
    form.addEventListener("submit", (event) => saveGalleryItem(event, form));
  });
  galleryTarget.querySelectorAll("[data-delete-gallery]").forEach((button) => {
    button.addEventListener("click", () => deleteGalleryItem(button.dataset.deleteGallery, button));
  });
  loadAdminPreviews();
}

async function loadAdminPreviews() {
  await Promise.all([...galleryTarget.querySelectorAll("[data-media-preview]")].map(async (image) => {
    try {
      const response = await storageRequest(image.dataset.bucket, image.dataset.path);
      const objectUrl = URL.createObjectURL(await response.blob());
      previewUrls.push(objectUrl);
      image.src = objectUrl;
    } catch {
      image.alt = "Vorschau nicht verfügbar";
    }
  }));
}

async function imageDimensions(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const result = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return result;
  } catch {
    return { width: null, height: null };
  }
}

function storageExtension(file) {
  return ({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
  })[file.type] || null;
}

async function uploadGalleryItem(event) {
  event.preventDefault();
  const button = galleryUploadForm.querySelector('button[type="submit"]');
  const file = galleryUploadForm.elements.file.files?.[0];
  const extension = file ? storageExtension(file) : null;
  if (!file || !extension || file.size < 1 || file.size > 10 * 1024 * 1024) {
    message.textContent = "Bitte ein JPEG-, PNG-, WebP- oder AVIF-Bild bis 10 MiB wählen.";
    return;
  }
  button.disabled = true;
  let uploaded = null;
  try {
    const session = await getDirectAdminSession();
    const objectPath = `${session.locationId}/gallery/${crypto.randomUUID()}.${extension}`;
    uploaded = { bucketId: "mcello-media", objectPath };
    await storageRequest(uploaded.bucketId, objectPath, {
      method: "POST",
      headers: { "content-type": file.type, "x-upsert": "false" },
      body: file,
    });
    const dimensions = await imageDimensions(file);
    await adminRpc("admin_register_gallery_upload", {
      _location_id: session.locationId,
      _bucket_id: uploaded.bucketId,
      _object_path: objectPath,
      _original_filename: file.name.slice(0, 255),
      _mime_type: file.type,
      _byte_size: file.size,
      _width: dimensions.width,
      _height: dimensions.height,
      _alt_text: galleryUploadForm.elements.altText.value.trim(),
      _source_kind: galleryUploadForm.elements.sourceKind.value,
      _rights_confirmed: galleryUploadForm.elements.rightsConfirmed.checked,
      _category: galleryUploadForm.elements.category.value,
      _title: galleryUploadForm.elements.title.value.trim(),
      _caption: galleryUploadForm.elements.caption.value.trim(),
      _status: galleryUploadForm.elements.status.value,
      _featured: galleryUploadForm.elements.featured.checked,
      _sort: Number(galleryUploadForm.elements.sort.value || 100),
      _visible_from: isoOrNull(galleryUploadForm.elements.visibleFrom.value),
      _visible_until: isoOrNull(galleryUploadForm.elements.visibleUntil.value),
    });
    uploaded = null;
    galleryUploadForm.reset();
    galleryUploadForm.elements.sort.value = "100";
    message.textContent = "Originalbild sicher gespeichert und der Galerie hinzugefügt.";
    await loadContent();
  } catch (error) {
    if (uploaded) {
      await storageRequest(uploaded.bucketId, uploaded.objectPath, { method: "DELETE" }).catch(() => {});
    }
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function saveGalleryItem(event, form) {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const session = await getDirectAdminSession();
    await adminRpc("admin_save_gallery_item", {
      _id: form.dataset.id,
      _location_id: session.locationId,
      _category: form.elements.category.value,
      _title: form.elements.title.value.trim(),
      _caption: form.elements.caption.value.trim(),
      _status: form.elements.status.value,
      _featured: form.elements.featured.checked,
      _sort: Number(form.elements.sort.value || 100),
      _visible_from: isoOrNull(form.elements.visibleFrom.value),
      _visible_until: isoOrNull(form.elements.visibleUntil.value),
      _alt_text: form.elements.altText.value.trim(),
      _source_kind: form.elements.sourceKind.value,
      _rights_confirmed: form.elements.rightsConfirmed.checked,
    });
    message.textContent = "Galerieeintrag gespeichert.";
    await loadContent();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function deleteGalleryItem(id, button) {
  if (!window.confirm("Galerieeintrag und ungenutztes Originalbild wirklich löschen?")) return;
  button.disabled = true;
  try {
    const session = await getDirectAdminSession();
    const result = await adminRpc("admin_delete_gallery_item", { _id: id, _location_id: session.locationId });
    if (result?.deleteObject && result.bucketId && result.objectPath) {
      await storageRequest(result.bucketId, result.objectPath, { method: "DELETE" });
    }
    message.textContent = "Galerieeintrag gelöscht.";
    await loadContent();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function loadContent() {
  try {
    const session = await getDirectAdminSession();
    [snapshot, gallerySnapshot] = await Promise.all([
      adminRpc("admin_get_content", { _location_id: session.locationId }),
      adminRpc("admin_get_gallery", { _location_id: session.locationId }),
    ]);
    renderSections();
    renderPosts();
    renderGallery();
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
galleryUploadForm.addEventListener("submit", uploadGalleryItem);
await loadContent();
