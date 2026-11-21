/**
 * Vista de estadísticas: cifras principales y distribución de intentos.
 */

import { displayedStreak, winRate } from "../core/stats.js";
import { t } from "../app/i18n.js";
import { h } from "./dom.js";

/**
 * Pinta las estadísticas en un contenedor.
 *
 * @param {HTMLElement} container
 * @param {import("../core/stats.js").Stats} stats
 * @param {string} today "YYYY-MM-DD"
 * @param {string | null} highlight Barra a resaltar ("3", "fail") o null.
 */
export function renderStats(container, stats, today, highlight) {
  const numbers = [
    [stats.played, t("played")],
    [`${winRate(stats)}%`, t("wins")],
    [displayedStreak(stats, today), t("currentStreak")],
    [stats.maxStreak, t("maxStreak")],
  ];
  const summary = h(
    "dl",
    { class: "stat-numbers" },
    ...numbers.map(([value, label]) =>
      h("div", {}, h("dd", { text: value }), h("dt", { text: label })),
    ),
  );

  const keys = [
    ...Object.keys(stats.distribution)
      .filter((k) => k !== "fail")
      .sort((a, b) => Number(a) - Number(b)),
    "fail",
  ];
  const max = Math.max(1, ...keys.map((k) => stats.distribution[k] ?? 0));
  const bars = h(
    "ol",
    { class: "stat-bars", "aria-label": t("distribution") },
    ...keys.map((key) => {
      const count = stats.distribution[key] ?? 0;
      const bar = h("span", {
        class: `stat-bar${key === highlight ? " stat-bar--highlight" : ""}`,
        style: `--fraction: ${count / max}`,
        text: count,
      });
      return h("li", {}, h("span", { class: "stat-bar-label", text: key === "fail" ? "✗" : key }), bar);
    }),
  );

  container.replaceChildren(
    summary,
    h("h3", { class: "stat-heading", text: t("distribution") }),
    bars,
  );
}
