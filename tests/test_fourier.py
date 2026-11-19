"""Tests de la serie de Fourier y la reconstrucción con epiciclos."""

import numpy as np
import pytest

from pipeline.contour import normalize_contour
from pipeline.fourier import (
    FourierSeries,
    dft,
    evaluate,
    reconstruct,
    relative_error,
    to_complex,
    to_points,
)

N = 256
T = np.arange(N) / N


def star(n: int = N) -> np.ndarray:
    """Curva con forma de estrella, normalizada como lo hace el pipeline."""
    t = np.arange(4 * n) / (4 * n) * 2 * np.pi
    r = 1 + 0.3 * np.cos(5 * t) + 0.1 * np.sin(13 * t)
    return to_complex(normalize_contour(np.column_stack([r * np.cos(t), r * np.sin(t)]), n))


def test_circulo_se_reconstruye_con_un_circulo():
    z = 2 + 1j + 3 * np.exp(-2j * np.pi * T)  # círculo horario de radio 3 centrado en 2+i
    series = dft(z)
    assert relative_error(z, series, 1) < 1e-10
    assert series.freqs[1] == -1
    assert abs(series.coeffs[1]) == pytest.approx(3)


def test_elipse_necesita_dos_circulos():
    z = 2 * np.cos(2 * np.pi * T) - 1j * np.sin(2 * np.pi * T)
    series = dft(z)
    assert relative_error(z, series, 1) > 0.1
    assert relative_error(z, series, 2) < 1e-10


def test_frecuencia_cero_primero_y_resto_por_magnitud():
    series = dft(star())
    assert series.freqs[0] == 0
    mags = np.abs(series.coeffs[1:])
    assert np.all(np.diff(mags) <= 1e-15)


def test_error_no_aumenta_con_mas_circulos():
    z = star()
    series = dft(z)
    errors = [relative_error(z, series, k) for k in range(0, 65)]
    assert np.all(np.diff(errors) <= 1e-12)
    assert errors[0] == pytest.approx(1.0)  # contorno centrado: solo DC = 0 -> error total


def test_error_coincide_con_parseval():
    # Por ortogonalidad, el error² es la energía de los términos descartados.
    z = star()
    series = dft(z)
    k = 8
    dropped = np.sum(np.abs(series.coeffs[k + 1 :]) ** 2)
    total = np.sum(np.abs(series.coeffs) ** 2)
    assert relative_error(z, series, k) == pytest.approx(np.sqrt(dropped / total))


def test_serie_completa_reconstruye_exactamente():
    z = star()
    series = dft(z)
    assert reconstruct(series, series.n_circles, N) == pytest.approx(z)


def test_reconstruccion_continua_pasa_por_las_muestras():
    z = star()
    series = dft(z)
    fine = reconstruct(series, series.n_circles, 4 * N)
    assert fine[::4] == pytest.approx(z)


def test_truncate_valida_rango():
    series = dft(star(16))
    assert len(series.truncate(3)) == 4
    with pytest.raises(ValueError):
        series.truncate(16)


def test_evaluate_y_conversiones():
    series = FourierSeries(np.array([0, 1]), np.array([0j, 1 + 0j]))
    assert evaluate(series, np.array([0.25])) == pytest.approx([1j])
    pts = np.array([[1.0, 2.0], [3.0, -4.0]])
    assert to_points(to_complex(pts)) == pytest.approx(pts)
