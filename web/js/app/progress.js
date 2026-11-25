/**
 * Pasar el progreso a otro dispositivo: un enlace (o un código) con todo lo
 * guardado, que al abrirse se une con lo de ese navegador (core/sync.js).
 *
 * Sin cuentas ni servidor: el progreso va comprimido en el propio enlace, tras
 * el "#", que el navegador no envía a ningún servidor.
 *
 *   https://…/#progreso=1.<datos comprimidos en base64url>
 */

import { SYNC_VERSION, isSyncedKey, mergeProgress } from "../core/sync.js";

const PREFIX = "epidex:v1:"; // el de app/storage.js
const HASH_KEY = "progreso";

/** Todo el progreso guardado en este navegador: {"gen1:game": {...}, ...}. */
export function readProgress(storage = window.localStorage) {
  const out = {};
  try {
    for (let i = 0; i < storage.length; i++) {
      const full = storage.key(i);
      if (!full?.startsWith(PREFIX)) continue;
      const key = full.slice(PREFIX.length);
      if (!isSyncedKey(key)) continue;
      try {
        out[key] = JSON.parse(storage.getItem(full));
      } catch {
        // Una clave corrupta no impide pasar el resto.
      }
    }
  } catch {
    // Sin almacenamiento: no hay nada que pasar.
  }
  return out;
}

// ---- Codificación: JSON -> deflate -> base64url ----------------------------

function toBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** Progreso -> código ("1." comprimido, o "0." sin comprimir si el navegador no sabe). */
export async function encodeProgress(progress) {
  const bytes = new TextEncoder().encode(JSON.stringify({ v: SYNC_VERSION, data: progress }));
  if (typeof CompressionStream === "function") {
    return `1.${toBase64Url(await pipe(bytes, new CompressionStream("deflate-raw")))}`;
  }
  return `0.${toBase64Url(bytes)}`;
}

/** Código (o enlace entero) -> progreso. Lanza un error si no es válido. */
export async function decodeProgress(input) {
  const code = String(input).trim().split(`${HASH_KEY}=`).at(-1).trim();
  const [format, payload] = [code.slice(0, 2), code.slice(2)];
  let bytes = fromBase64Url(payload);
  if (format === "1.") bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
  else if (format !== "0.") throw new Error("Formato desconocido");
  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  if (parsed?.v !== SYNC_VERSION || typeof parsed.data !== "object") throw new Error("Versión desconocida");
  return parsed.data;
}

/** Enlace para abrir en el otro dispositivo. */
export async function progressLink() {
  const url = new URL(window.location.href);
  url.search = url.searchParams.get("modo") ? `?modo=${url.searchParams.get("modo")}` : "";
  url.hash = `${HASH_KEY}=${await encodeProgress(readProgress())}`;
  return url.toString();
}

/** Código del enlace actual (#progreso=…), o null. */
export function progressInHash() {
  const hash = window.location.hash.slice(1);
  return hash.startsWith(`${HASH_KEY}=`) ? hash : null;
}

/** Quita el código de la barra de direcciones (sin recargar). */
export function clearProgressHash() {
  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState(null, "", url);
}

/**
 * Une el progreso de un código con el de este navegador y lo guarda.
 * @returns {Promise<number>} Cuántas cosas han cambiado (0 = ya estaba todo).
 */
export async function importProgress(input, storage = window.localStorage) {
  const incoming = await decodeProgress(input);
  const changed = mergeProgress(readProgress(storage), incoming);
  for (const [key, value] of Object.entries(changed)) storage.setItem(PREFIX + key, JSON.stringify(value));
  return Object.keys(changed).length;
}
