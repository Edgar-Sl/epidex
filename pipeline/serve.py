"""Servidor local para probar el juego (``web/``) sin caché.

Uso::

    python -m pipeline.serve            # http://localhost:8005/
    python -m pipeline.serve --port 8006

``python -m http.server`` no manda cabeceras de caché y el navegador guarda los
módulos JS por su cuenta durante horas: tras un cambio puede mezclar archivos
nuevos con viejos y el juego no arranca. Este servidor pide no guardar nada.
"""

from __future__ import annotations

import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

WEB_DIR = Path(__file__).resolve().parent.parent / "web"


class NoCacheHandler(SimpleHTTPRequestHandler):
    """Sirve archivos con ``Cache-Control: no-store``."""

    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript"}

    def end_headers(self) -> None:
        """Añade las cabeceras que evitan la caché del navegador."""
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main(argv: list[str] | None = None) -> None:
    """Punto de entrada del comando."""
    parser = argparse.ArgumentParser(description="Sirve web/ en local, sin caché.")
    parser.add_argument("--port", type=int, default=8005)
    parser.add_argument("--bind", default="0.0.0.0", help="Interfaz (0.0.0.0: también el móvil).")
    args = parser.parse_args(argv)
    handler = functools.partial(NoCacheHandler, directory=str(WEB_DIR))
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        print(f"Epidex en http://localhost:{args.port}/ (Ctrl+C para parar)")
        server.serve_forever()


if __name__ == "__main__":
    main()
