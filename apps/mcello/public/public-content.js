const knownSections = new Map([
  ["hero", "start"],
  ["quick_order", "bestellen"],
  ["story_team", "ueber"],
  ["news_events", "aktuelles"],
  ["gallery", "galerie"],
  ["contact", "kontakt"],
]);

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[char]);
}

function kindLabel(kind) {
  return ({ news: "News", event: "Event", special: "Special", press: "Presse" })[kind] || kind;
}

function dateLabel(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(date);
}

function applyHomepage(snapshot) {
  if (!snapshot.homepageConfigured) return;
  const main = document.querySelector("main");
  if (!main) return;

  for (const [, id] of knownSections) {
    const section = document.getElementById(id);
    if (section) section.hidden = true;
  }

  for (const config of snapshot.homepageSections || []) {
    const id = knownSections.get(config.sectionKey);
    const section = id ? document.getElementById(id) : null;
    if (!section) continue;
    section.hidden = false;
    main.appendChild(section);
  }
}

function renderEditorial(posts = []) {
  const target = document.querySelector("#newsStack");
  if (!target) return;
  if (!posts.length) {
    target.innerHTML = '<div class="notice">Aktuell sind keine veröffentlichten Meldungen hinterlegt.</div>';
    return;
  }

  target.innerHTML = posts.map((post) => {
    const eventTime = post.kind === "event" && post.eventStartsAt
      ? `<div class="editorial-date">${esc(dateLabel(post.eventStartsAt))}</div>`
      : "";
    return `<article class="news-card no-media">
      <div>
        <div class="tag">${esc(kindLabel(post.kind))}${post.pinned ? " · Highlight" : ""}</div>
        <h3>${esc(post.title)}</h3>
        ${eventTime}
        <p>${esc(post.teaser || post.content || "")}</p>
      </div>
    </article>`;
  }).join("");
}

async function loadPublicContent() {
  try {
    const response = await fetch("/api/content", { cache: "no-store" });
    if (!response.ok) throw new Error("content backend unavailable");
    const snapshot = await response.json();
    applyHomepage(snapshot);
    renderEditorial(snapshot.editorialPosts || []);
  } catch {
    // Static preview remains safe without a local backend. No demo news are injected.
  }
}

loadPublicContent();
