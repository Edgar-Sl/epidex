/**
 * Guardado local (localStorage) del progreso del día y de las estadísticas.
 *
 * Responsabilidad única: leer y escribir JSON de forma segura. Nada aquí sabe
 * de reglas del juego ni de cómo se calculan las estadísticas.
 *
 * localStorage puede fallar (modo privado, almacenamiento lleno, cookies
 * bloqueadas, JSON corrupto...). Todos los accesos van en try/catch y, si no
 * está disponible, se usa un almacén en memoria: el juego sigue funcionando,
 * solo que el progreso no sobrevive a una recarga.
 */

const PREFIX = "epidex";
const SCHEMA = "v1";

/** Almacén mínimo con la misma interfaz que usamos de localStorage. */
class MemoryStore {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

/** @returns {Storage | MemoryStore} */
function pickBackend() {
  try {
    const probe = `${PREFIX}:probe`;
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    console.warn("localStorage no disponible: el progreso no se guardará entre recargas.");
    return new MemoryStore();
  }
}

export class GameStorage {
  /**
   * @param {string} collectionId Cada modo de juego guarda sus datos por separado.
   * @param {Storage | MemoryStore} [backend] Inyectable para los tests.
   */
  constructor(collectionId, backend = pickBackend()) {
    this.backend = backend;
    this.base = `${PREFIX}:${SCHEMA}:${collectionId}`;
  }

  /**
   * Lee y parsea una clave. Devuelve `fallback` si no existe o está corrupta.
   * @template T
   * @param {string} key
   * @param {T} fallback
   * @returns {T}
   */
  read(key, fallback) {
    try {
      const raw = this.backend.getItem(`${this.base}:${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (error) {
      console.warn(`No se pudo leer ${key}:`, error);
      return fallback;
    }
  }

  /**
   * Guarda un valor como JSON. Devuelve false si falla (sin lanzar).
   * @param {string} key
   * @param {unknown} value
   */
  write(key, value) {
    try {
      this.backend.setItem(`${this.base}:${key}`, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`No se pudo guardar ${key}:`, error);
      return false;
    }
  }

  /**
   * Partida guardada para un puzzle concreto, o null si no hay o es de otro día.
   * @param {string} puzzleId
   * @param {number} version Versión del formato del estado (game.STATE_VERSION).
   */
  loadGame(puzzleId, version) {
    const saved = this.read("game", null);
    if (!saved || saved.version !== version || saved.puzzleId !== puzzleId) return null;
    if (!Array.isArray(saved.attempts) || !Array.isArray(saved.levels)) return null;
    return saved;
  }

  /** @param {object} state */
  saveGame(state) {
    return this.write("game", state);
  }

  /** @param {object} fallback Estadísticas vacías (stats.emptyStats()). */
  loadStats(fallback) {
    const saved = this.read("stats", null);
    return saved && saved.version === fallback.version ? { ...fallback, ...saved } : fallback;
  }

  /** @param {object} stats */
  saveStats(stats) {
    return this.write("stats", stats);
  }
}
