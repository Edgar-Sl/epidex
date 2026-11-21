"""Descarga las imágenes de origen definidas en ``[images]`` de ``config.toml``.

Uso::

    python -m pipeline.download            # descarga las que falten
    python -m pipeline.download --force    # vuelve a descargarlas todas

Se guardan como ``<dir>/<nnn>.png`` (``001.png`` ... ``151.png``), que es el id
de cada elemento en la colección.
"""

from __future__ import annotations

import logging
import time
import tomllib
import urllib.request
from pathlib import Path

from pipeline.cli import build_parser, setup_logging

logger = logging.getLogger(__name__)

TIMEOUT_S = 60
USER_AGENT = "epidex-pipeline/0.1"
PAUSE_S = 0.05  # entre descargas, por cortesía con el servidor


def download_file(url: str, dest: Path, timeout: float = TIMEOUT_S) -> int:
    """Descarga ``url`` en ``dest`` de forma atómica (archivo temporal + renombrado).

    Returns:
        Número de bytes descargados.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        data = response.read()
    tmp.write_bytes(data)
    tmp.replace(dest)
    return len(data)


def item_id(n: int) -> str:
    """Id de elemento a partir del número de la Pokédex: 1 -> "001"."""
    return f"{n:03d}"


def main(argv: list[str] | None = None) -> None:
    """Punto de entrada del comando."""
    parser = build_parser("Descarga las imágenes de origen.")
    parser.add_argument("--force", action="store_true", help="Descarga aunque ya existan.")
    args = parser.parse_args(argv)
    setup_logging(args.verbose)

    config_path = Path(args.config)
    cfg = tomllib.loads(config_path.read_text(encoding="utf-8"))["images"]
    out_dir = config_path.parent / cfg["dir"]
    total = 0
    for n in range(cfg["first"], cfg["last"] + 1):
        dest = out_dir / f"{item_id(n)}.png"
        if dest.exists() and not args.force:
            continue
        total += download_file(cfg["url_template"].format(n=n), dest)
        time.sleep(PAUSE_S)
    logger.info("Imágenes en %s (%.1f MB descargados).", out_dir, total / 1e6)


if __name__ == "__main__":
    main()
