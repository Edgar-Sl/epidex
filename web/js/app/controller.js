/**
 * Controlador de la partida: une estado (core/game.js), dibujo, guardado y DOM.
 *
 * Flujo: el jugador escribe o salta -> core/game.js devuelve el estado nuevo ->
 * se guarda -> se repinta. Toda la lógica del juego vive en core/; aquí solo
 * hay pegamento y decisiones de interfaz.
 */

import { AnswerIndex } from "../core/answer-index.js";
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
  takeHint,
} from "../core/game.js";
import { recordInDex, emptyDex } from "../core/dex.js";
import { TINTS, availableHints, hintText, pickHint } from "../core/hints.js";
import { buildShareText } from "../core/share.js";
import { displayedStreak, emptyStats, recordResult } from "../core/stats.js";
import { EpicycleRenderer } from "../render/epicycles.js";
import { Autocomplete } from "../ui/autocomplete.js";
import { burstConfetti } from "../ui/confetti.js";
import { byId, h, replayAnimation } from "../ui/dom.js";
import { enableTypeAnywhere, hasFinePointer } from "../ui/keyboard.js";
import { renderStats } from "../ui/stats-view.js";
import { SITE } from "./config.js";
import { LANG, LOCALE, t } from "./i18n.js";
import { appShareUrl, canShareNatively, copyToClipboard, shareResult } from "./share-action.js";
import { GameStorage, dexStore } from "./storage.js";

const RESULT_LABEL = {
  correct: t("resultCorrect"),
  wrong: t("resultWrong"),
  skip: t("resultSkip"),
  unused: t("resultUnused"),
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
   * @param {() => void} [options.onDexChange] Al anotar algo en la Pokédex.
   */
  constructor({ collection, shareLink, answers, entry, puzzle, timezone, toast, onDexChange = () => {} }) {
    this.collection = collection;
    this.shareLink = shareLink;
    this.puzzle = puzzle;
    this.timezone = timezone;
    this.toast = toast;
    this.onDexChange = onDexChange;
    /** Pistas que se pueden pedir en este puzzle (ninguna si el modo no tiene). */
    this.hintKinds = collection.ui?.hints === false ? [] : availableHints(puzzle);
    this.names = new Map(answers.map((a) => [a.id, a.name]));
    this.storage = new GameStorage(collection.id);
    this.state = this.storage.loadGame(puzzle.id, STATE_VERSION) ?? createGame(puzzle, entry);
    this.stats = this.storage.loadStats(emptyStats(maxAttempts(this.state)));
    this.countdownTimer = null;
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
      hint: /** @type {HTMLButtonElement} */ (byId("hint")),
      hintLine: byId("hint-line"),
      resultDex: byId("result-dex"),
      history: byId("history"),
      result: byId("result"),
      resultTitle: byId("result-title"),
      resultAnswer: byId("result-answer"),
      resultGrid: byId("result-grid"),
      shareWa: /** @type {HTMLAnchorElement} */ (byId("share-wa")),
      shareTg: /** @type {HTMLAnchorElement} */ (byId("share-tg")),
      shareX: /** @type {HTMLAnchorElement} */ (byId("share-x")),
      shareCopy: byId("share-copy"),
      shareMore: byId("share-more"),
      countdown: byId("countdown"),
      streak: byId("result-streak"),
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
    this.ui.puzzleLabel.textContent = `${collection.menu?.kicker ?? collection.title} · #${entry.number}`;
    this.renderPalette();

    this.ui.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const answer = this.autocomplete.value();
      if (answer) this.apply(guess(this.state, answer.id), answer.name);
    });
    this.ui.skip.addEventListener("click", () => this.apply(skip(this.state)));
    this.ui.hint.hidden = this.hintKinds.length === 0;
    this.hintTitle = this.ui.hint.title;
    this.ui.hint.addEventListener("click", () =>
      this.useHint(pickHint(this.hintKinds, `${this.puzzle.id}|${this.state.date}`)),
    );
    // El mensaje cambia al responder las preguntas extra: el enlace se completa
    // justo al pulsar (antes de que el navegador lo abra).
    for (const [link, app] of [
      [this.ui.shareWa, "whatsapp"],
      [this.ui.shareTg, "telegram"],
      [this.ui.shareX, "x"],
    ]) {
      link.addEventListener("click", () => {
        link.href = appShareUrl(app, this.shareText(false), this.shareLink);
      });
    }
    this.ui.shareCopy.addEventListener("click", () => this.copyResult());
    this.ui.shareMore.hidden = !canShareNatively();
    this.ui.shareMore.addEventListener("click", () => this.share());
    enableTypeAnywhere(this.ui.input);

    // Partida ya acabada (p. ej. al recargar): que esté en la Pokédex.
    if (isOver(this.state)) this.recordDex();
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

  // ---- pistas --------------------------------------------------------------

  /** @param {string | null} kind Pista que toca (ver `pickHint`). */
  useHint(kind) {
    if (!kind) return;
    const state = takeHint(this.state, kind);
    if (state === this.state) return;
    this.state = state;
    this.storage.saveGame(state);
    this.render();
    replayAnimation(this.ui.hintLine, "is-new");
    this.ui.input.focus();
  }

  /** "Tipo: Eléctrico" */
  hintLabel(kind = this.state.hint) {
    const text = hintText(kind, this.puzzle.hints ?? {}, {
      lang: LANG,
      locale: LOCALE,
      startsWith: t("startsWith"),
      stages: {
        single: t("stage_single"),
        basic: t("stage_basic"),
        middle: t("stage_middle"),
        final: t("stage_final"),
      },
    });
    return text ? `${t(`hint_${kind}`)}: ${text}` : "";
  }

  // ---- Pokédex -------------------------------------------------------------

  /** Anota la partida acabada en la Pokédex del jugador. */
  recordDex() {
    const { state } = this;
    const dex = dexStore.load(emptyDex());
    const next = recordInDex(dex, {
      id: state.answer,
      won: state.status === "won",
      date: state.date,
      name: this.names.get(state.answer) ?? state.answer,
      art: this.collection.ui.art ? `${this.collection.id}/art/${this.puzzle.id}.webp` : undefined,
    });
    if (next !== dex) {
      dexStore.save(next);
      this.onDexChange();
    }
    this.dexEntry = next.entries[state.answer];
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
      this.toast(t("alreadyTried", { name }));
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
        this.toast(t("notIt", { name }), { tone: "error" });
      } else {
        this.toast(t("nowCircles", { n: circlesToShow(state) }));
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
    this.recordDex();
    this.renderer.setCircles(circlesToShow(this.state));
    this.renderer.complete();
    this.justFinished = true;
    if (won) {
      replayAnimation(this.ui.frame, "is-celebrating");
      burstConfetti(this.ui.frame);
    }
    this.scan();
    // Que el resultado y el botón de compartir queden a la vista en móvil. Se espera a
    // que el aparato se reajuste al nuevo contenido (ui/fit.js): en escritorio suele caber.
    setTimeout(() => {
      const box = this.ui.result.getBoundingClientRect();
      if (box.top < 0 || box.bottom > window.innerHeight) {
        this.ui.result.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 250);
  }

  /**
   * Texto para compartir (sin spoiler).
   * @param {boolean} [withUrl] Con el enlace al final.
   */
  shareText(withUrl = true) {
    const { state } = this;
    const won = state.status === "won";
    return buildShareText({
      gameName: SITE.name,
      number: state.number,
      emoji: this.collection.menu?.kicker ?? this.collection.emoji, // "Epidex Gen I #12"
      won,
      attemptsUsed: state.attempts.length,
      maxAttempts: maxAttempts(state),
      results: attemptResults(state),
      // Pista: su nombre ("Tipo"), null si se jugó sin ninguna; nada si el modo no tiene.
      hint: this.hintKinds.length ? (state.hint ? t(`hint_${state.hint}`) : null) : undefined,
      url: withUrl ? this.shareLink : undefined,
      lang: LANG,
    });
  }

  /** Hoja de compartir del sistema (o copiar, si no hay). */
  async share() {
    const outcome = await shareResult(this.shareText());
    if (outcome === "copied") this.toast(t("copied"), { tone: "success" });
    if (outcome === "failed") this.toast(t("copyFailed"), { tone: "error" });
  }

  async copyResult() {
    const ok = await copyToClipboard(this.shareText());
    this.toast(t(ok ? "copied" : "copyFailed"), { tone: ok ? "success" : "error" });
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

    ui.circlesLabel.textContent = over ? t("fullDrawing") : t("circles", { n: circles });

    ui.ladder.replaceChildren(
      ...results.map((result, i) =>
        h("li", {
          class: [
            "rung",
            `rung--${result}`,
            !over && i === levelIndex(state) ? "rung--current" : "",
          ].join(" "),
          text: state.levels[i],
          title: t("tileTitle", { n: state.levels[i], result: RESULT_LABEL[result] }),
        }),
      ),
    );

    // Registro: una línea por intento (los pendientes solo se ven en escritorio).
    ui.history.replaceChildren(
      ...state.levels.map((level, i) => {
        const attempt = state.attempts[i];
        let kind = "pending";
        let text = "· · ·";
        if (attempt?.type === "skip") [kind, text] = ["skip", t("resultSkip")];
        else if (attempt && attempt.id === state.answer) [kind, text] = ["correct", this.names.get(attempt.id) ?? attempt.id];
        else if (attempt) [kind, text] = ["wrong", this.names.get(attempt.id) ?? attempt.id];
        else if (!over && i === levelIndex(state)) [kind, text] = ["current", t("now")];
        return h(
          "li",
          { class: `log-row log-row--${kind}${attempt ? " log-row--done" : ""}` },
          h("span", { class: "log-n", text: String(level) }),
          h("span", { class: "log-text", text }),
        );
      }),
    );

    // Pista: la tecla se apaga cuando ya se ha usado, y la pista queda en la pantalla.
    ui.hint.disabled = over || Boolean(state.hint);
    ui.hint.title = state.hint ? t("hintUsed") : this.hintTitle;
    const hintLabel = state.hint ? this.hintLabel() : "";
    ui.hintLine.hidden = !hintLabel;
    ui.hintLine.textContent = hintLabel;
    // Pista del color: además del texto, la silueta se rellena con ese color.
    const tint = state.hint === "tint" ? (TINTS[this.puzzle.hints?.tint?.key] ?? null) : null;
    if (this.renderer.options.fillColor !== tint) this.renderer.setOptions({ fillColor: tint });

    this.autocomplete.setExclude(guessedIds(state));
    ui.play.hidden = over;
    ui.result.hidden = !over;
    if (!over) return;

    const won = state.status === "won";
    ui.result.classList.toggle("result--won", won);
    ui.resultTitle.textContent = won
      ? t("correct", { score: `${state.attempts.length}/${maxAttempts(state)}` })
      : t("lost");
    ui.resultAnswer.textContent = this.names.get(state.answer) ?? state.answer;
    const entry = this.dexEntry;
    ui.resultDex.hidden = !entry;
    if (entry) {
      const caughtNow = entry.status === "caught" && entry.date === state.date;
      ui.resultDex.textContent = t(caughtNow ? "dexCaught" : entry.status === "caught" ? "dexCaughtAgain" : "dexSeen");
      ui.resultDex.className = `result-dex result-dex--${entry.status}`;
    }
    this.revealArt();
    const streak = displayedStreak(this.stats, state.date);
    ui.streak.hidden = !won || streak < 1;
    ui.streak.textContent = streak === 1 ? t("streakStart") : t("streak", { n: streak });
    ui.streak.classList.toggle("is-new", this.justFinished);
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
          h("a", { href: window.location.href, text: t("reload") }),
        );
      }
    };
    tick();
    this.countdownTimer = setInterval(tick, 1000);
  }
}
