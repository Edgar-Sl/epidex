/**
 * Tests de los módulos JS sin dependencias: se ejecutan abriendo
 * dev/tests.html en el navegador (con el servidor local en marcha).
 */

import { AnswerIndex } from "../js/core/answer-index.js";
import { dateInTimeZone, findScheduleEntry, formatDuration, msUntilNextDay } from "../js/core/dates.js";
import { chainPositions, evaluate, truncate } from "../js/render/epicycles.js";
import {
  attemptResults,
  circlesToShow,
  createGame,
  guess,
  isOver,
  levelIndex,
  skip,
  takeHint,
} from "../js/core/game.js";
import { availableHints, hintText } from "../js/core/hints.js";
import { dexCounts, dexId, dexSlots, emptyDex, generationOf, recentCatches, recordInDex } from "../js/core/dex.js";
import { buildShareText } from "../js/core/share.js";
import { appShareUrl } from "../js/app/share-action.js";
import { browserLang, t } from "../js/app/i18n.js";
import { displayedStreak, emptyStats, previousDate, recordResult, winRate } from "../js/core/stats.js";
import { GameStorage } from "../js/app/storage.js";
import { normalize } from "../js/core/text.js";

// ---- Mini framework ------------------------------------------------------
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function assertEqual(actual, expected, message = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message} esperado ${e}, obtenido ${a}`);
}
function assertClose(actual, expected, tol = 1e-9) {
  if (Math.abs(actual - expected) > tol) throw new Error(`esperado ${expected}, obtenido ${actual}`);
}

// ---- Datos de prueba -----------------------------------------------------
const PUZZLE = { id: "p1", answer: "ITA", levels: [2, 4, 8, 16, 32, 64], terms: [] };
const ENTRY = { number: 3, date: "2026-12-03" };
const ANSWERS = [
  { id: "ITA", name: "Italia", aliases: [] },
  { id: "NLD", name: "Países Bajos", aliases: ["Holanda"] },
  { id: "USA", name: "Estados Unidos", aliases: ["EE. UU.", "EEUU", "USA"] },
  { id: "JPN", name: "Japón", aliases: [] },
  { id: "IRL", name: "Irlanda", aliases: [] },
  { id: "ISL", name: "Islandia", aliases: [] },
];

// ---- text.js -------------------------------------------------------------
test("normalize igual que en Python", () => {
  assertEqual(normalize("  Japón "), "japon");
  assertEqual(normalize("REPÚBLICA   Checa"), "republica checa");
  assertEqual(normalize("Côte d'Ivoire"), "cote d'ivoire");
});

// ---- game.js -------------------------------------------------------------
test("partida nueva empieza en el nivel 0 con 2 círculos", () => {
  const s = createGame(PUZZLE, ENTRY);
  assertEqual([levelIndex(s), circlesToShow(s), s.status], [0, 2, "playing"]);
});

test("fallo y saltar avanzan de nivel", () => {
  let s = createGame(PUZZLE, ENTRY);
  let r = guess(s, "JPN");
  assertEqual(r.outcome, "wrong");
  s = r.state;
  assertEqual(circlesToShow(s), 4);
  r = skip(s);
  assertEqual(r.outcome, "skip");
  assertEqual(circlesToShow(r.state), 8);
});

test("respuesta repetida no consume intento", () => {
  const s = guess(createGame(PUZZLE, ENTRY), "JPN").state;
  const r = guess(s, "JPN");
  assertEqual([r.outcome, r.state.attempts.length], ["duplicate", 1]);
});

test("acertar gana y muestra el dibujo completo", () => {
  let s = skip(createGame(PUZZLE, ENTRY)).state;
  const r = guess(s, "ITA");
  s = r.state;
  assertEqual([r.outcome, s.status, circlesToShow(s)], ["correct", "won", 64]);
  assertEqual(attemptResults(s), ["skip", "correct", "unused", "unused", "unused", "unused"]);
  assertEqual(guess(s, "JPN").outcome, "over");
});

test("seis fallos pierden", () => {
  let s = createGame(PUZZLE, ENTRY);
  for (let i = 0; i < 6; i++) s = skip(s).state;
  assertEqual([s.status, isOver(s), levelIndex(s)], ["lost", true, 5]);
});

test("el estado no se modifica (inmutable)", () => {
  const s = createGame(PUZZLE, ENTRY);
  guess(s, "JPN");
  assertEqual(s.attempts.length, 0);
});

test("una sola pista por partida, y solo jugando", () => {
  const start = createGame(PUZZLE, ENTRY);
  const withHint = takeHint(start, "type");
  assertEqual(withHint.hint, "type");
  assertEqual(start.hint, undefined, "inmutable");
  assertEqual(takeHint(withHint, "color").hint, "type", "no se cambia");
  const over = guess(start, "ITA").state;
  assertEqual(takeHint(over, "type").hint, undefined, "al acabar no hay pistas");
});

// ---- hints.js ------------------------------------------------------------
const HINTS = {
  type: { es: "Eléctrico", en: "Electric" },
  stage: "middle",
  size: { m: 0.4, kg: 6 },
  letter: "P",
  generation: 3,
};
const WORDS_ES = {
  lang: "es", locale: "es-ES", stages: { middle: "Forma intermedia" }, startsWith: "Empieza por «{letter}»",
};
test("pistas disponibles en orden y su texto en cada idioma", () => {
  assertEqual(availableHints({ hints: HINTS }), ["type", "stage", "size", "letter", "generation"]);
  assertEqual(availableHints({}), []);
  assertEqual(hintText("type", HINTS, WORDS_ES), "Eléctrico");
  assertEqual(hintText("type", HINTS, { ...WORDS_ES, lang: "en" }), "Electric");
  assertEqual(hintText("stage", HINTS, WORDS_ES), "Forma intermedia");
  assertEqual(hintText("size", HINTS, WORDS_ES), "0,4 m · 6 kg");
  assertEqual(hintText("letter", HINTS, WORDS_ES), "Empieza por «P»");
  assertEqual(hintText("generation", HINTS, WORDS_ES), "Gen III · Hoenn");
});

test("compartir dice si se usó pista o no", () => {
  const base = { gameName: "Epidex", number: 1, emoji: "Gen I", maxAttempts: 6, won: true,
    attemptsUsed: 1, results: ["correct", "unused", "unused", "unused", "unused", "unused"] };
  assertEqual(buildShareText({ ...base, hint: "Tipo" }).split("\n").at(-1), "Con pista: Tipo");
  assertEqual(buildShareText({ ...base, hint: null }).split("\n").at(-1), "Sin pistas");
  assertEqual(buildShareText(base).split("\n").length, 2, "sin pistas en el modo: nada");
});

// ---- dex.js --------------------------------------------------------------
test("la Pokédex anota capturados y vistos, y capturar es para siempre", () => {
  let dex = emptyDex();
  dex = recordInDex(dex, { id: "025", won: false, date: "2026-01-01", name: "Pikachu" });
  assertEqual(dex.entries["025"].status, "seen");
  dex = recordInDex(dex, { id: "025", won: true, date: "2026-01-05", name: "Pikachu", art: "gen1/art/x.webp" });
  assertEqual(dex.entries["025"], { status: "caught", date: "2026-01-05", name: "Pikachu", art: "gen1/art/x.webp" });
  const again = recordInDex(dex, { id: "025", won: false, date: "2026-02-01", name: "Pikachu" });
  assertEqual(again.entries["025"].status, "caught", "no baja a visto");
  dex = recordInDex(dex, { id: "1025", won: false, date: "2026-01-02", name: "Pecharunt" });
  assertEqual(dexCounts(dex), { caught: 1, seen: 1 });
  assertEqual(dexCounts(dex, [1, 151]), { caught: 1, seen: 0 });
});

test("casillas de la Pokédex por generación", () => {
  const dex = recordInDex(emptyDex(), { id: "152", won: true, date: "2026-01-01", name: "Chikorita" });
  const johto = dexSlots(dex, 1);
  assertEqual(johto.length, 100);
  assertEqual(johto[0].id, "152");
  assertEqual(johto[0].entry.name, "Chikorita");
  assertEqual(johto[1].entry, null);
  assertEqual(dexSlots(dex, 8).at(-1).id, "1025");
  assertEqual([dexId(7), generationOf(25), generationOf(1000)], ["007", 0, 8]);
});

test("últimas capturas, de la más reciente a la más antigua", () => {
  let dex = emptyDex();
  dex = recordInDex(dex, { id: "001", won: true, date: "2026-01-01", name: "Bulbasaur" });
  dex = recordInDex(dex, { id: "004", won: false, date: "2026-01-03", name: "Charmander" });
  dex = recordInDex(dex, { id: "007", won: true, date: "2026-01-02", name: "Squirtle" });
  assertEqual(recentCatches(dex, 5).map((e) => e.id), ["007", "001"]);
  assertEqual(recentCatches(dex, 1).length, 1);
});

// ---- autocomplete.js -----------------------------------------------------
const index = new AnswerIndex(ANSWERS);
const ids = (list) => list.map((s) => s.answer.id);

test("búsqueda sin tildes ni mayúsculas", () => {
  assertEqual(ids(index.search("JAPON")), ["JPN"]);
});

test("busca por alias y lo indica", () => {
  const [first] = index.search("holan");
  assertEqual([first.answer.id, first.alias], ["NLD", "Holanda"]);
});

test("prefijo del nombre antes que subcadena", () => {
  // "irl" es prefijo de Irlanda; "isl" no aparece en Irlanda.
  assertEqual(ids(index.search("i")).slice(0, 3), ["IRL", "ISL", "ITA"]);
  assertEqual(ids(index.search("bajos")), ["NLD"]);
});

test("excluye los ya probados", () => {
  assertEqual(ids(index.search("i", { exclude: new Set(["IRL"]) }))[0], "ISL");
});

test("resolve exige coincidencia exacta normalizada", () => {
  assertEqual(index.resolve("ee. uu.")?.id, "USA");
  assertEqual(index.resolve("italia ")?.id, "ITA");
  assertEqual(index.resolve("ital"), null);
});

// ---- dates.js ------------------------------------------------------------
test("fecha en Madrid cambia a medianoche de Madrid, no UTC", () => {
  // 23:30 UTC del 31-dic = 00:30 del 1-ene en Madrid (UTC+1 en invierno).
  assertEqual(dateInTimeZone("Europe/Madrid", new Date("2026-12-31T23:30:00Z")), "2027-01-01");
  assertEqual(dateInTimeZone("Europe/Madrid", new Date("2026-12-31T22:30:00Z")), "2026-12-31");
  // Verano (UTC+2).
  assertEqual(dateInTimeZone("Europe/Madrid", new Date("2027-07-01T22:30:00Z")), "2027-07-02");
});

test("findScheduleEntry", () => {
  const schedule = { days: [{ date: "2026-12-01", number: 1, puzzle: "a" }] };
  assertEqual(findScheduleEntry(schedule, "2026-12-01")?.puzzle, "a");
  assertEqual(findScheduleEntry(schedule, "2026-12-02"), null);
});

// ---- epicycles.js --------------------------------------------------------
test("un círculo horario de radio 1 empieza arriba y gira", () => {
  const terms = [[0, 0, 0], [-1, 0, 1]]; // c = i  ->  z(0) = i (arriba)
  const p0 = evaluate(terms, 0);
  assertClose(p0.x, 0);
  assertClose(p0.y, 1);
  const p = evaluate(terms, 0.25); // un cuarto de vuelta horaria -> derecha
  assertClose(p.x, 1);
  assertClose(p.y, 0);
});

test("chainPositions y truncate", () => {
  const terms = [[0, 0.5, 0], [1, 1, 0], [-1, 0.25, 0]];
  assertEqual(truncate(terms, 1).length, 2);
  const chain = chainPositions(terms, 0);
  assertEqual(chain.length, 4);
  assertClose(chain[3].x, 1.75);
});

// ---- stats.js ------------------------------------------------------------
test("previousDate cruza meses y años", () => {
  assertEqual(previousDate("2027-01-01"), "2026-12-31");
  assertEqual(previousDate("2028-03-01"), "2028-02-29");
});

test("racha sube con días consecutivos y se rompe al fallar", () => {
  let s = emptyStats();
  s = recordResult(s, { date: "2026-12-01", won: true, attemptsUsed: 3 });
  s = recordResult(s, { date: "2026-12-02", won: true, attemptsUsed: 1 });
  assertEqual([s.currentStreak, s.maxStreak, s.distribution["3"], s.distribution["1"]], [2, 2, 1, 1]);
  s = recordResult(s, { date: "2026-12-03", won: false, attemptsUsed: 6 });
  assertEqual([s.currentStreak, s.maxStreak, s.distribution.fail, s.played, winRate(s)], [0, 2, 1, 3, 67]);
});

test("saltarse un día reinicia la racha", () => {
  let s = recordResult(emptyStats(), { date: "2026-12-01", won: true, attemptsUsed: 2 });
  assertEqual(displayedStreak(s, "2026-12-02"), 1);
  assertEqual(displayedStreak(s, "2026-12-03"), 0);
  s = recordResult(s, { date: "2026-12-03", won: true, attemptsUsed: 2 });
  assertEqual(s.currentStreak, 1);
});

test("el mismo día no se cuenta dos veces", () => {
  const s = recordResult(emptyStats(), { date: "2026-12-01", won: true, attemptsUsed: 2 });
  assertEqual(recordResult(s, { date: "2026-12-01", won: true, attemptsUsed: 2 }), s);
});

// ---- share.js ------------------------------------------------------------
test("texto para compartir: resultado, círculos y enlace, sin la respuesta", () => {
  const base = { gameName: "[NOMBRE]", number: 12, emoji: "🌍", maxAttempts: 6 };
  assertEqual(
    buildShareText({ ...base, won: true, attemptsUsed: 3, circles: 8, url: "https://x.test/",
      results: ["wrong", "skip", "correct", "unused", "unused", "unused"] }),
    "[NOMBRE] 🌍 #12 · 3/6\n🟥⬛🟩⬜⬜⬜\nLo saqué con 8 círculos\nhttps://x.test/",
  );
  assertEqual(
    buildShareText({ ...base, won: false, attemptsUsed: 6,
      results: ["skip", "wrong", "wrong", "wrong", "wrong", "wrong"] }),
    "[NOMBRE] 🌍 #12 · X/6\n⬛🟥🟥🟥🟥🟥",
  );
});

test("enlaces de WhatsApp, Telegram y X con el mensaje y los emojis intactos", () => {
  const wa = new URL(appShareUrl("whatsapp", "Epidex #1 · 1/6\n🟩", "https://x.test/"));
  assertEqual(wa.origin + wa.pathname, "https://api.whatsapp.com/send");
  assertEqual(wa.searchParams.get("text"), "Epidex #1 · 1/6\n🟩\nhttps://x.test/");
  const tg = new URL(appShareUrl("telegram", "🟩", "https://x.test/"));
  assertEqual([tg.searchParams.get("url"), tg.searchParams.get("text")], ["https://x.test/", "🟩"]);
  const x = new URL(appShareUrl("x", "🟩", "https://x.test/"));
  assertEqual(x.hostname, "x.com");
  assertEqual(x.searchParams.get("text"), "🟩");
});

test("cuenta atrás hasta la medianoche de Madrid", () => {
  // 23:00:00 en Madrid (invierno, UTC+1) = 22:00 UTC: falta una hora.
  assertEqual(msUntilNextDay("Europe/Madrid", new Date("2026-12-01T22:00:00Z")), 3600 * 1000);
  assertEqual(formatDuration(3723 * 1000), "01:02:03");
});

// ---- storage.js ----------------------------------------------------------
function fakeBackend() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test("guarda y recupera la partida del día", () => {
  const store = new GameStorage("countries", fakeBackend());
  const state = guess(createGame(PUZZLE, ENTRY), "JPN").state;
  store.saveGame(state);
  assertEqual(store.loadGame("p1", state.version), state);
  assertEqual(store.loadGame("otro-puzzle", state.version), null);
});

test("JSON corrupto o localStorage roto no rompen el juego", () => {
  const backend = fakeBackend();
  const store = new GameStorage("countries", backend);
  backend.map.set("fourier:v1:countries:game", "{no es json");
  assertEqual(store.loadGame("p1", 1), null);
  const broken = {
    getItem() { throw new Error("SecurityError"); },
    setItem() { throw new Error("QuotaExceededError"); },
    removeItem() {},
  };
  const store2 = new GameStorage("countries", broken);
  assertEqual(store2.saveGame({}), false);
  assertEqual(store2.loadStats(emptyStats()).played, 0);
});

// ---- i18n.js -------------------------------------------------------------
test("textos traducidos e idioma del navegador", () => {
  assertEqual(t("notIt", { name: "Pikachu" }, "en"), "It's not Pikachu");
  assertEqual(t("notIt", { name: "Pikachu" }, "es"), "No es Pikachu");
  assertEqual(browserLang(["es-MX", "en"]), "es");
  assertEqual(browserLang(["fr-FR"]), null);
});

// ---- Ejecutar ------------------------------------------------------------
const out = document.getElementById("results");
let failed = 0;
for (const { name, fn } of tests) {
  const li = document.createElement("li");
  try {
    fn();
    li.textContent = `✅ ${name}`;
  } catch (error) {
    failed++;
    li.textContent = `❌ ${name}: ${error.message}`;
    li.className = "fail";
  }
  out.append(li);
}
document.getElementById("summary").textContent =
  failed === 0 ? `${tests.length} tests OK` : `${failed} de ${tests.length} fallan`;
document.title = failed === 0 ? "✅ Tests" : "❌ Tests";
