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
// Preferred ordering of publications for the Book filter.
const PUB_ORDER = ["phb1", "dmg1", "mm1", "ff", "mm2", "ua"];

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

// ---------- browse ----------

function renderList(entityType) {
  const t = state.types[entityType];
  const items = state.index.filter((e) => e.entity_type === entityType);
  el.results.innerHTML = "";

  if (entityType === "spell") {
    const byClass = groupBy(items, (e) => e.spell_class || "other");
    for (const cls of SPELL_CLASS_ORDER) {
      if (!byClass[cls]) continue;
      addGroupHead(SPELL_CLASS_LABEL[cls] || cls);
      const byLevel = groupBy(byClass[cls], (e) => e.level ?? 0);
      Object.keys(byLevel)
        .map(Number)
        .sort((a, b) => a - b)
        .forEach((lvl) => {
          addGroupHead(lvl === 0 ? "— Cantrips" : `— Level ${lvl}`, true);
          byLevel[lvl]
            .sort((a, b) => a.name.localeCompare(b.name))
            .forEach((e) => el.results.appendChild(resultItem(e)));
        });
    }
  } else if (entityType === "magic_item") {
    // group by category (Potions, Scrolls, Rings, …)
    const byCat = groupBy(items, (e) => e.group || "miscellaneous");
    const seen = new Set();
    for (const [id, label] of MAGIC_ITEM_CATEGORIES) {
      if (!byCat[id]) continue;
      seen.add(id);
      addGroupHead(label);
      byCat[id]
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((e) => el.results.appendChild(resultItem(e)));
    }
    // any category not in the known list (defensive)
    Object.keys(byCat)
      .filter((id) => !seen.has(id))
      .sort()
      .forEach((id) => {
        addGroupHead(humanize(id));
        byCat[id]
          .sort((a, b) => a.name.localeCompare(b.name))
          .forEach((e) => el.results.appendChild(resultItem(e)));
      });
  } else {
    // monsters: group by source book
    const byPub = groupBy(items, (e) => e.publication || "other");
    const order = [
      ...MONSTER_BOOK_ORDER.filter((p) => byPub[p]),
      ...Object.keys(byPub)
        .filter((p) => !MONSTER_BOOK_ORDER.includes(p))
        .sort((a, b) => (state.publications[a] || a).localeCompare(state.publications[b] || b)),
    ];
    order.forEach((pub) => {
      addGroupHead(state.publications[pub] || pub);
      byPub[pub]
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((e) => el.results.appendChild(resultItem(e)));
    });
  }

  el.detail.innerHTML = `<div class="empty"><h1>${t ? t.label : entityType}</h1>
    <p class="muted">${items.length} entries. Select one to view details.</p></div>`;
}

function addGroupHead(text, sub = false) {
  const div = document.createElement("div");
  div.className = "group-head";
  if (sub) div.style.paddingLeft = "1.1rem";
  div.textContent = text;
  el.results.appendChild(div);
}

function groupBy(arr, fn) {
  const out = {};
  arr.forEach((x) => {
    const k = fn(x);
    (out[k] = out[k] || []).push(x);
  });
  return out;
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

// ---------- filter page ----------

const filterState = { type: "", cls: "", level: "", category: "", book: "" };

function levelOptions() {
  const opts = [["0", "Cantrips"]];
  for (let n = 1; n <= 9; n++) opts.push([String(n), `Level ${n}`]);
  return opts;
}

function buildSelect(id, options, selected) {
  const opts = [`<option value="">All</option>`]
    .concat(
      options.map(
        ([v, l]) =>
          `<option value="${escapeHtml(v)}"${v === selected ? " selected" : ""}>${escapeHtml(l)}</option>`
      )
    )
    .join("");
  return `<select id="${id}">${opts}</select>`;
}

function bookOptions() {
  return Object.keys(state.publications)
    .sort((a, b) => {
      const ia = PUB_ORDER.indexOf(a);
      const ib = PUB_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    })
    .map((id) => [id, state.publications[id]]);
}

function renderFilter(query) {
  el.search.value = "";
  state.results = [];
  el.results.innerHTML = "";

  const p = new URLSearchParams(query || "");
  filterState.type = p.get("type") || "";
  filterState.cls = p.get("class") || "";
  filterState.level = p.get("level") || "";
  filterState.category = p.get("category") || "";
  filterState.book = p.get("book") || "";

  const field = (id, label, inner) =>
    `<div class="filter-field"><label for="${id}">${label}</label>${inner}</div>`;

  el.detail.innerHTML = `<div class="detail-scroll">
    <h1 class="entry-title">Filter</h1>
    <div class="filters">
      ${field("f-type", "Type", buildSelect("f-type", [["spell", "Spells"], ["magic_item", "Magic Items"], ["monster", "Monsters"]], filterState.type))}
      ${field("f-class", "Class", buildSelect("f-class", SPELL_CLASS_ORDER.map((c) => [c, SPELL_CLASS_LABEL[c]]), filterState.cls))}
      ${field("f-level", "Level", buildSelect("f-level", levelOptions(), filterState.level))}
      ${field("f-category", "Category", buildSelect("f-category", MAGIC_ITEM_CATEGORIES, filterState.category))}
      ${field("f-book", "Book", buildSelect("f-book", bookOptions(), filterState.book))}
      <div class="filter-field"><label>&nbsp;</label><button id="f-reset" class="reset-btn">Reset</button></div>
    </div>
    <p class="muted filter-count" id="filter-count"></p>
    <ul class="results filter-results" id="filter-results"></ul>
  </div>`;

  const map = { "f-type": "type", "f-class": "cls", "f-level": "level", "f-category": "category", "f-book": "book" };
  Object.keys(map).forEach((id) => {
    document.getElementById(id).addEventListener("change", (ev) => {
      filterState[map[id]] = ev.target.value;
      syncFilterUrl();
      applyFilter();
    });
  });
  document.getElementById("f-reset").addEventListener("click", () => {
    Object.keys(filterState).forEach((k) => (filterState[k] = ""));
    syncFilterUrl();
    renderFilter("");
  });

  applyFilter();
}

function applyFilter() {
  const f = filterState;
  let list = state.index.slice();
  if (f.type) list = list.filter((e) => e.entity_type === f.type);
  if (f.book) list = list.filter((e) => e.publication === f.book);
  if (f.cls) list = list.filter((e) => e.entity_type === "spell" && e.spell_class === f.cls);
  if (f.level !== "") list = list.filter((e) => e.entity_type === "spell" && String(e.level ?? "") === f.level);
  if (f.category) list = list.filter((e) => e.entity_type === "magic_item" && (e.group || "") === f.category);
  list.sort((a, b) => a.name.localeCompare(b.name));

  const container = document.getElementById("filter-results");
  const count = document.getElementById("filter-count");
  if (!container || !count) return;
  container.innerHTML = "";
  list.slice(0, 500).forEach((e) => container.appendChild(resultItem(e)));
  count.textContent =
    `${list.length} match${list.length === 1 ? "" : "es"}` +
    (list.length > 500 ? " · showing first 500" : "");
}

function syncFilterUrl() {
  const f = filterState;
  const p = new URLSearchParams();
  if (f.type) p.set("type", f.type);
  if (f.cls) p.set("class", f.cls);
  if (f.level !== "") p.set("level", f.level);
  if (f.category) p.set("category", f.category);
  if (f.book) p.set("book", f.book);
  const qs = p.toString();
  history.replaceState(null, "", "#/filter" + (qs ? `?${qs}` : ""));
}

// ---------- routing ----------

function route() {
  const raw = (location.hash || "#/").slice(1); // drop leading '#'
  const qIndex = raw.indexOf("?");
  const path = qIndex === -1 ? raw : raw.slice(0, qIndex);
  const query = qIndex === -1 ? "" : raw.slice(qIndex + 1);

  if (path.startsWith("/entity/")) {
    renderEntity(decodeURIComponent(path.slice("/entity/".length)));
  } else if (path.startsWith("/list/")) {
    el.search.value = "";
    state.results = [];
    renderList(path.slice("/list/".length));
  } else if (path.startsWith("/filter")) {
    renderFilter(query);
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
