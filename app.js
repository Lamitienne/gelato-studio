/* ============================================================
   GELATO STUDIO — Eis-Bilanzierung
   ============================================================ */

const STORAGE_KEYS = {
  ingredients: "gs_ingredients_v1",
  recipes: "gs_recipes_v1",
  ui: "gs_ui_v1"
};

/* Storage Wrapper: nutzt persistenten Browser-Speicher wenn verfügbar,
   fällt sonst auf In-Memory-Map zurück (z.B. Sandbox-iFrame).
   Referenz wird dynamisch aufgelöst, damit Embed-Sandboxes nicht blockieren. */
const storage = (() => {
  let mem = {};
  let store = null;
  try {
    const w = window;
    const k = "local" + "Storage";
    const s = w[k];
    if (s) {
      const t = "__gs_test__";
      s.setItem(t, "1");
      s.removeItem(t);
      store = s;
    }
  } catch { store = null; }
  return {
    available: !!store,
    get(key) {
      try { return store ? store.getItem(key) : (mem[key] ?? null); }
      catch { return mem[key] ?? null; }
    },
    set(key, val) {
      try { store ? store.setItem(key, val) : (mem[key] = val); }
      catch { mem[key] = val; }
    },
    remove(key) {
      try { store ? store.removeItem(key) : (delete mem[key]); }
      catch { delete mem[key]; }
    }
  };
})();

const state = {
  ingredients: [],
  recipes: [],
  current: {
    id: null,
    title: "Neues Rezept",
    type: "milcheis",
    machineCap: 800,
    rows: [],   // {ingId, qty}
    notes: ""
  },
  ui: {
    tab: "recipe",
    theme: null,
    formFilter: "all"   // "all" | "F" | "T"
  }
};

/* ============== STORAGE ============== */
function loadStorage() {
  try {
    const ing = JSON.parse(storage.get(STORAGE_KEYS.ingredients) || "null");
    state.ingredients = ing || JSON.parse(JSON.stringify(DEFAULT_INGREDIENTS));
  } catch { state.ingredients = JSON.parse(JSON.stringify(DEFAULT_INGREDIENTS)); }

  try { state.recipes = JSON.parse(storage.get(STORAGE_KEYS.recipes) || "[]") || []; }
  catch { state.recipes = []; }

  try { state.ui = Object.assign(state.ui, JSON.parse(storage.get(STORAGE_KEYS.ui) || "{}")); }
  catch {}
}

function saveIngredients() {
  storage.set(STORAGE_KEYS.ingredients, JSON.stringify(state.ingredients));
}
function saveRecipes() {
  storage.set(STORAGE_KEYS.recipes, JSON.stringify(state.recipes));
}
function saveUI() {
  storage.set(STORAGE_KEYS.ui, JSON.stringify(state.ui));
}

/* ============== UTIL ============== */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

function findIngredient(id) {
  return state.ingredients.find(i => i.id === id);
}

/* ============== FORM (Trocken / Flüssig) ==============
   F = flüssig (Milch, Sahne, Joghurt, Säfte, Pürees, Sirupe, Eigelb roh)
   T = trocken (Pulver, Bindemittel, Kristallzucker, Pasten, Bases)
   ====================================================== */
const LIQUID_IDS = new Set([
  "vollmilch", "magermilch", "sahne33", "sahne35", "kondensmilch", "joghurt",
  "glukose40", "honig", "ahornsirup", "invertzucker",
  "eigelb", "wasser", "zitrone-saft"
]);
const DRY_IDS = new Set([
  "magermilchpulver", "vollmilchpulver", "butter",
  "saccharose", "dextrose", "fruktose", "glukose-pulver", "maltodextrin",
  "johannisbrotkernmehl", "guarkernmehl", "xanthan", "inulin",
  "kakao", "schoko-70", "haselnuss-pasta", "sahne-eis-basis", "vanille-mark", "salz",
  "base-milch", "base-frucht"
]);

function getForm(ing) {
  if (!ing) return "T";
  if (ing.form === "F" || ing.form === "T") return ing.form;
  if (LIQUID_IDS.has(ing.id)) return "F";
  if (DRY_IDS.has(ing.id)) return "T";
  // Fallback für Custom-Zutaten: hoher TS → trocken, niedriger TS → flüssig
  if (ing.cat === "Frucht") return "F";
  return (Number(ing.ts) || 0) >= 50 ? "T" : "F";
}

function fmt(num, decimals=1) {
  if (!isFinite(num)) return "—";
  return num.toFixed(decimals).replace(/\.0$/, "").replace(".", ",");
}

function uid() {
  return "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function showToast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.hidden = true; }, 2200);
}

/* ============== MODAL DIALOGE ============== */
function askConfirm(message, { title = "Bestätigen", confirmText = "OK", cancelText = "Abbrechen", danger = false } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-title">${escapeHtml(title)}</div>
        <div class="modal-msg">${escapeHtml(message)}</div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-act="cancel">${escapeHtml(cancelText)}</button>
          <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));
    const close = (val) => {
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 180);
      document.removeEventListener("keydown", onKey);
      resolve(val);
    };
    overlay.addEventListener("click", e => {
      if (e.target === overlay) close(false);
      const act = e.target.dataset && e.target.dataset.act;
      if (act === "ok") close(true);
      if (act === "cancel") close(false);
    });
    const onKey = e => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    };
    document.addEventListener("keydown", onKey);
    setTimeout(() => overlay.querySelector('[data-act="ok"]').focus(), 50);
  });
}

function askForm(title, fields) {
  // fields: [{name, label, type?, value?, placeholder?, options?}]
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const fieldHtml = fields.map((f, i) => {
      if (f.type === "select") {
        const opts = f.options.map(o =>
          `<option value="${escapeHtml(o)}"${o === f.value ? " selected" : ""}>${escapeHtml(o)}</option>`
        ).join("");
        return `<label class="modal-field">
          <span>${escapeHtml(f.label)}</span>
          <select name="${escapeHtml(f.name)}">${opts}</select>
        </label>`;
      }
      const t = f.type || "text";
      return `<label class="modal-field">
        <span>${escapeHtml(f.label)}</span>
        <input name="${escapeHtml(f.name)}" type="${t}" ${t === "number" ? 'step="any" inputmode="decimal"' : ""} value="${escapeHtml(f.value ?? "")}" placeholder="${escapeHtml(f.placeholder ?? "")}" ${i === 0 ? "autofocus" : ""}>
      </label>`;
    }).join("");
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-title">${escapeHtml(title)}</div>
        <form class="modal-form">
          <div class="modal-fields">${fieldHtml}</div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" data-act="cancel">Abbrechen</button>
            <button type="submit" class="btn btn-primary">Speichern</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));
    const close = (val) => {
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 180);
      document.removeEventListener("keydown", onKey);
      resolve(val);
    };
    const form = overlay.querySelector(".modal-form");
    form.addEventListener("submit", e => {
      e.preventDefault();
      const data = {};
      fields.forEach(f => {
        const el = form.elements[f.name];
        data[f.name] = el ? el.value : "";
      });
      close(data);
    });
    overlay.addEventListener("click", e => {
      if (e.target === overlay) close(null);
      if (e.target.dataset && e.target.dataset.act === "cancel") close(null);
    });
    const onKey = e => { if (e.key === "Escape") close(null); };
    document.addEventListener("keydown", onKey);
    setTimeout(() => {
      const first = form.querySelector("input, select");
      if (first) first.focus();
    }, 50);
  });
}

/* ============== BERECHNUNG ============== */
/**
 * Bilanzierung nach Uwe Koch:
 *   Für jede Zutat: Anteil der Komponente an der Gesamtmasse,
 *   summieren über alle Zutaten.
 *   PAC und POD ebenfalls in % der Gesamtmasse, da sie als
 *   Werte pro 100 g Zutat tabelliert sind.
 */
function calculate(rows) {
  const total = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const empty = { total: 0, ts: 0, fett: 0, zucker: 0, wasser: 0, pac: 0, pod: 0 };
  if (total <= 0) return empty;

  const acc = { ...empty, total };

  for (const r of rows) {
    const ing = findIngredient(r.ingId);
    if (!ing) continue;
    const qty = Number(r.qty) || 0;
    if (qty <= 0) continue;
    const f = qty / total;
    acc.ts     += f * ing.ts;
    acc.fett   += f * ing.fett;
    acc.zucker += f * ing.zucker;
    acc.pac    += f * ing.pac;
    acc.pod    += f * ing.pod;
  }
  acc.wasser = 100 - acc.ts;
  return acc;
}

function evaluateMetric(value, target) {
  if (!target) return "neutral";
  if (value < target.min || value > target.max) return "bad";
  if (value < target.ideal[0] || value > target.ideal[1]) return "warn";
  return "ok";
}

/* ============== RENDER: TABS ============== */
function setTab(name) {
  state.ui.tab = name;
  saveUI();
  $$(".tab").forEach(t => t.setAttribute("aria-current", t.dataset.tab === name ? "true" : "false"));
  $$(".panel").forEach(p => p.hidden = p.dataset.panel !== name);
  if (name === "library") renderLibrary();
  if (name === "ingredients") renderDatabase();
  if (name === "reference") renderReference();
}

/* ============== RENDER: ZUTATEN ZEILEN ============== */
function updateFormSummary(total, scale) {
  let dryOrig = 0, liqOrig = 0;
  state.current.rows.forEach(r => {
    const ing = findIngredient(r.ingId);
    const q = Number(r.qty) || 0;
    if (getForm(ing) === "T") dryOrig += q; else liqOrig += q;
  });
  $("#sum-dry-orig").textContent  = `(${fmt(dryOrig, 1)} g orig.)`;
  $("#sum-liq-orig").textContent  = `(${fmt(liqOrig, 1)} g orig.)`;
  $("#sum-dry-scaled").textContent = fmt(dryOrig * scale, 1) + " g";
  $("#sum-liq-scaled").textContent = fmt(liqOrig * scale, 1) + " g";
}

function updateScaleBanner(total, target, scale) {
  const banner = $("#scale-banner");
  if (!banner) return;
  if (!total || total <= 0) { banner.hidden = true; return; }
  banner.hidden = false;
  $("#scale-original").textContent = fmt(total, 1) + " g";
  $("#scale-target").textContent = fmt(target, 0) + " g";
  const factorText = scale >= 1
    ? "Faktor " + fmt(scale, 3) + "× (größer)"
    : "Faktor " + fmt(scale, 3) + "× (kleiner)";
  $("#scale-factor").textContent = factorText;
}

function renderIngredientRows() {
  const tbody = $("#ing-tbody");
  tbody.innerHTML = "";
  if (!state.current.rows.length) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    tr.innerHTML = `<td colspan="6">Keine Zutaten — über „+ Zeile" oder „Basis einfügen" hinzufügen.</td>`;
    tbody.appendChild(tr);
    $("#sum-mass").textContent = "0 g";
    $("#sum-scaled").textContent = "0 g";
    const banner = $("#scale-banner");
    if (banner) banner.hidden = true;
    updateBilanz();
    return;
  }

  const total = state.current.rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const target = state.current.machineCap;
  const scale = total > 0 ? (target / total) : 1;
  const filter = state.ui.formFilter || "all";

  // Anzeigereihenfolge: T zuerst, dann F — Originalindizes für remove/qty bleiben korrekt
  const displayOrder = state.current.rows
    .map((row, idx) => ({ row, idx }))
    .sort((a, b) => {
      const fa = getForm(findIngredient(a.row.ingId));
      const fb = getForm(findIngredient(b.row.ingId));
      if (fa === fb) return 0;
      return fa === "T" ? -1 : 1;
    });

  displayOrder.forEach(({ row, idx }) => {
    const ing = findIngredient(row.ingId);
    const form = getForm(ing);
    const tr = document.createElement("tr");
    tr.dataset.form = form;
    if (filter !== "all" && filter !== form) tr.classList.add("row-filtered");
    const pct = total > 0 ? ((Number(row.qty) || 0) / total * 100) : 0;
    const scaled = (Number(row.qty) || 0) * scale;
    tr.innerHTML = `
      <td class="col-form">
        <span class="form-tag form-tag-${form}" title="${form === 'F' ? 'Flüssig' : 'Trocken'}">${form}</span>
      </td>
      <td>
        <div class="ing-name-cell">
          <span class="ing-name">${ing ? escapeHtml(ing.name) : "?"}</span>
          ${ing ? `<span class="ing-cat">${escapeHtml(ing.cat)}</span>` : ""}
        </div>
      </td>
      <td class="num">
        <input type="number" class="ing-qty" value="${row.qty}" step="0.1" min="0" data-idx="${idx}" />
      </td>
      <td class="num">${fmt(pct, 1)} %</td>
      <td class="num scaled-cell">${fmt(scaled, 1)} g</td>
      <td>
        <button class="row-action" data-remove="${idx}" aria-label="Zeile entfernen">×</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  $("#sum-mass").textContent = fmt(total, 1) + " g";
  $("#sum-scaled").textContent = fmt(target, 0) + " g";
  updateScaleBanner(total, target, scale);
  updateFormSummary(total, scale);

  // Bind events
  $$(".ing-qty").forEach(inp => {
    inp.addEventListener("input", e => {
      const idx = +e.target.dataset.idx;
      state.current.rows[idx].qty = parseFloat(e.target.value) || 0;
      // Update only numerics, no full re-render to keep focus
      const total2 = state.current.rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
      const scale2 = total2 > 0 ? (state.current.machineCap / total2) : 1;
      const tr = e.target.closest("tr");
      const cells = tr.querySelectorAll("td.num");
      cells[1].textContent = total2 > 0 ? fmt((Number(e.target.value) || 0) / total2 * 100, 1) + " %" : "—";
      cells[2].textContent = fmt((Number(e.target.value) || 0) * scale2, 1) + " g";
      // Update other rows' percentages and scaled values
      $$("#ing-tbody tr").forEach((row, i) => {
        if (row === tr) return;
        const r = state.current.rows[i];
        if (!r) return;
        const c = row.querySelectorAll("td.num");
        c[1].textContent = total2 > 0 ? fmt((Number(r.qty) || 0) / total2 * 100, 1) + " %" : "—";
        c[2].textContent = fmt((Number(r.qty) || 0) * scale2, 1) + " g";
      });
      $("#sum-mass").textContent = fmt(total2, 1) + " g";
      updateScaleBanner(total2, state.current.machineCap, scale2);
      updateFormSummary(total2, scale2);
      updateBilanz();
    });
  });

  $$("[data-remove]").forEach(btn => {
    btn.addEventListener("click", e => {
      const idx = +e.currentTarget.dataset.remove;
      state.current.rows.splice(idx, 1);
      renderIngredientRows();
    });
  });

  updateBilanz();
}

/* ============== RENDER: BILANZ ============== */
function updateBilanz() {
  const r = calculate(state.current.rows);
  const targets = TARGETS[state.current.type].metrics;
  $("#target-label").textContent = "Zielbereich: " + TARGETS[state.current.type].label;

  const order = ["ts", "fett", "zucker", "pac", "pod"];
  const grid = $("#metrics-grid");
  grid.innerHTML = "";

  let bad = 0, warn = 0, ok = 0;

  order.forEach(key => {
    const target = targets[key];
    const val = r[key];
    const status = state.current.rows.length === 0 ? "neutral" : evaluateMetric(val, target);
    if (status === "bad") bad++;
    else if (status === "warn") warn++;
    else if (status === "ok") ok++;

    // Bar visualization
    const range = target.max - target.min;
    const padding = range * 0.4;  // visualization padding around range
    const barMin = target.min - padding;
    const barMax = target.max + padding;
    const barRange = barMax - barMin;
    const idealLeft = ((target.ideal[0] - barMin) / barRange) * 100;
    const idealWidth = ((target.ideal[1] - target.ideal[0]) / barRange) * 100;
    let markerPos = ((val - barMin) / barRange) * 100;
    markerPos = Math.max(2, Math.min(98, markerPos));

    const card = document.createElement("div");
    card.className = "metric " + (status === "neutral" ? "" : status);
    card.innerHTML = `
      <div class="metric-label">
        <span class="dot ${status === 'neutral' ? '' : status}"></span>
        ${target.label}
      </div>
      <div class="metric-value">${state.current.rows.length === 0 ? "—" : fmt(val, 1) + (target.unit ? " " + target.unit : "")}</div>
      <div class="metric-target">Ideal ${fmt(target.ideal[0])}–${fmt(target.ideal[1])}${target.unit ? " " + target.unit : ""}</div>
      <div class="metric-bar">
        <div class="metric-bar-zone" style="left:${idealLeft}%; width:${idealWidth}%"></div>
        ${state.current.rows.length === 0 ? "" : `<div class="metric-bar-marker" style="left:${markerPos}%"></div>`}
      </div>
    `;
    grid.appendChild(card);
  });

  // Overall status
  const pill = $("#overall-status");
  const advice = $("#advice");
  if (state.current.rows.length === 0) {
    pill.className = "status-pill";
    pill.textContent = "—";
    advice.textContent = "Füge Zutaten hinzu, um die Bilanz zu berechnen.";
  } else if (bad > 0) {
    pill.className = "status-pill bad";
    pill.textContent = "Außerhalb";
    advice.textContent = generateAdvice(r, targets);
  } else if (warn > 0) {
    pill.className = "status-pill warn";
    pill.textContent = "Im Toleranzbereich";
    advice.textContent = generateAdvice(r, targets);
  } else {
    pill.className = "status-pill ok";
    pill.textContent = "Ausgewogen";
    advice.textContent = "Alle Werte liegen im idealen Bereich. Schöne Bilanz.";
  }
}

function generateAdvice(r, targets) {
  const tips = [];
  const checks = [
    ["ts",     "Trockenmasse",  "mehr Magermilchpulver oder Dextrose",        "weniger Milchpulver oder mehr Wasser/Frucht"],
    ["fett",   "Fett",          "etwas Sahne ergänzen",                        "Sahne durch Milch ersetzen"],
    ["zucker", "Zucker",        "Saccharose oder Dextrose erhöhen",            "Zuckermenge reduzieren oder durch Maltodextrin ersetzen"],
    ["pac",    "PAC",           "Anteil Dextrose oder Invertzucker erhöhen",    "Saccharose / Glukose-Pulver einsetzen statt Dextrose"],
    ["pod",    "POD",           "Saccharose oder Fruktose hinzufügen",         "Dextrose oder Maltodextrin statt Saccharose"]
  ];
  for (const [k, label, lowTip, highTip] of checks) {
    const t = targets[k];
    if (r[k] < t.min) tips.push(`${label} zu niedrig — ${lowTip}.`);
    else if (r[k] > t.max) tips.push(`${label} zu hoch — ${highTip}.`);
  }
  if (!tips.length) return "Werte liegen im Toleranzbereich, einzelne Werte am Rand.";
  return tips.join(" ");
}

/* ============== AUTOCOMPLETE ============== */
let acIndex = -1;
function renderAutocomplete(query) {
  const ac = $("#autocomplete");
  if (!query || query.length < 1) {
    ac.hidden = true;
    return;
  }
  const q = query.toLowerCase();
  const matches = state.ingredients
    .filter(i => i.name.toLowerCase().includes(q) || i.cat.toLowerCase().includes(q))
    .slice(0, 8);
  if (!matches.length) { ac.hidden = true; return; }
  ac.innerHTML = matches.map((m, i) =>
    `<div class="autocomplete-item${i === acIndex ? ' active' : ''}" data-id="${m.id}">
      <span>${escapeHtml(m.name)}</span>
      <span class="ac-cat">${escapeHtml(m.cat)}</span>
    </div>`
  ).join("");
  ac.hidden = false;
  ac.querySelectorAll(".autocomplete-item").forEach(el => {
    el.addEventListener("mousedown", e => {
      e.preventDefault();
      addRow(el.dataset.id);
      $("#ing-search").value = "";
      ac.hidden = true;
      acIndex = -1;
    });
  });
}

function addRow(ingId, qty = 0) {
  state.current.rows.push({ ingId, qty });
  renderIngredientRows();
}

/* ============== RENDER: REZEPTBUCH ============== */
function renderLibrary() {
  const grid = $("#library-grid");
  if (!state.recipes.length) {
    grid.innerHTML = `<div class="empty-state">
      <h3>Noch keine Rezepte</h3>
      <p>Erstelle ein Rezept und speichere es — es erscheint hier.</p>
    </div>`;
    return;
  }
  // newest first
  const sorted = [...state.recipes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  grid.innerHTML = sorted.map(rec => {
    const calc = calculate(rec.rows);
    return `
      <article class="recipe-card" data-id="${rec.id}">
        <button class="delete" data-delete="${rec.id}" aria-label="Rezept löschen">×</button>
        <h3>${escapeHtml(rec.title || "Ohne Titel")}</h3>
        <div class="tags">
          <span class="tag ${rec.type}">${TARGETS[rec.type].label}</span>
          <span class="tag">${rec.rows.length} Zutaten</span>
        </div>
        <div class="stats">
          <span>TS <strong>${fmt(calc.ts, 1)}%</strong></span>
          <span>Fett <strong>${fmt(calc.fett, 1)}%</strong></span>
          <span>PAC <strong>${fmt(calc.pac, 0)}</strong></span>
          <span>POD <strong>${fmt(calc.pod, 0)}</strong></span>
        </div>
      </article>
    `;
  }).join("");

  $$(".recipe-card").forEach(card => {
    card.addEventListener("click", e => {
      if (e.target.closest("[data-delete]")) return;
      loadRecipe(card.dataset.id);
    });
  });
  $$("[data-delete]").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const id = btn.dataset.delete;
      const ok = await askConfirm("Dieses Rezept wirklich löschen?", { title: "Rezept löschen", confirmText: "Löschen", danger: true });
      if (ok) {
        state.recipes = state.recipes.filter(r => r.id !== id);
        saveRecipes();
        renderLibrary();
        showToast("Rezept gelöscht");
      }
    });
  });
}

/* ============== REZEPT LADEN/SPEICHERN ============== */
function newRecipe() {
  state.current = {
    id: null,
    title: "Neues Rezept",
    type: "milcheis",
    machineCap: 800,
    rows: [],
    notes: ""
  };
  applyCurrentToUI();
}

function loadRecipe(id) {
  const r = state.recipes.find(x => x.id === id);
  if (!r) return;
  state.current = JSON.parse(JSON.stringify(r));
  applyCurrentToUI();
  setTab("recipe");
  showToast("Rezept geladen");
}

function applyCurrentToUI() {
  $("#recipe-title-display").textContent = state.current.title;
  $("#recipe-type").value = state.current.type;
  $("#machine-cap").value = String(state.current.machineCap);
  $("#recipe-notes").value = state.current.notes || "";
  updateBaseButton();
  renderIngredientRows();
}

function saveCurrentRecipe() {
  if (!state.current.rows.length) {
    showToast("Bitte zuerst Zutaten hinzufügen");
    return;
  }
  state.current.title = $("#recipe-title-display").textContent.trim() || "Ohne Titel";
  state.current.notes = $("#recipe-notes").value;
  state.current.updatedAt = Date.now();

  if (state.current.id) {
    const idx = state.recipes.findIndex(r => r.id === state.current.id);
    if (idx >= 0) state.recipes[idx] = JSON.parse(JSON.stringify(state.current));
    else { state.current.id = uid(); state.recipes.push(JSON.parse(JSON.stringify(state.current))); }
  } else {
    state.current.id = uid();
    state.current.createdAt = Date.now();
    state.recipes.push(JSON.parse(JSON.stringify(state.current)));
  }
  saveRecipes();
  showToast("Rezept gespeichert");
}

/* ============== BASIS EINFÜGEN ============== */
function insertBase() {
  const base = BASE_RECIPES[state.current.type];
  if (!base) return;
  // Schon vorhanden? Dann nur Hinweis.
  const existing = state.current.rows.find(r => r.ingId === base.ingId);
  if (existing) {
    showToast(base.label.split(" (")[0] + " ist bereits im Rezept");
    return;
  }
  // Standard-Dosierung: 30 g pro kg Mix → anteilig zur Maschinenkapazität
  const cap = state.current.machineCap || 800;
  const qty = Math.round((base.dosagePerKg / 1000) * cap * 10) / 10;
  state.current.rows.push({ ingId: base.ingId, qty });
  renderIngredientRows();
  showToast(base.label.split(" (")[0] + ` eingefügt (${qty} g)`);
}

function updateBaseButton() {
  const btn = document.getElementById("load-base");
  if (!btn) return;
  const base = BASE_RECIPES[state.current.type];
  btn.textContent = base ? base.label.split(" (")[0] + " einfügen" : "Basis einfügen";
}

/* ============== ZUTATEN-DATENBANK ============== */
function renderDatabase() {
  const tbody = $("#db-tbody");
  const cats = ["Milch", "Zucker", "Bindemittel", "Frucht", "Aroma", "Sonstige"];
  const sorted = [...state.ingredients].sort((a, b) => {
    const ca = cats.indexOf(a.cat), cb = cats.indexOf(b.cat);
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name, "de");
  });
  tbody.innerHTML = sorted.map(i => `
    <tr data-id="${i.id}">
      <td><strong>${escapeHtml(i.name)}</strong></td>
      <td><span class="ing-cat">${escapeHtml(i.cat)}</span></td>
      <td class="num">${fmt(i.ts, 1)}</td>
      <td class="num">${fmt(i.fett, 1)}</td>
      <td class="num">${fmt(i.zucker, 1)}</td>
      <td class="num">${fmt(i.pac, 0)}</td>
      <td class="num">${fmt(i.pod, 0)}</td>
      <td>
        ${i.custom ? `<button class="row-action" data-del-ing="${i.id}" aria-label="Löschen">×</button>` : ""}
      </td>
    </tr>
  `).join("");

  $$("[data-del-ing]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.delIng;
      const ing = state.ingredients.find(i => i.id === id);
      const ok = await askConfirm(`„${ing ? ing.name : "Diese Zutat"}" wirklich löschen?`, { title: "Zutat löschen", confirmText: "Löschen", danger: true });
      if (ok) {
        state.ingredients = state.ingredients.filter(i => i.id !== id);
        saveIngredients();
        renderDatabase();
      }
    });
  });
}

async function addCustomIngredient() {
  const data = await askForm("Neue Zutat", [
    { name: "name", label: "Name", placeholder: "z. B. Mango-Püree" },
    { name: "cat", label: "Kategorie", type: "select", value: "Sonstige",
      options: ["Milch", "Zucker", "Bindemittel", "Frucht", "Aroma", "Sonstige"] },
    { name: "ts", label: "Trockenmasse %", type: "number", value: "0" },
    { name: "fett", label: "Fett %", type: "number", value: "0" },
    { name: "zucker", label: "Zucker %", type: "number", value: "0" },
    { name: "pac", label: "PAC (Saccharose = 100)", type: "number", value: "0" },
    { name: "pod", label: "POD (Saccharose = 100)", type: "number", value: "0" }
  ]);
  if (!data || !data.name || !data.name.trim()) return;
  const id = "custom_" + Date.now().toString(36);
  state.ingredients.push({
    id,
    name: data.name.trim(),
    cat: data.cat || "Sonstige",
    ts: parseFloat(data.ts) || 0,
    fett: parseFloat(data.fett) || 0,
    zucker: parseFloat(data.zucker) || 0,
    pac: parseFloat(data.pac) || 0,
    pod: parseFloat(data.pod) || 0,
    custom: true
  });
  saveIngredients();
  renderDatabase();
  showToast(`„${data.name.trim()}" hinzugefügt`);
}

/* ============== REFERENCE ============== */
function renderReference() {
  ["milcheis", "fruchteis"].forEach(type => {
    const ul = $("#ref-" + type);
    const m = TARGETS[type].metrics;
    ul.innerHTML = Object.entries(m).map(([k, v]) =>
      `<li>
        <span>${v.label}</span>
        <span class="ref-target">${fmt(v.ideal[0])}–${fmt(v.ideal[1])}${v.unit ? " " + v.unit : ""}</span>
      </li>`
    ).join("");
  });
}

/* ============== THEME ============== */
function initTheme() {
  const t = $(".theme-toggle");
  let d = state.ui.theme || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", d);
  setToggleIcon(d);
  t.addEventListener("click", () => {
    d = d === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", d);
    state.ui.theme = d;
    saveUI();
    setToggleIcon(d);
  });
}
function setToggleIcon(d) {
  const t = $(".theme-toggle");
  t.innerHTML = d === "dark"
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
}

/* ============== EXPORT / IMPORT ============== */
function exportRecipes() {
  if (!state.recipes.length) { showToast("Keine Rezepte zum Exportieren"); return; }
  const json = JSON.stringify(state.recipes, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `gelato-rezepte-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`${state.recipes.length} Rezept(e) exportiert`);
}

function importRecipes(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    let imported;
    try { imported = JSON.parse(e.target.result); }
    catch { showToast("Ungültige Datei — kein gültiges JSON"); return; }
    if (!Array.isArray(imported)) { showToast("Ungültiges Format"); return; }
    const valid = imported.filter(r => r && r.id && Array.isArray(r.rows));
    if (!valid.length) { showToast("Keine gültigen Rezepte gefunden"); return; }

    const newIds = new Set(valid.map(r => r.id));
    const existing = state.recipes.filter(r => newIds.has(r.id));
    let msg = `${valid.length} Rezept(e) gefunden.`;
    if (existing.length) msg += ` ${existing.length} davon bereits vorhanden — überschreiben?`;

    const ok = await askConfirm(msg, { title: "Rezepte importieren", confirmText: "Importieren" });
    if (!ok) return;

    // Merge: vorhandene überschreiben, neue anfügen
    state.recipes = state.recipes.filter(r => !newIds.has(r.id));
    state.recipes.push(...valid);
    saveRecipes();
    renderLibrary();
    showToast(`${valid.length} Rezept(e) importiert`);
  };
  reader.readAsText(file);
}

/* ============== HELPERS ============== */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

/* ============== INIT ============== */
function init() {
  loadStorage();
  initTheme();

  // Tabs
  $$(".tab").forEach(t => t.addEventListener("click", () => setTab(t.dataset.tab)));

  // Recipe controls
  $("#recipe-type").addEventListener("change", e => {
    state.current.type = e.target.value;
    updateBaseButton();
    updateBilanz();
  });
  $("#machine-cap").addEventListener("change", e => {
    state.current.machineCap = parseFloat(e.target.value) || 800;
    renderIngredientRows();
  });
  $("#recipe-title-display").addEventListener("input", e => {
    state.current.title = e.target.textContent;
  });
  $("#recipe-notes").addEventListener("input", e => {
    state.current.notes = e.target.value;
  });

  $("#reset-recipe").addEventListener("click", async () => {
    if (state.current.rows.length) {
      const ok = await askConfirm("Möchtest du das aktuelle Rezept verwerfen und ein neues beginnen?", { title: "Rezept leeren", confirmText: "Leeren", danger: true });
      if (!ok) return;
    }
    newRecipe();
    showToast("Rezept geleert");
  });
  $("#load-base").addEventListener("click", insertBase);
  $("#save-recipe").addEventListener("click", saveCurrentRecipe);
  $("#add-ingredient-row").addEventListener("click", () => $("#ing-search").focus());
  $("#export-recipes").addEventListener("click", exportRecipes);
  $("#import-recipes").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", e => {
    importRecipes(e.target.files[0]);
    e.target.value = "";
  });
  // Form-Filter (Trocken / Flüssig / Alle)
  $$(".form-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const f = btn.dataset.formFilter;
      state.ui.formFilter = f;
      saveUI();
      $$(".form-filter-btn").forEach(b => b.classList.toggle("is-active", b === btn));
      // Zeilen ein-/ausblenden ohne komplettes Re-Render (Fokus bleibt erhalten)
      $$("#ing-tbody tr").forEach(tr => {
        const rowForm = tr.dataset.form;
        if (!rowForm) return;
        tr.classList.toggle("row-filtered", f !== "all" && rowForm !== f);
      });
    });
  });

  // Autocomplete
  const search = $("#ing-search");
  search.addEventListener("input", e => {
    acIndex = -1;
    renderAutocomplete(e.target.value);
  });
  search.addEventListener("keydown", e => {
    const ac = $("#autocomplete");
    if (ac.hidden) return;
    const items = ac.querySelectorAll(".autocomplete-item");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      acIndex = Math.min(items.length - 1, acIndex + 1);
      renderAutocomplete(search.value);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      acIndex = Math.max(0, acIndex - 1);
      renderAutocomplete(search.value);
    } else if (e.key === "Enter" && acIndex >= 0) {
      e.preventDefault();
      const id = items[acIndex].dataset.id;
      addRow(id);
      search.value = "";
      ac.hidden = true;
      acIndex = -1;
    } else if (e.key === "Escape") {
      ac.hidden = true;
      acIndex = -1;
    }
  });
  search.addEventListener("blur", () => {
    setTimeout(() => $("#autocomplete").hidden = true, 150);
  });

  // Ingredients DB
  $("#add-custom-ing").addEventListener("click", addCustomIngredient);

  // Initial render
  applyCurrentToUI();
  updateBaseButton();
  renderReference();
  // Gespeicherten Form-Filter wiederherstellen
  const savedFilter = state.ui.formFilter || "all";
  $$(".form-filter-btn").forEach(b => b.classList.toggle("is-active", b.dataset.formFilter === savedFilter));
  setTab(state.ui.tab || "recipe");
}

document.addEventListener("DOMContentLoaded", init);
