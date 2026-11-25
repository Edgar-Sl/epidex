"""Páginas HTML, ``robots.txt`` y ``sitemap.xml`` a partir de ``site/page.html``.

Hay una página por idioma, con su título, descripción, texto e imagen para
compartir, para que los buscadores y las vistas previas de WhatsApp/X muestren
lo correcto. El primer idioma va en la raíz y los demás en su carpeta::

    web/index.html      -> inglés
    web/es/index.html   -> español (con <base href="../">: comparte CSS, JS y datos)

Y, si existe ``site/legal.json``, una página de aviso legal y privacidad por
idioma (``web/legal/``, ``web/es/legal/``) con los datos de ``[site.legal]``.

Los textos están en ``site/strings.json``. Lo que depende del dominio (URL
canónica, ``hreflang``, ``og:url``, sitemap) solo se genera si ``[site] url``
está definido en ``config.toml``.
"""

from __future__ import annotations

import datetime
import html
import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_LEVELS = (2, 4, 8, 16, 32, 64)


@dataclass(frozen=True)
class LegalSettings:
    """Bloque ``[site.legal]``: quién responde de la web (aviso legal y privacidad)."""

    owner: str = ""  # nombre del titular
    email: str = ""  # contacto para retiradas de contenido y protección de datos
    nif: str = ""  # opcional (obligatorio en España si hay actividad económica)
    address: str = ""  # opcional; con el correo suele bastar para un particular
    ads: bool = False  # si la web muestra anuncios (cambia el texto de privacidad)
    updated: str = ""  # fecha de la última revisión del texto

    @classmethod
    def from_config(cls, raw: dict[str, Any]) -> LegalSettings:
        """Lee el bloque ``[site.legal]``."""
        return cls(
            owner=str(raw.get("owner", "")),
            email=str(raw.get("email", "")),
            nif=str(raw.get("nif", "")),
            address=str(raw.get("address", "")),
            ads=bool(raw.get("ads", False)),
            updated=str(raw.get("updated", "")),
        )

    def missing(self) -> list[str]:
        """Datos imprescindibles sin rellenar."""
        return [key for key in ("owner", "email") if not getattr(self, key)]


@dataclass(frozen=True)
class SiteSettings:
    """Bloque ``[site]`` de ``config.toml``."""

    name: str = "Epidex"
    url: str = ""  # p. ej. "https://ejemplo.com/" (con / final); vacío = aún sin dominio
    languages: tuple[str, ...] = ("en", "es")  # el primero va en la raíz
    goatcounter: str = ""  # código de GoatCounter (analítica sin cookies); vacío = sin analítica
    donate_url: str = ""  # enlace de donaciones (Ko-fi...); vacío = sin bloque «Apoya al creador»
    legal: LegalSettings = field(default_factory=LegalSettings)

    @classmethod
    def from_config(cls, raw: dict[str, Any]) -> SiteSettings:
        """Lee el bloque ``[site]`` (las claves que no son de aquí se ignoran)."""
        return cls(
            name=str(raw.get("name", cls.name)),
            url=str(raw.get("url", "")),
            languages=tuple(str(lang) for lang in raw.get("languages", cls.languages)),
            goatcounter=str(raw.get("goatcounter", "")),
            donate_url=str(raw.get("donate_url", "")),
            legal=LegalSettings.from_config(raw.get("legal", {})),
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


def donate_box(site: SiteSettings, texts: dict[str, Any]) -> str:
    """Bloque «Apoya al creador» de la pantalla de resultado, o nada sin ``donate_url``."""
    if not site.donate_url:
        return ""
    url = html.escape(site.donate_url)
    return (
        '<div class="donate-box">'
        f'<p class="donate-text">{texts["donate_text"]}</p>'
        f'<a id="donate" class="share-pill donate-btn" href="{url}" target="_blank" '
        f'rel="noopener">☕ <span>{texts["donate_btn"]}</span></a>'
        "</div>"
    )


def boot_script(site: SiteSettings, lang: str) -> str:
    """Script en línea que va al principio del ``<head>``, antes que nada más.

    - En la página del idioma principal, primera visita con el navegador en otro
      idioma: salta a esa versión ya, sin descargar antes el juego en inglés.
      (``js/app/i18n.js`` hace lo mismo; esto solo lo adelanta.)
    - Empieza a descargar los datos que va a pedir el juego (índice de modos y,
      con ``?modo=``, su calendario y sus respuestas) a la vez que el JS, en vez
      de esperar a que este arranque.
    """
    redirect = ""
    if lang == site.languages[0] and len(site.languages) > 1:
        langs = json.dumps(list(site.languages))
        redirect = (
            f"var L={langs},w=null;"
            'try{w=localStorage.getItem("epidex:lang")}catch(e){}'
            "if(L.indexOf(w)<0){w=null;var n=navigator.languages||[navigator.language];"
            "for(var i=0;i<n.length&&!w;i++){var c=String(n[i]).slice(0,2).toLowerCase();"
            "if(L.indexOf(c)>=0)w=c}}"
            "if(w&&w!==L[0]){location.replace(w+'/'+location.search+location.hash);return}"
        )
    return (
        "<script>(function(){"
        + redirect
        + "function p(h){var l=document.createElement('link');l.rel='preload';l.as='fetch';"
        "l.crossOrigin='anonymous';l.href='data/'+h;document.head.appendChild(l)}"
        "p('collections.json');"
        "var m=new URLSearchParams(location.search).get('modo');"
        "if(m&&/^[a-z0-9_-]+$/i.test(m)){p(m+'/schedule.json');p(m+'/answers.json')}"
        "})()</script>"
    )


def module_graph(js_dir: Path, entry: str = "main.js") -> list[str]:
    """Módulos que importa ``entry`` (directa o indirectamente), sin él, ordenados.

    Sirven para ``<link rel="modulepreload">``: así el navegador los pide todos a
    la vez en vez de descubrirlos nivel a nivel.
    """
    seen: set[Path] = set()
    pending = [js_dir / entry]
    while pending:
        path = pending.pop().resolve()
        if path in seen or not path.exists():
            continue
        seen.add(path)
        text = path.read_text(encoding="utf-8")
        for spec in re.findall(r'(?:from|import)\s*"(\.{1,2}/[^"]+)"', text):
            pending.append(path.parent / spec)
    root = js_dir.resolve()
    return sorted(
        f"js/{p.relative_to(root).as_posix()}" for p in seen if p != (js_dir / entry).resolve()
    )


def render_page(
    template: str,
    site: SiteSettings,
    lang: str,
    strings: dict[str, dict[str, Any]],
    levels: tuple[int, ...] = DEFAULT_LEVELS,
    modules: list[str] | None = None,
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
        "boot": boot_script(site, lang),
        "modulepreload": "\n  ".join(
            f'<link rel="modulepreload" href="{html.escape(m)}">' for m in modules or []
        ),
        "donate": donate_box(site, texts),
        "levels": " → ".join(str(k) for k in levels),
        "first_level": str(levels[0]),
        "attempts": str(len(levels)),
        "legal_href": f"{path}legal/",
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


LEGAL_LABELS = {
    "en": {"owner": "Owner", "nif": "Tax ID", "address": "Address", "email": "Contact"},
    "es": {"owner": "Titular", "nif": "NIF", "address": "Domicilio", "email": "Contacto"},
}


def render_legal(
    template: str, site: SiteSettings, lang: str, strings: dict[str, dict[str, Any]]
) -> str:
    """Página de aviso legal y privacidad de un idioma (``site/legal.html``).

    Los datos que falten en ``[site.legal]`` salen como «—»: hay que rellenarlos
    antes de publicar (``build_site`` avisa).
    """
    texts = strings[lang]
    legal = site.legal
    path = f"{site.path(lang)}legal/"
    labels = LEGAL_LABELS.get(lang, LEGAL_LABELS["en"])
    email = html.escape(legal.email)
    contact = f'<a href="mailto:{email}">{email}</a>' if legal.email else "—"
    identity = "".join(
        f"<li><strong>{labels[key]}:</strong> {value}</li>"
        for key, value in (
            ("owner", html.escape(legal.owner) or "—"),
            ("nif", html.escape(legal.nif)),
            ("address", html.escape(legal.address)),
            ("email", contact),
        )
        if value
    )
    year = legal.updated[:4] if legal.updated[:4].isdigit() else str(datetime.date.today().year)
    values = {
        # Primero los párrafos que a su vez llevan marcadores.
        "ads": texts["ads_on" if legal.ads else "ads_off"],
        "analytics": texts["analytics_on" if site.goatcounter else "analytics_off"],
        "donations": texts.get("donations_on", "") if site.donate_url else "",
        "lang": lang,
        "base": f'<base href="{"../" * path.count("/")}">',
        "home": site.path(lang) or "./",
        "name": html.escape(site.name),
        "owner": html.escape(legal.owner) or "—",
        "contact": contact,
        "identity": identity,
        "year": year,
        "updated": html.escape(legal.updated) or "—",
    }
    out = template
    for key, value in texts.items():
        out = out.replace("{{t." + key + "}}", value)
    for key, value in values.items():
        out = out.replace("{{" + key + "}}", value)
    if "{{" in out:
        raise ValueError(f"Marcadores sin rellenar en legal: {out[out.index('{{') :][:40]}")
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
    modules = module_graph(web_dir / "js")
    for lang in site.languages:
        dest = web_dir / site.path(lang) / "index.html"
        dest.parent.mkdir(parents=True, exist_ok=True)
        page = render_page(template, site, lang, strings, levels, modules)
        dest.write_text(page, encoding="utf-8")
        written.append(dest)
    legal_template = template_path.parent / "legal.html"
    if legal_template.exists():
        legal_strings = load_strings(template_path.parent / "legal.json")
        legal_html = legal_template.read_text(encoding="utf-8")
        for lang in site.languages:
            dest = web_dir / site.path(lang) / "legal" / "index.html"
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(render_legal(legal_html, site, lang, legal_strings), encoding="utf-8")
            written.append(dest)
        if site.legal.missing():
            logger.warning(
                "Aviso legal incompleto: rellena %s en [site.legal] de config.toml.",
                ", ".join(site.legal.missing()),
            )
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
