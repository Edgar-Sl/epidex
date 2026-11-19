/**
 * Arranque: carga los datos del día, pinta la cabecera y crea la partida.
 *
 * Estructura de js/:
 *   core/    lógica pura, sin DOM (reglas, estadísticas, fechas, búsqueda, texto
 *            para compartir). Se prueba en dev/tests.html.
 *   render/  animación de epiciclos en canvas.
 *   ui/      piezas de interfaz reutilizables (combobox, toasts, estadísticas).
 *   app/     lo propio de esta página: configuración, datos, guardado,
 *            compartir y el controlador de la partida.
 */

import { GameStorage } from "./app/storage.js";
import { GameController } from "./app/controller.js";
import { loadCollections, loadToday, modeUrl, NoPuzzleError, pickCollection, shareUrl } from "./app/data.js";
import { SITE } from "./app/config.js";
import { byId, h } from "./ui/dom.js";
import { createToaster } from "./ui/toast.js";

const toast = createToaster(byId("toasts"));
const prefs = new GameStorage("app");

/** Pestañas de modo de juego (solo si hay más de uno). */
function renderModes(collections, current) {
  const nav = byId("modes");
  nav.hidden = collections.length < 2;
  nav.replaceChildren(
    ...collections.map((c) =>
      h(
        "a",
        {
          class: "mode",
          href: modeUrl(collections, c.id),
          "aria-current": c.id === current.id ? "page" : null,
        },
        h("span", { class: "mode-emoji", "aria-hidden": "true", text: c.emoji }),
        c.title,
      ),
    ),
  );
}

/** Diálogos de ayuda y estadísticas; la ayuda se abre sola la primera vez. */
function setupDialogs(getGame) {
  const help = /** @type {HTMLDialogElement} */ (byId("help-dialog"));
  byId("open-help").addEventListener("click", () => help.showModal());
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

async function start() {
  document.title = SITE.name;
  for (const el of document.querySelectorAll("[data-site-name]")) el.textContent = SITE.name;

  let game = null;
  setupDialogs(() => game);
  try {
    const collections = await loadCollections();
    const collection = pickCollection(collections);
    renderModes(collections, collection);
    const data = await loadToday(collection);
    game = new GameController({
      collection,
      shareLink: shareUrl(collections, collection.id),
      toast,
      ...data,
    });
    // La partida puede estar repartida en varias zonas (p. ej. dos mitades en escritorio).
    for (const el of document.querySelectorAll("[data-game]")) el.hidden = false;
    byId("open-stats").hidden = false;
    window.game = game; // accesible desde la consola para depurar
  } catch (error) {
    if (!(error instanceof NoPuzzleError)) console.error(error);
    const notice = byId("notice");
    notice.textContent = error.message;
    notice.hidden = false;
  } finally {
    byId("loading").remove();
  }
}

start();
