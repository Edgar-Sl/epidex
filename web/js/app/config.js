/**
 * Configuración del sitio. Lo único que cambia al renombrar o desplegar el juego.
 */

import { t } from "./i18n.js";

export const SITE = {
  /** Nombre del juego (aparece en la cabecera y en el texto para compartir). */
  name: "Epidex",
  /** Carpeta de datos generada por `python -m pipeline.build`, relativa a index.html. */
  dataDir: "data",
};

/** Textos por defecto si una colección no define su bloque `ui`. */
export const DEFAULT_UI = {
  placeholder: t("placeholder"),
  subject: t("subject"),
};
