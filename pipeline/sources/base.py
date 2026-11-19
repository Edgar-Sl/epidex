"""Interfaz común de los proveedores de formas.

Un *proveedor de formas* sabe convertir su fuente de datos (un GeoJSON, una carpeta
de imágenes...) en contornos 2D cerrados y ordenados. No normaliza nada ni sabe
nada del juego: de eso se encargan ``contour.py`` y ``puzzle.py``.

Para añadir un nuevo tipo de colección basta con escribir una clase que cumpla
:class:`ShapeProvider` y registrarla en ``pipeline/sources/__init__.py``.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

import numpy as np


@dataclass(frozen=True)
class Shape:
    """Contorno cerrado y ordenado de un elemento.

    Attributes:
        id: Identificador estable dentro de la colección (p. ej. ``"ITA"``).
        points: Array ``(N, 2)`` de floats con los vértices en orden, en el sistema
            de coordenadas del proveedor y con el eje *y* hacia arriba. El primer
            punto **no** se repite al final.
        source: Origen de los datos, útil para atribuciones (p. ej.
            ``"natural-earth-110m"``).
        meta: Información extra opcional (nombre, área, nº de partes descartadas...).
    """

    id: str
    points: np.ndarray
    source: str
    meta: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        """Valida que ``points`` tenga forma ``(N, 2)`` con al menos 3 puntos."""
        pts = np.asarray(self.points, dtype=float)
        if pts.ndim != 2 or pts.shape[1] != 2:
            raise ValueError(f"{self.id}: points debe tener forma (N, 2), no {pts.shape}")
        if len(pts) < 3:
            raise ValueError(f"{self.id}: un contorno necesita al menos 3 puntos")
        # dataclass congelada: hay que usar object.__setattr__ para normalizar el tipo.
        object.__setattr__(self, "points", pts)


@runtime_checkable
class ShapeProvider(Protocol):
    """Cualquier objeto capaz de devolver contornos por identificador.

    Es un ``Protocol`` (tipado estructural): no hace falta heredar de nada, basta
    con implementar estos dos métodos. Así los tests pueden usar proveedores
    falsos mínimos.
    """

    def available_ids(self) -> list[str]:
        """Devuelve todos los identificadores que este proveedor sabe dibujar."""
        ...

    def get_shape(self, item_id: str) -> Shape:
        """Devuelve el contorno de ``item_id``.

        Raises:
            KeyError: Si el proveedor no conoce ``item_id``.
        """
        ...
