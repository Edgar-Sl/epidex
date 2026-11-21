/**
 * Confeti al acertar: unos cuantos papelitos que salen de un punto y caen.
 *
 * Solo DOM y CSS (la animación `confetti-fall` está en components.css), sin
 * bibliotecas. Se quita solo al acabar y no hace nada si el sistema pide
 * reducir el movimiento.
 */

import { prefersReducedMotion } from "./dom.js";

const COLORS = ["var(--correct)", "var(--blue)", "#f5c542", "#4a90d9", "#e3664f", "var(--ink)"];

/**
 * @param {HTMLElement} origin Elemento desde cuyo centro sale el confeti.
 * @param {{count?: number}} [options]
 */
export function burstConfetti(origin, { count = 70 } = {}) {
  if (prefersReducedMotion()) return;
  const box = origin.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.className = "confetti";
  layer.setAttribute("aria-hidden", "true");
  layer.style.setProperty("--x", `${box.left + box.width / 2}px`);
  layer.style.setProperty("--y", `${box.top + box.height / 2}px`);

  for (let i = 0; i < count; i++) {
    const piece = document.createElement("i");
    const angle = Math.random() * Math.PI * 2;
    const speed = 120 + Math.random() * 220;
    piece.style.setProperty("--dx", `${Math.cos(angle) * speed}px`);
    piece.style.setProperty("--dy", `${Math.sin(angle) * speed - 140}px`);
    piece.style.setProperty("--spin", `${(Math.random() - 0.5) * 1440}deg`);
    piece.style.setProperty("--delay", `${Math.random() * 120}ms`);
    piece.style.setProperty("--color", COLORS[i % COLORS.length]);
    if (i % 3 === 0) piece.classList.add("round");
    layer.append(piece);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 2200);
}
