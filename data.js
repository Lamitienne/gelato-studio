/* ============================================================
   Zutaten-Datenbank & Zielwerte
   Quellen:
   - Uwe Koch, "Eismanufaktur" (Bilanzierung-Methode)
   - Les Vergers Boiron, Eismagazin, LAVES Workshop Speiseeis
   PAC/POD basieren auf Saccharose = 100 (Standard).
   Werte sind Prozent der Zutat (z.B. Magermilchpulver: 96 % TS).
   ============================================================ */

const DEFAULT_INGREDIENTS = [
  // ---------- MILCH ----------
  // PAC/POD für Milch: Laktose hat PAC≈100, POD≈16 (Saccharose=100). Werte = % Laktose × Faktor.
  // z.B. Vollmilch hat ~4,8 % Laktose → PAC ≈ 4,8 ; POD ≈ 4,8 × 0,16 = 0,77
  { id: "vollmilch",        name: "Vollmilch (3,5 %)",         cat: "Milch",        ts: 12.5,  fett: 3.5,  zucker: 4.8,  pac: 4.8,  pod: 0.8 },
  { id: "magermilch",       name: "Magermilch",                cat: "Milch",        ts: 9.5,   fett: 0.1,  zucker: 4.9,  pac: 4.9,  pod: 0.8 },
  { id: "sahne33",          name: "Schlagsahne 33 %",          cat: "Milch",        ts: 38.0,  fett: 33.0, zucker: 3.0,  pac: 3.0,  pod: 0.5 },
  { id: "sahne35",          name: "Schlagsahne 35 %",          cat: "Milch",        ts: 40.0,  fett: 35.0, zucker: 3.0,  pac: 3.0,  pod: 0.5 },
  { id: "kondensmilch",     name: "Kondensmilch (gez. nicht)", cat: "Milch",        ts: 25.0,  fett: 7.5,  zucker: 9.5,  pac: 9.5,  pod: 1.5 },
  { id: "magermilchpulver", name: "Magermilchpulver",          cat: "Milch",        ts: 96.0,  fett: 1.0,  zucker: 51.0, pac: 51.0, pod: 8.2 },
  { id: "vollmilchpulver",  name: "Vollmilchpulver",           cat: "Milch",        ts: 96.0,  fett: 26.0, zucker: 38.0, pac: 38.0, pod: 6.1 },
  { id: "joghurt",          name: "Joghurt natur (3,5 %)",     cat: "Milch",        ts: 14.0,  fett: 3.5,  zucker: 5.0,  pac: 5.0,  pod: 0.8 },
  { id: "butter",           name: "Butter",                    cat: "Milch",        ts: 84.0,  fett: 82.0, zucker: 0.5,  pac: 0.5,  pod: 0.1 },

  // ---------- ZUCKER ----------
  { id: "saccharose",       name: "Saccharose (Kristallzucker)", cat: "Zucker",     ts: 100.0, fett: 0.0,  zucker: 100.0, pac: 100.0, pod: 100.0 },
  { id: "dextrose",         name: "Dextrose (Traubenzucker)",  cat: "Zucker",       ts: 100.0, fett: 0.0,  zucker: 100.0, pac: 190.0, pod: 70.0 },
  { id: "fruktose",         name: "Fruktose",                  cat: "Zucker",       ts: 100.0, fett: 0.0,  zucker: 100.0, pac: 190.0, pod: 170.0 },
  { id: "invertzucker",     name: "Invertzucker (Trimoline)",  cat: "Zucker",       ts: 80.0,  fett: 0.0,  zucker: 80.0,  pac: 152.0, pod: 104.0 },
  { id: "glukose40",        name: "Glukose-Sirup 40 DE",       cat: "Zucker",       ts: 80.0,  fett: 0.0,  zucker: 80.0,  pac: 76.0,  pod: 40.0 },
  { id: "glukose-pulver",   name: "Glukose Atomisato 38 DE",   cat: "Zucker",       ts: 100.0, fett: 0.0,  zucker: 100.0, pac: 45.0,  pod: 24.0 },
  { id: "honig",            name: "Honig",                     cat: "Zucker",       ts: 80.0,  fett: 0.0,  zucker: 80.0,  pac: 152.0, pod: 104.0 },
  { id: "ahornsirup",       name: "Ahornsirup",                cat: "Zucker",       ts: 67.0,  fett: 0.0,  zucker: 67.0,  pac: 67.0,  pod: 67.0 },
  { id: "maltodextrin",     name: "Maltodextrin 18 DE",        cat: "Zucker",       ts: 100.0, fett: 0.0,  zucker: 0.0,   pac: 18.0,  pod: 5.0 },

  // ---------- BINDEMITTEL ----------
  { id: "johannisbrotkernmehl", name: "Johannisbrotkernmehl", cat: "Bindemittel",   ts: 90.0,  fett: 0.0,  zucker: 0.0, pac: 0.0,   pod: 0.0 },
  { id: "guarkernmehl",     name: "Guarkernmehl",              cat: "Bindemittel",  ts: 90.0,  fett: 0.0,  zucker: 0.0, pac: 0.0,   pod: 0.0 },
  { id: "xanthan",          name: "Xanthan",                   cat: "Bindemittel",  ts: 90.0,  fett: 0.0,  zucker: 0.0, pac: 0.0,   pod: 0.0 },
  { id: "inulin",           name: "Inulin",                    cat: "Bindemittel",  ts: 95.0,  fett: 0.0,  zucker: 0.0, pac: 0.0,   pod: 7.0 },
  { id: "eigelb",           name: "Eigelb",                    cat: "Bindemittel",  ts: 51.0,  fett: 31.0, zucker: 0.0, pac: 0.0,   pod: 0.0 },

  // ---------- WASSER ----------
  { id: "wasser",           name: "Wasser",                    cat: "Sonstige",     ts: 0.0,   fett: 0.0,  zucker: 0.0, pac: 0.0,   pod: 0.0 },

  // ---------- FRÜCHTE ----------
  // Frucht-Zucker = Mischung Glukose+Fruktose+Saccharose. Mittl. PAC≈140, POD≈110 → ca. 1,4×Zucker für PAC, 1,1×Zucker für POD
  { id: "erdbeere",         name: "Erdbeere (frisch)",         cat: "Frucht",       ts: 9.0,   fett: 0.4,  zucker: 5.5,  pac: 7.7,  pod: 6.1 },
  { id: "himbeere",         name: "Himbeere",                  cat: "Frucht",       ts: 12.0,  fett: 0.7,  zucker: 4.4,  pac: 6.2,  pod: 4.8 },
  { id: "heidelbeere",      name: "Heidelbeere",               cat: "Frucht",       ts: 15.0,  fett: 0.6,  zucker: 9.7,  pac: 13.6, pod: 10.7 },
  { id: "johannisbeere-rot",name: "Rote Johannisbeere",        cat: "Frucht",       ts: 14.0,  fett: 0.2,  zucker: 7.4,  pac: 10.4, pod: 8.1 },
  { id: "kirsche",          name: "Kirsche (entsteint)",       cat: "Frucht",       ts: 17.0,  fett: 0.5,  zucker: 13.0, pac: 18.2, pod: 14.3 },
  { id: "aprikose",         name: "Aprikose",                  cat: "Frucht",       ts: 14.0,  fett: 0.4,  zucker: 9.0,  pac: 12.6, pod: 9.9 },
  { id: "pfirsich",         name: "Pfirsich",                  cat: "Frucht",       ts: 13.0,  fett: 0.3,  zucker: 8.7,  pac: 12.2, pod: 9.6 },
  { id: "mango",            name: "Mango (Püree)",             cat: "Frucht",       ts: 17.0,  fett: 0.4,  zucker: 14.0, pac: 19.6, pod: 15.4 },
  { id: "banane",           name: "Banane",                    cat: "Frucht",       ts: 24.0,  fett: 0.3,  zucker: 17.0, pac: 23.8, pod: 18.7 },
  { id: "zitrone-saft",     name: "Zitronensaft",              cat: "Frucht",       ts: 8.0,   fett: 0.0,  zucker: 2.5,  pac: 3.5,  pod: 2.8 },

  // ---------- AROMA ----------
  { id: "kakao",            name: "Kakaopulver (entölt)",      cat: "Aroma",        ts: 95.0,  fett: 11.0, zucker: 0.0,  pac: 0.0,  pod: 0.0 },
  { id: "schoko-70",        name: "Bitterschokolade 70 %",     cat: "Aroma",        ts: 99.0,  fett: 42.0, zucker: 28.0, pac: 28.0, pod: 28.0 },
  { id: "haselnuss-pasta",  name: "Haselnusspaste 100 %",      cat: "Aroma",        ts: 98.0,  fett: 60.0, zucker: 4.0,  pac: 4.0,  pod: 4.0 },
  { id: "sahne-eis-basis",  name: "Eigelb (gekocht)",          cat: "Aroma",        ts: 51.0,  fett: 31.0, zucker: 0.0,  pac: 0.0,  pod: 0.0 },
  { id: "vanille-mark",     name: "Vanillemark",               cat: "Aroma",        ts: 30.0,  fett: 0.5,  zucker: 0.0,  pac: 0.0,  pod: 0.0 },
  { id: "salz",             name: "Salz",                      cat: "Sonstige",     ts: 100.0, fett: 0.0,  zucker: 0.0,  pac: 540.0, pod: 0.0 },

  // ---------- BASES (vorgemischt nach Uwe Koch) ----------
  // Aggregierte Werte aus den Einzelkomponenten der jeweiligen Base.
  // Verwendung: einmal die Base anrühren, dann pro Charge die gewünschte Menge
  // (typisch 30 g pro kg Mix) als eine Zutat einsetzen.
  { id: "base-milch",  name: "Milchbase 30 (vorgemischt)",  cat: "Bindemittel", ts: 98.3, fett: 0.2, zucker: 81.8, pac: 99.5,  pod: 37.4, isBase: true, baseFor: "milcheis" },
  { id: "base-frucht", name: "Fruchtbase 30 (vorgemischt)", cat: "Bindemittel", ts: 98.9, fett: 0.0, zucker: 89.3, pac: 117.9, pod: 46.1, isBase: true, baseFor: "fruchteis" }
];

/* ============================================================
   Zielbereiche (Richtwerte für Hausgebrauch / 1,5 L Maschinen)
   Quellen: Uwe Koch, LAVES Speiseeis-Workshop, Eismagazin
   ============================================================ */
const TARGETS = {
  milcheis: {
    label: "Milcheis",
    metrics: {
      ts:     { label: "Trockenmasse", unit: "%", min: 32, max: 42, ideal: [34, 38] },
      fett:   { label: "Fett",         unit: "%", min: 6,  max: 12, ideal: [7, 10] },
      zucker: { label: "Zucker",       unit: "%", min: 16, max: 22, ideal: [18, 20] },
      pac:    { label: "PAC",          unit: "",  min: 22, max: 30, ideal: [24, 28] },
      pod:    { label: "POD",          unit: "",  min: 14, max: 22, ideal: [16, 20] }
    }
  },
  fruchteis: {
    label: "Fruchteis / Sorbet",
    metrics: {
      ts:     { label: "Trockenmasse", unit: "%", min: 28, max: 36, ideal: [30, 34] },
      fett:   { label: "Fett",         unit: "%", min: 0,  max: 3,  ideal: [0, 1] },
      zucker: { label: "Zucker",       unit: "%", min: 22, max: 30, ideal: [24, 28] },
      pac:    { label: "PAC",          unit: "",  min: 26, max: 34, ideal: [28, 32] },
      pod:    { label: "POD",          unit: "",  min: 18, max: 26, ideal: [20, 24] }
    }
  }
};

/* ============================================================
   Basis-Rezepturen nach Uwe Koch „Eismanufaktur“
   ----
   Milchbase 30 und Fruchtbase 30 — die Zahl steht für die
   Menge in Gramm, die pro 1 kg Mix verwendet wird.
   210 g Basis liefern Bindemittel, Dextrose, Glukose und
   (bei Milchbase) Magermilchpulver für Bindung und Trockenmasse.
   Ergänzt wird mit Milch/Sahne (Milcheis) bzw. Fruchtpüree und
   Saccharose (Fruchteis), je nach gewünschter Sorte.
   ============================================================ */
/* ============================================================
   Bases als Einzelzutaten — vorgemischt verwenden.
   Empfohlene Menge: 30 g pro kg Mix (Name = „Base 30").
   Die Vormisch-Rezeptur (Komponenten + Mengen) ist nur zur Info,
   damit du die Base einmal anrühren und aufbewahren kannst.
   ============================================================ */
const BASE_RECIPES = {
  milcheis: {
    label: "Milchbase 30 (nach U. Koch)",
    ingId: "base-milch",
    dosagePerKg: 30,        // g Base pro 1 kg Mix
    components: [
      { ingId: "johannisbrotkernmehl", qty: 10.5 },
      { ingId: "guarkernmehl",         qty: 10.5 },
      { ingId: "dextrose",             qty: 84 },
      { ingId: "glukose-pulver",       qty: 70 },
      { ingId: "magermilchpulver",     qty: 35 }
    ]
  },
  fruchteis: {
    label: "Fruchtbase 30 (nach U. Koch)",
    ingId: "base-frucht",
    dosagePerKg: 30,
    components: [
      { ingId: "johannisbrotkernmehl", qty: 10.5 },
      { ingId: "guarkernmehl",         qty: 10.5 },
      { ingId: "dextrose",             qty: 105 },
      { ingId: "glukose-pulver",       qty: 70 }
    ]
  }
};
