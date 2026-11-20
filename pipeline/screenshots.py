"""Capturas del juego para el README (``docs/img/``), con Chrome sin interfaz.

Uso::

    python -m pipeline.screenshots     # después de build y art

Usa ``web/dev/capture.html``, que carga el juego, juega las jugadas indicadas y,
con ``ancho``/``alto``, lo enmarca como un móvil. Las capturas de móvil salen a
doble resolución para que se vean nítidas en GitHub. También guarda una tira con
una silueta en cada nivel de círculos (``fourier-niveles.png``).
"""

from __future__ import annotations

import functools
import logging
import os
import shutil
import subprocess
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode

from pipeline.cli import build_parser, setup_logging
from pipeline.config import load_settings

logger = logging.getLogger(__name__)

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "google-chrome",
    "chromium",
]

PHONE = {"ancho": 390, "alto": 900}
PHONE_WINDOW = (480, 990)  # el marco y un margen alrededor
DESKTOP_WINDOW = (1440, 900)

# nombre -> (parámetros de capture.html, ¿móvil?)
SHOTS: dict[str, tuple[dict[str, str], bool]] = {
    "movil-inicio": ({"fecha": "2026-11-26"}, True),
    "movil-pistas": ({"fecha": "2026-11-26", "jugadas": "fallo,fallo"}, True),
    "movil-resultado": ({"fecha": "2026-11-26", "jugadas": "fallo,fallo,salto,acierto"}, True),
    "movil-ayuda": ({"fecha": "2026-11-26", "ayuda": "1"}, True),
    "movil-estadisticas": ({"fecha": "2026-11-26", "jugadas": "fallo,acierto", "stats": "1"}, True),
    "escritorio": ({"fecha": "2026-11-28", "jugadas": "fallo"}, False),
    "escritorio-resultado": ({"fecha": "2026-11-28", "jugadas": "fallo,salto,acierto"}, False),
}


class QuietHandler(SimpleHTTPRequestHandler):
    """Servidor de archivos sin log por petición."""

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        """No escribe nada."""


def find_chrome() -> str:
    """Ruta de Chrome/Chromium/Edge (o la variable de entorno ``CHROME``)."""
    for candidate in [os.environ.get("CHROME", ""), *CHROME_CANDIDATES]:
        if candidate and (Path(candidate).exists() or shutil.which(candidate)):
            return candidate
    raise FileNotFoundError("No se encuentra Chrome. Indica su ruta en la variable CHROME.")


def screenshot(chrome: str, url: str, dest: Path, width: int, height: int, scale: int = 1) -> None:
    """Captura ``url`` a ``width``x``height`` en ``dest`` (PNG)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as profile:
        subprocess.run(
            [
                chrome,
                "--headless=new",
                "--disable-gpu",
                "--hide-scrollbars",
                f"--force-device-scale-factor={scale}",
                f"--user-data-dir={profile}",
                f"--window-size={width},{height}",
                "--virtual-time-budget=8000",
                f"--screenshot={dest}",
                url,
            ],
            check=True,
            capture_output=True,
            timeout=120,
        )


def main(argv: list[str] | None = None) -> None:
    """Punto de entrada del comando."""
    parser = build_parser("Genera las capturas del README en docs/img/.")
    args = parser.parse_args(argv)
    setup_logging(args.verbose)
    settings = load_settings(args.config)
    web = settings.web_data_dir.parent
    out = settings.root / "docs" / "img"
    chrome = find_chrome()

    handler = functools.partial(QuietHandler, directory=str(web))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}/dev/capture.html"
    try:
        for name, (params, phone) in SHOTS.items():
            query = urlencode({**params, **(PHONE if phone else {})})
            width, height = PHONE_WINDOW if phone else DESKTOP_WINDOW
            dest = out / f"{name}.png"
            screenshot(chrome, f"{base}?{query}", dest, width, height, scale=2 if phone else 1)
            logger.info("Captura: %s", dest.relative_to(settings.root))
    finally:
        server.shutdown()

    levels = settings.preview_dir / "pokemon_levels.html"
    if levels.exists():
        dest = out / "fourier-niveles.png"
        screenshot(chrome, levels.resolve().as_uri(), dest, 1100, 300)
        logger.info("Niveles: %s", dest.relative_to(settings.root))
    else:
        logger.warning("Sin %s: ejecuta pipeline.preview --levels antes.", levels.name)


if __name__ == "__main__":
    main()
