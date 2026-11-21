"""Páginas HTML, ``robots.txt`` y ``sitemap.xml`` a partir de ``site/page.html``.

Hay una página por idioma, con su título, descripción, texto e imagen para
compartir, para que los buscadores y las vistas previas de WhatsApp/X muestren
lo correcto. El primer idioma va en la raíz y los demás en su carpeta::

    web/index.html      -> inglés
    web/es/index.html   -> español (con <base href="../">: comparte CSS, JS y datos)

Los textos están en ``site/strings.json``. Lo que depende del dominio (URL
canónica, ``hreflang``, ``og:url``, sitemap) solo se genera si ``[site] url``
está definido en ``config.toml``.
"""

from __future__ import annotations

import html
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_LEVELS = (2, 4, 8, 16, 32, 64)


@dataclass(frozen=True)
class SiteSettings:
    """Bloque ``[site]`` de ``config.toml``."""

    name: str = "Epidex"
    url: str = ""  # p. ej. "https://ejemplo.com/" (con / final); vacío = aún sin dominio
    languages: tuple[str, ...] = ("en", "es")  # el primero va en la raíz
    goatcounter: str = ""  # código de GoatCounter (analítica sin cookies); vacío = sin analítica

    @classmethod
    def from_config(cls, raw: dict[str, Any]) -> SiteSettings:
        """Lee el bloque ``[site]`` (las claves que no son de aquí se ignoran)."""
        return cls(
            name=str(raw.get("name", cls.name)),
            url=str(raw.get("url", "")),
            languages=tuple(str(lang) for lang in raw.get("languages", cls.languages)),
            goatcounter=str(raw.get("goatcounter", "")),
        )

    def path(self, lang: str) -> str:
        """Carpeta de la página de un idioma ("" para el principal, "es/"...)."""
        return "" if lang == self.languages[0] else f"{lang}/"

    def absolute(self, path: str) -> str:
        """URL absoluta de una ruta del sitio (o la ruta tal cual si no hay dominio)."""
        return f"{self.url.rstrip('/')}/{path}" if self.url else path


def load_strings(path: Path) -> dict[str, dict[str, Any]]:
    """Textos de la plantilla por idioma (``site/strings.json``)."""
    data = json.loads(path.read_text(encoding="utf-8"))
    return {k: v for k, v in data.items() if not k.startswith("_")}


def json_ld(site: SiteSettings, lang: str, texts: dict[str, Any]) -> str:
    """Datos estructurados (schema.org) del juego."""
    game: dict[str, Any] = {
        "@context": "https://schema.org",
        "@type": "VideoGame",
        "name": site.name,
        "description": texts["description"],
        "genre": texts.get("genre", ["Puzzle"]),
        "inLanguage": lang,
        "isAccessibleForFree": True,
        "playMode": "SinglePlayer",
        "applicationCategory": "Game",
        "operatingSystem": "Web",
        "gamePlatform": texts.get("platform", "Web"),
        "offers": {"@type": "Offer", "price": "0", "priceCurrency": "EUR"},
    }
    if site.url:
        game["url"] = site.absolute(site.path(lang))
    return json.dumps(game, ensure_ascii=False).replace("</", "<\\/")


def analytics_tag(site: SiteSettings) -> str:
    """Script de GoatCounter (sin cookies, no necesita aviso) o nada."""
    if not site.goatcounter:
        return ""
    code = html.escape(site.goatcounter)
    return (
        f'<script data-goatcounter="https://{code}.goatcounter.com/count" '
        'async src="https://gc.zgo.at/count.js"></script>'
    )


def render_page(
    template: str,
    site: SiteSettings,
    lang: str,
    strings: dict[str, dict[str, Any]],
    levels: tuple[int, ...] = DEFAULT_LEVELS,
) -> str:
    """Rellena la plantilla para un idioma.

    Marcadores: ``{{clave}}`` (valores calculados) y ``{{t.clave}}`` (textos de
    ``site/strings.json``, que pueden llevar HTML y los marcadores de niveles).
    """
    texts = strings[lang]
    path = site.path(lang)
    others = [other for other in site.languages if other != lang and other in strings]
    canonical = alternates = ""
    if site.url:
        url = html.escape(site.absolute(path))
        canonical = (
            f'<link rel="canonical" href="{url}">\n  <meta property="og:url" content="{url}">'
        )
        alternates = "\n  ".join(
            [
                f'<link rel="alternate" hreflang="{other}" '
                f'href="{html.escape(site.absolute(site.path(other)))}">'
                for other in site.languages
            ]
            + [
                '<link rel="alternate" hreflang="x-default" '
                f'href="{html.escape(site.absolute(""))}">'
            ]
        )
    switch = " ".join(
        f'<a class="lang-switch" href="{site.path(other) or "./"}" hreflang="{other}" '
        f'lang="{other}" data-lang="{other}" '
        f'title="{html.escape(strings[other].get("lang_name", other))}">{other.upper()}</a>'
        for other in others
    )
    og_locales = "\n  ".join(
        f'<meta property="og:locale:alternate" content="{html.escape(strings[o]["locale"])}">'
        for o in others
        if "locale" in strings[o]
    )
    og_image = "og/epidex.png" if lang == site.languages[0] else f"og/{lang}/epidex.png"
    values = {
        "lang": lang,
        "base": f'<base href="{"../" * path.count("/")}">' if path else "",
        "name": html.escape(site.name),
        "title": html.escape(texts["title"].replace("{name}", site.name)),
        "description": html.escape(texts["description"]),
        "canonical": canonical,
        "alternates": alternates,
        "og_locale_alternates": og_locales,
        "og_image": html.escape(site.absolute(og_image)),
        "lang_switch": switch,
        "json_ld": json_ld(site, lang, texts),
        "analytics": analytics_tag(site),
        "levels": " → ".join(str(k) for k in levels),
        "first_level": str(levels[0]),
        "attempts": str(len(levels)),
    }
    out = template
    for key, value in texts.items():
        if isinstance(value, str):
            out = out.replace("{{t." + key + "}}", value)
    for key, value in values.items():
        out = out.replace("{{" + key + "}}", value)
    if "{{" in out:
        raise ValueError(f"Marcadores sin rellenar en la plantilla: {out[out.index('{{') :][:40]}")
    return out


def robots_txt(site: SiteSettings) -> str:
    """``robots.txt``: todo indexable salvo las herramientas de desarrollo."""
    lines = ["User-agent: *", "Allow: /", "Disallow: /dev/"]
    if site.url:
        lines.append(f"Sitemap: {site.absolute('sitemap.xml')}")
    return "\n".join(lines) + "\n"


def sitemap_xml(site: SiteSettings) -> str:
    """``sitemap.xml`` con la página de cada idioma y sus alternativas (necesita ``url``)."""
    links = "".join(
        f'\n    <xhtml:link rel="alternate" hreflang="{lang}" '
        f'href="{html.escape(site.absolute(site.path(lang)))}"/>'
        for lang in site.languages
    )
    entries = "\n".join(
        f"  <url>\n    <loc>{html.escape(site.absolute(site.path(lang)))}</loc>{links}"
        "\n    <changefreq>daily</changefreq>\n  </url>"
        for lang in site.languages
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
        'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + entries + "\n</urlset>\n"
    )


def build_site(
    template_path: Path,
    web_dir: Path,
    site: SiteSettings,
    levels: tuple[int, ...] = DEFAULT_LEVELS,
) -> list[Path]:
    """Genera una página por idioma, ``robots.txt`` y (con dominio) ``sitemap.xml``.

    Los textos se leen de ``strings.json``, junto a la plantilla.

    Returns:
        Rutas escritas.
    """
    template = template_path.read_text(encoding="utf-8")
    strings = load_strings(template_path.parent / "strings.json")
    written = []
    for lang in site.languages:
        dest = web_dir / site.path(lang) / "index.html"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(render_page(template, site, lang, strings, levels), encoding="utf-8")
        written.append(dest)
    (web_dir / "robots.txt").write_text(robots_txt(site), encoding="utf-8")
    written.append(web_dir / "robots.txt")
    sitemap = web_dir / "sitemap.xml"
    if site.url:
        sitemap.write_text(sitemap_xml(site), encoding="utf-8")
        written.append(sitemap)
    else:
        sitemap.unlink(missing_ok=True)
        logger.info("Sin [site] url: se omiten canónica, hreflang y sitemap (falta el dominio).")
    return written
