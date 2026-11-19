/**
 * Teclado en escritorio: se puede escribir la respuesta sin hacer clic antes.
 *
 * - Cualquier letra pulsada fuera de un campo de texto enfoca el buscador (y la
 *   letra se escribe en él).
 * - Esc con la lista de sugerencias cerrada borra lo escrito.
 * - Enter ya envía el formulario (lo hace el propio <form>).
 */

/**
 * @param {HTMLInputElement} input Buscador de respuestas.
 */
export function enableTypeAnywhere(input) {
  document.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector("dialog[open]")) return;
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.closest("input, textarea, select, [contenteditable]")) return;
    if (input.disabled || input.offsetParent === null) return; // partida acabada
    if (e.key.length === 1 && e.key.trim() !== "") input.focus();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || input.getAttribute("aria-expanded") === "true") return;
    input.value = "";
    input.dispatchEvent(new Event("input"));
  });
}

/** El dispositivo tiene ratón y teclado (no es táctil). */
export const hasFinePointer = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;
