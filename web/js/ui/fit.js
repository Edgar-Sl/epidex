/**
 * Ajusta la Pokédex al tamaño de la ventana en escritorio.
 *
 * El aparato se diseña a un tamaño fijo y luego se amplía o reduce con `zoom`
 * para llenar la pantalla sin hacer scroll: en un portátil se ve igual de
 * cómodo que en un monitor de 27". En móvil no hace falta (ya ocupa el ancho).
 */

const DESKTOP = "(min-width: 900px) and (min-height: 540px)";
const MARGIN_X = 48;
const MARGIN_Y = 56;

/**
 * @param {HTMLElement} element
 * @param {() => void} [after] Para repintar lo que dependa del tamaño (canvas).
 * @returns {() => void} Función para reajustar (p. ej. al cambiar de pantalla).
 */
export function fitToViewport(element, after = () => {}) {
  const query = window.matchMedia(DESKTOP);
  const fit = () => {
    element.style.zoom = "";
    if (query.matches) {
      const scale = Math.min(
        (window.innerWidth - MARGIN_X) / element.offsetWidth,
        (window.innerHeight - MARGIN_Y) / element.offsetHeight,
      );
      element.style.zoom = String(Math.min(1.8, Math.max(0.7, scale)).toFixed(3));
    }
    after();
  };
  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  };
  window.addEventListener("resize", schedule);
  // También cuando cambia lo de dentro (al acabar sale el resultado, se abre la lista
  // de pistas...). Se vigilan las mitades: su tamaño no cambia con el zoom del aparato,
  // así que ajustar no vuelve a disparar el observador.
  const sizes = new Map();
  const observer = new ResizeObserver(() => {
    let changed = false;
    for (const child of element.children) {
      const size = `${child.offsetWidth}x${child.offsetHeight}`;
      if (sizes.get(child) !== size) changed = true;
      sizes.set(child, size);
    }
    if (changed) schedule();
  });
  for (const child of element.children) observer.observe(child);
  query.addEventListener("change", schedule);
  document.fonts?.ready.then(schedule);
  fit();
  return schedule;
}
