"""Genera todos los datos del juego en ``web/data/``.

Uso::

    python -m pipeline.build                         # todas las colecciones
    python -m pipeline.build --collection countries  # solo una

Salida (por colección)::

    web/data/collections.json               # índice de modos de juego
    web/data/<colección>/puzzles/<id>.json  # un archivo por puzzle (ver puzzle.py)
    web/data/<colección>/answers.json       # autocompletado (ver answers.py)
    web/data/<colección>/schedule.json      # calendario (ver schedule.py)
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from pipeline.answers import answers_to_dict, build_answers
from pipeline.cli import build_parser, setup_logging
from pipeline.config import Collection, Settings, load_collection, load_settings
from pipeline.puzzle import Puzzle, build_puzzle, puzzle_to_dict
from pipeline.schedule import build_schedule, frozen_days
from pipeline.site import SiteSettings, build_site
from pipeline.sources import ShapeProvider, create_provider

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class BuildResult:
    """Resumen de lo generado para una colección."""

    collection: str
    puzzles: tuple[Puzzle, ...]
    n_answers: int
    n_days: int
    out_dir: Path


def write_json(path: Path, data: Any, compact: bool = False) -> None:
    """Escribe ``data`` como JSON UTF-8 (compacto o con sangría)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    else:
        text = json.dumps(data, ensure_ascii=False, indent=2)
    path.write_text(text + "\n", encoding="utf-8")


def check_distinct_drawings(puzzles: list[Puzzle]) -> None:
    """Falla si dos puzzles de la misma colección tienen el mismo dibujo y colores.

    Lo que ve el jugador es el dibujo y, si los hay, los colores (banderas). Si dos
    respuestas coinciden en ambos no se pueden distinguir jugando, así que es un
    error de la colección. Francia e Italia comparten dibujo, pero no colores.

    Raises:
        ValueError: Con la lista de respuestas que comparten dibujo.
    """
    groups: dict[tuple, list[str]] = {}
    for puzzle in puzzles:
        groups.setdefault((puzzle.terms, puzzle.colors), []).append(puzzle.answer)
    repeated = [sorted(answers) for answers in groups.values() if len(answers) > 1]
    if repeated:
        detail = "; ".join(", ".join(group) for group in sorted(repeated))
        raise ValueError(f"Puzzles con el mismo dibujo y colores (indistinguibles): {detail}")


def collection_hints(collection: Collection, settings: Settings) -> dict[str, dict[str, Any]]:
    """Pistas de cada respuesta de la colección (bloque ``hints``), solo las de sus tipos.

    El bloque es ``{"file": "data/pokemon_hints.json", "kinds": ["type", ...]}``.
    """
    spec = collection.extra.get("hints")
    if not isinstance(spec, dict):
        return {}
    data = json.loads((settings.root / spec["file"]).read_text(encoding="utf-8"))["pokemon"]
    kinds = spec.get("kinds", [])
    return {pid: {k: h[k] for k in kinds if k in h} for pid, h in data.items()}


def build_collection(
    collection: Collection, provider: ShapeProvider, settings: Settings, out_dir: Path
) -> BuildResult:
    """Genera puzzles, respuestas y calendario de una colección.

    Borra los puzzles antiguos de ``out_dir/puzzles`` para no dejar archivos
    huérfanos (por ejemplo, de un elemento que se ha quitado de la colección).

    Args:
        collection: Colección a generar.
        provider: Proveedor de formas de la colección.
        settings: Configuración global (niveles, puntos, calendario...).
        out_dir: Carpeta de salida de esta colección.

    Returns:
        Resumen de lo generado.
    """
    names = getattr(provider, "names", None)
    answers = build_answers(collection, names() if callable(names) else None)

    puzzles = []
    for item in collection.items:
        puzzle = build_puzzle(
            provider.get_shape(item.id),
            collection.id,
            settings.levels,
            settings.n_points,
            salt=settings.id_salt,
            decimals=settings.decimals,
        )
        if puzzle.errors[-1] > settings.max_final_error:
            logger.warning(
                "%s: con %d círculos el error sigue siendo %.1f%%; puede no reconocerse.",
                item.id,
                settings.levels[-1],
                100 * puzzle.errors[-1],
            )
        puzzles.append(puzzle)

    ids = [p.id for p in puzzles]
    if len(set(ids)) != len(ids):
        raise ValueError("Colisión de identificadores de puzzle; usa una sal distinta.")
    check_distinct_drawings(puzzles)

    puzzles_dir = out_dir / "puzzles"
    if puzzles_dir.exists():
        for old in puzzles_dir.glob("*.json"):
            old.unlink()
    hints = collection_hints(collection, settings)
    for puzzle in puzzles:
        data = puzzle_to_dict(puzzle)
        if puzzle.answer in hints:
            data["hints"] = hints[puzzle.answer]
        write_json(puzzles_dir / f"{puzzle.id}.json", data, compact=True)

    write_json(out_dir / "answers.json", answers_to_dict(collection.id, answers))

    sched = settings.schedule
    # Los días ya jugados (hasta hoy) se conservan del calendario anterior.
    schedule_path = out_dir / "schedule.json"
    previous = (
        json.loads(schedule_path.read_text(encoding="utf-8")) if schedule_path.exists() else None
    )
    today = datetime.now(ZoneInfo(sched.timezone)).date()
    schedule = build_schedule(
        collection.id,
        ids,
        sched.start_date,
        sched.n_days,
        sched.seed,
        sched.timezone,
        min_gap=sched.min_gap,
        frozen=frozen_days(previous, sched.start_date, today, ids),
    )
    write_json(out_dir / "schedule.json", schedule)

    return BuildResult(
        collection=collection.id,
        puzzles=tuple(puzzles),
        n_answers=len(answers),
        n_days=len(schedule["days"]),
        out_dir=out_dir,
    )


def collection_index_entry(collection: Collection) -> dict[str, Any]:
    """Entrada de la colección en ``collections.json``.

    El bloque opcional ``ui`` de la colección (textos de la interfaz, como el
    placeholder del buscador) pasa tal cual al frontend.
    """
    entry: dict[str, Any] = {
        "id": collection.id,
        "title": collection.title,
        "emoji": collection.emoji,
    }
    # ``menu``: lo que enseña la tarjeta del modo en el menú (generación, región...).
    for key in ("ui", "menu"):
        if isinstance(collection.extra.get(key), dict):
            entry[key] = collection.extra[key]
    # Textos en otros idiomas: {"en": {"title": ..., "ui": {...}, "menu": {...}}}.
    if isinstance(collection.extra.get("i18n"), dict):
        entry["i18n"] = {
            lang: {k: v for k, v in block.items() if k in ("title", "ui", "menu")}
            for lang, block in collection.extra["i18n"].items()
        }
    return entry


def main(argv: list[str] | None = None) -> None:
    """Punto de entrada del comando."""
    parser = build_parser("Genera los datos del juego en web/data/.")
    parser.add_argument(
        "--collection",
        action="append",
        help="Id de una colección a generar (se puede repetir). Por defecto, todas.",
    )
    args = parser.parse_args(argv)
    setup_logging(args.verbose)

    settings = load_settings(args.config)
    ids = args.collection or sorted(p.stem for p in settings.collections_dir.glob("*.json"))

    built = []
    for collection_id in ids:
        collection = load_collection(settings.collection_path(collection_id))
        provider = create_provider(collection.provider, settings)
        result = build_collection(
            collection, provider, settings, settings.web_data_dir / collection.id
        )
        errors = [p.errors for p in result.puzzles]
        logger.info(
            "%s: %d puzzles, %d respuestas, %d días -> %s",
            collection.id,
            len(result.puzzles),
            result.n_answers,
            result.n_days,
            result.out_dir,
        )
        for i, k in enumerate(settings.levels):
            mean = sum(e[i] for e in errors) / len(errors)
            logger.info("  %2d círculos: error medio %.1f%%", k, 100 * mean)
        built.append(collection)

    # El índice siempre recoge todas las colecciones existentes, se generen o no ahora.
    # En el orden del campo ``order`` de cada colección: el primero es el modo por defecto.
    all_collections = sorted(
        (load_collection(p) for p in sorted(settings.collections_dir.glob("*.json"))),
        key=lambda c: c.extra.get("order", 0),
    )
    write_json(
        settings.web_data_dir / "collections.json",
        {
            "version": 1,
            # Para saber qué día es en el menú sin descargar ningún calendario.
            "timezone": settings.schedule.timezone,
            "collections": [collection_index_entry(c) for c in all_collections],
        },
    )
    if settings.site.get("template"):
        written = build_site(
            settings.root / settings.site["template"],
            settings.web_data_dir.parent,
            SiteSettings.from_config(settings.site),
            settings.levels,
        )
        logger.info("Páginas: %s", ", ".join(str(p.relative_to(settings.root)) for p in written))
    logger.info("Listo: %d colección(es) generada(s).", len(built))


if __name__ == "__main__":
    main()
