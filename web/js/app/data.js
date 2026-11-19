/**
 * Carga de datos: índice de colecciones, calendario, respuestas y puzzle del día.
 */

import { dateInTimeZone, dateOverride, findScheduleEntry, formatDate } from "../core/dates.js";
import { DEFAULT_UI, SITE } from "./config.js";

/** Error esperado (hoy no hay puzzle): se muestra sin ensuciar la consola. */
export class NoPuzzleError extends Error {}

/**
 * @typedef {Object} CollectionInfo
 * @property {string} id
 * @property {string} title
 * @property {string} emoji
 * @property {{placeholder: string, subject: string}} ui
 */

async function getJSON(path) {
  const response = await fetch(`${SITE.dataDir}/${path}`);
  if (!response.ok) throw new Error(`No se pudo cargar ${path} (${response.status})`);
  return response.json();
}

/**
 * Colección elegida por la URL (?modo=<id>) o la primera.
 * @param {CollectionInfo[]} collections
 * @param {string} [search]
 */
export function pickCollection(collections, search = window.location.search) {
  const wanted = new URLSearchParams(search).get("modo");
  return collections.find((c) => c.id === wanted) ?? collections[0];
}

/**
 * Enlace a un modo de juego, conservando ?fecha= si se está probando otro día.
 * El primer modo usa la URL limpia.
 *
 * @param {CollectionInfo[]} collections
 * @param {string} id
 */
export function modeUrl(collections, id) {
  const params = new URLSearchParams();
  if (id !== collections[0].id) params.set("modo", id);
  const date = dateOverride();
  if (date) params.set("fecha", date);
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}`;
}

/**
 * Enlace público para compartir: sin ?fecha= (cada uno juega su día).
 * @param {CollectionInfo[]} collections
 * @param {string} id
 */
export function shareUrl(collections, id) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return id === collections[0].id ? base : `${base}?modo=${encodeURIComponent(id)}`;
}

/** Índice de colecciones con los textos de interfaz completados. */
export async function loadCollections() {
  const { collections } = await getJSON("collections.json");
  return collections.map((c) => ({ ...c, ui: { ...DEFAULT_UI, ...c.ui } }));
}

/**
 * Todo lo necesario para la partida de hoy de una colección.
 * @param {CollectionInfo} collection
 */
export async function loadToday(collection) {
  const [schedule, answers] = await Promise.all([
    getJSON(`${collection.id}/schedule.json`),
    getJSON(`${collection.id}/answers.json`),
  ]);
  const date = dateOverride() ?? dateInTimeZone(schedule.timezone);
  const entry = findScheduleEntry(schedule, date);
  if (!entry) {
    const first = schedule.days[0]?.date;
    const reason =
      first && date < first
        ? `El primer puzzle llega el ${formatDate(first)}.`
        : "Hoy no hay puzzle.";
    throw new NoPuzzleError(`${reason} Mientras tanto puedes probar otro día con ?fecha=${first}`);
  }
  const puzzle = await getJSON(`${collection.id}/puzzles/${entry.puzzle}.json`);
  return { answers: answers.answers, entry, puzzle, timezone: schedule.timezone };
}
