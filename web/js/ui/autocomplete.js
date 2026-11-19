/**
 * Combobox accesible para escribir la respuesta (patrón ARIA "combobox with
 * listbox popup"). La búsqueda la hace un AnswerIndex (core/answer-index.js).
 */

/** @typedef {import("../core/answer-index.js").Answer} Answer */
/** @typedef {import("../core/answer-index.js").Suggestion} Suggestion */
/** @typedef {import("../core/answer-index.js").AnswerIndex} AnswerIndex */

let instanceCounter = 0;

export class Autocomplete {
  /**
   * @param {Object} options
   * @param {HTMLInputElement} options.input
   * @param {HTMLUListElement} options.list Lista donde se pintan las sugerencias.
   * @param {AnswerIndex} options.index
   * @param {(answer: Answer | null) => void} [options.onChange]
   *   Se llama cuando cambia la respuesta válida actual (o deja de haberla).
   */
  constructor({ input, list, index, onChange = () => {} }) {
    this.input = input;
    this.list = list;
    this.index = index;
    this.onChange = onChange;
    this.exclude = new Set();
    /** @type {Suggestion[]} */
    this.suggestions = [];
    this.active = -1;
    /** @type {Answer | null} */
    this.current = null;
    this.prefix = `ac${++instanceCounter}`;

    if (!list.id) list.id = `${this.prefix}-list`;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", list.id);
    input.setAttribute("aria-expanded", "false");
    input.autocomplete = "off";
    input.spellcheck = false;
    list.setAttribute("role", "listbox");
    list.hidden = true;

    input.addEventListener("input", () => this.update());
    input.addEventListener("keydown", (e) => this.onKeyDown(e));
    input.addEventListener("blur", () => setTimeout(() => this.close(), 120));
    input.addEventListener("focus", () => this.update());
    // mousedown (y no click) para elegir antes de que el input pierda el foco.
    list.addEventListener("mousedown", (e) => {
      const option = e.target.closest("[role=option]");
      if (!option) return;
      e.preventDefault();
      this.choose(Number(option.dataset.index));
    });
  }

  /** Respuesta válida escrita o elegida ahora, o null. */
  value() {
    return this.current;
  }

  /** @param {Set<string>} ids Ids que no se deben sugerir. */
  setExclude(ids) {
    this.exclude = new Set(ids);
  }

  /** Vacía el campo. */
  clear() {
    this.input.value = "";
    this.setCurrent(null);
    this.close();
  }

  /** @param {boolean} disabled */
  setDisabled(disabled) {
    this.input.disabled = disabled;
    if (disabled) this.close();
  }

  // ---- internos ----------------------------------------------------------

  update() {
    const text = this.input.value;
    this.setCurrent(this.index.resolve(text));
    this.suggestions = this.index.search(text, { exclude: this.exclude });
    this.active = this.suggestions.length > 0 ? 0 : -1;
    this.render();
  }

  setCurrent(answer) {
    if (answer !== this.current) {
      this.current = answer;
      this.onChange(answer);
    }
  }

  /** @param {number} i */
  choose(i) {
    const suggestion = this.suggestions[i];
    if (!suggestion) return;
    this.input.value = suggestion.answer.name;
    this.setCurrent(suggestion.answer);
    this.close();
  }

  close() {
    this.suggestions = [];
    this.active = -1;
    this.render();
  }

  /** @param {KeyboardEvent} e */
  onKeyDown(e) {
    const open = this.suggestions.length > 0;
    if (e.key === "ArrowDown" && open) {
      e.preventDefault();
      this.active = (this.active + 1) % this.suggestions.length;
      this.render();
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      this.active = (this.active - 1 + this.suggestions.length) % this.suggestions.length;
      this.render();
    } else if (e.key === "Enter" && open && this.active >= 0) {
      // Si la lista está abierta, Enter elige; un segundo Enter envía el formulario.
      const already = this.current && this.current.id === this.suggestions[this.active].answer.id;
      if (!already) {
        e.preventDefault();
        this.choose(this.active);
      } else {
        this.close();
      }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      this.close();
    }
  }

  render() {
    const open = this.suggestions.length > 0;
    this.list.hidden = !open;
    this.input.setAttribute("aria-expanded", String(open));
    this.list.replaceChildren(
      ...this.suggestions.map(({ answer, alias }, i) => {
        const li = document.createElement("li");
        li.id = `${this.prefix}-opt-${i}`;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", String(i === this.active));
        li.dataset.index = String(i);
        li.textContent = answer.name;
        if (alias) {
          const small = document.createElement("small");
          small.textContent = ` (${alias})`;
          li.append(small);
        }
        return li;
      }),
    );
    if (this.active >= 0) {
      this.input.setAttribute("aria-activedescendant", `${this.prefix}-opt-${this.active}`);
      this.list.children[this.active]?.scrollIntoView({ block: "nearest" });
    } else {
      this.input.removeAttribute("aria-activedescendant");
    }
  }
}
