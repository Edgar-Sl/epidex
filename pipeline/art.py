"""Exporta el arte de cada puzzle para la revelación final ("¡Es Pikachu!").

Uso::

    python -m pipeline.art        # después de python -m pipeline.build

Escribe ``web/data/<colección>/art/<id del puzzle>.webp``. El nombre es el id
opaco del puzzle (un hash), así que mirar las peticiones de red no desvela la
respuesta antes de tiempo: el navegador solo pide la imagen al acabar.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from pipeline.cli import build_parser, setup_logging
from pipeline.config import load_collection, load_settings

logger = logging.getLogger(__name__)

SIZE = 320
QUALITY = 82


def export_art(image: Path, dest: Path, size: int = SIZE) -> int:
    """Reduce una imagen a ``size`` px de lado como máximo y la guarda en WebP."""
    from PIL import Image

    with Image.open(image) as im:
        im = im.convert("RGBA")
        im.thumbnail((size, size), Image.Resampling.LANCZOS)
        dest.parent.mkdir(parents=True, exist_ok=True)
        im.save(dest, "WEBP", quality=QUALITY, method=6)
    size = dest.stat().st_size
    if size == 0:  # ya pasó con una exportación cortada: mejor fallar que publicar vacío
        raise OSError(f"Arte vacío tras exportar {image} -> {dest}")
    return size


def main(argv: list[str] | None = None) -> None:
    """Punto de entrada del comando."""
    parser = build_parser("Exporta el arte de revelación de cada puzzle.")
    args = parser.parse_args(argv)
    setup_logging(args.verbose)
    settings = load_settings(args.config)

    for path in sorted(settings.collections_dir.glob("*.json")):
        collection = load_collection(path)
        image_dir = collection.provider.get("image_dir")
        if collection.provider.get("type") != "image" or not image_dir:
            continue
        out = settings.web_data_dir / collection.id
        art_dir = out / "art"
        for old in art_dir.glob("*.webp"):
            old.unlink()
        total = 0
        for puzzle_file in sorted((out / "puzzles").glob("*.json")):
            puzzle = json.loads(puzzle_file.read_text(encoding="utf-8"))
            source = settings.root / image_dir / f"{puzzle['answer']}.png"
            total += export_art(source, art_dir / f"{puzzle['id']}.webp")
        logger.info("%s: arte exportado a %s (%.1f MB).", collection.id, art_dir, total / 1e6)


if __name__ == "__main__":
    main()
