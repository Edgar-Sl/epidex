/**
 * Diálogo "Mi Pokédex": una pestaña por generación y una casilla por Pokémon.
 *
 *   capturado -> su ilustración y su nombre
 *   visto     -> la silueta en negro y su nombre
 *   sin ver   -> solo el número
 */

import { GENERATION_RANGES, dexCounts, dexSlots } from "../core/dex.js";
import { h } from "./dom.js";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

/**
 * @param {Object} options
 * @param {HTMLElement} options.tabs
 * @param {HTMLElement} options.grid
 * @param {ReturnType<import("../core/dex.js").emptyDex>} options.dex
 * @param {number} options.generation Pestaña abierta (0 = Gen I).
 * @param {string} options.dataDir
 * @param {string} options.locale
 * @param {(key: string, values?: object) => string} options.t
 */
export function renderDex({ tabs, grid, dex, generation, dataDir, locale, t }) {
  const date = (iso) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(
      new Date(`${iso}T12:00:00`),
    );

  const show = (gen) => {
    tabs.replaceChildren(
      ...GENERATION_RANGES.map((range, i) => {
        const { caught } = dexCounts(dex, range);
        const total = range[1] - range[0] + 1;
        const tab = h(
          "button",
          { type: "button", role: "tab", class: "dex-tab", "aria-selected": String(i === gen) },
          h("span", { class: "dex-tab-gen", text: `Gen ${ROMAN[i]}` }),
          h("span", { class: "dex-tab-count digits", text: `${caught}/${total}` }),
        );
        tab.addEventListener("click", () => show(i));
        return tab;
      }),
    );

    const slots = dexSlots(dex, gen);
    grid.replaceChildren(
      ...slots.map(({ number, entry }) => {
        const num = `#${String(number).padStart(4, "0")}`;
        if (!entry) {
          return h(
            "li",
            { class: "dex-slot dex-slot--unknown", title: `${num} · ${t("dexUnknown")}` },
            h("span", { class: "dex-num digits", text: num }),
          );
        }
        const caught = entry.status === "caught";
        return h(
          "li",
          {
            class: `dex-slot dex-slot--${entry.status}`,
            title: t(caught ? "dexCaughtTitle" : "dexSeenTitle", { date: date(entry.date) }),
          },
          h("span", { class: "dex-num digits", text: num }),
          entry.art
            ? h("img", { class: "dex-art", src: `${dataDir}/${entry.art}`, alt: "", loading: "lazy", decoding: "async" })
            : h("span", { class: "dex-art" }),
          h("span", { class: "dex-name", text: entry.name }),
        );
      }),
    );
    if (!slots.some((s) => s.entry)) {
      grid.append(h("li", { class: "dex-empty", text: t("dexEmpty", { gen: `Gen ${ROMAN[gen]}` }) }));
    }
  };

  show(generation);
}

/**
 * Teclas de la tapa (escritorio): una por generación, rellena según lo capturado.
 * @param {HTMLElement} el
 * @param {ReturnType<import("../core/dex.js").emptyDex>} dex
 */
export function renderDexKeys(el, dex) {
  el.replaceChildren(
    ...GENERATION_RANGES.map((range, i) => {
      const { caught, seen } = dexCounts(dex, range);
      const total = range[1] - range[0] + 1;
      return h(
        "span",
        {
          class: "flap-key",
          style: `--caught: ${(100 * caught) / total}%; --seen: ${(100 * (caught + seen)) / total}%`,
        },
        h("span", { text: ROMAN[i] }),
      );
    }),
  );
}
