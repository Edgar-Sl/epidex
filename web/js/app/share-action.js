/**
 * Enlaces que abren cada app con el mensaje ya escrito. En el móvil abren la
 * app directamente (WhatsApp, Telegram, X); en el ordenador, su versión web.
 *
 * @param {"whatsapp" | "telegram" | "x"} app
 * @param {string} text Mensaje sin el enlace.
 * @param {string} url Enlace al juego.
 */
export function appShareUrl(app, text, url) {
  const enc = encodeURIComponent;
  // wa.me redirige aquí y por el camino rompe los emojis: se va directo.
  if (app === "whatsapp") return `https://api.whatsapp.com/send?text=${enc(`${text}\n${url}`)}`;
  if (app === "telegram") return `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`;
  return `https://x.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`;
}

/** Si el navegador tiene la hoja de compartir del sistema (solo con HTTPS). */
export const canShareNatively = () => typeof navigator.share === "function";

/**
 * Compartir el resultado: hoja nativa del móvil o, si no hay, portapapeles.
 *
 * - En móvil, navigator.share() abre WhatsApp, Telegram, etc. directamente:
 *   es el gesto natural para "mandárselo a alguien".
 * - En escritorio la hoja nativa es incómoda (y no existe en Firefox), así que
 *   se copia al portapapeles y se avisa con un toast.
 * - Si el usuario cierra la hoja sin compartir, no es un error.
 */

/**
 * @param {string} text Texto completo a compartir (incluye el enlace).
 * @returns {Promise<"shared" | "copied" | "cancelled" | "failed">}
 */
export async function shareResult(text) {
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (touch && typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
      // Otros fallos (p. ej. permisos): probamos a copiar.
    }
  }
  return (await copyToClipboard(text)) ? "copied" : "failed";
}

/**
 * Copia texto al portapapeles. Usa la API moderna (requiere HTTPS o localhost)
 * y, si no está disponible, un <textarea> temporal.
 *
 * @param {string} text
 * @returns {Promise<boolean>} true si se ha copiado.
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Seguimos con el método antiguo.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
