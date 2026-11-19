"""Normalización de contornos antes de la DFT.

La DFT trata los puntos como muestras de una curva tomadas a intervalos *iguales*
del parámetro ``t``. Si los vértices originales están repartidos de forma
irregular (muchos en una costa recortada, pocos en una frontera recta), la DFT
"vería" la curva acelerando y frenando, y gastaría coeficientes en eso. Por eso:

1. **Orientación**: todos los contornos en sentido horario (con el eje *y* hacia
   arriba), para que todas las figuras se dibujen girando igual.
2. **Punto de inicio**: el vértice más alto, para que el dibujo empiece siempre
   por arriba y el resultado sea determinista.
3. **Remuestreo por longitud de arco**: ``N`` puntos equidistantes a lo largo del
   perímetro.
4. **Centrado**: se resta la media de los puntos remuestreados. Como están
   equiespaciados, esa media es exactamente el coeficiente de frecuencia 0 de la
   DFT, que queda a 0.
5. **Escala**: el punto más lejano del centro queda a distancia 1, así el
   frontend sabe que la figura cabe en el círculo unidad.

Todas las funciones son puras: reciben arrays y devuelven arrays nuevos.
"""

from __future__ import annotations

import numpy as np


def signed_area(points: np.ndarray) -> float:
    """Área con signo (fórmula del área de Gauss): positiva si es antihoraria.

    Args:
        points: Array ``(N, 2)`` de un polígono cerrado (sin repetir el primer punto).
    """
    x, y = points[:, 0], points[:, 1]
    return 0.5 * float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))


def ensure_clockwise(points: np.ndarray) -> np.ndarray:
    """Devuelve el contorno en sentido horario (eje *y* hacia arriba).

    Args:
        points: Array ``(N, 2)``.

    Returns:
        El mismo contorno, invertido si era antihorario.
    """
    return points[::-1].copy() if signed_area(points) > 0 else points.copy()


def start_at_top(points: np.ndarray) -> np.ndarray:
    """Rota el orden de los puntos para que el primero sea el de mayor *y*.

    En caso de empate gana el de menor *x* (el más a la izquierda), para que el
    resultado no dependa de dónde empezaba el contorno original.
    """
    order = np.lexsort((points[:, 0], -points[:, 1]))
    return np.roll(points, -int(order[0]), axis=0)


def perimeter(points: np.ndarray) -> float:
    """Longitud del contorno cerrado, incluido el segmento del último al primero."""
    closed = np.vstack([points, points[:1]])
    return float(np.linalg.norm(np.diff(closed, axis=0), axis=1).sum())


def resample_arclength(points: np.ndarray, n: int) -> np.ndarray:
    """Remuestrea un contorno cerrado en ``n`` puntos equidistantes por longitud de arco.

    El primer punto de la salida coincide con el primero de la entrada.

    Args:
        points: Array ``(M, 2)`` con el contorno cerrado (sin repetir el primero).
        n: Número de puntos de salida.

    Returns:
        Array ``(n, 2)``. Los puntos están separados ``perimeter / n`` medidos
        *a lo largo del contorno* (la distancia en línea recta puede ser menor en
        las esquinas).

    Raises:
        ValueError: Si el contorno tiene longitud 0 o ``n < 3``.
    """
    if n < 3:
        raise ValueError("n debe ser al menos 3")
    closed = np.vstack([points, points[:1]])
    seg = np.linalg.norm(np.diff(closed, axis=0), axis=1)
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    total = cum[-1]
    if total <= 0:
        raise ValueError("El contorno tiene longitud 0")
    targets = np.linspace(0.0, total, n, endpoint=False)
    x = np.interp(targets, cum, closed[:, 0])
    y = np.interp(targets, cum, closed[:, 1])
    return np.column_stack([x, y])


def center(points: np.ndarray) -> np.ndarray:
    """Traslada los puntos para que su media quede en el origen."""
    return points - points.mean(axis=0)


def normalize_scale(points: np.ndarray) -> np.ndarray:
    """Escala los puntos (ya centrados) para que el más lejano esté a distancia 1."""
    radius = float(np.linalg.norm(points, axis=1).max())
    if radius == 0:
        raise ValueError("No se puede normalizar un contorno de radio 0")
    return points / radius


def normalize_contour(points: np.ndarray, n: int) -> np.ndarray:
    """Aplica todo el proceso: orientación, inicio, remuestreo, centrado y escala.

    Args:
        points: Contorno ``(M, 2)`` tal como lo da un proveedor de formas.
        n: Número de puntos equidistantes de salida.

    Returns:
        Array ``(n, 2)`` horario, centrado en el origen y dentro del círculo unidad.
    """
    pts = np.asarray(points, dtype=float)
    pts = start_at_top(ensure_clockwise(pts))
    return normalize_scale(center(resample_arclength(pts, n)))
