/**
 * Avisos breves ("No es Francia", "¡Copiado!") que aparecen arriba y se van solos.
 *
 * Un solo contenedor con aria-live: los lectores de pantalla los anuncian.
 */

import { h } from "./dom.js";

/**
 * @param {HTMLElement} container Elemento con role="status".
 */
export function createToaster(container) {
  /**
   * @param {string} message
   * @param {{tone?: "info" | "error" | "success", duration?: number}} [options]
   */
  return function toast(message, { tone = "info", duration = 2200 } = {}) {
    const item = h("div", { class: `toast toast--${tone}`, text: message });
    container.append(item);
    // Máximo tres a la vez: el más antiguo sobra.
    while (container.children.length > 3) container.firstElementChild?.remove();
    setTimeout(() => {
      item.classList.add("toast--leaving");
      setTimeout(() => item.remove(), 250);
    }, duration);
  };
}
