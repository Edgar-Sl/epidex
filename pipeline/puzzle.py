"""Construcción de puzzles: de un :class:`Shape` a los datos que dibuja el navegador.

Formato JSON de un puzzle (versión 1)::

    {
      "version": 1,
      "id": "3f9c1a7b2e",            # opaco: no revela la respuesta
      "collection": "countries",
      "answer": "ITA",               # id de la respuesta; el nombre está en answers.json
      "levels": [2, 4, 8, 16, 32, 64],
      "errors": [0.215, 0.133, ...], # error relativo L2 en cada nivel
      "terms": [[0, 0.0, 0.0],       # [frecuencia, real, imaginaria]; el primero es
                [-1, 0.61, -0.12],   # el de frecuencia 0 y el resto van por magnitud
                ...],                # decreciente: con K círculos se usan terms[:K+1]
      "source": "natural_earth_110m"
    }

La figura está normalizada: centrada en el origen, dentro del círculo unidad, eje
*y* hacia arriba y recorrida en sentido horario.
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from pipeline.contour import normalize_contour
from pipeline.fourier import dft, relative_error, to_complex
from pipeline.sources.base import Shape

FORMAT_VERSION = 1


@dataclass(frozen=True)
class Puzzle:
    """Un puzzle listo para serializar."""

    id: str
    collection: str
    answer: str
    levels: tuple[int, ...]
    errors: tuple[float, ...]
    terms: tuple[tuple[int, float, float], ...]
    source: str
    colors: tuple[str, ...] = ()


def puzzle_id(collection_id: str, item_id: str, salt: str = "", length: int = 10) -> str:
    """Identificador opaco y estable de un puzzle.

    Es un hash, así el nombre del archivo (visible en la pestaña de red del
    navegador) no delata la respuesta.

    Args:
        collection_id: Id de la colección.
        item_id: Id del elemento.
        salt: Texto secreto opcional; cambiarlo cambia todos los ids.
        length: Número de caracteres hexadecimales.
    """
    digest = hashlib.sha256(f"{salt}|{collection_id}|{item_id}".encode()).hexdigest()
    return digest[:length]


def build_puzzle(
    shape: Shape,
    collection_id: str,
    levels: Sequence[int],
    n_points: int,
    salt: str = "",
    decimals: int = 5,
) -> Puzzle:
    """Convierte una forma en un puzzle.

    Args:
        shape: Contorno tal como lo devuelve el proveedor.
        collection_id: Id de la colección a la que pertenece.
        levels: Círculos visibles en cada intento (creciente).
        n_points: Puntos del remuestreo antes de la DFT.
        salt: Sal para :func:`puzzle_id`.
        decimals: Decimales con los que se redondean los coeficientes.

    Returns:
        El puzzle, con los términos truncados a ``max(levels)`` círculos.
    """
    z = to_complex(normalize_contour(shape.points, n_points))
    series = dft(z)
    max_circles = max(levels)
    kept = series.truncate(max_circles)
    terms = tuple(
        (int(k), round(float(c.real), decimals), round(float(c.imag), decimals))
        for k, c in zip(kept.freqs, kept.coeffs, strict=True)
    )
    errors = tuple(round(relative_error(z, series, k), 4) for k in levels)
    return Puzzle(
        id=puzzle_id(collection_id, shape.id, salt),
        collection=collection_id,
        answer=shape.id,
        levels=tuple(levels),
        errors=errors,
        terms=terms,
        source=shape.source,
        colors=tuple(str(color) for color in shape.meta.get("colors", ())),
    )


def puzzle_to_dict(puzzle: Puzzle) -> dict[str, Any]:
    """Representación JSON del puzzle (ver el formato en la cabecera del módulo)."""
    return {
        "version": FORMAT_VERSION,
        "id": puzzle.id,
        "collection": puzzle.collection,
        "answer": puzzle.answer,
        "levels": list(puzzle.levels),
        "errors": list(puzzle.errors),
        "terms": [list(t) for t in puzzle.terms],
        "source": puzzle.source,
        "colors": list(puzzle.colors),
    }
