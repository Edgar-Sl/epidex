"""Tests del generador de páginas (idiomas, hreflang, robots, sitemap)."""

import json

from pipeline.site import SiteSettings, build_site, render_page, robots_txt, sitemap_xml

TEMPLATE = (
    '<html lang="{{lang}}">{{base}}<title>{{title}}</title>{{canonical}}{{alternates}}'
    "<meta content='{{og_image}}'>{{lang_switch}}<p>{{t.hi}} {{levels}}</p>"
    "<script>{{json_ld}}</script>"
)
STRINGS = {
    "en": {"title": "{name} · EN", "description": "d", "hi": "Hi", "locale": "en_US"},
    "es": {"title": "{name} · ES", "description": "d", "hi": "Hola", "locale": "es_ES"},
}


def test_pagina_por_idioma():
    site = SiteSettings(name="Juego", languages=("en", "es"))
    en = render_page(TEMPLATE, site, "en", STRINGS)
    es = render_page(TEMPLATE, site, "es", STRINGS)
    assert '<html lang="en">' in en and "<base" not in en and "<title>Juego · EN</title>" in en
    assert '<base href="../">' in es and "<p>Hola 2 → 4 → 8 → 16 → 32 → 64</p>" in es
    assert 'href="./" hreflang="en"' in es and 'href="es/" hreflang="es"' in en
    assert "og/es/epidex.png" in es and "og/epidex.png" in en
    assert "canonical" not in en  # sin dominio
    assert json.loads(es.split("<script>")[1].split("</script>")[0])["inLanguage"] == "es"


def test_con_dominio_hay_canonica_hreflang_y_sitemap(tmp_path):
    site = SiteSettings(name="Juego", url="https://x.test/", languages=("en", "es"))
    es = render_page(TEMPLATE, site, "es", STRINGS)
    assert '<link rel="canonical" href="https://x.test/es/">' in es
    assert 'hreflang="en" href="https://x.test/"' in es
    assert 'hreflang="x-default" href="https://x.test/"' in es
    assert sitemap_xml(site).count("<url>") == 2
    assert "Sitemap: https://x.test/sitemap.xml" in robots_txt(site)
    template = tmp_path / "page.html"
    template.write_text(TEMPLATE, encoding="utf-8")
    (tmp_path / "strings.json").write_text(json.dumps(STRINGS), encoding="utf-8")
    build_site(template, tmp_path / "web", site)
    for path in ("index.html", "es/index.html", "robots.txt", "sitemap.xml"):
        assert (tmp_path / "web" / path).exists()


def test_aviso_legal_con_datos_y_anuncios():
    from pipeline.site import LegalSettings, render_legal

    template = "{{base}}<a href='{{home}}'>{{t.back}}</a><ul>{{identity}}</ul>{{t.body}}"
    strings = {
        "es": {
            "back": "Volver",
            "body": "<p>{{ads}} {{analytics}} © {{year}} {{owner}} {{contact}}</p>",
            "ads_on": "Con anuncios.",
            "ads_off": "Sin anuncios.",
            "analytics_on": "Con analítica.",
            "analytics_off": "Sin analítica.",
        }
    }
    legal = LegalSettings(owner="Ana <A>", email="a@x.test", ads=True, updated="2027-01-02")
    site = SiteSettings(languages=("en", "es"), legal=legal)
    es = render_legal(template, site, "es", strings)
    assert '<base href="../../">' in es and "href='es/'" in es
    assert "Con anuncios. Sin analítica. © 2027 Ana &lt;A&gt;" in es
    assert '<a href="mailto:a@x.test">a@x.test</a>' in es and "NIF" not in es
    assert LegalSettings().missing() == ["owner", "email"] and legal.missing() == []
