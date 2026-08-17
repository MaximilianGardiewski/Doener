let sessionCache = null;
let previewUrls = [];
const grid = document.querySelector("#productMediaGrid");
const message = document.querySelector("#productMediaMessage");
const dot = document.querySelector("#productMediaDot");
const sync = document.querySelector("#productMediaSync");

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}

async function getSession({ force = false } = {}) {
  if (!force && sessionCache && sessionCache.expiresAt > Date.now() + 60_000) return sessionCache;
  const response = await fetch("/api/admin/realtime-session", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.websocketUrl || !data.accessToken || !data.locationId) {
    throw new Error(data.error || "Admin-Session nicht verfügbar");
  }
  const websocket = new URL(data.websocketUrl);
  const apiKey = websocket.searchParams.get("apikey");
  if (!apiKey) throw new Error("Öffentlicher Supabase-API-Key fehlt in der Session");
  sessionCache = {
    restBase: `${websocket.protocol === "wss:" ? "https:" : "http:"}//${websocket.host}`,
    apiKey,
    accessToken: data.accessToken,
    expiresAt: Number(data.expiresAt || Date.now() + 5 * 60_000),
    locationId: data.locationId,
  };
  return sessionCache;
}

async function rpc(name, args, retry = true) {
  const session = await getSession();
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
    if (response.status === 401 && retry) {
      sessionCache = null;
      await getSession({ force: true });
      return rpc(name, args, false);
    }
    throw new Error(data?.message || data?.error || `${name} wurde abgelehnt`);
  }
  return data;
}

function encodedStoragePath(bucketId, objectPath) {
  return [bucketId, ...String(objectPath).split("/")]
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function storageRequest(bucketId, objectPath, options = {}) {
  const session = await getSession();
  const objectRoute = !options.method || options.method === "GET" ? "object/authenticated" : "object";
  const response = await fetch(`${session.restBase}/storage/v1/${objectRoute}/${encodedStoragePath(bucketId, objectPath)}`, {
    ...options,
    headers: {
      apikey: session.apiKey,
      authorization: `Bearer ${session.accessToken}`,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`Medien-Storage abgelehnt (${response.status}): ${raw || "unbekannter Fehler"}`);
  }
  return response;
}

function sourceOptions(current = "owner_upload") {
  const labels = {
    owner_upload: "Vom Betrieb hochgeladen",
    user_supplied: "Bereitgestelltes Original",
    licensed: "Lizenziert",
  };
  return Object.entries(labels)
    .map(([value, label]) => `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`)
    .join("");
}

function card(product) {
  const image = product.image || null;
  return `<article class="media-card" data-product-id="${esc(product.id)}">
    <div class="media-preview">
      ${image ? `<img data-preview data-bucket="${esc(image.bucketId)}" data-path="${esc(image.objectPath)}" alt="${esc(image.altText || "Produktbild-Vorschau")}" />` : '<div class="empty">Noch kein Produktbild hinterlegt.</div>'}
    </div>
    <div class="media-body">
      <div class="media-head"><div><strong>${esc(product.name)}</strong><small>${esc(product.status || "draft")}</small></div>${image?.rightsConfirmed ? '<span class="tag">Rechte bestätigt</span>' : '<span class="tag">nicht öffentlich</span>'}</div>
      ${image ? `<form class="form metadata-form">
        <label>Alternativtext<input name="altText" maxlength="250" required value="${esc(image.altText || "")}" /></label>
        <label>Herkunft<select name="sourceKind">${sourceOptions(image.sourceKind)}</select></label>
        <div class="checks"><label><input name="rightsConfirmed" type="checkbox" ${image.rightsConfirmed ? "checked" : ""}/> Bildrechte bestätigt</label></div>
        <div class="meta">${esc(image.originalFilename || "")} · ${Math.round(Number(image.byteSize || 0) / 1024)} KiB</div>
        <div class="actions"><button class="btn primary" type="submit">Bilddaten speichern</button><button class="btn danger" type="button" data-remove-image>Bild entfernen</button></div>
      </form>` : ""}
      <form class="form upload-form">
        <label>${image ? "Bild ersetzen" : "Bild hochladen"}<input name="file" type="file" accept="image/jpeg,image/png,image/webp,image/avif" required /></label>
        <label>Alternativtext<input name="altText" maxlength="250" required placeholder="Was ist auf dem Produktbild zu sehen?" /></label>
        <label>Herkunft<select name="sourceKind">${sourceOptions("owner_upload")}</select></label>
        <div class="checks"><label><input name="rightsConfirmed" type="checkbox" /> Bildrechte bestätigt</label></div>
        <button class="btn primary" type="submit">${image ? "Neues Bild hochladen" : "Produktbild hochladen"}</button>
      </form>
    </div>
  </article>`;
}

function storageExtension(file) {
  return ({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
  })[file.type] || null;
}

async function imageDimensions(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return { width: null, height: null };
  }
}

async function removeReturnedObject(result) {
  if (!result) return;
  const shouldDelete = result.deleteObject || result.deletePreviousObject;
  const bucketId = result.bucketId || result.previousBucketId;
  const objectPath = result.objectPath || result.previousObjectPath;
  if (shouldDelete && bucketId && objectPath) {
    await storageRequest(bucketId, objectPath, { method: "DELETE" }).catch(() => {});
  }
}

async function uploadImage(event, form, productId) {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const file = form.elements.file.files?.[0];
  const extension = file ? storageExtension(file) : null;
  if (!file || !extension || file.size < 1 || file.size > 10 * 1024 * 1024) {
    message.textContent = "Bitte ein JPEG-, PNG-, WebP- oder AVIF-Bild bis 10 MiB wählen.";
    return;
  }
  const altText = form.elements.altText.value.trim();
  if (!altText) {
    message.textContent = "Alternativtext ist für Produktbilder Pflicht.";
    return;
  }

  button.disabled = true;
  let uploaded = null;
  try {
    const session = await getSession();
    const objectPath = `${session.locationId}/products/${crypto.randomUUID()}.${extension}`;
    uploaded = { bucketId: "mcello-media", objectPath };
    await storageRequest(uploaded.bucketId, uploaded.objectPath, {
      method: "POST",
      headers: { "content-type": file.type, "x-upsert": "false" },
      body: file,
    });
    const dimensions = await imageDimensions(file);
    const result = await rpc("admin_register_product_image_upload", {
      _product_id: productId,
      _location_id: session.locationId,
      _bucket_id: uploaded.bucketId,
      _object_path: uploaded.objectPath,
      _original_filename: file.name.slice(0, 255),
      _mime_type: file.type,
      _byte_size: file.size,
      _width: dimensions.width,
      _height: dimensions.height,
      _alt_text: altText,
      _source_kind: form.elements.sourceKind.value,
      _rights_confirmed: form.elements.rightsConfirmed.checked,
    });
    uploaded = null;
    await removeReturnedObject(result);
    message.textContent = "Produktbild gespeichert. Öffentlich wird es nur mit bestätigten Rechten ausgespielt.";
    await load();
  } catch (error) {
    if (uploaded) await storageRequest(uploaded.bucketId, uploaded.objectPath, { method: "DELETE" }).catch(() => {});
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function saveMetadata(event, form, productId) {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const session = await getSession();
    await rpc("admin_save_product_image_metadata", {
      _product_id: productId,
      _location_id: session.locationId,
      _alt_text: form.elements.altText.value.trim(),
      _source_kind: form.elements.sourceKind.value,
      _rights_confirmed: form.elements.rightsConfirmed.checked,
    });
    message.textContent = "Produktbild-Metadaten gespeichert.";
    await load();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function removeImage(button, productId) {
  if (!window.confirm("Produktbild-Zuordnung wirklich entfernen? Ungenutzte Originaldateien werden anschließend gelöscht.")) return;
  button.disabled = true;
  try {
    const session = await getSession();
    const result = await rpc("admin_remove_product_image", { _product_id: productId, _location_id: session.locationId });
    await removeReturnedObject(result);
    message.textContent = "Produktbild entfernt.";
    await load();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function loadPreviews() {
  for (const url of previewUrls) URL.revokeObjectURL(url);
  previewUrls = [];
  await Promise.all([...grid.querySelectorAll("[data-preview]")].map(async (image) => {
    try {
      const response = await storageRequest(image.dataset.bucket, image.dataset.path);
      const url = URL.createObjectURL(await response.blob());
      previewUrls.push(url);
      image.src = url;
    } catch {
      image.alt = "Vorschau nicht verfügbar";
    }
  }));
}

function bind() {
  grid.querySelectorAll("[data-product-id]").forEach((cardNode) => {
    const productId = cardNode.dataset.productId;
    cardNode.querySelector(".upload-form")?.addEventListener("submit", (event) => uploadImage(event, event.currentTarget, productId));
    cardNode.querySelector(".metadata-form")?.addEventListener("submit", (event) => saveMetadata(event, event.currentTarget, productId));
    cardNode.querySelector("[data-remove-image]")?.addEventListener("click", (event) => removeImage(event.currentTarget, productId));
  });
}

async function load() {
  sync.textContent = "Laden …";
  dot.classList.add("offline");
  try {
    const session = await getSession();
    const snapshot = await rpc("admin_get_product_media", { _location_id: session.locationId });
    const products = Array.isArray(snapshot.products) ? snapshot.products : [];
    grid.innerHTML = products.map(card).join("") || '<div class="notice">Noch keine Produkte vorhanden.</div>';
    bind();
    await loadPreviews();
    sync.textContent = "Admin · verbunden";
    dot.classList.remove("offline");
    message.textContent = "";
  } catch (error) {
    sync.textContent = "nicht verbunden";
    message.textContent = error.message;
  }
}

await load();
