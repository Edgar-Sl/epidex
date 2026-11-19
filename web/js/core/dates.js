/**
 * Fechas del puzzle diario.
 *
 * Todos los jugadores ven el mismo puzzle el mismo día *en la zona horaria del
 * calendario* (Europe/Madrid), estén donde estén. Por eso no se usa la fecha
 * local del dispositivo.
 */

/**
 * Fecha "YYYY-MM-DD" de un instante en una zona horaria.
 *
 * @param {string} timeZone Zona IANA, p. ej. "Europe/Madrid".
 * @param {Date} [now]
 * @returns {string}
 */
export function dateInTimeZone(timeZone, now = new Date()) {
  // El formato en-CA es justamente AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Entrada del calendario para una fecha.
 *
 * @param {{days: {date: string, number: number, puzzle: string}[]}} schedule
 * @param {string} date "YYYY-MM-DD"
 * @returns {{date: string, number: number, puzzle: string} | null}
 */
export function findScheduleEntry(schedule, date) {
  return schedule.days.find((d) => d.date === date) ?? null;
}

/**
 * Fecha forzada por la URL (?fecha=AAAA-MM-DD), útil para probar otros días.
 *
 * @param {string} [search] window.location.search
 * @returns {string | null}
 */
export function dateOverride(search = window.location.search) {
  const value = new URLSearchParams(search).get("fecha");
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * Formatea "YYYY-MM-DD" para mostrarlo, p. ej. "1 de diciembre de 2026".
 *
 * @param {string} date
 * @returns {string}
 */
export function formatDate(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/**
 * Milisegundos que faltan para el siguiente día en una zona horaria (el
 * siguiente puzzle). Ignora el salto de hora de los cambios de horario, que
 * solo desplaza la cuenta atrás una hora dos noches al año.
 *
 * @param {string} timeZone
 * @param {Date} [now]
 * @returns {number}
 */
export function msUntilNextDay(timeZone, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  );
  const elapsed = ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000;
  return Math.max(0, 24 * 3600 * 1000 - elapsed - now.getMilliseconds());
}

/**
 * Formatea una duración como "HH:MM:SS".
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}
