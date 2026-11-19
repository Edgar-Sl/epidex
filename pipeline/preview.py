"""Vista previa en HTML de las siluetas de una colección (herramienta de depuración).

Sirve para decidir qué elementos son reconocibles antes de convertirlos en
puzzles. Genera un HTML estático con un SVG por elemento.

Uso::

    python -m pipeline.preview --collection countries
    python -m pipeline.preview --collection countries --all     # todos los del proveedor
    python -m pipeline.preview --collection countries --levels  # reconstrucción por nivel
"""

from __future__ import annotations

import html
import logging
from collections.abc import Iterable
from pathlib import Path

import numpy as np

from pipeline.cli import build_parser, setup_logging
from pipeline.config import Settings, load_collection, load_settings
from pipeline.contour import normalize_contour
from pipeline.fourier import dft, reconstruct, relative_error, to_complex, to_points
from pipeline.sources import Shape, create_provider

logger = logging.getLogger(__name__)

SVG_SIZE = 160
MARGIN = 8
RECONSTRUCTION_SAMPLES = 512


def shape_to_svg_path(
    points: np.ndarray,
    size: int = SVG_SIZE,
    margin: int = MARGIN,
    extent: float | None = None,
) -> str:
    """Convierte un contorno en el atributo ``d`` de un ``<path>`` SVG.

    Escala el contorno para que quepa en un cuadrado de ``size`` píxeles
    manteniendo la proporción, e invierte el eje *y* (en SVG crece hacia abajo).

    Args:
        points: Array ``(N, 2)``.
        size: Lado del lienzo en píxeles.
        margin: Margen interior en píxeles.
        extent: Si se indica, el lienzo representa siempre ``[-extent, extent]²``
            en vez de ajustarse a la figura (útil para comparar niveles).

    Returns:
        Cadena del tipo ``"M x,y L x,y ... Z"``.
    """
    if extent is not None:
        points = np.vstack([points, [[-extent, -extent], [extent, extent]]])
        mins, maxs = points.min(axis=0), points.max(axis=0)
        points = points[:-2]
    else:
        mins, maxs = points.min(axis=0), points.max(axis=0)
    span = float((maxs - mins).max()) or 1.0
    scale = (size - 2 * margin) / span
    offset = (size - (maxs - mins) * scale) / 2
    xy = (points - mins) * scale + offset
    xy[:, 1] = size - xy[:, 1]
    coords = " L ".join(f"{x:.1f},{y:.1f}" for x, y in xy)
    return f"M {coords} Z"


def render_card(shape: Shape, label: str) -> str:
    """HTML de una tarjeta con la silueta y sus datos."""
    meta = shape.meta
    path = shape_to_svg_path(shape.points)
    info = (
        f"{shape.id} · {len(shape.points)} pts · {meta.get('parts', '?')} partes · "
        f"{100 * meta.get('area_fraction', 1):.0f}% área"
    )
    return (
        "<figure>"
        f'<svg viewBox="0 0 {SVG_SIZE} {SVG_SIZE}"><path d="{path}"/></svg>'
        f"<figcaption><strong>{html.escape(label)}</strong><br><small>{html.escape(info)}</small>"
        "</figcaption></figure>"
    )


def render_levels_row(shape: Shape, label: str, settings: Settings) -> str:
    """HTML de una fila con la reconstrucción de ``shape`` en cada nivel del juego."""
    z = to_complex(normalize_contour(shape.points, settings.n_points))
    series = dft(z)
    cells = []
    for k in settings.levels:
        approx = to_points(reconstruct(series, k, RECONSTRUCTION_SAMPLES))
        err = relative_error(z, series, k)
        cells.append((f"{k} círculos · {100 * err:.1f}%", approx))
    cells.append(("original", to_points(z)))
    svgs = "".join(
        f'<div><svg viewBox="0 0 {SVG_SIZE} {SVG_SIZE}">'
        f'<path d="{shape_to_svg_path(pts, extent=1.0)}"/></svg>'
        f"<small>{html.escape(caption)}</small></div>"
        for caption, pts in cells
    )
    return (
        f'<figure class="row"><figcaption><strong>{html.escape(label)}</strong></figcaption>'
        f'<div class="levels">{svgs}</div></figure>'
    )


def render_page(title: str, cards: Iterable[str]) -> str:
    """Página HTML completa con la cuadrícula de tarjetas."""
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>{html.escape(title)}</title>
<style>
  body {{ font-family: system-ui, sans-serif; margin: 16px; background: #fafafa; color: #222; }}
  main {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }}
  figure {{ margin: 0; padding: 8px; background: #fff; border-radius: 8px; text-align: center;
           box-shadow: 0 1px 3px #0002; }}
  svg {{ width: 100%; height: auto; }}
  path {{ fill: #4a6fa5; stroke: #1d3557; stroke-width: 1; }}
  small {{ color: #666; }}
  .row {{ grid-column: 1 / -1; text-align: left; }}
  .levels {{ display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; text-align: center; }}
</style></head>
<body><h1>{html.escape(title)}</h1><main>{"".join(cards)}</main></body></html>
"""


def main(argv: list[str] | None = None) -> None:
    """Punto de entrada del comando."""
    parser = build_parser("Genera una vista previa HTML de las siluetas de una colección.")
    parser.add_argument(
        "--collection", required=True, help="Id de la colección (p. ej. countries)."
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Muestra todos los elementos del proveedor, no solo los jugables.",
    )
    parser.add_argument(
        "--levels",
        action="store_true",
        help="Muestra la reconstrucción de Fourier de cada elemento en cada nivel.",
    )
    parser.add_argument("--out", type=Path, help="Archivo HTML de salida.")
    args = parser.parse_args(argv)
    setup_logging(args.verbose)

    settings = load_settings(args.config)
    collection = load_collection(settings.collection_path(args.collection))
    provider = create_provider(collection.provider, settings)

    if args.all:
        names = getattr(provider, "names", dict)()
        entries = [(i, names.get(i, i)) for i in provider.available_ids()]
    else:
        entries = [(it.id, it.name) for it in collection.items]

    if args.levels:
        cards = [render_levels_row(provider.get_shape(i), label, settings) for i, label in entries]
    else:
        cards = [render_card(provider.get_shape(i), label) for i, label in entries]
    suffix = ("_all" if args.all else "") + ("_levels" if args.levels else "")
    out = args.out or settings.preview_dir / f"{collection.id}{suffix}.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render_page(f"{collection.emoji} {collection.title}", cards), encoding="utf-8")
    logger.info("Vista previa de %d elementos en %s", len(cards), out)


if __name__ == "__main__":
    main()
