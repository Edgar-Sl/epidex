/**
 * Menú principal: los cartuchos de cada región y, al lado, el resumen de tu Pokédex.
 */

import { DEX_SIZE, GENERATION_RANGES, dexCounts, recentCatches } from "../core/dex.js";
import { byId, h } from "./dom.js";

/**
 * Cartuchos de las regiones, con cómo te ha ido hoy en cada una.
 * @param {Object} options
 * @param {{id: string, title: string, menu?: object}[]} options.collections
 * @param {(id: string) => {kind: string, score?: string}} options.status
 * @param {(id: string) => string} options.href
 * @param {(key: string, values?: object) => string} options.t
 */
export function renderModes({ collections, status, href, t }) {
  const text = {
    won: (s) => `✓ ${s.score}`,
    lost: () => "✗",
    playing: () => t("modePlaying"),
    new: () => t("modeNew"),
  };
  const statuses = collections.map((c) => status(c.id));
  byId("modes-list").replaceChildren(
    ...collections.map((c, i) => {
      const menu = c.menu ?? { kicker: c.title, name: "", detail: "" };
      const s = statuses[i];
      return h(
        "a",
        { class: `mode-card${c.id === "all" ? " mode-card--all" : ""}`, href: href(c.id) },
        h("span", { class: "mode-kicker", text: menu.kicker }),
        h("span", { class: "mode-name", text: menu.name }),
        h("span", { class: "mode-detail", text: menu.detail }),
        h("span", { class: `mode-status mode-status--${s.kind}`, text: text[s.kind](s) }),
      );
    }),
  );
  const done = statuses.filter((s) => s.kind === "won" || s.kind === "lost").length;
  byId("modes-progress").textContent = t("modesProgress", { done, total: collections.length });
}

/**
 * Resumen de la Pokédex del menú: total, una barra por generación y lo último capturado.
 * @param {Object} options
 * @param {ReturnType<import("../core/dex.js").emptyDex>} options.dex
 * @param {{id: string, menu?: {kicker: string, name: string}}[]} options.collections
 * @param {string} options.dataDir
 * @param {(key: string, values?: object) => string} options.t
 */
export function renderHomeDex({ dex, collections, dataDir, t }) {
  const { caught, seen } = dexCounts(dex);
  byId("home-caught").textContent = String(caught);
  byId("home-of").textContent = `/${DEX_SIZE}`;
  byId("home-dex-bar").style.cssText =
    `--caught: ${(100 * caught) / DEX_SIZE}%; --seen: ${(100 * (caught + seen)) / DEX_SIZE}%`;
  byId("home-dex-detail").textContent = t("dexCount", { caught, seen });

  const menus = new Map(collections.map((c) => [c.id, c.menu]));
  byId("home-gens").replaceChildren(
    ...GENERATION_RANGES.map((range, i) => {
      const menu = menus.get(`gen${i + 1}`) ?? { kicker: `Gen ${i + 1}`, name: "" };
      const c = dexCounts(dex, range);
      const total = range[1] - range[0] + 1;
      return h(
        "li",
        { class: "home-gen" },
        h("span", { class: "home-gen-name", text: `${menu.kicker} · ${menu.name}` }),
        h(
          "span",
          {
            class: "home-gen-bar",
            style: `--caught: ${(100 * c.caught) / total}%; --seen: ${(100 * (c.caught + c.seen)) / total}%`,
          },
        ),
        h("span", { class: "home-gen-count digits", text: `${c.caught}/${total}` }),
      );
    }),
  );

  const recent = recentCatches(dex, 6);
  byId("home-recent").replaceChildren(
    ...recent.map((entry) =>
      h(
        "li",
        { class: "home-recent-item", title: entry.name },
        entry.art
          ? h("img", { src: `${dataDir}/${entry.art}`, alt: entry.name, loading: "lazy", decoding: "async" })
          : h("span", { text: entry.name }),
      ),
    ),
  );
}
