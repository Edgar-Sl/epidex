/**
 * Controlador de la partida: une estado (core/game.js), dibujo, guardado y DOM.
 *
 * Flujo: el jugador escribe o salta -> core/game.js devuelve el estado nuevo ->
 * se guarda -> se repinta. Toda la lógica del juego vive en core/; aquí solo
 * hay pegamento y decisiones de interfaz.
 */

import { AnswerIndex } from "../core/answer-index.js";
import { answerBonus, bonusChoices, bonusQuestions, bonusResults } from "../core/bonus.js";
import { formatDuration, msUntilNextDay } from "../core/dates.js";
import {
  STATE_VERSION,
  attemptResults,
  circlesToShow,
  createGame,
  guess,
  guessedIds,
  isOver,
  levelIndex,
  maxAttempts,
  skip,
} from "../core/game.js";
import { buildShareText } from "../core/share.js";
import { displayedStreak, emptyStats, recordResult } from "../core/stats.js";
import { EpicycleRenderer } from "../render/epicycles.js";
import { Autocomplete } from "../ui/autocomplete.js";
import { burstConfetti } from "../ui/confetti.js";
import { byId, h, replayAnimation } from "../ui/dom.js";
import { enableTypeAnywhere, hasFinePointer } from "../ui/keyboard.js";
import { renderStats } from "../ui/stats-view.js";
import { SITE } from "./config.js";
import { shareResult } from "./share-action.js";
import { GameStorage } from "./storage.js";

const RESULT_LABEL = {
  correct: "acierto",
  wrong: "fallo",
  skip: "saltado",
  unused: "sin usar",
};

export class GameController {
  /**
   * @param {Object} options
   * @param {import("./data.js").CollectionInfo} options.collection
   * @param {string} options.shareLink Enlace público del modo.
   * @param {{id: string, name: string, aliases: string[]}[]} options.answers
   * @param {{date: string, number: number, puzzle: string}} options.entry
   * @param {Object} options.puzzle JSON del puzzle.
   * @param {string} options.timezone Zona del calendario (para la cuenta atrás).
   * @param {(message: string, options?: object) => void} options.toast
   */
  constructor({ collection, shareLink, answers, entry, puzzle, timezone, toast }) {
    this.collection = collection;
    this.shareLink = shareLink;
    this.puzzle = puzzle;
    this.timezone = timezone;
    this.toast = toast;
    this.names = new Map(answers.map((a) => [a.id, a.name]));
    this.storage = new GameStorage(collection.id);
    this.state = this.storage.loadGame(puzzle.id, STATE_VERSION) ?? createGame(puzzle, entry);
    this.stats = this.storage.loadStats(emptyStats(maxAttempts(this.state)));
    this.countdownTimer = null;
    this.bonus = bonusQuestions(puzzle);
    /** Pregunta extra recién respondida: se queda a la vista hasta pulsar "Siguiente". */
    this.bonusShown = null;
    /** La partida acaba de terminar en esta visita (para celebrar la racha). */
    this.justFinished = false;

    this.ui = {
      frame: byId("canvas-frame"),
      puzzleLabel: byId("puzzle-label"),
      circlesLabel: byId("circles-label"),
      palette: byId("palette"),
      ladder: byId("ladder"),
      play: byId("play"),
      form: byId("guess-form"),
      input: /** @type {HTMLInputElement} */ (byId("guess")),
      submit: /** @type {HTMLButtonElement} */ (byId("submit")),
      skip: byId("skip"),
      history: byId("history"),
      result: byId("result"),
      resultTitle: byId("result-title"),
      resultAnswer: byId("result-answer"),
      resultGrid: byId("result-grid"),
      share: byId("share"),
      countdown: byId("countdown"),
      streak: byId("result-streak"),
      bonus: byId("bonus"),
      bonusStep: byId("bonus-step"),
      bonusMarks: byId("bonus-marks"),
      bonusQuestion: byId("bonus-question"),
      bonusOptions: byId("bonus-options"),
      bonusNext: /** @type {HTMLButtonElement} */ (byId("bonus-next")),
      bonusSummary: byId("bonus-summary"),
      statsBody: byId("stats-body"),
      statsDialog: /** @type {HTMLDialogElement} */ (byId("stats-dialog")),
      // Opcional: arte que se revela al acabar (colecciones con `ui.art`).
      reveal: /** @type {HTMLImageElement | null} */ (document.getElementById("reveal")),
      // Opcional: la lente de la Pokédex parpadea mientras analiza un dibujo nuevo.
      lens: document.querySelector(".lens-glass"),
    };

    this.renderer = new EpicycleRenderer(byId("canvas"));
    this.renderer.setTerms(puzzle.terms, circlesToShow(this.state));
    if (isOver(this.state)) this.renderer.complete();
    this.renderer.play();
    this.scan();

    this.autocomplete = new Autocomplete({
      input: this.ui.input,
      list: byId("suggestions"),
      index: new AnswerIndex(answers),
      onChange: (answer) => {
        this.ui.submit.disabled = answer === null;
      },
    });

    this.ui.input.placeholder = collection.ui.placeholder;
    this.ui.puzzleLabel.textContent = `${collection.title} · #${entry.number}`;
    this.renderPalette();

    this.ui.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const answer = this.autocomplete.value();
      if (answer) this.apply(guess(this.state, answer.id), answer.name);
    });
    this.ui.skip.addEventListener("click", () => this.apply(skip(this.state)));
    this.ui.share.addEventListener("click", () => this.share());
    this.ui.bonusNext.addEventListener("click", () => this.nextBonus());
    this.ui.bonusOptions.addEventListener("click", (e) => {
      const button = /** @type {HTMLElement} */ (e.target).closest("button[data-choice]");
      if (button) this.chooseBonus(Number(button.getAttribute("data-choice")));
    });
    document.addEventListener("keydown", (e) => this.onBonusKey(e));
    enableTypeAnywhere(this.ui.input);

    this.render();
    // En escritorio, listo para escribir (en móvil no: abriría el teclado de golpe).
    if (hasFinePointer() && !isOver(this.state) && !document.querySelector("dialog[open]")) {
      this.ui.input.focus();
    }
  }

  /** Abre el diálogo de estadísticas. */
  openStats() {
    renderStats(this.ui.statsBody, this.stats, this.state.date, this.highlightKey());
    this.ui.statsDialog.showModal();
  }

  // ---- jugadas -------------------------------------------------------------

  /**
   * Aplica el resultado de una jugada, la guarda y actualiza la interfaz.
   * @param {{state: object, outcome: string}} result
   * @param {string} [name] Nombre de lo que se ha intentado.
   */
  apply({ state, outcome }, name = "") {
    if (outcome === "over") return;
    if (outcome === "duplicate") {
      this.toast(`Ya has probado ${name}`);
      return;
    }
    this.state = state;
    this.autocomplete.clear();
    this.storage.saveGame(state);

    if (isOver(state)) {
      this.finish();
    } else {
      this.renderer.setCircles(circlesToShow(state));
      this.scan();
      if (outcome === "wrong") {
        replayAnimation(this.ui.frame, "is-shaking");
        this.toast(`No es ${name}`, { tone: "error" });
      } else {
        this.toast(`Ahora con ${circlesToShow(state)} círculos`);
      }
      this.ui.input.focus();
    }
    this.render();
  }

  /** La lente "analiza" (parpadea) cada vez que la pantalla dibuja algo nuevo. */
  scan() {
    if (this.ui.lens) replayAnimation(this.ui.lens, "is-scanning");
  }

  /** Fin de partida: estadísticas, dibujo completo y celebración. */
  finish() {
    const won = this.state.status === "won";
    this.stats = recordResult(this.stats, {
      date: this.state.date,
      won,
      attemptsUsed: this.state.attempts.length,
    });
    this.storage.saveStats(this.stats);
    this.renderer.setCircles(circlesToShow(this.state));
    this.renderer.complete();
    this.justFinished = true;
    if (won) {
      replayAnimation(this.ui.frame, "is-celebrating");
      burstConfetti(this.ui.frame);
    }
    this.scan();
    // Que el resultado y el botón de compartir queden a la vista en móvil.
    requestAnimationFrame(() => this.ui.result.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  async share() {
    const { state } = this;
    const won = state.status === "won";
    const text = buildShareText({
      gameName: SITE.name,
      number: state.number,
      emoji: this.collection.emoji,
      won,
      attemptsUsed: state.attempts.length,
      maxAttempts: maxAttempts(state),
      results: attemptResults(state),
      // Al acabar se muestra el dibujo completo; lo que cuenta es el nivel del acierto.
      circles: won ? state.levels[state.attempts.length - 1] : undefined,
      bonus: bonusResults(state, this.bonus),
      url: this.shareLink,
    });
    const outcome = await shareResult(text);
    if (outcome === "copied") this.toast("Resultado copiado. ¡Pégalo en el chat!", { tone: "success" });
    if (outcome === "failed") this.toast("No se pudo copiar el resultado", { tone: "error" });
  }

  // ---- preguntas extra -----------------------------------------------------

  /** @param {number} choice Índice de la opción elegida. */
  chooseBonus(choice) {
    if (this.bonusShown !== null) return; // primero "Siguiente"
    const step = answerBonus(this.state, this.bonus, choice);
    if (!step) return;
    const index = bonusChoices(this.state).length;
    this.state = step.state;
    this.storage.saveGame(step.state);
    this.bonusShown = index;
    this.renderBonus();
    const done = bonusChoices(this.state).length >= this.bonus.length;
    if (done && bonusResults(this.state, this.bonus).every((r) => r === "correct")) {
      burstConfetti(this.ui.bonus, { count: 50 });
    }
    this.ui.bonusNext.focus({ preventScroll: true });
  }

  nextBonus() {
    if (this.bonusShown === null) return;
    this.bonusShown = null;
    this.renderBonus();
    const first = this.ui.bonusOptions.querySelector("button");
    if (first && hasFinePointer()) first.focus({ preventScroll: true });
    else if (this.ui.bonus.hidden) this.ui.share.focus({ preventScroll: true });
  }

  /** Teclas 1-4 responden y Enter pasa a la siguiente (en escritorio). */
  onBonusKey(e) {
    if (this.ui.bonus.hidden || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector("dialog[open]")) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= 9) {
      e.preventDefault();
      this.chooseBonus(n - 1);
    } else if (e.key === "Enter" && this.bonusShown !== null && e.target !== this.ui.bonusNext) {
      e.preventDefault();
      this.nextBonus();
    }
  }

  renderBonus() {
    const { ui, bonus } = this;
    const chosen = bonusChoices(this.state);
    const results = bonusResults(this.state, bonus);
    const index = this.bonusShown ?? chosen.length;
    const question = bonus[index];
    const over = isOver(this.state);

    ui.bonus.hidden = !over || !question;
    ui.bonusSummary.hidden = !over || bonus.length === 0 || Boolean(question);
    if (!over) return;

    if (!question) {
      const right = results.filter((r) => r === "correct").length;
      ui.bonusSummary.textContent = `Preguntas extra: ${right}/${bonus.length} ${results
        .map((r) => (r === "correct" ? "✅" : "❌"))
        .join("")}`;
      ui.bonusSummary.classList.toggle("bonus-summary--perfect", right === bonus.length);
      return;
    }

    const answered = this.bonusShown !== null;
    const choice = chosen[index];
    ui.bonusStep.textContent = `Pregunta extra ${index + 1}/${bonus.length}`;
    ui.bonusMarks.textContent = results.map((r) => (r === "correct" ? "✅" : "❌")).join("");
    ui.bonusQuestion.textContent = question.question;
    ui.bonusOptions.replaceChildren(
      ...question.options.map((label, i) => {
        let state = "";
        if (answered && i === question.answer) state = "is-right";
        else if (answered && i === choice) state = "is-wrong";
        return h(
          "li",
          {},
          h(
            "button",
            {
              type: "button",
              class: `bonus-option ${state}`.trim(),
              disabled: answered ? "" : null,
              "aria-pressed": answered && i === choice ? "true" : null,
              "data-choice": i,
            },
            h("kbd", { text: String(i + 1), "aria-hidden": "true" }),
            h("span", { text: label }),
          ),
        );
      }),
    );
    ui.bonusNext.hidden = !answered;
    ui.bonusNext.textContent = index + 1 < bonus.length ? "Siguiente" : "Ver resultado";
  }

  // ---- pintado -------------------------------------------------------------

  /** Clave de la distribución a resaltar (la de hoy, si la partida ha acabado). */
  highlightKey() {
    if (!isOver(this.state)) return null;
    return this.state.status === "won" ? String(this.state.attempts.length) : "fail";
  }

  /** Colores del puzzle (banderas): pista visible desde el principio. */
  renderPalette() {
    const colors = Array.isArray(this.puzzle.colors) ? this.puzzle.colors : [];
    this.ui.palette.hidden = colors.length === 0;
    this.ui.palette.replaceChildren(
      ...colors.map((color) => h("span", { class: "swatch", style: `--swatch: ${color}`, title: color })),
    );
  }

  render() {
    const { state, ui } = this;
    const over = isOver(state);
    const circles = circlesToShow(state);
    const results = attemptResults(state);

    ui.circlesLabel.textContent = over ? "dibujo completo" : `${circles} círculos`;

    ui.ladder.replaceChildren(
      ...results.map((result, i) =>
        h("li", {
          class: [
            "rung",
            `rung--${result}`,
            !over && i === levelIndex(state) ? "rung--current" : "",
          ].join(" "),
          text: state.levels[i],
          title: `${state.levels[i]} círculos · ${RESULT_LABEL[result]}`,
        }),
      ),
    );

    // Registro: una línea por intento (los pendientes solo se ven en escritorio).
    ui.history.replaceChildren(
      ...state.levels.map((level, i) => {
        const attempt = state.attempts[i];
        let kind = "pending";
        let text = "· · ·";
        if (attempt?.type === "skip") [kind, text] = ["skip", "saltado"];
        else if (attempt && attempt.id === state.answer) [kind, text] = ["correct", this.names.get(attempt.id) ?? attempt.id];
        else if (attempt) [kind, text] = ["wrong", this.names.get(attempt.id) ?? attempt.id];
        else if (!over && i === levelIndex(state)) [kind, text] = ["current", "ahora"];
        return h(
          "li",
          { class: `log-row log-row--${kind}${attempt ? " log-row--done" : ""}` },
          h("span", { class: "log-n", text: String(level) }),
          h("span", { class: "log-text", text }),
        );
      }),
    );

    this.autocomplete.setExclude(guessedIds(state));
    ui.play.hidden = over;
    ui.result.hidden = !over;
    if (!over) return;

    const won = state.status === "won";
    ui.result.classList.toggle("result--won", won);
    ui.resultTitle.textContent = won
      ? `¡Correcto! ${state.attempts.length}/${maxAttempts(state)}`
      : "¡Otra vez será!";
    ui.resultAnswer.textContent = this.names.get(state.answer) ?? state.answer;
    this.revealArt();
    const streak = displayedStreak(this.stats, state.date);
    ui.streak.hidden = !won || streak < 1;
    ui.streak.textContent = streak === 1 ? "🔥 Empiezas racha: 1 día" : `🔥 Racha: ${streak} días seguidos`;
    ui.streak.classList.toggle("is-new", this.justFinished);
    this.renderBonus();
    ui.resultGrid.replaceChildren(
      ...results.map((r) => h("span", { class: `cell cell--${r}`, title: RESULT_LABEL[r] })),
    );
    this.startCountdown();
  }

  /** "¿Quién es ese Pokémon?": muestra el arte real sobre el dibujo al acabar. */
  revealArt() {
    const { reveal } = this.ui;
    if (!reveal || !this.collection.ui.art) return;
    reveal.alt = this.names.get(this.state.answer) ?? "";
    reveal.src = `${SITE.dataDir}/${this.collection.id}/art/${this.puzzle.id}.webp`;
    reveal.hidden = false; // empieza transparente; aparece con .is-revealed al cargar
    reveal.addEventListener("load", () => this.ui.frame.classList.add("is-revealed"), { once: true });
  }

  startCountdown() {
    if (this.countdownTimer !== null) return;
    const tick = () => {
      const ms = msUntilNextDay(this.timezone);
      this.ui.countdown.textContent = formatDuration(ms);
      if (ms < 1000) {
        clearInterval(this.countdownTimer);
        this.ui.countdown.replaceChildren(
          h("a", { href: window.location.href, text: "¡Ya está! Recarga" }),
        );
      }
    };
    tick();
    this.countdownTimer = setInterval(tick, 1000);
  }
}
