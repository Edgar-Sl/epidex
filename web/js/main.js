/**
 * Arranque: sin ?modo= enseña el menú principal (regiones y tu Pokédex); con
 * ?modo=<región> carga el Pokémon del día de esa región y crea la partida.
 *
 * Estructura de js/:
 *   core/    lógica pura, sin DOM (reglas, pistas, Pokédex, estadísticas, fechas,
 *            búsqueda, texto para compartir). Se prueba en dev/tests.html.
 *   render/  animación de epiciclos en canvas.
 *   ui/      piezas de interfaz (combobox, toasts, estadísticas, menú, Pokédex).
 *   app/     lo propio de esta página: configuración, datos, guardado,
 *            compartir y el controlador de la partida.
 */

import { SITE } from "./app/config.js";
import { GameController } from "./app/controller.js";
import {
  NoPuzzleError,
  homeUrl,
  loadCollections,
  loadToday,
  modeUrl,
  pickCollection,
  shareUrl,
  today,
} from "./app/data.js";
import { LOCALE, setupLanguage, t } from "./app/i18n.js";
import { GameStorage, dexStore } from "./app/storage.js";
import { DEX_SIZE, dexCounts, emptyDex } from "./core/dex.js";
import { renderDex, renderDexKeys } from "./ui/dex-view.js";
import { byId } from "./ui/dom.js";
import { fitToViewport } from "./ui/fit.js";
import { renderHomeDex, renderModes } from "./ui/home-view.js";
import { createToaster } from "./ui/toast.js";

const toast = createToaster(byId("toasts"));
const prefs = new GameStorage("app");

/**
 * Cómo va hoy un modo, según su partida guardada: "won", "lost", "playing" o
 * "new" (no jugado hoy). Con la puntuación si ya ha acabado.
 * @param {string} collectionId
 * @param {string} today Fecha del puzzle de hoy (YYYY-MM-DD).
 */
function modeStatus(collectionId, today) {
  const saved = new GameStorage(collectionId).read("game", null);
  if (!saved || saved.date !== today) return { kind: "new" };
  if (saved.status === "playing") return { kind: "playing" };
  const score = `${saved.attempts?.length ?? 0}/${saved.levels?.length ?? 6}`;
  return { kind: saved.status === "won" ? "won" : "lost", score };
}

/** Pestaña con la que se abre la Pokédex (0 = Gen I): la del modo que se juega. */
let dexGeneration = 0;

/** Cuenta de la Pokédex en la tapa (escritorio). */
function updateDexFlap() {
  const dex = dexStore.load(emptyDex());
  const { caught, seen } = dexCounts(dex);
  byId("dex-flap-count").textContent = `${t("dexCount", { caught, seen })} · ${t("dexOf", { total: DEX_SIZE })}`;
  renderDexKeys(byId("dex-flap-gens"), dex);
}

function openDex() {
  const dex = dexStore.load(emptyDex());
  const { caught, seen } = dexCounts(dex);
  byId("dex-caught").textContent = String(caught);
  byId("dex-seen").textContent = String(seen);
  byId("dex-total").textContent = t("dexOf", { total: DEX_SIZE });
  renderDex({
    tabs: byId("dex-tabs"),
    grid: byId("dex-grid"),
    dex,
    generation: dexGeneration,
    dataDir: SITE.dataDir,
    locale: LOCALE,
    t,
  });
  /** @type {HTMLDialogElement} */ (byId("dex-dialog")).showModal();
}

/** Diálogos de ayuda y estadísticas; la ayuda se abre sola la primera vez. */
function setupDialogs(getGame) {
  const help = /** @type {HTMLDialogElement} */ (byId("help-dialog"));
  byId("open-help").addEventListener("click", () => help.showModal());
  for (const id of ["open-dex", "dex-flap", "result-dex", "result-dex-link"]) {
    byId(id).addEventListener("click", openDex);
  }
  updateDexFlap();
  byId("open-stats").addEventListener("click", () => getGame()?.openStats());
  byId("result-stats").addEventListener("click", () => getGame()?.openStats());
  // Clic en el fondo (fuera de la tarjeta) cierra el diálogo.
  for (const dialog of document.querySelectorAll("dialog")) {
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
  }
  if (!prefs.read("seenHelp", false)) {
    help.showModal();
    help.addEventListener("close", () => prefs.write("seenHelp", true), { once: true });
  }
}

/** Enseña las zonas de una pantalla ("home" o "game") y deja ocultas las de la otra. */
function show(view) {
  document.body.dataset.view = view;
  for (const el of document.querySelectorAll(`[data-${view}]`)) el.hidden = false;
}

async function start() {
  let game = null;
  setupDialogs(() => game);
  const refit = fitToViewport(byId("device"), () => game?.renderer.resize());
  try {
    const collections = await loadCollections();
    const collection = pickCollection(collections);

    if (!collection) {
      // Menú principal: regiones a un lado y tu Pokédex al otro.
      const date = await today(collections[0]);
      renderModes({
        collections,
        status: (id) => modeStatus(id, date),
        href: modeUrl,
        t,
      });
      renderHomeDex({ dex: dexStore.load(emptyDex()), collections, dataDir: SITE.dataDir, t });
      byId("home-open-dex").addEventListener("click", openDex);
      show("home");
      return;
    }

    const data = await loadToday(collection);
    for (const id of ["open-modes", "other-mode"]) byId(id).setAttribute("href", homeUrl());
    const gen = /^gen(\d)$/.exec(collection.id);
    // En "todas" no se abre por la generación del Pokémon de hoy: sería una pista gratis.
    dexGeneration = gen ? Number(gen[1]) - 1 : 0;
    game = new GameController({
      collection,
      shareLink: shareUrl(collection.id),
      toast,
      onDexChange: updateDexFlap,
      ...data,
    });
    show("game");
    byId("open-stats").hidden = false;
    window.game = game; // accesible desde la consola para depurar
  } catch (error) {
    if (!(error instanceof NoPuzzleError)) console.error(error);
    const notice = byId("notice");
    notice.textContent = error.message;
    notice.hidden = false;
  } finally {
    byId("loading").remove();
    refit();
  }
}

if (!setupLanguage()) start();
