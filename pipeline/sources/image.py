"""Proveedor de formas a partir de imágenes: ``<image_dir>/<id>.png`` -> contorno.

Por qué no basta con una convolución (Sobel, Laplaciano...): un filtro de bordes
devuelve *píxeles* de borde sin orden, y la DFT necesita un *camino* ordenado que
recorra el contorno. El procedimiento es:

1. Cargar la imagen y reducirla (el detalle fino no sobrevive a 64 círculos).
2. Máscara figura/fondo: transparencia (``alpha > 127``) o, si la imagen no
   tiene, umbral de Otsu sobre la luminancia.
3. Cierre morfológico (dilatar y erosionar) para unir huecos de 1-2 píxeles.
4. Quedarse con la componente conexa más grande y rellenar sus agujeros.
5. Trazar el borde exterior en orden (algoritmo de vecinos de Moore).
6. Invertir el eje *y* (en imágenes crece hacia abajo; ``Shape`` lo quiere hacia arriba).

Todo con numpy y Pillow, sin dependencias de visión artificial.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np

from pipeline.sources.base import Shape

MAX_SIDE = 256
"""Lado máximo de la imagen reducida, en píxeles."""

# Vecinos de Moore en sentido horario (con y hacia abajo), empezando por el oeste.
_MOORE = [(-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1)]


# --------------------------------------------------------------------------- #
# Máscara
# --------------------------------------------------------------------------- #


def otsu_threshold(gray: np.ndarray) -> float:
    """Umbral de Otsu de una imagen en escala de grises (0-255)."""
    hist = np.bincount(gray.astype(np.uint8).ravel(), minlength=256).astype(float)
    total = hist.sum()
    levels = np.arange(256)
    weight_bg = np.cumsum(hist)
    weight_fg = total - weight_bg
    mean_bg = np.cumsum(hist * levels) / np.maximum(weight_bg, 1)
    mean_fg = ((hist * levels).sum() - np.cumsum(hist * levels)) / np.maximum(weight_fg, 1)
    between = weight_bg * weight_fg * (mean_bg - mean_fg) ** 2
    return float(np.argmax(between))


def load_mask(path: Path, max_side: int = MAX_SIDE) -> np.ndarray:
    """Máscara booleana (True = figura) de una imagen, reducida a ``max_side``."""
    from PIL import Image  # importación diferida: solo hace falta para imágenes

    with Image.open(path) as image:
        image = image.convert("RGBA")
        image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        rgba = np.asarray(image)
    alpha = rgba[..., 3]
    if alpha.min() < 250:  # tiene transparencia útil
        return alpha > 127
    gray = rgba[..., :3].astype(float) @ [0.299, 0.587, 0.114]
    mask = gray < otsu_threshold(gray)
    # Si "figura" ocupa más de la mitad, seguramente era el fondo: invertir.
    return ~mask if mask.mean() > 0.5 else mask


def _shift_any(mask: np.ndarray) -> np.ndarray:
    """Dilatación 3x3: True si algún vecino (o el propio píxel) es True."""
    padded = np.pad(mask, 1)
    out = np.zeros_like(mask)
    for dy in (0, 1, 2):
        for dx in (0, 1, 2):
            out |= padded[dy : dy + mask.shape[0], dx : dx + mask.shape[1]]
    return out


def close_mask(mask: np.ndarray, iterations: int = 1) -> np.ndarray:
    """Cierre morfológico: une huecos y grietas pequeñas sin engordar la figura."""
    out = mask
    for _ in range(iterations):
        out = _shift_any(out)
    for _ in range(iterations):
        out = ~_shift_any(~out)
    return out


def largest_component(mask: np.ndarray) -> np.ndarray:
    """Componente conexa (8-vecindad) más grande de la máscara."""
    labels = np.zeros(mask.shape, dtype=np.int32)
    height, width = mask.shape
    best_label, best_size, current = 0, 0, 0
    for y0, x0 in zip(*np.nonzero(mask), strict=True):
        if labels[y0, x0]:
            continue
        current += 1
        labels[y0, x0] = current
        queue, size = deque([(y0, x0)]), 0
        while queue:
            y, x = queue.popleft()
            size += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = current
                        queue.append((ny, nx))
        if size > best_size:
            best_label, best_size = current, size
    if best_label == 0:
        raise ValueError("La imagen no tiene ninguna figura.")
    return labels == best_label


def fill_holes(mask: np.ndarray) -> np.ndarray:
    """Rellena los agujeros: todo el fondo no conectado con el borde pasa a figura."""
    padded = np.pad(~mask, 1, constant_values=True)
    outside = np.zeros_like(padded)
    outside[0, 0] = True
    queue = deque([(0, 0)])
    height, width = padded.shape
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < height and 0 <= nx < width and padded[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                queue.append((ny, nx))
    return ~outside[1:-1, 1:-1]


# --------------------------------------------------------------------------- #
# Contorno
# --------------------------------------------------------------------------- #


def trace_boundary(mask: np.ndarray) -> np.ndarray:
    """Borde exterior de una figura conexa sin agujeros, en orden (vecinos de Moore).

    Returns:
        Array ``(N, 2)`` de coordenadas ``(x, y)`` de píxel, con y hacia abajo.
    """
    padded = np.pad(mask, 1)
    ys, xs = np.nonzero(padded)
    order = np.lexsort((xs, ys))  # el más alto y, a igualdad, el más a la izquierda
    start = (int(xs[order[0]]), int(ys[order[0]]))
    # El vecino del oeste es fondo (start es el primero de su fila): punto de retroceso.
    start_back = (start[0] - 1, start[1])

    boundary = [start]
    current, back = start, start_back
    for _ in range(4 * padded.size):
        # Recorre los vecinos de `current` en sentido horario empezando tras `back`.
        first = _MOORE.index((back[0] - current[0], back[1] - current[1]))
        previous = back
        for k in range(1, 9):
            dx, dy = _MOORE[(first + k) % 8]
            candidate = (current[0] + dx, current[1] + dy)
            if padded[candidate[1], candidate[0]]:
                current, back = candidate, previous
                break
            previous = candidate
        else:
            break  # píxel aislado: el contorno es un punto
        # Criterio de Jacob: se vuelve al inicio entrando por el mismo sitio.
        if current == start and back == start_back:
            break
        boundary.append(current)
    if boundary[-1] == start and len(boundary) > 1:
        boundary.pop()
    return np.array(boundary, dtype=float) - 1.0  # quitar el relleno


def image_contour(path: Path, max_side: int = MAX_SIDE) -> np.ndarray:
    """Contorno ordenado de la figura principal de una imagen, con y hacia arriba."""
    mask = fill_holes(largest_component(close_mask(load_mask(path, max_side))))
    points = trace_boundary(mask)
    points[:, 1] = -points[:, 1]
    return points


# --------------------------------------------------------------------------- #
# Proveedor
# --------------------------------------------------------------------------- #


class ImageProvider:
    """Convierte imágenes ``<image_dir>/<id>.png`` en contornos."""

    def __init__(self, image_dir: Path, max_side: int = MAX_SIDE) -> None:
        """Guarda la carpeta de imágenes.

        Args:
            image_dir: Carpeta con un archivo PNG por elemento.
            max_side: Lado máximo al que se reduce cada imagen antes de trazar.
        """
        self.image_dir = Path(image_dir)
        self.max_side = max_side

    def available_ids(self) -> list[str]:
        """Devuelve los nombres (sin extensión) de las imágenes PNG de la carpeta."""
        return sorted(p.stem for p in self.image_dir.glob("*.png"))

    def get_shape(self, item_id: str) -> Shape:
        """Contorno de la imagen ``<image_dir>/<item_id>.png``.

        Raises:
            KeyError: Si no existe la imagen.
        """
        path = self.image_dir / f"{item_id}.png"
        if not path.exists():
            raise KeyError(f"No hay imagen para {item_id!r} en {self.image_dir}")
        return Shape(id=item_id, points=image_contour(path, self.max_side), source="image")
