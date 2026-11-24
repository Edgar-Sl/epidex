/**
 * Carga de datos: índice de colecciones, calendario, respuestas y puzzle del día.
 */

import { dateInTimeZone, dateOverride, findScheduleEntry, formatDate } from "../core/dates.js";
import { DEFAULT_UI, SITE } from "./config.js";
import { LANG, LOCALE, t } from "./i18n.js";

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
  if (!response.ok) throw new Error(t("loadFailed", { path, status: response.status }));
  return response.json();
}

/**
 * Colección elegida por la URL (?modo=<id>), o null para el menú principal.
 * @param {CollectionInfo[]} collections
 * @param {string} [search]
 */
export function pickCollection(collections, search = window.location.search) {
  const wanted = new URLSearchParams(search).get("modo");
  return collections.find((c) => c.id === wanted) ?? null;
}

/** Conserva ?fecha= en los enlaces internos si se está probando otro día. */
function withDate(params) {
  const date = dateOverride();
  if (date) params.set("fecha", date);
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}`;
}

/**
 * Enlace a un modo de juego.
 * @param {string} id
 */
export function modeUrl(id) {
  return withDate(new URLSearchParams({ modo: id }));
}

/** Enlace al menú principal. */
export function homeUrl() {
  return withDate(new URLSearchParams());
}

/**
 * Enlace público para compartir: sin ?fecha= (cada uno juega su día).
 * @param {string} id
 */
export function shareUrl(id) {
  return `${window.location.origin}${window.location.pathname}?modo=${encodeURIComponent(id)}`;
}

/** Fecha de hoy del juego (la del calendario, o la de ?fecha=). */
export async function today(collection) {
  const schedule = await getJSON(`${collection.id}/schedule.json`);
  return dateOverride() ?? dateInTimeZone(schedule.timezone);
}

/**
 * Índice de colecciones con los textos de interfaz completados, en el idioma de
 * la página (bloque `i18n.<idioma>` de cada colección, si lo tiene).
 */
export async function loadCollections() {
  const { collections } = await getJSON("collections.json");
  return collections.map((c) => {
    const local = c.i18n?.[LANG] ?? {};
    return { ...c, ...local, ui: { ...DEFAULT_UI, ...c.ui, ...local.ui } };
  });
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
      first && date < first ? t("firstPuzzle", { date: formatDate(first, LOCALE) }) : t("noPuzzle");
    throw new NoPuzzleError(`${reason} ${t("tryOtherDay", { date: first })}`);
  }
  const puzzle = await getJSON(`${collection.id}/puzzles/${entry.puzzle}.json`);
  return { answers: answers.answers, entry, puzzle, timezone: schedule.timezone };
}
