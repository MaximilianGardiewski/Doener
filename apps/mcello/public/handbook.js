const params = new URLSearchParams(location.search);
const requestedRole = params.get("role") === "admin" ? "admin" : "staff";
document.body.dataset.operationsRole = requestedRole;

const SOURCES = [
  { key: "shared", label: "Grundlagen", href: "/handbook/shared.md", roles: ["admin", "staff"] },
  { key: "staff", label: "Betrieb & KDS", href: "/handbook/staff.md", roles: ["admin", "staff"] },
  { key: "admin", label: "Admin", href: "/handbook/admin.md", roles: ["admin"] },
];

const tabs = document.querySelector("#handbookTabs");
const search = document.querySelector("#handbookSearch");
const status = document.querySelector("#handbookStatus");
const results = document.querySelector("#handbookResults");
const roleBadge = document.querySelector("#handbookRole");
roleBadge.textContent = requestedRole === "admin" ? "Admin" : "Staff";

const available = SOURCES.filter((source) => source.roles.includes(requestedRole));
const docs = new Map();
let activeKey = available[0]?.key;

for (const source of available) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "handbook-tab";
  button.dataset.key = source.key;
  button.setAttribute("role", "tab");
  button.textContent = source.label;
  button.addEventListener("click", () => {
    activeKey = source.key;
    search.value = "";
    render();
  });
  tabs.append(button);
}

await Promise.all(available.map(async (source) => {
  const response = await fetch(source.href);
  if (!response.ok) throw new Error(`Handbuchquelle fehlt: ${source.href}`);
  docs.set(source.key, parseMarkdown(await response.text()));
})).catch((error) => {
  status.textContent = error.message;
});

search.addEventListener("input", render);
render();

function render() {
  const query = search.value.trim().toLocaleLowerCase("de");
  results.replaceChildren();
  for (const button of tabs.querySelectorAll("button")) {
    button.setAttribute("aria-selected", String(!query && button.dataset.key === activeKey));
  }

  const pools = query ? available : available.filter((source) => source.key === activeKey);
  const matches = [];
  for (const source of pools) {
    for (const section of docs.get(source.key) || []) {
      if (!query || section.searchText.includes(query)) matches.push({ source, section });
    }
  }

  status.textContent = query
    ? `${matches.length} Treffer für „${search.value.trim()}“`
    : `${matches.length} Abschnitte · ${available.find((source) => source.key === activeKey)?.label || "Handbuch"}`;

  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "handbook-empty";
    empty.textContent = "Keine passenden Handbuchabschnitte gefunden.";
    results.append(empty);
    return;
  }

  for (const { source, section } of matches) {
    const article = document.createElement("article");
    article.className = "handbook-section";
    article.dataset.source = source.key;
    for (const block of section.blocks) article.append(renderBlock(block));
    results.append(article);
  }
}

function parseMarkdown(raw) {
  const lines = raw.replace(/\r/g, "").split("\n");
  const sections = [];
  let current = { blocks: [], text: [] };
  const flush = () => {
    if (!current.blocks.length) return;
    current.searchText = current.text.join(" ").toLocaleLowerCase("de");
    sections.push(current);
    current = { blocks: [], text: [] };
  };

  let list = null;
  const flushList = () => {
    if (!list) return;
    current.blocks.push(list);
    list = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flushList(); continue; }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushList();
      if (heading[1].length <= 2 && current.blocks.length) flush();
      current.blocks.push({ type: `h${Math.min(heading[1].length + 1, 3)}`, text: heading[2] });
      current.text.push(heading[2]);
      continue;
    }
    const item = trimmed.match(/^[-*]\s+(.+)$/);
    if (item) {
      if (!list) list = { type: "ul", items: [] };
      list.items.push(item[1]);
      current.text.push(item[1]);
      continue;
    }
    flushList();
    current.blocks.push({ type: "p", text: trimmed });
    current.text.push(trimmed);
  }
  flushList();
  flush();
  return sections;
}

function renderBlock(block) {
  if (block.type === "ul") {
    const ul = document.createElement("ul");
    for (const text of block.items) {
      const li = document.createElement("li");
      li.textContent = text;
      ul.append(li);
    }
    return ul;
  }
  const el = document.createElement(block.type);
  el.textContent = block.text;
  return el;
}