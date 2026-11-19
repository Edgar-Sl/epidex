"""Tests de la normalización de contornos."""

import numpy as np
import pytest

from pipeline.contour import (
    ensure_clockwise,
    normalize_contour,
    perimeter,
    resample_arclength,
    signed_area,
    start_at_top,
)

SQUARE_CCW = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=float)


def irregular_polygon(seed: int = 0, m: int = 37) -> np.ndarray:
    """Polígono en estrella con vértices repartidos de forma muy irregular."""
    rng = np.random.default_rng(seed)
    angles = np.sort(rng.uniform(0, 2 * np.pi, m))
    radii = rng.uniform(0.5, 1.5, m)
    return np.column_stack([radii * np.cos(angles), radii * np.sin(angles)])


def test_remuestreo_puntos_equidistantes_en_cuadrado():
    # Perímetro 4 y 400 puntos: paso 0.01, las esquinas caen justo en una muestra.
    pts = resample_arclength(SQUARE_CCW, 400)
    steps = np.linalg.norm(np.diff(np.vstack([pts, pts[:1]]), axis=0), axis=1)
    assert steps == pytest.approx(np.full(400, 0.01))


def test_remuestreo_equidistante_en_poligono_irregular():
    poly = irregular_polygon()
    n = 2000
    pts = resample_arclength(poly, n)
    steps = np.linalg.norm(np.diff(np.vstack([pts, pts[:1]]), axis=0), axis=1)
    step = perimeter(poly) / n
    # Ninguna cuerda supera el paso de arco, y casi todas lo igualan
    # (solo son más cortas las que "recortan" un vértice).
    assert steps.max() <= step + 1e-12
    assert np.mean(np.isclose(steps, step)) > 0.95
    # El perímetro baja un poco porque cortar las puntas acorta el camino.
    assert perimeter(pts) == pytest.approx(perimeter(poly), rel=1e-2)
    assert perimeter(pts) <= perimeter(poly)


def test_remuestreo_empieza_en_el_primer_punto():
    poly = irregular_polygon()
    assert resample_arclength(poly, 100)[0] == pytest.approx(poly[0])


def test_remuestreo_rechaza_contorno_degenerado():
    with pytest.raises(ValueError):
        resample_arclength(np.zeros((5, 2)), 10)


def test_orientacion_horaria():
    assert signed_area(ensure_clockwise(SQUARE_CCW)) < 0
    cw = SQUARE_CCW[::-1]
    assert np.array_equal(ensure_clockwise(cw), cw)


def test_inicio_en_el_punto_mas_alto():
    pts = start_at_top(SQUARE_CCW)
    # Empate en y=1 entre (1,1) y (0,1): gana el de menor x.
    assert pts[0].tolist() == [0, 1]


def test_normalize_contour_centrado_escalado_y_horario():
    out = normalize_contour(irregular_polygon() * 50 + [300, -20], 512)
    assert out.shape == (512, 2)
    assert out.mean(axis=0) == pytest.approx([0, 0], abs=1e-12)
    assert np.linalg.norm(out, axis=1).max() == pytest.approx(1.0)
    assert signed_area(out) < 0


def test_normalize_contour_no_depende_del_inicio_ni_del_sentido():
    poly = irregular_polygon()
    a = normalize_contour(poly, 256)
    b = normalize_contour(np.roll(poly[::-1], 11, axis=0), 256)
    assert a == pytest.approx(b)
