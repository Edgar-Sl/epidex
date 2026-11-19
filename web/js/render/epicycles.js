/**
 * Animación de epiciclos en un <canvas>.
 *
 * Este módulo no sabe nada del juego: recibe una lista de términos de Fourier
 * y cuántos círculos usar, y dibuja los círculos girando y el trazo que dejan.
 *
 * Formato de los términos (igual que en los JSON de puzzle):
 *   [[frecuencia, real, imaginaria], ...]
 * El primero es el de frecuencia 0 y el resto van ordenados por radio
 * decreciente, así que "K círculos" = los K+1 primeros términos.
 *
 * La figura viene normalizada: centrada en el origen, dentro del círculo
 * unidad y con el eje y hacia arriba (en el canvas se invierte).
 *
 * Matemática: el punto del dibujo en el instante t ∈ [0, 1) es
 *   z(t) = Σ c_k · e^{2πi·k·t}
 * Cada sumando es un círculo de radio |c_k| que da k vueltas por dibujo.
 */

/** @typedef {[number, number, number]} Term  [frecuencia, real, imaginaria] */
/** @typedef {{x: number, y: number}} Point */

const TAU = 2 * Math.PI;

// --------------------------------------------------------------------------
// Funciones puras (sin canvas): fáciles de probar desde la consola.
// --------------------------------------------------------------------------

/**
 * Posiciones de la cadena de epiciclos en el instante t.
 *
 * @param {Term[]} terms Términos a usar (ya truncados).
 * @param {number} t Instante, en vueltas (0 = inicio, 1 = dibujo completo).
 * @returns {Point[]} terms.length + 1 puntos: el origen y la punta de cada brazo.
 *   El último es el punto que dibuja.
 */
export function chainPositions(terms, t) {
  let x = 0;
  let y = 0;
  const points = [{ x, y }];
  for (const [k, re, im] of terms) {
    const angle = TAU * k * t;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // (re + i·im) · (cos + i·sin)
    x += re * cos - im * sin;
    y += re * sin + im * cos;
    points.push({ x, y });
  }
  return points;
}

/**
 * Punto de la curva en el instante t (la punta de la cadena).
 *
 * @param {Term[]} terms
 * @param {number} t
 * @returns {Point}
 */
export function evaluate(terms, t) {
  const chain = chainPositions(terms, t);
  return chain[chain.length - 1];
}

/**
 * Muestrea la curva completa en n puntos equiespaciados en t.
 *
 * @param {Term[]} terms
 * @param {number} n
 * @returns {Point[]}
 */
export function sampleCurve(terms, n) {
  return Array.from({ length: n }, (_, i) => evaluate(terms, i / n));
}

/**
 * Términos para dibujar con `circles` círculos (más el de frecuencia 0).
 *
 * @param {Term[]} terms Todos los términos del puzzle.
 * @param {number} circles
 * @returns {Term[]}
 */
export function truncate(terms, circles) {
  return terms.slice(0, Math.max(0, circles) + 1);
}

// --------------------------------------------------------------------------
// Renderizador
// --------------------------------------------------------------------------

const DEFAULTS = {
  /** Segundos que tarda en completarse un dibujo. */
  period: 4,
  /** Puntos del trazo precalculado (más = más suave). */
  samples: 1200,
  /** Margen alrededor de la figura, en fracción del lado del canvas. */
  padding: 0.08,
  /** Dibujar los círculos y los brazos (false = solo el trazo). */
  showCircles: true,
  /** Al completar el dibujo, seguir girando (false = se para tras una vuelta). */
  loop: false,
  /** Rellenar la figura cuando el trazo está completo. */
  fillWhenComplete: true,
};

/**
 * Colores, leídos de variables CSS para que el modo oscuro funcione solo:
 *   --epi-circle, --epi-arm, --epi-trace, --epi-fill, --epi-pen (punta que dibuja)
 */
function readColors(element) {
  const css = getComputedStyle(element);
  const get = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    circle: get("--epi-circle", "rgba(128, 128, 128, 0.35)"),
    arm: get("--epi-arm", "rgba(128, 128, 128, 0.8)"),
    trace: get("--epi-trace", "#3b6fd8"),
    fill: get("--epi-fill", "rgba(59, 111, 216, 0.15)"),
    pen: get("--epi-pen", get("--epi-trace", "#3b6fd8")),
  };
}

export class EpicycleRenderer {
  /**
   * @param {HTMLCanvasElement} canvas Lienzo; se adapta al tamaño de su caja CSS.
   * @param {Partial<typeof DEFAULTS>} [options]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.options = { ...DEFAULTS, ...options };

    /** @type {Term[]} */
    this.allTerms = [];
    /** @type {Term[]} */
    this.terms = [];
    /** @type {Point[]} */
    this.curve = [];

    this.t = 0; // progreso del dibujo actual, en vueltas
    // `playing` es la intención (play/pause); el bucle de animación puede estar
    // detenido aunque playing sea true (al terminar una vuelta con loop=false).
    this.playing = false;
    this.lastTimestamp = null;
    this.frameId = null;
    this.colors = readColors(canvas);

    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    this.onSchemeChange = () => this.refreshColors();
    this.colorScheme.addEventListener("change", this.onSchemeChange);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  /**
   * Carga los términos de un puzzle. No empieza a animar.
   * @param {Term[]} terms
   * @param {number} circles Círculos iniciales.
   */
  setTerms(terms, circles) {
    this.allTerms = terms;
    this.setCircles(circles);
  }

  /**
   * Cambia el número de círculos y reinicia el dibujo desde el principio.
   * @param {number} circles
   */
  setCircles(circles) {
    this.terms = truncate(this.allTerms, circles);
    this.curve = sampleCurve(this.terms, this.options.samples);
    this.t = 0;
    if (this.reducedMotion.matches) this.t = 1; // sin animación: figura completa
    this.draw();
    if (this.playing) this.startLoop(); // el dibujo nuevo vuelve a animarse
  }

  /** Empieza (o reanuda) la animación. */
  play() {
    this.playing = true;
    this.startLoop();
  }

  /** Pausa la animación sin perder el progreso. */
  pause() {
    this.playing = false;
    this.stopLoop();
  }

  /** Salta al dibujo completo (por ejemplo, al terminar la partida). */
  complete() {
    this.t = Math.max(this.t, 1);
    this.draw();
  }

  /** Cambia opciones en caliente (showCircles, period, fillWhenComplete...). */
  setOptions(options) {
    Object.assign(this.options, options);
    if ("samples" in options) this.curve = sampleCurve(this.terms, this.options.samples);
    this.draw();
    if (this.playing) this.startLoop(); // p. ej. al activar loop con el dibujo parado
  }

  /** Vuelve a leer los colores de las variables CSS (p. ej. tras cambiar de tema). */
  refreshColors() {
    this.colors = readColors(this.canvas);
    this.draw();
  }

  /** Libera observadores y detiene la animación. */
  destroy() {
    this.pause();
    this.resizeObserver.disconnect();
    this.colorScheme.removeEventListener("change", this.onSchemeChange);
  }

  // ---- internos ----------------------------------------------------------

  /** Arranca el bucle de requestAnimationFrame si no está ya en marcha. */
  startLoop() {
    if (this.frameId !== null) return;
    if (!this.options.loop && this.t >= 1) return; // ya terminado: nada que animar
    this.lastTimestamp = null;
    this.frameId = requestAnimationFrame((ts) => this.tick(ts));
  }

  /** Detiene el bucle de animación. */
  stopLoop() {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  /** Ajusta la resolución interna del canvas a su tamaño en pantalla (HiDPI). */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.draw();
  }

  /** @param {DOMHighResTimeStamp} timestamp */
  tick(timestamp) {
    this.frameId = null;
    if (!this.playing) return;
    if (this.lastTimestamp !== null) {
      // Basado en tiempo real, no en fotogramas: misma velocidad a 60 o 120 Hz.
      const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.1);
      this.t += dt / this.options.period;
      if (!this.options.loop && this.t >= 1) {
        // Una vuelta completa: se para con la figura cerrada (y rellena).
        this.t = 1;
        this.draw();
        return;
      }
    }
    this.lastTimestamp = timestamp;
    this.draw();
    this.frameId = requestAnimationFrame((ts) => this.tick(ts));
  }

  /** Transformación de coordenadas de la figura (círculo unidad) a píxeles. */
  transform() {
    const { width, height } = this.canvas;
    const side = Math.min(width, height);
    const scale = (side * (1 - 2 * this.options.padding)) / 2;
    return { cx: width / 2, cy: height / 2, scale };
  }

  draw() {
    const { ctx, canvas, colors, options } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (this.terms.length === 0) return;

    const { cx, cy, scale } = this.transform();
    const toX = (x) => cx + x * scale;
    const toY = (y) => cy - y * scale; // eje y hacia arriba
    const dpr = window.devicePixelRatio || 1;
    const done = this.t >= 1;
    const phase = this.t % 1;

    // 1) Trazo: desde el inicio hasta el progreso actual (o completo).
    const n = this.curve.length;
    const visible = done ? n : Math.floor(phase * n);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (visible > 1) {
      ctx.beginPath();
      ctx.moveTo(toX(this.curve[0].x), toY(this.curve[0].y));
      for (let i = 1; i < visible; i++) ctx.lineTo(toX(this.curve[i].x), toY(this.curve[i].y));
      if (done) {
        ctx.closePath();
        if (options.fillWhenComplete) {
          ctx.fillStyle = colors.fill;
          ctx.fill();
        }
      } else {
        // Une el último punto muestreado con la punta exacta, sin saltos.
        const tip = evaluate(this.terms, phase);
        ctx.lineTo(toX(tip.x), toY(tip.y));
      }
      ctx.strokeStyle = colors.trace;
      ctx.lineWidth = 2.5 * dpr;
      ctx.stroke();
    }

    // 2) Círculos y brazos.
    if (!options.showCircles) return;
    const chain = chainPositions(this.terms, phase);
    ctx.lineWidth = 1 * dpr;
    for (let i = 1; i < chain.length; i++) {
      const center = chain[i - 1];
      const tip = chain[i];
      const r = Math.hypot(tip.x - center.x, tip.y - center.y) * scale;
      if (r < 0.5 * dpr) continue; // círculos invisibles: no se dibujan
      ctx.beginPath();
      ctx.arc(toX(center.x), toY(center.y), r, 0, TAU);
      ctx.strokeStyle = colors.circle;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toX(center.x), toY(center.y));
      ctx.lineTo(toX(tip.x), toY(tip.y));
      ctx.strokeStyle = colors.arm;
      ctx.stroke();
    }
    const pen = chain[chain.length - 1];
    ctx.beginPath();
    ctx.arc(toX(pen.x), toY(pen.y), 4 * dpr, 0, TAU);
    ctx.fillStyle = colors.pen;
    ctx.fill();
  }
}
