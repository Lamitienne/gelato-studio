/* ============================================================
   GELATO STUDIO — Eis-Bilanzierung
   ============================================================ */

const STORAGE_KEYS = {
  ingredients: "gs_ingredients_v1",
  recipes: "gs_recipes_v1",
  productions: "gs_productions_v1",
  ui: "gs_ui_v1",
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
  } catch {
    store = null;
  }
  return {
    available: !!store,
    get(key) {
      try {
        return store ? store.getItem(key) : (mem[key] ?? null);
      } catch {
        return mem[key] ?? null;
      }
    },
    set(key, val) {
      try {
        store ? store.setItem(key, val) : (mem[key] = val);
      } catch {
        mem[key] = val;
      }
    },
    remove(key) {
      try {
        store ? store.removeItem(key) : delete mem[key];
      } catch {
        delete mem[key];
      }
    },
  };
})();

const state = {
  ingredients: [],
  recipes: [],
  productions: [],
  current: {
    id: null,
    title: "Neues Rezept",
    type: "milcheis",
    machineCap: 900,
    rows: [], // {ingId, qty}
    notes: "",
  },
  ui: {
    tab: "recipe",
    theme: null,
    formFilter: "all", // "all" | "F" | "T"
    cookingMode: false,
  },
};

/* ============== STORAGE ============== */
function loadStorage() {
  try {
    const ingData = storage.get(STORAGE_KEYS.ingredients);
    const parsedIng = ingData ? JSON.parse(ingData) : null;
    state.ingredients =
      Array.isArray(parsedIng) && parsedIng.length
        ? parsedIng
        : JSON.parse(JSON.stringify(DEFAULT_INGREDIENTS));
  } catch {
    state.ingredients = JSON.parse(JSON.stringify(DEFAULT_INGREDIENTS));
  }

  try {
    const recData = storage.get(STORAGE_KEYS.recipes);
    const parsedRec = recData ? JSON.parse(recData) : null;
    if (Array.isArray(parsedRec) && parsedRec.length) {
      state.recipes = parsedRec;
      // Fehlende Beispielrezepte ergänzen ohne eigene zu überschreiben
      const savedIds = new Set(parsedRec.map((r) => r.id));
      DEFAULT_RECIPES.forEach((def) => {
        if (!savedIds.has(def.id)) {
          state.recipes.push(JSON.parse(JSON.stringify(def)));
        }
      });
    } else {
      state.recipes = JSON.parse(JSON.stringify(DEFAULT_RECIPES));
    }
  } catch {
    state.recipes = JSON.parse(JSON.stringify(DEFAULT_RECIPES));
  }

  try {
    const prodData = storage.get(STORAGE_KEYS.productions);
    state.productions = prodData ? JSON.parse(prodData) : [];
  } catch {
    state.productions = [];
  }

  try {
    state.ui = Object.assign(
      state.ui,
      JSON.parse(storage.get(STORAGE_KEYS.ui) || "{}"),
    );
  } catch {}
}

function saveIngredients() {
  storage.set(STORAGE_KEYS.ingredients, JSON.stringify(state.ingredients));
}
function saveRecipes() {
  storage.set(STORAGE_KEYS.recipes, JSON.stringify(state.recipes));
}
function saveProductions() {
  storage.set(STORAGE_KEYS.productions, JSON.stringify(state.productions));
}
function saveUI() {
  storage.set(STORAGE_KEYS.ui, JSON.stringify(state.ui));
}

function toggleCookingMode() {
  state.ui.cookingMode = !state.ui.cookingMode;
  const btn = $("#toggle-cooking");
  const panel = $('section[data-panel="recipe"]');

  if (state.ui.cookingMode) {
    btn.textContent = "Editor-Modus";
    btn.classList.add("btn-cooking-active");
    panel.classList.add("cooking-active");
  } else {
    btn.textContent = "Kochmodus";
    btn.classList.remove("btn-cooking-active");
    panel.classList.remove("cooking-active");
  }
  renderIngredientRows();
}

function duplicateRecipe(id) {
  const r = state.recipes.find((x) => x.id === id);
  if (!r) return;
  const copy = JSON.parse(JSON.stringify(r));
  copy.id = uid();
  copy.title = copy.title + " (Kopie)";
  copy.createdAt = Date.now();
  copy.updatedAt = Date.now();
  state.recipes.push(copy);
  saveRecipes();
  renderLibrary();
  showToast("Rezept dupliziert");
  return copy.id;
}

/* ============== UTIL ============== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function findIngredient(id) {
  return state.ingredients.find((i) => i.id === id);
}

/* ============== FORM (Trocken / Flüssig) ==============
   F = flüssig (Milch, Sahne, Joghurt, Säfte, Pürees, Sirupe, Eigelb roh)
   T = trocken (Pulver, Bindemittel, Kristallzucker, Pasten, Bases)
   ====================================================== */
const LIQUID_IDS = new Set([
  "vollmilch",
  "magermilch",
  "sahne33",
  "sahne35",
  "kondensmilch",
  "joghurt",
  "glukose40",
  "honig",
  "ahornsirup",
  "invertzucker",
  "eigelb",
  "wasser",
  "zitrone-saft",
]);
const DRY_IDS = new Set([
  "magermilchpulver",
  "vollmilchpulver",
  "butter",
  "saccharose",
  "dextrose",
  "fruktose",
  "glukose-pulver",
  "maltodextrin",
  "johannisbrotkernmehl",
  "guarkernmehl",
  "xanthan",
  "inulin",
  "kakao",
  "schoko-70",
  "haselnuss-pasta",
  "sahne-eis-basis",
  "vanille-mark",
  "salz",
  "base-milch",
  "base-frucht",
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

function getRowForm(row) {
  if (row.formOverride === "F" || row.formOverride === "T") return row.formOverride;
  return getForm(findIngredient(row.ingId));
}

function formTagSvg(form, idx) {
  const fill   = form === "T" ? "rgba(199,154,58,0.22)"  : "rgba(74,144,184,0.22)";
  const stroke = form === "T" ? "rgba(199,154,58,0.55)"  : "rgba(74,144,184,0.55)";
  const color  = form === "T" ? "#8a6810" : "#2d6985";
  const tip    = form === "T" ? "Trocken → Flüssig" : "Flüssig → Trocken";
  return `<svg data-toggle-form="${idx}" role="button" tabindex="0" title="Klicken: ${tip} · Doppelklick: Reset"
      width="22" height="22" viewBox="0 0 22 22"
      style="cursor:pointer;flex-shrink:0;display:inline-block;vertical-align:middle">
    <circle cx="11" cy="11" r="10" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
    <text x="11" y="15.5" text-anchor="middle" font-size="11" font-weight="700" fill="${color}" font-family="inherit">${form}</text>
  </svg>`;
}

function fmt(num, decimals = 1) {
  if (!isFinite(num)) return "—";
  return num.toFixed(decimals).replace(/\.0$/, "").replace(".", ",");
}

function uid() {
  return (
    "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  );
}

function showToast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.hidden = true;
  }, 2200);
}

/* ============== MODAL DIALOGE ============== */
function askConfirm(
  message,
  {
    title = "Bestätigen",
    confirmText = "OK",
    cancelText = "Abbrechen",
    danger = false,
  } = {},
) {
  return new Promise((resolve) => {
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
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
      const act = e.target.dataset && e.target.dataset.act;
      if (act === "ok") close(true);
      if (act === "cancel") close(false);
    });
    const onKey = (e) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    };
    document.addEventListener("keydown", onKey);
    setTimeout(() => overlay.querySelector('[data-act="ok"]').focus(), 50);
  });
}

function askForm(title, fields) {
  // fields: [{name, label, type?, value?, placeholder?, options?}]
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const fieldHtml = fields
      .map((f, i) => {
        if (f.type === "select") {
          const opts = f.options
            .map(
              (o) =>
                `<option value="${escapeHtml(o)}"${o === f.value ? " selected" : ""}>${escapeHtml(o)}</option>`,
            )
            .join("");
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
      })
      .join("");
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
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = {};
      fields.forEach((f) => {
        const el = form.elements[f.name];
        data[f.name] = el ? el.value : "";
      });
      close(data);
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
      if (e.target.dataset && e.target.dataset.act === "cancel") close(null);
    });
    const onKey = (e) => {
      if (e.key === "Escape") close(null);
    };
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
function calculate(rows, machineCap) {
  // Filtere Zeilen mit ungültigen oder fehlenden Zutaten
  const validRows = rows
    .map((r) => ({ ...r, ing: findIngredient(r.ingId) }))
    .filter((r) => r.ing && (Number(r.qty) || 0) > 0);

  const total = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const validTotal = validRows.reduce((s, r) => s + (Number(r.qty) || 0), 0);

  const empty = {
    total: 0,
    ts: 0,
    fett: 0,
    zucker: 0,
    wasser: 100,
    pac: 0,
    pod: 0,
    stab: 0,
    incomplete: false,
  };
  if (total <= 0) return empty;

  // Chargenmengen: fixedChargeQty hat Vorrang, sonst proportional skaliert
  const scale = machineCap != null ? machineCap / total : 1;
  const chargeRows = validRows.map((r) => ({
    ...r,
    chargeQty: r.fixedChargeQty != null ? r.fixedChargeQty : (Number(r.qty) || 0) * scale,
  }));
  const chargeTotal = chargeRows.reduce((s, r) => s + r.chargeQty, 0);

  const acc = { ...empty, total, incomplete: validTotal < total };

  for (const r of chargeRows) {
    const f = r.chargeQty / chargeTotal;
    acc.ts += f * r.ing.ts;
    acc.fett += f * r.ing.fett;
    acc.zucker += f * r.ing.zucker;
    acc.pac += f * r.ing.pac;
    acc.pod += f * r.ing.pod;
    acc.stab += f * (r.ing.stab || 0);
  }
  acc.wasser = 100 - acc.ts;
  return acc;
}

function evaluateMetric(value, target, key) {
  if (!target) return "neutral";
  // Spezialfall Stabilisator: Nur Untergrenze kritisch, Obergrenze oft weich
  if (key === "stab") {
    if (value < 0.1) return "bad";
    if (value < 0.3 || value > 0.6) return "warn";
    return "ok";
  }
  if (value < target.min || value > target.max) return "bad";
  if (value < target.ideal[0] || value > target.ideal[1]) return "warn";
  return "ok";
}

/* ============== RENDER: TABS ============== */
function setTab(name) {
  state.ui.tab = name;
  saveUI();
  $$(".tab").forEach((t) =>
    t.setAttribute("aria-current", t.dataset.tab === name ? "true" : "false"),
  );
  $$(".panel").forEach((p) => (p.hidden = p.dataset.panel !== name));
  if (name === "library") renderLibrary();
  if (name === "production") renderProductionLog();
  if (name === "ingredients") renderDatabase();
  if (name === "reference") renderReference();
}

/* ============== RENDER: ZUTATEN ZEILEN ============== */
function updateFormSummary(total, scale) {
  let dryOrig = 0, liqOrig = 0, dryScaled = 0, liqScaled = 0;
  state.current.rows.forEach((r) => {
    const q = Number(r.qty) || 0;
    const s = r.fixedChargeQty != null ? r.fixedChargeQty : q * scale;
    if (getRowForm(r) === "T") { dryOrig += q; dryScaled += s; }
    else { liqOrig += q; liqScaled += s; }
  });
  $("#sum-dry-orig").textContent = `(${fmt(dryOrig, 1)} g orig.)`;
  $("#sum-liq-orig").textContent = `(${fmt(liqOrig, 1)} g orig.)`;
  $("#sum-dry-scaled").textContent = fmt(dryScaled, 1) + " g";
  $("#sum-liq-scaled").textContent = fmt(liqScaled, 1) + " g";
}

function updateScaleBanner(total, target, scale) {
  const banner = $("#scale-banner");
  if (!banner) return;
  if (!total || total <= 0) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  $("#scale-original").textContent = fmt(total, 1) + " g";
  $("#scale-target").textContent = fmt(target, 0) + " g";
  const factorText =
    scale > 1
      ? "Faktor " + fmt(scale, 3) + "× (größer)"
      : scale < 1
        ? "Faktor " + fmt(scale, 3) + "× (kleiner)"
        : "Faktor 1,000×";
  $("#scale-factor").textContent = factorText;
}

function renderIngredientRows() {
  const tbody = $("#ing-tbody");
  const table = tbody.closest("table");
  const thead = table.querySelector("thead tr");
  const tfoot = table.querySelector("tfoot");
  const cooking = state.ui.cookingMode;

  if (thead) {
    thead.innerHTML = cooking
      ? `<th class="col-check"></th><th>Zutat</th><th class="num col-batch">Für Charge (g)</th>`
      : `<th class="col-check" hidden></th><th class="col-form" title="Form: T = trocken, F = flüssig">F/T</th><th>Zutat</th><th class="num col-orig">Original (g)</th><th class="num col-pct">Anteil</th><th class="num col-batch">Für Charge (g)</th><th class="col-actions"></th>`;
  }
  if (tfoot) tfoot.hidden = cooking;

  tbody.innerHTML = "";
  if (!state.current.rows.length) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    tr.innerHTML = `<td colspan="${cooking ? 3 : 6}">Keine Zutaten — über „+ Zeile" hinzufügen.</td>`;
    tbody.appendChild(tr);
    $("#sum-mass").textContent = "0 g";
    $("#sum-scaled").textContent = "0 g";
    const banner = $("#scale-banner");
    if (banner) banner.hidden = true;
    updateBilanz();
    return;
  }

  const total = state.current.rows.reduce(
    (s, r) => s + (Number(r.qty) || 0),
    0,
  );
  const target = state.current.machineCap;
  const scale = total > 0 ? target / total : 1;
  const filter = state.ui.formFilter || "all";

  // Anzeigereihenfolge: T zuerst, dann F — Originalindizes für remove/qty bleiben korrekt
  const displayOrder = state.current.rows
    .map((row, idx) => ({ row, idx }))
    .sort((a, b) => {
      const fa = getRowForm(a.row);
      const fb = getRowForm(b.row);
      if (fa === fb) return 0;
      return fa === "T" ? -1 : 1;
    });

  displayOrder.forEach(({ row, idx }) => {
    const form = getRowForm(row);
    const tr = document.createElement("tr");
    tr.dataset.form = form;
    if (filter !== "all" && filter !== form) tr.classList.add("row-filtered");
    const ing = findIngredient(row.ingId);
    const qtyValue = Number(row.qty) || 0;
    const pct = total > 0 ? (qtyValue / total) * 100 : 0;
    const scaled = row.fixedChargeQty != null ? row.fixedChargeQty : qtyValue * scale;
    tr.innerHTML = cooking ? `
      <td class="col-check">
        <input type="checkbox" class="cooking-check" />
      </td>
      <td>
        <span class="ing-name">${ing ? escapeHtml(ing.name) : "?"}</span>
      </td>
      <td class="num col-batch scaled-cell">${fmt(scaled, 1)} g</td>
    ` : `
      <td class="col-form">
        ${formTagSvg(form, idx)}
      </td>
      <td>
        <div class="ing-name-cell">
          <span class="ing-name">${ing ? escapeHtml(ing.name) : '<span class="error-text">Unbekannte Zutat</span>'}</span>
          ${ing ? `<span class="ing-cat">${escapeHtml(ing.cat)}</span>` : ""}
        </div>
      </td>
      <td class="num col-orig">
        <input type="number" class="ing-qty" value="${row.qty}" step="0.1" min="0" data-idx="${idx}" />
      </td>
      <td class="num col-pct">${fmt(pct, 1)} %</td>
      <td class="num col-batch scaled-cell">${fmt(scaled, 1)} g</td>
      <td class="col-actions">
        <button class="row-action" data-remove="${idx}" aria-label="Zeile entfernen">×</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Bind Cooking events
  if (cooking) {
    $$(".cooking-check", tbody).forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const tr = e.target.closest("tr");
        tr.classList.toggle("is-done", e.target.checked);
      });
    });
  }

  $("#sum-mass").textContent = fmt(total, 1) + " g";
  $("#sum-scaled").textContent = fmt(target, 0) + " g";
  updateScaleBanner(total, target, scale);
  updateFormSummary(total, scale);

  // Bind events
  $$(".ing-qty").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const idx = +e.target.dataset.idx;
      const val = parseFloat(e.target.value.replace(",", "."));
      state.current.rows[idx].qty = isNaN(val) ? 0 : val;

      const total2 = state.current.rows.reduce(
        (s, r) => s + (Number(r.qty) || 0),
        0,
      );
      const scale2 = total2 > 0 ? state.current.machineCap / total2 : 1;

      // Update ALL rows to keep percentages consistent
      $$("#ing-tbody tr").forEach((row) => {
        const rowInp = row.querySelector(".ing-qty");
        if (!rowInp) return;
        const origIdx = +rowInp.dataset.idx;
        const r = state.current.rows[origIdx];
        const rowQty = Number(r.qty) || 0;
        const rowScaled = r.fixedChargeQty != null ? r.fixedChargeQty : rowQty * scale2;
        const c = row.querySelectorAll("td.num");
        c[1].textContent =
          total2 > 0 ? fmt((rowQty / total2) * 100, 1) + " %" : "0 %";
        c[2].textContent = fmt(rowScaled, 1) + " g";
      });

      $("#sum-mass").textContent = fmt(total2, 1) + " g";
      updateScaleBanner(total2, state.current.machineCap, scale2);
      updateFormSummary(total2, scale2);
      updateBilanz();
    });
  });

  $$("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = +e.currentTarget.dataset.remove;
      state.current.rows.splice(idx, 1);
      renderIngredientRows();
    });
  });

  $$("[data-toggle-form]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const idx = +e.currentTarget.dataset.toggleForm;
      const row = state.current.rows[idx];
      const current = getRowForm(row);
      row.formOverride = current === "T" ? "F" : "T";
      renderIngredientRows();
    });
    el.addEventListener("dblclick", (e) => {
      const idx = +e.currentTarget.dataset.toggleForm;
      delete state.current.rows[idx].formOverride;
      renderIngredientRows();
    });
  });

  updateBilanz();
}

/* ============== RENDER: BILANZ ============== */
function updateBilanz() {
  const r = calculate(state.current.rows, state.current.machineCap);
  const targets = { ...TARGETS[state.current.type].metrics };
  // Add Stabilizer target dynamically
  targets.stab = {
    label: "Stabilisator",
    unit: "%",
    min: 0.3,
    max: 0.6,
    ideal: [0.35, 0.5],
  };

  $("#target-label").textContent =
    "Zielbereich: " + TARGETS[state.current.type].label;

  const order = ["ts", "fett", "zucker", "pac", "pod", "stab"];
  const grid = $("#metrics-grid");
  grid.innerHTML = "";

  let bad = 0,
    warn = 0,
    ok = 0;

  order.forEach((key) => {
    const target = targets[key];
    const val = r[key];
    const status =
      state.current.rows.length === 0 || r.total <= 0
        ? "neutral"
        : evaluateMetric(val, target, key);
    if (status === "bad") bad++;
    else if (status === "warn") warn++;
    else if (status === "ok") ok++;

    // Bar visualization
    const range = target.max - target.min;
    const padding = range * 0.4;
    const barMin = Math.max(0, target.min - padding);
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
        <span class="dot ${status === "neutral" ? "" : status}"></span>
        ${target.label}
      </div>
      <div class="metric-value">${state.current.rows.length === 0 || r.total <= 0 ? "—" : fmt(val, key === "stab" ? 2 : 1) + (target.unit ? " " + target.unit : "")}</div>
      <div class="metric-target">Ideal ${fmt(target.ideal[0], key === "stab" ? 2 : 1)}–${fmt(target.ideal[1], key === "stab" ? 2 : 1)}${target.unit ? " " + target.unit : ""}</div>
      <div class="metric-bar">
        <div class="metric-bar-zone" style="left:${idealLeft}%; width:${idealWidth}%"></div>
        ${state.current.rows.length === 0 || r.total <= 0 ? "" : `<div class="metric-bar-marker" style="left:${markerPos}%"></div>`}
      </div>
    `;
    grid.appendChild(card);
  });

  // Overall status
  const pill = $("#overall-status");
  const advice = $("#advice");
  if (state.current.rows.length === 0 || r.total <= 0) {
    pill.className = "status-pill";
    pill.textContent = "—";
    advice.textContent = "Füge Zutaten hinzu, um die Bilanz zu berechnen.";
  } else {
    if (r.incomplete) {
      pill.className = "status-pill bad";
      pill.textContent = "Unvollständig";
      advice.innerHTML =
        '<span class="error-text">Achtung: Einige Zutaten sind nicht in der Datenbank vorhanden. Die Bilanz ist ungenau.</span>';
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
      advice.textContent =
        "Alle Werte liegen im idealen Bereich. Schöne Bilanz.";
    }
  }
}

function generateAdvice(r, targets) {
  const tips = [];
  const checks = [
    [
      "ts",
      "Trockenmasse",
      "mehr Magermilchpulver oder Dextrose",
      "weniger Milchpulver oder mehr Wasser/Frucht",
    ],
    ["fett", "Fett", "etwas Sahne ergänzen", "Sahne durch Milch ersetzen"],
    [
      "zucker",
      "Zucker",
      "Saccharose oder Dextrose erhöhen",
      "Zuckermenge reduzieren oder durch Maltodextrin ersetzen",
    ],
    [
      "pac",
      "PAC",
      "Anteil Dextrose oder Trockenglukose erhöhen",
      "Saccharose / Glukose-Pulver einsetzen statt Dextrose",
    ],
    [
      "pod",
      "POD",
      "Saccharose oder Fruktose hinzufügen",
      "Dextrose oder Maltodextrin statt Saccharose",
    ],
    [
      "stab",
      "Stabilisator",
      "Anteil Bindemittel (Johannisbrotkernmehl etc.) erhöhen",
      "Bindemittel reduzieren",
    ],
  ];
  for (const [k, label, lowTip, highTip] of checks) {
    const t = targets[k];
    if (r[k] < t.min) tips.push(`${label} zu niedrig — ${lowTip}.`);
    else if (r[k] > t.max) tips.push(`${label} zu hoch — ${highTip}.`);
  }
  if (!tips.length)
    return "Werte liegen im Toleranzbereich, einzelne Werte am Rand.";
  return tips.join(" ");
}

/* ============== AUTOCOMPLETE ============== */
let acIndex = -1;
let pendingIngId = null;
function renderAutocomplete(query) {
  const ac = $("#autocomplete");
  if (!query || query.length < 1) {
    ac.hidden = true;
    return;
  }
  const q = query.toLowerCase();
  const matches = state.ingredients
    .filter(
      (i) =>
        i.name.toLowerCase().includes(q) || i.cat.toLowerCase().includes(q),
    )
    .slice(0, 8);
  if (!matches.length) {
    ac.hidden = true;
    return;
  }
  ac.innerHTML = matches
    .map(
      (m, i) =>
        `<div class="autocomplete-item${i === acIndex ? " active" : ""}" data-id="${m.id}">
      <span>${escapeHtml(m.name)}</span>
      <span class="ac-cat">${escapeHtml(m.cat)}</span>
    </div>`,
    )
    .join("");
  ac.hidden = false;
  ac.querySelectorAll(".autocomplete-item").forEach((el) => {
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      selectIngredient(el.dataset.id);
    });
  });
}

function addRow(ingId, qty = 0) {
  state.current.rows.push({ ingId, qty });
  renderIngredientRows();
}


function selectIngredient(id) {
  const ing = findIngredient(id);
  if (!ing) return;
  const search = $("#ing-search");
  search.value = "";
  $("#autocomplete").hidden = true;
  acIndex = -1;
  pendingIngId = id;
  $("#ing-qty-label").textContent = ing.name + ":";
  $("#ing-qty-input").value = "";
  $("#ing-qty-wrap").hidden = false;
  search.hidden = true;
  setTimeout(() => $("#ing-qty-input").focus(), 0);
}

function resetIngSearch() {
  pendingIngId = null;
  $("#ing-qty-input").value = "";
  $("#ing-qty-wrap").hidden = true;
  $("#ing-search").hidden = false;
  $("#ing-search").focus();
}

/* ============== PRODUKTIONSLOG ============== */
function logProductionModal(prefill = {}) {
  return new Promise((resolve) => {
    const today = new Date().toISOString().slice(0, 10);
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-title">${prefill.title || "Produktion erfassen"}</div>
        <form class="modal-form">
          <div class="modal-fields">
            <label class="modal-field">
              <span>Datum</span>
              <input name="date" type="date" value="${prefill.date || today}">
            </label>
            <label class="modal-field">
              <span>Rezept</span>
              <input name="recipeName" type="text" value="${escapeHtml(prefill.recipeName || "")}" placeholder="Rezeptname">
            </label>
            <label class="modal-field">
              <span>Menge (g)</span>
              <input name="qty" type="number" step="1" min="0" inputmode="decimal" value="${prefill.qty || ""}">
            </label>
            <div class="modal-field">
              <span>Bewertung</span>
              <div class="star-picker">
                ${[1,2,3,4,5].map((n) => `<button type="button" class="star-btn" data-val="${n}">★</button>`).join("")}
              </div>
              <input type="hidden" name="rating" value="${prefill.rating || 0}">
            </div>
            <label class="modal-field">
              <span>Notizen</span>
              <textarea name="notes" rows="3" placeholder="Cremigkeit, Süsse, Abweichungen, Ideen …">${escapeHtml(prefill.notes || "")}</textarea>
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" data-act="cancel">Abbrechen</button>
            <button type="submit" class="btn btn-primary">Speichern</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));

    const ratingInput = overlay.querySelector('input[name="rating"]');
    const starBtns = [...overlay.querySelectorAll(".star-btn")];

    function updateStars(n) {
      ratingInput.value = n;
      starBtns.forEach((b) => b.classList.toggle("star-active", +b.dataset.val <= n));
    }
    if (prefill.rating) updateStars(prefill.rating);

    starBtns.forEach((b) => {
      b.addEventListener("click", () => updateStars(+b.dataset.val));
      b.addEventListener("mouseenter", () =>
        starBtns.forEach((x) => x.classList.toggle("star-hover", +x.dataset.val <= +b.dataset.val))
      );
    });
    overlay.querySelector(".star-picker").addEventListener("mouseleave", () =>
      starBtns.forEach((b) => b.classList.remove("star-hover"))
    );

    const close = (val) => {
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 180);
      document.removeEventListener("keydown", onKey);
      resolve(val);
    };
    overlay.querySelector(".modal-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      close({
        date: f.elements.date.value,
        recipeName: f.elements.recipeName.value.trim(),
        qty: parseFloat(f.elements.qty.value) || 0,
        rating: parseInt(ratingInput.value) || 0,
        notes: f.elements.notes.value.trim(),
      });
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(null);
      if (e.target.dataset?.act === "cancel") close(null);
    });
    const onKey = (e) => { if (e.key === "Escape") close(null); };
    document.addEventListener("keydown", onKey);
    setTimeout(() => overlay.querySelector('input[name="date"]').focus(), 50);
  });
}

async function logProduction(prefill = {}) {
  const data = await logProductionModal(prefill);
  if (!data) return;
  state.productions.unshift({
    id: uid(),
    recipeId: prefill.recipeId || null,
    recipeName: data.recipeName,
    recipeType: prefill.recipeType || "",
    date: data.date,
    qty: data.qty,
    rating: data.rating,
    notes: data.notes,
    recipeSnapshot: prefill.recipeSnapshot || null,
    createdAt: Date.now(),
  });
  saveProductions();
  showToast("Produktion gespeichert");
  if (state.ui.tab === "production") renderProductionLog();
}

function renderProductionLog() {
  const list = $("#production-list");
  if (!state.productions.length) {
    list.innerHTML = `<div class="empty-state"><h3>Noch keine Einträge</h3><p>Erfasse deine erste Produktion über „+ Produktion" oder den Button im Rezept-Editor.</p></div>`;
    return;
  }
  const sorted = [...state.productions].sort((a, b) => {
    const da = new Date(a.date + "T12:00:00").getTime();
    const db = new Date(b.date + "T12:00:00").getTime();
    return da !== db ? db - da : (b.createdAt || 0) - (a.createdAt || 0);
  });
  list.innerHTML = sorted.map((e) => {
    const dateStr = e.date
      ? new Date(e.date + "T12:00:00").toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric" })
      : "—";
    const stars = Array.from({ length: 5 }, (_, i) =>
      `<span class="${i < e.rating ? "star-on" : "star-off"}">★</span>`
    ).join("");
    const typeLabel = e.recipeType ? TARGETS[e.recipeType]?.label : "";
    let snapshotHtml = "";
    if (e.recipeSnapshot) {
      const s = e.recipeSnapshot;
      const c = s.calc;
      const snapRows = s.rows.map((r) =>
        `<tr><td>${escapeHtml(r.ingName)}</td><td class="snap-qty">${c.total > 0 ? fmt(r.qty / c.total * 100, 1) : "—"} %</td></tr>`
      ).join("");
      snapshotHtml = `
        <details class="prod-snapshot">
          <summary class="prod-snapshot-toggle">Rezept</summary>
          <div class="prod-snapshot-body">
            <table class="snap-table">
              <thead><tr><th>Zutat</th><th class="snap-qty">Anteil</th></tr></thead>
              <tbody>${snapRows}</tbody>
            </table>
            <table class="snap-table snap-metrics-table">
              <thead><tr><th>Kennwert</th><th class="snap-qty">Wert</th></tr></thead>
              <tbody>
                <tr><td>Trockenmasse</td><td class="snap-qty">${fmt(c.ts, 1)} %</td></tr>
                <tr><td>Fett</td><td class="snap-qty">${fmt(c.fett, 1)} %</td></tr>
                <tr><td>Zucker</td><td class="snap-qty">${fmt(c.zucker, 1)} %</td></tr>
                <tr><td>PAC</td><td class="snap-qty">${fmt(c.pac, 0)}</td></tr>
                <tr><td>POD</td><td class="snap-qty">${fmt(c.pod, 0)}</td></tr>
                <tr><td>Stabilisator</td><td class="snap-qty">${fmt(c.stab, 2)} %</td></tr>
              </tbody>
            </table>
          </div>
        </details>`;
    }
    return `
      <div class="prod-entry">
        <div class="prod-entry-head">
          <div class="prod-entry-meta">
            <span class="prod-date">${dateStr}</span>
            ${typeLabel ? `<span class="tag ${e.recipeType}">${typeLabel}</span>` : ""}
          </div>
          <button class="row-action row-action-edit" data-edit-prod="${e.id}" aria-label="Eintrag bearbeiten"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="row-action" data-del-prod="${e.id}" aria-label="Eintrag löschen">×</button>
        </div>
        <strong class="prod-recipe-name">${escapeHtml(e.recipeName || "—")}</strong>
        <div class="prod-row">
          ${e.rating ? `<span class="prod-stars">${stars}</span>` : ""}
          ${e.qty ? `<span class="prod-qty">${fmt(e.qty, 0)} g</span>` : ""}
        </div>
        ${e.notes ? `<p class="prod-notes">${escapeHtml(e.notes)}</p>` : ""}
        ${snapshotHtml}
      </div>`;
  }).join("");

  $$("[data-edit-prod]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const entry = state.productions.find((p) => p.id === btn.dataset.editProd);
      if (!entry) return;
      const data = await logProductionModal({
        title: "Produktion bearbeiten",
        date: entry.date,
        recipeName: entry.recipeName,
        qty: entry.qty,
        rating: entry.rating,
        notes: entry.notes,
      });
      if (!data) return;
      Object.assign(entry, {
        date: data.date,
        recipeName: data.recipeName,
        qty: data.qty,
        rating: data.rating,
        notes: data.notes,
      });
      saveProductions();
      showToast("Eintrag aktualisiert");
      renderProductionLog();
    });
  });

  $$("[data-del-prod]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await askConfirm("Diesen Eintrag wirklich löschen?", {
        title: "Eintrag löschen",
        confirmText: "Löschen",
        danger: true,
      });
      if (ok) {
        state.productions = state.productions.filter((p) => p.id !== btn.dataset.delProd);
        saveProductions();
        renderProductionLog();
      }
    });
  });
}

/* ============== RENDER: REZEPTBUCH ============== */
function getOverallStatus(calc, type) {
  if (!calc || calc.total <= 0) return "";
  const targets = { ...TARGETS[type].metrics };
  targets.stab = { min: 0.3, max: 0.6, ideal: [0.35, 0.5] };
  let bad = 0,
    warn = 0;
  for (const key of ["ts", "fett", "zucker", "pac", "pod", "stab"]) {
    const s = evaluateMetric(calc[key], targets[key], key);
    if (s === "bad") bad++;
    else if (s === "warn") warn++;
  }
  return bad > 0 ? "bad" : warn > 0 ? "warn" : "ok";
}

function fmtDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("de-CH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const CARD_PLACEHOLDERS = {
  milcheis: `<svg viewBox="0 0 80 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="40" cy="32" r="24" fill="#fdf0d0" stroke="#c8a96a" stroke-width="1.5"/>
    <path d="M16 46 L40 90 L64 46 Z" fill="#d4a44a" stroke="#a07a3d" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M22 52 L58 52 M19 60 L61 60 M21 68 L59 68 M25 76 L55 76" stroke="#a07a3d" stroke-width="0.75" opacity="0.45"/>
    <path d="M34 46 L46 90 M40 46 L40 90 M46 46 L34 90" stroke="#a07a3d" stroke-width="0.75" opacity="0.45"/>
  </svg>`,
  fruchteis: `<svg viewBox="0 0 60 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="13" y="10" width="34" height="56" rx="17" fill="#f4914a" stroke="#c0552a" stroke-width="1.5"/>
    <rect x="18" y="15" width="10" height="22" rx="5" fill="white" opacity="0.25"/>
    <rect x="26" y="62" width="8" height="26" rx="4" fill="#d4a44a" stroke="#a07a3d" stroke-width="1"/>
  </svg>`,
};

function compressImage(file, maxW = 600, maxH = 400, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxW / img.width, maxH / img.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error());
    };
    img.src = objectUrl;
  });
}

function renderLibrary() {
  const grid = $("#library-grid");
  const searchEl = $("#library-search");
  const q = searchEl ? searchEl.value.trim().toLowerCase() : "";

  const all = [...state.recipes].sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
  );
  const filtered = q
    ? all.filter(
        (r) =>
          (r.title || "").toLowerCase().includes(q) ||
          (TARGETS[r.type]?.label || "").toLowerCase().includes(q) ||
          (r.notes || "").toLowerCase().includes(q),
      )
    : all;

  if (!filtered.length) {
    grid.innerHTML = q
      ? `<div class="empty-state"><h3>Keine Treffer</h3><p>Kein Rezept passt zu „${escapeHtml(q)}".</p></div>`
      : `<div class="empty-state"><h3>Noch keine Rezepte</h3><p>Erstelle ein Rezept und speichere es — es erscheint hier.</p></div>`;
    return;
  }

  const STATUS_LABELS = {
    ok: "Ausgewogen",
    warn: "Im Toleranzbereich",
    bad: "Außerhalb",
  };

  grid.innerHTML = filtered
    .map((rec) => {
      const calc = calculate(rec.rows, rec.machineCap);
      const statusKey = rec.rows.length ? getOverallStatus(calc, rec.type) : "";
      const statusLabel = STATUS_LABELS[statusKey] || "";

      const SPECIAL_CATS = new Set(["Frucht", "Aroma"]);
      const topIngs = rec.rows
        .filter((r) => r.qty > 0)
        .map((r) => findIngredient(r.ingId))
        .filter((ing) => ing && SPECIAL_CATS.has(ing.cat))
        .map((ing) => ing.name);

      const notesPreview = (rec.notes || "").split("\n")[0].trim().slice(0, 90);
      const dateStr = fmtDate(rec.updatedAt || rec.createdAt);
      const imgContent = rec.image
        ? `<img src="${rec.image}" alt="${escapeHtml(rec.title || "")}" class="recipe-card-photo">`
        : `<div class="recipe-card-placeholder">${CARD_PLACEHOLDERS[rec.type] || CARD_PLACEHOLDERS.milcheis}</div>`;

      return `
      <article class="recipe-card" data-id="${rec.id}">
        <div class="recipe-card-img ${rec.type}" data-recipe-id="${rec.id}" title="${rec.image ? "Foto ändern" : "Foto hinzufügen"}">
          ${imgContent}
          <div class="recipe-card-img-overlay">
            <span class="recipe-card-img-btn">${rec.image ? "Foto ändern" : "Foto hinzufügen"}</span>
          </div>
        </div>
        <div class="recipe-card-inner">
          <button class="duplicate" data-dup="${rec.id}" title="Duplizieren" aria-label="Duplizieren">❐</button>
          <button class="delete" data-delete="${rec.id}" aria-label="Rezept löschen">×</button>
          <h3>${escapeHtml(rec.title || "Ohne Titel")}</h3>
          <div class="tags">
            <span class="tag ${rec.type}">${TARGETS[rec.type].label}</span>
            <span class="tag">${rec.rows.length} Zutaten</span>
            ${statusKey ? `<span class="status-pill ${statusKey}">${statusLabel}</span>` : ""}
          </div>
          ${topIngs.length ? `<div class="recipe-card-ings">${topIngs.map((n) => `<span>${escapeHtml(n)}</span>`).join("")}</div>` : ""}
          <div class="stats">
            <span>TS <strong>${fmt(calc.ts, 1)}%</strong></span>
            <span>Fett <strong>${fmt(calc.fett, 1)}%</strong></span>
            <span>PAC <strong>${fmt(calc.pac, 0)}</strong></span>
            <span>POD <strong>${fmt(calc.pod, 0)}</strong></span>
            <span>Stab <strong>${fmt(calc.stab, 2)}%</strong></span>
          </div>
          ${notesPreview ? `<p class="recipe-card-note">${escapeHtml(notesPreview)}</p>` : ""}
          ${dateStr ? `<div class="recipe-card-footer"><span class="recipe-card-date">${dateStr}</span></div>` : ""}
        </div>
      </article>
    `;
    })
    .join("");

  // Shared file input for photo uploads (created once per render call, recycled via id)
  let imgInput = $("#library-img-input");
  if (!imgInput) {
    imgInput = document.createElement("input");
    imgInput.type = "file";
    imgInput.accept = "image/*";
    imgInput.id = "library-img-input";
    imgInput.hidden = true;
    document.body.appendChild(imgInput);
  }

  $$(".recipe-card-img").forEach((imgDiv) => {
    imgDiv.addEventListener("click", (e) => {
      e.stopPropagation();
      const recipeId = imgDiv.dataset.recipeId;
      imgInput.onchange = async () => {
        const file = imgInput.files[0];
        imgInput.value = "";
        if (!file) return;
        try {
          const dataUrl = await compressImage(file);
          const idx = state.recipes.findIndex((r) => r.id === recipeId);
          if (idx >= 0) {
            state.recipes[idx].image = dataUrl;
            if (state.current.id === recipeId) state.current.image = dataUrl;
            saveRecipes();
            renderLibrary();
            showToast("Foto gespeichert");
          }
        } catch {
          showToast("Foto konnte nicht geladen werden");
        }
      };
      imgInput.click();
    });
  });

  $$(".recipe-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (
        e.target.closest("[data-delete]") ||
        e.target.closest(".recipe-card-img")
      )
        return;
      loadRecipe(card.dataset.id);
    });
  });
  $$("[data-dup]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      duplicateRecipe(btn.dataset.dup);
    });
  });
  $$("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.delete;
      const ok = await askConfirm("Dieses Rezept wirklich löschen?", {
        title: "Rezept löschen",
        confirmText: "Löschen",
        danger: true,
      });
      if (ok) {
        state.recipes = state.recipes.filter((r) => r.id !== id);
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
    machineCap: 900,
    rows: [],
    notes: "",
  };
  applyCurrentToUI();
}

function loadRecipe(id) {
  const r = state.recipes.find((x) => x.id === id);
  if (!r) return;
  state.current = JSON.parse(JSON.stringify(r));
  state.current.rows.forEach((row) => delete row.fixedChargeQty);
  applyCurrentToUI();
  setTab("recipe");
  showToast("Rezept geladen");
}

function applyCurrentToUI() {
  $("#recipe-title-display").textContent = state.current.title;
  $("#recipe-type").value = state.current.type;
  $("#machine-cap").value = String(state.current.machineCap);
  $("#recipe-notes").value = state.current.notes || "";
  $("#copy-recipe").hidden = !state.current.id;
  $("#toggle-cooking").hidden = state.current.rows.length === 0;
  $("#log-production").hidden = state.current.rows.length === 0;

  // Reset ingredient search state
  pendingIngId = null;
  $("#ing-qty-wrap").hidden = true;
  $("#ing-search").hidden = false;
  $("#autocomplete").hidden = true;

  // Reset cooking mode UI classes if not active in state
  if (!state.ui.cookingMode) {
    $('section[data-panel="recipe"]').classList.remove("cooking-active");
    $("#toggle-cooking").textContent = "Kochmodus";
    $("#toggle-cooking").classList.remove("btn-cooking-active");
  } else {
    $('section[data-panel="recipe"]').classList.add("cooking-active");
    $("#toggle-cooking").textContent = "Editor-Modus";
    $("#toggle-cooking").classList.add("btn-cooking-active");
  }

  renderIngredientRows();
}

function saveCurrentRecipe() {
  if (!state.current.rows.length) {
    showToast("Bitte zuerst Zutaten hinzufügen");
    return;
  }
  state.current.title =
    $("#recipe-title-display").textContent.trim() || "Ohne Titel";
  state.current.notes = $("#recipe-notes").value;
  state.current.updatedAt = Date.now();

  if (state.current.id) {
    const idx = state.recipes.findIndex((r) => r.id === state.current.id);
    if (idx >= 0)
      state.recipes[idx] = JSON.parse(JSON.stringify(state.current));
    else {
      state.current.id = uid();
      state.recipes.push(JSON.parse(JSON.stringify(state.current)));
    }
  } else {
    state.current.id = uid();
    state.current.createdAt = Date.now();
    state.recipes.push(JSON.parse(JSON.stringify(state.current)));
  }
  saveRecipes();
  showToast("Rezept gespeichert");
}

/* ============== ZUTATEN-DATENBANK ============== */
function renderDatabase() {
  const tbody = $("#db-tbody");
  const cats = [
    "Milch",
    "Zucker",
    "Bindemittel",
    "Frucht",
    "Aroma",
    "Sonstige",
  ];
  const sorted = [...state.ingredients].sort((a, b) => {
    const ca = cats.indexOf(a.cat),
      cb = cats.indexOf(b.cat);
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name, "de");
  });
  tbody.innerHTML = sorted
    .map(
      (i) => `
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
  `,
    )
    .join("");

  $$("[data-del-ing]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.delIng;
      const ing = state.ingredients.find((i) => i.id === id);
      const ok = await askConfirm(
        `„${ing ? ing.name : "Diese Zutat"}" wirklich löschen?`,
        { title: "Zutat löschen", confirmText: "Löschen", danger: true },
      );
      if (ok) {
        state.ingredients = state.ingredients.filter((i) => i.id !== id);
        saveIngredients();
        renderDatabase();
      }
    });
  });
}

async function addCustomIngredient() {
  const data = await askForm("Neue Zutat", [
    { name: "name", label: "Name", placeholder: "z. B. Mango-Püree" },
    {
      name: "cat",
      label: "Kategorie",
      type: "select",
      value: "Sonstige",
      options: [
        "Milch",
        "Zucker",
        "Bindemittel",
        "Frucht",
        "Aroma",
        "Sonstige",
      ],
    },
    { name: "ts", label: "Trockenmasse %", type: "number", value: "0" },
    { name: "fett", label: "Fett %", type: "number", value: "0" },
    { name: "zucker", label: "Zucker %", type: "number", value: "0" },
    {
      name: "pac",
      label: "PAC (Saccharose = 100)",
      type: "number",
      value: "0",
    },
    {
      name: "pod",
      label: "POD (Saccharose = 100)",
      type: "number",
      value: "0",
    },
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
    custom: true,
  });
  saveIngredients();
  renderDatabase();
  showToast(`„${data.name.trim()}" hinzugefügt`);
}

/* ============== REFERENCE ============== */
function renderReference() {
  ["milcheis", "fruchteis"].forEach((type) => {
    const ul = $("#ref-" + type);
    const m = TARGETS[type].metrics;
    ul.innerHTML = Object.entries(m)
      .map(
        ([k, v]) =>
          `<li>
        <span>${v.label}</span>
        <span class="ref-target">${fmt(v.ideal[0])}–${fmt(v.ideal[1])}${v.unit ? " " + v.unit : ""}</span>
      </li>`,
      )
      .join("");
  });
}

function updateThemeColorMeta(d) {
  const meta = $('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", d === "dark" ? "#181612" : "#faf7f1");
  }
}

/* ============== THEME ============== */
function initTheme() {
  const t = $(".theme-toggle");
  let d =
    state.ui.theme ||
    (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", d);
  setToggleIcon(d);
  updateThemeColorMeta(d);
  t.addEventListener("click", () => {
    d = d === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", d);
    state.ui.theme = d;
    saveUI();
    setToggleIcon(d);
    updateThemeColorMeta(d);
  });
}
function setToggleIcon(d) {
  const t = $(".theme-toggle");
  t.innerHTML =
    d === "dark"
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
}

/* ============== EXPORT / IMPORT ============== */
function exportRecipes() {
  if (!state.recipes.length) {
    showToast("Keine Rezepte zum Exportieren");
    return;
  }
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
  reader.onload = async (e) => {
    let imported;
    try {
      imported = JSON.parse(e.target.result);
    } catch {
      showToast("Ungültige Datei — kein gültiges JSON");
      return;
    }
    if (!Array.isArray(imported)) {
      showToast("Ungültiges Format");
      return;
    }
    const valid = imported.filter((r) => r && r.id && Array.isArray(r.rows));
    if (!valid.length) {
      showToast("Keine gültigen Rezepte gefunden");
      return;
    }

    const newIds = new Set(valid.map((r) => r.id));
    const existing = state.recipes.filter((r) => newIds.has(r.id));
    let msg = `${valid.length} Rezept(e) gefunden.`;
    if (existing.length)
      msg += ` ${existing.length} davon bereits vorhanden — überschreiben?`;

    const ok = await askConfirm(msg, {
      title: "Rezepte importieren",
      confirmText: "Importieren",
    });
    if (!ok) return;

    // Merge: vorhandene überschreiben, neue anfügen
    state.recipes = state.recipes.filter((r) => !newIds.has(r.id));
    state.recipes.push(...valid);
    saveRecipes();
    renderLibrary();
    showToast(`${valid.length} Rezept(e) importiert`);
  };
  reader.readAsText(file);
}

/* ============== HELPERS ============== */
function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

/* ============== INIT ============== */
function init() {
  loadStorage();
  initTheme();

  // Tabs
  $$(".tab").forEach((t) =>
    t.addEventListener("click", () => setTab(t.dataset.tab)),
  );

  // Recipe controls
  $("#recipe-type").addEventListener("change", (e) => {
    state.current.type = e.target.value;
    updateBilanz();
  });
  $("#machine-cap").addEventListener("change", (e) => {
    state.current.machineCap = parseFloat(e.target.value) || 900;
    renderIngredientRows();
  });
  $("#recipe-title-display").addEventListener("input", (e) => {
    state.current.title = e.target.textContent;
  });
  $("#recipe-notes").addEventListener("input", (e) => {
    state.current.notes = e.target.value;
  });

  $("#reset-recipe").addEventListener("click", () => {
    newRecipe();
    showToast("Rezept geleert");
  });
  $("#save-recipe").addEventListener("click", saveCurrentRecipe);
  $("#copy-recipe").addEventListener("click", () => {
    if (state.current.id) {
      const newId = duplicateRecipe(state.current.id);
      if (newId) loadRecipe(newId);
    }
  });
  $("#toggle-cooking").addEventListener("click", toggleCookingMode);
  $("#log-production").addEventListener("click", () => {
    const snapRows = state.current.rows.map((r) => {
      const ing = findIngredient(r.ingId);
      return { ingId: r.ingId, ingName: ing ? ing.name : r.ingId, qty: r.qty };
    });
    const snapCalc = calculate(state.current.rows, state.current.machineCap);
    logProduction({
      recipeId: state.current.id,
      recipeName: state.current.title || "Neues Rezept",
      recipeType: state.current.type,
      qty: state.current.machineCap,
      recipeSnapshot: {
        rows: snapRows,
        calc: {
          total: snapCalc.total,
          ts: snapCalc.ts,
          fett: snapCalc.fett,
          zucker: snapCalc.zucker,
          pac: snapCalc.pac,
          pod: snapCalc.pod,
          stab: snapCalc.stab,
          wasser: snapCalc.wasser,
        },
      },
    });
  });
  $("#add-production").addEventListener("click", () => logProduction({}));
  $("#add-ingredient-row").addEventListener("click", () =>
    $("#ing-search").focus(),
  );
  $("#export-recipes").addEventListener("click", exportRecipes);
  $("#reset-all-data").addEventListener("click", async () => {
    const ok = await askConfirm(
      "Möchtest du alle Rezepte und Zutaten auf die Standardwerte zurücksetzen? Deine eigenen Änderungen gehen verloren.",
      {
        title: "Daten zurücksetzen",
        confirmText: "Zurücksetzen",
        danger: true,
      },
    );
    if (!ok) return;
    storage.remove(STORAGE_KEYS.ingredients);
    storage.remove(STORAGE_KEYS.recipes);
    location.reload();
  });
  $("#import-recipes").addEventListener("click", () =>
    $("#import-file").click(),
  );
  $("#import-file").addEventListener("change", (e) => {
    importRecipes(e.target.files[0]);
    e.target.value = "";
  });
  // Form-Filter (Trocken / Flüssig / Alle) — event delegation für Comet-Kompatibilität
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".form-filter-btn");
    if (!btn) return;
    const f = btn.dataset.formFilter;
    if (!f) return;
    state.ui.formFilter = f;
    saveUI();
    $$(".form-filter-btn").forEach((b) =>
      b.classList.toggle("is-active", b.dataset.formFilter === f),
    );
    $$("#ing-tbody tr").forEach((tr) => {
      const rowForm = tr.dataset.form;
      if (!rowForm) return;
      tr.classList.toggle("row-filtered", f !== "all" && rowForm !== f);
    });
  });

  // Autocomplete
  const search = $("#ing-search");
  search.addEventListener("input", (e) => {
    acIndex = -1;
    renderAutocomplete(e.target.value);
  });
  search.addEventListener("keydown", (e) => {
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
      selectIngredient(id);
    } else if (e.key === "Escape") {
      ac.hidden = true;
      acIndex = -1;
    }
  });
  search.addEventListener("blur", () => {
    setTimeout(() => ($("#autocomplete").hidden = true), 150);
  });

  const qtyInput = $("#ing-qty-input");
  qtyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!pendingIngId) return;
      addRow(pendingIngId, parseFloat(qtyInput.value) || 0);
      resetIngSearch();
    } else if (e.key === "Escape") {
      resetIngSearch();
    }
  });
  $("#ing-qty-cancel").addEventListener("click", resetIngSearch);

  // Library search
  const libSearch = $("#library-search");
  if (libSearch) libSearch.addEventListener("input", () => renderLibrary());

  // Ingredients DB
  $("#add-custom-ing").addEventListener("click", addCustomIngredient);

  // Initial render
  applyCurrentToUI();
  renderReference();
  // Gespeicherten Form-Filter wiederherstellen
  const savedFilter = state.ui.formFilter || "all";
  $$(".form-filter-btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.formFilter === savedFilter),
  );
  setTab(state.ui.tab || "recipe");
}

document.addEventListener("DOMContentLoaded", init);
