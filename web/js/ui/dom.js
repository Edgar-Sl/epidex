/**
 * Utilidades mínimas de DOM (sin framework).
 */

/**
 * Elemento por id. Lanza si no existe: un id mal escrito debe fallar pronto.
 * @param {string} id
 * @returns {HTMLElement}
 */
export function byId(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Falta el elemento #${id} en index.html`);
  return element;
}

/**
 * Crea un elemento: h("li", { class: "chip", title: "x" }, "texto", otroNodo).
 * Las propiedades `class`, `text` y `data*` tienen atajo; el resto son atributos.
 *
 * @param {string} tag
 * @param {Record<string, string | number | boolean | null | undefined>} [props]
 * @param {...(Node | string)} children
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") element.className = String(value);
    else if (key === "text") element.textContent = String(value);
    else element.setAttribute(key, value === true ? "" : String(value));
  }
  element.append(...children);
  return element;
}

/**
 * Reproduce una animación CSS de clase (p. ej. "shake") aunque ya estuviera puesta.
 * @param {HTMLElement} element
 * @param {string} className
 */
export function replayAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth; // fuerza el reflow para reiniciar la animación
  element.classList.add(className);
  element.addEventListener("animationend", () => element.classList.remove(className), {
    once: true,
  });
}

/** El usuario prefiere menos movimiento. */
export const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
