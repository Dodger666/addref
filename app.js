// AD&D Search — static client-side rebuild.
// All data is served as static JSON from ./data/. No backend required.

const DATA = "./data";

const state = {
  index: [],
  publications: {},
  types: {},
  fields: {},         // entity_type -> ordered field list
  byType: {},         // entity_type -> { id: entity } cache (lazy)
  activeResult: -1,
  results: [],
};

const el = {
  search: document.getElementById("search"),
  results: document.getElementById("results"),
  detail: document.getElementById("detail"),
  stats: document.getElementById("stats"),
  footerMeta: document.getElementById("footer-meta"),
};

const TYPE_LABELS = { spell: "Spell", magic_item: "Magic Item", monster: "Monster" };
const SPELL_CLASS_ORDER = ["cleric", "druid", "magic_user", "illusionist"];
const SPELL_CLASS_LABEL = {
  cleric: "Cleric", druid: "Druid", magic_user: "Magic-User", illusionist: "Illusionist",
};
// Magic item categories, in the original app's order (group id -> label).
const MAGIC_ITEM_CATEGORIES = [
  ["potion", "Potions"], ["scroll", "Scrolls"], ["ring", "Rings"],
  ["rod", "Rods"], ["staff", "Staves"], ["wand", "Wands"],
  ["miscellaneous", "Miscellaneous"], ["armor", "Armor"], ["shield", "Shields"],
  ["sword", "Swords"], ["weapon", "Weapons"], ["artifact", "Artifacts"],
];
// Monster source books, in the original app's order.
const MONSTER_BOOK_ORDER = ["mm1", "ff", "mm2"];
// The "core" publication per type; entries from other sources get a superscript tag.
const CORE_PUB = { spell: "phb1", magic_item: "dmg1" };
const PUB_SHORT = { phb1: "PHB", dmg1: "DMG", mm1: "MM", mm2: "MM2", ff: "FF", ua: "UA" };
const ORDINAL = ["Cantrips", "1st level", "2nd level", "3rd level", "4th level", "5th level", "6th level", "7th level", "8th level", "9th level"];

// ---------- data loading ----------

async function getJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

async function boot() {
  const [index, pubs, types, fSpell, fItem, fMonster] = await Promise.all([
    getJSON(`${DATA}/index.json`),
    getJSON(`${DATA}/publications.json`),
    getJSON(`${DATA}/types.json`),
    getJSON(`${DATA}/fields/spell.json`),
    getJSON(`${DATA}/fields/magic_item.json`),
    getJSON(`${DATA}/fields/monster.json`),
  ]);

  state.index = index;
  pubs.forEach((p) => (state.publications[p.id] = p.label));
  types.forEach((t) => (state.types[t.id] = t));
  state.fields = { spell: fSpell, magic_item: fItem, monster: fMonster };

  const counts = { spell: 0, magic_item: 0, monster: 0 };
  index.forEach((e) => (counts[e.entity_type] = (counts[e.entity_type] || 0) + 1));
  el.stats.textContent =
    `${index.length} entries · ${counts.spell} spells · ${counts.magic_item} magic items · ${counts.monster} monsters`;
  el.footerMeta.textContent = `${index.length} entries indexed`;

  el.search.addEventListener("input", onSearchInput);
  el.search.addEventListener("keydown", onSearchKey);
  window.addEventListener("hashchange", route);

  route();
  el.search.focus();
}

async function loadType(entityType) {
  if (state.byType[entityType]) return state.byType[entityType];
  const rows = await getJSON(`${DATA}/by_type/${entityType}.json`);
  const map = {};
  rows.forEach((r) => (map[r.id] = r));
  state.byType[entityType] = map;
  return map;
}

// ---------- search ----------

function scoreMatch(name, q) {
  const n = name.toLowerCase();
  const i = n.indexOf(q);
  if (i === -1) return -1;
  if (n === q) return 1000;
  if (i === 0) return 500 - name.length;
  // word-boundary bonus
  if (i > 0 && /[\s(,-]/.test(n[i - 1])) return 300 - name.length;
  return 100 - i;
}

function search(q) {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const scored = [];
  for (const e of state.index) {
    const s = scoreMatch(e.name, query);
    if (s >= 0) scored.push([s, e]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
  return scored.slice(0, 50).map((x) => x[1]);
}

function onSearchInput() {
  const q = el.search.value;
  if (!q.trim()) {
    if (location.hash.startsWith("#/list/")) route();
    else renderResults([]);
    return;
  }
  state.results = search(q);
  state.activeResult = state.results.length ? 0 : -1;
  renderResults(state.results, { selectable: true });
}

function onSearchKey(ev) {
  if (ev.key === "Escape") {
    el.search.value = "";
    renderResults([]);
    return;
  }
  if (!state.results.length) return;
  if (ev.key === "ArrowDown") {
    ev.preventDefault();
    state.activeResult = Math.min(state.activeResult + 1, state.results.length - 1);
    highlightActive();
  } else if (ev.key === "ArrowUp") {
    ev.preventDefault();
    state.activeResult = Math.max(state.activeResult - 1, 0);
    highlightActive();
  } else if (ev.key === "Enter") {
    ev.preventDefault();
    const e = state.results[state.activeResult];
    if (e) location.hash = `#/entity/${encodeURIComponent(e.id)}`;
  }
}

function highlightActive() {
  const items = el.results.querySelectorAll("li[data-id]");
  items.forEach((li, i) => {
    li.classList.toggle("active", i === state.activeResult);
    if (i === state.activeResult) li.scrollIntoView({ block: "nearest" });
  });
}

// ---------- rendering: results list ----------

function metaFor(e) {
  if (e.entity_type === "spell") {
    const cls = SPELL_CLASS_LABEL[e.spell_class] || e.spell_class || "";
    const lvl = e.level === 0 ? "Cantrip" : `Lvl ${e.level}`;
    return `${cls} · ${lvl}`;
  }
  return state.publications[e.publication] || e.publication || "";
}

function resultItem(e) {
  const li = document.createElement("li");
  li.dataset.id = e.id;
  li.setAttribute("role", "option");
  li.innerHTML = `
    <span class="badge ${e.entity_type}">${TYPE_LABELS[e.entity_type]}</span>
    <span class="r-name"></span>
    <span class="r-meta"></span>`;
  li.querySelector(".r-name").textContent = e.name;
  li.querySelector(".r-meta").textContent = metaFor(e);
  li.addEventListener("click", () => {
    location.hash = `#/entity/${encodeURIComponent(e.id)}`;
  });
  return li;
}

function renderResults(list, opts = {}) {
  el.results.innerHTML = "";
  list.forEach((e) => el.results.appendChild(resultItem(e)));
  if (opts.selectable) highlightActive();
}

// ---------- browse (drill-down, like the original) ----------

function renderBrowse(token) {
  el.search.value = "";
  state.results = [];
  const parts = decodeURIComponent(token).split(".").filter(Boolean);
  const type = parts[0];
  if (!type || !state.types[type]) {
    el.results.innerHTML = "";
    el.detail.innerHTML = `<div class="empty"><h1>Browse</h1><p class="muted">Unknown list.</p></div>`;
    return;
  }
  if (parts.length === 1) renderOverview(type);
  else renderDrill(type, parts.slice(1));
  el.results.scrollTop = 0;
}

function browsePlaceholder(type) {
  const t = state.types[type];
  el.detail.innerHTML = `<div class="empty"><h1>${t ? t.label : "Browse"}</h1>
    <p class="muted">Select an entry to view its details.</p></div>`;
}

function browseNav(current) {
  const items = [["spell", "spells"], ["magic_item", "magic items"], ["monster", "monsters"]];
  return `<nav class="browse-nav">${items
    .map(([id, label]) =>
      id === current
        ? `<span class="current">${label}</span>`
        : `<a href="#/list/${id}">${label}</a>`
    )
    .join('<span class="dot">·</span>')}</nav>`;
}

function spellLevelsFor(cls) {
  const levels = new Set(
    state.index
      .filter((e) => e.entity_type === "spell" && e.spell_class === cls)
      .map((e) => e.level ?? 0)
  );
  return [...levels].sort((a, b) => a - b);
}

function renderOverview(type) {
  let body = "";
  if (type === "spell") {
    body = SPELL_CLASS_ORDER.filter((cls) =>
      state.index.some((e) => e.entity_type === "spell" && e.spell_class === cls)
    )
      .map((cls) => {
        const badges = spellLevelsFor(cls)
          .map(
            (lvl) =>
              `<a class="lvl" href="#/list/spell.${cls}.${lvl}" title="${ORDINAL[lvl]}">${lvl}</a>`
          )
          .join("");
        return `<div class="tax-row">
          <div class="tax-label">${SPELL_CLASS_LABEL[cls] || cls}</div>
          <div class="tax-levels">${badges}</div>
        </div>`;
      })
      .join("");
  } else if (type === "magic_item") {
    const present = new Set(
      state.index.filter((e) => e.entity_type === "magic_item").map((e) => e.group)
    );
    body = `<ul class="tax-list">${MAGIC_ITEM_CATEGORIES.filter(([id]) => present.has(id))
      .map(([id, label]) => `<li><a href="#/list/magic_item.${id}">${label}</a></li>`)
      .join("")}</ul>`;
  } else {
    const present = new Set(
      state.index.filter((e) => e.entity_type === "monster").map((e) => e.publication)
    );
    const books = [
      ...MONSTER_BOOK_ORDER.filter((p) => present.has(p)),
      ...[...present].filter((p) => !MONSTER_BOOK_ORDER.includes(p)).sort(),
    ];
    body = `<ul class="tax-list">${books
      .map((p) => `<li><a href="#/list/monster.${p}">${escapeHtml(state.publications[p] || p)}</a></li>`)
      .join("")}</ul>`;
  }

  el.results.innerHTML = `<div class="browse-left">
    ${browseNav(type)}
    <div class="tax">${body}</div>
  </div>`;
  browsePlaceholder(type);
}

function browseEntry(e, type) {
  const core = CORE_PUB[type];
  const sup =
    core && e.publication && e.publication !== core
      ? ` <sup class="ent-sup">${escapeHtml(PUB_SHORT[e.publication] || e.publication.toUpperCase())}</sup>`
      : "";
  const row = document.createElement("button");
  row.type = "button";
  row.className = "entry-row";
  row.innerHTML = `<span class="ent-name">${escapeHtml(e.name)}</span>${sup}`;
  row.addEventListener("click", () => {
    el.results.querySelectorAll(".entry-row.active").forEach((n) => n.classList.remove("active"));
    row.classList.add("active");
    location.hash = `#/entity/${encodeURIComponent(e.id)}`;
  });
  return row;
}

function renderDrill(type, facets) {
  let items = [];
  let crumbs = [];
  let switcher = "";

  if (type === "spell") {
    const cls = facets[0];
    const lvl = Number(facets[1]);
    items = state.index.filter(
      (e) => e.entity_type === "spell" && e.spell_class === cls && (e.level ?? 0) === lvl
    );
    crumbs = [
      `<a href="#/list/spell">Spells</a>`,
      `<span class="sep">›</span>`,
      `<span class="crumb-mid">${SPELL_CLASS_LABEL[cls] || cls}</span>`,
      `<span class="sep">›</span>`,
      `<span class="crumb-cur">${ORDINAL[lvl] || `Level ${lvl}`}</span>`,
    ];
    switcher = `<div class="switcher">${spellLevelsFor(cls)
      .map((l) =>
        l === lvl ? `<span class="active">${l}</span>` : `<a href="#/list/spell.${cls}.${l}">${l}</a>`
      )
      .join("")}</div>`;
  } else if (type === "magic_item") {
    const cat = facets[0];
    const label = (MAGIC_ITEM_CATEGORIES.find(([id]) => id === cat) || [cat, humanize(cat)])[1];
    items = state.index.filter((e) => e.entity_type === "magic_item" && e.group === cat);
    crumbs = [
      `<a href="#/list/magic_item">Magic items</a>`,
      `<span class="sep">›</span>`,
      `<span class="crumb-cur">${escapeHtml(label)}</span>`,
    ];
    const present = new Set(
      state.index.filter((e) => e.entity_type === "magic_item").map((e) => e.group)
    );
    switcher = `<div class="switcher switcher-wide">${MAGIC_ITEM_CATEGORIES.filter(([id]) => present.has(id))
      .map(([id, l]) =>
        id === cat ? `<span class="active">${l}</span>` : `<a href="#/list/magic_item.${id}">${l}</a>`
      )
      .join("")}</div>`;
  } else {
    const book = facets[0];
    items = state.index.filter((e) => e.entity_type === "monster" && e.publication === book);
    crumbs = [
      `<a href="#/list/monster">Monsters</a>`,
      `<span class="sep">›</span>`,
      `<span class="crumb-cur">${escapeHtml(state.publications[book] || book)}</span>`,
    ];
    const present = new Set(
      state.index.filter((e) => e.entity_type === "monster").map((e) => e.publication)
    );
    const books = [
      ...MONSTER_BOOK_ORDER.filter((p) => present.has(p)),
      ...[...present].filter((p) => !MONSTER_BOOK_ORDER.includes(p)).sort(),
    ];
    switcher = `<div class="switcher switcher-wide">${books
      .map((p) =>
        p === book
          ? `<span class="active">${escapeHtml(state.publications[p] || p)}</span>`
          : `<a href="#/list/monster.${p}">${escapeHtml(state.publications[p] || p)}</a>`
      )
      .join("")}</div>`;
  }

  items.sort((a, b) => a.name.localeCompare(b.name));

  el.results.innerHTML = `<div class="browse-left">
    ${browseNav(type)}
    <nav class="crumb">${crumbs.join(" ")} <span class="crumb-count">${items.length}</span></nav>
    ${switcher}
    <div class="browse-entries" id="browse-entries"></div>
  </div>`;

  browsePlaceholder(type);
  const container = el.results.querySelector("#browse-entries");
  if (!items.length) {
    container.innerHTML = `<p class="muted">No entries.</p>`;
    return;
  }
  items.forEach((e) => container.appendChild(browseEntry(e, type)));
}

// ---------- detail ----------

function labelValuePairs(entityType, data) {
  const fields = state.fields[entityType] || [];
  const pairs = [];
  const used = new Set(fields.map((f) => f.key)); // every schema key is "known"
  for (const f of fields) {
    if (f.parent_key) continue; // keep it simple: top-level fields only
    const v = data[f.key];
    if (v === null || v === undefined || v === "" || v === false) continue;
    pairs.push([f.label, formatValue(f.key, v)]);
  }
  // include any extra keys not covered by the schema
  for (const [k, v] of Object.entries(data)) {
    if (used.has(k) || k === "name" || k === "description" || k === "references") continue;
    if (v === null || v === undefined || v === "" || v === false || typeof v === "object") continue;
    pairs.push([humanize(k), formatValue(k, v)]);
  }
  return pairs;
}

function formatValue(key, v) {
  if (key === "spell_class") return SPELL_CLASS_LABEL[v] || v;
  if (v === true) return "Yes";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function humanize(k) {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statTable(entityType, data) {
  const pairs = labelValuePairs(entityType, data);
  if (!pairs.length) return "";
  const rows = pairs
    .map(([l, v]) => `<tr><th>${escapeHtml(l)}</th><td>${escapeHtml(v)}</td></tr>`)
    .join("");
  return `<div class="statblock"><table>${rows}</table></div>`;
}

async function renderEntity(id) {
  const indexed = state.index.find((e) => e.id === id);
  const entityType = indexed ? indexed.entity_type : id.split(":")[0].replace("-", "_");
  el.detail.innerHTML = `<div class="detail-scroll"><p class="muted">Loading…</p></div>`;
  let entity;
  try {
    const map = await loadType(entityType);
    entity = map[id];
  } catch (err) {
    el.detail.innerHTML = `<div class="detail-scroll"><p class="muted">Failed to load: ${escapeHtml(String(err))}</p></div>`;
    return;
  }
  if (!entity) {
    el.detail.innerHTML = `<div class="empty"><h1>Not found</h1><p class="muted">${escapeHtml(id)}</p></div>`;
    return;
  }

  const name = entity.data?.name || indexed?.name || id;
  const pub = entity.origin?.publication_label || state.publications[entity.origin_publication_id] || "";
  const loc = entity.origin?.locator ? `, p.${entity.origin.locator}` : "";

  let html = `<div class="detail-scroll">
    <h1 class="entry-title">${escapeHtml(name)}</h1>
    <div class="entry-sub">
      <span class="badge ${entity.entity_type}">${TYPE_LABELS[entity.entity_type]}</span>
      &nbsp;${escapeHtml(pub)}${escapeHtml(loc)}
    </div>`;

  const variants = entity.variants || [];
  if (variants.length === 1) {
    html += statTable(entity.entity_type, variants[0].data || {});
  } else if (variants.length > 1) {
    variants.forEach((v) => {
      const vlabel = v.variant_key || v.data?.name || "Variant";
      html += `<div class="statblock"><div class="variant-head">${escapeHtml(vlabel)}</div>
        <table>${labelValuePairs(entity.entity_type, v.data || {})
          .map(([l, val]) => `<tr><th>${escapeHtml(l)}</th><td>${escapeHtml(val)}</td></tr>`)
          .join("")}</table></div>`;
    });
  }

  if (indexed?.variant_names?.length) {
    html += `<p class="muted">Variants:</p><ul class="variant-names">${indexed.variant_names
      .map((n) => `<li>${escapeHtml(n)}</li>`)
      .join("")}</ul>`;
  }

  if (entity.data?.description) {
    html += `<div class="description">${escapeHtml(entity.data.description)}</div>`;
  }

  html += `</div>`;
  el.detail.innerHTML = html;
  el.detail.querySelector(".detail-scroll").scrollTop = 0;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------- routing ----------

function route() {
  const raw = (location.hash || "#/").slice(1); // drop leading '#'
  const qIndex = raw.indexOf("?");
  const path = qIndex === -1 ? raw : raw.slice(0, qIndex);

  if (path.startsWith("/entity/")) {
    renderEntity(decodeURIComponent(path.slice("/entity/".length)));
  } else if (path.startsWith("/list/")) {
    renderBrowse(path.slice("/list/".length));
  } else {
    renderResults([]);
    el.detail.innerHTML = `<div class="empty"><h1>AD&amp;D Search</h1>
      <p>Type to search, or pick a category above to browse.</p>
      <p class="muted">${el.stats.textContent}</p></div>`;
  }
}

boot().catch((err) => {
  el.detail.innerHTML = `<div class="empty"><h1>Failed to start</h1><p class="muted">${escapeHtml(String(err))}</p></div>`;
});
