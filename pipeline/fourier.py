r"""Serie de Fourier compleja de un contorno cerrado y su reconstrucción con epiciclos.

Idea: cada punto del contorno es un número complejo :math:`z_j = x_j + i y_j`,
muestreado en :math:`t_j = j/N`. La DFT da coeficientes :math:`c_k` tales que

.. math::

    z(t) = \sum_k c_k \, e^{2\pi i k t}

Cada término es un *epiciclo*: un círculo de radio :math:`|c_k|` que da :math:`k`
vueltas mientras se dibuja la figura (si :math:`k<0`, en sentido horario), con
fase inicial :math:`\arg c_k`. Sumarlos en cadena (el centro de cada círculo está
en la punta del anterior) dibuja la curva.

Convenciones:

* ``c_k = fft(z)[k] / N``, para que :math:`|c_k|` sea directamente el radio.
* Las frecuencias son enteros en ``[-N/2, N/2)`` (``numpy.fft.fftfreq(N, 1/N)``).
* Los términos se ordenan con la frecuencia 0 siempre primero y el resto por
  magnitud decreciente. Así, quedarse con los K primeros es la mejor aproximación
  posible con K círculos (en norma L2), porque las exponenciales son ortogonales.
* "K círculos" significa K términos **además** del de frecuencia 0 (que, tras
  centrar, vale 0 y no se ve).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class FourierSeries:
    """Coeficientes de Fourier ordenados (frecuencia 0 primero, luego por magnitud).

    Attributes:
        freqs: Array de enteros con la frecuencia de cada término.
        coeffs: Array complejo con el coeficiente de cada término.
    """

    freqs: np.ndarray
    coeffs: np.ndarray

    def __post_init__(self) -> None:
        """Comprueba que ``freqs`` y ``coeffs`` tienen la misma longitud."""
        if self.freqs.shape != self.coeffs.shape:
            raise ValueError("freqs y coeffs deben tener la misma forma")

    def __len__(self) -> int:
        """Número total de términos (incluido el de frecuencia 0)."""
        return len(self.coeffs)

    @property
    def n_circles(self) -> int:
        """Número de círculos disponibles (términos sin contar la frecuencia 0)."""
        return len(self) - 1

    def truncate(self, n_circles: int) -> FourierSeries:
        """Devuelve una serie con la frecuencia 0 y los ``n_circles`` términos mayores.

        Raises:
            ValueError: Si se piden más círculos de los que hay o un número negativo.
        """
        if not 0 <= n_circles <= self.n_circles:
            raise ValueError(f"n_circles debe estar entre 0 y {self.n_circles}")
        return FourierSeries(self.freqs[: n_circles + 1], self.coeffs[: n_circles + 1])


def to_complex(points: np.ndarray) -> np.ndarray:
    """Convierte un array ``(N, 2)`` en un array complejo ``x + iy``."""
    return points[:, 0] + 1j * points[:, 1]


def to_points(z: np.ndarray) -> np.ndarray:
    """Convierte un array complejo en un array ``(N, 2)``."""
    return np.column_stack([z.real, z.imag])


def order_terms(freqs: np.ndarray, coeffs: np.ndarray) -> np.ndarray:
    """Índices que ordenan los términos: frecuencia 0 primero, luego por magnitud.

    Los empates de magnitud se resuelven por ``|k|`` y luego por ``k``, para que
    el resultado sea determinista.
    """
    is_not_dc = freqs != 0
    # np.lexsort ordena por la ÚLTIMA clave primero.
    return np.lexsort((freqs, np.abs(freqs), -np.abs(coeffs), is_not_dc))


def dft(z: np.ndarray) -> FourierSeries:
    """Calcula la serie de Fourier ordenada de una curva cerrada muestreada.

    Args:
        z: Array complejo con ``N`` muestras equiespaciadas de la curva.

    Returns:
        La serie con los ``N`` términos, ya ordenados.
    """
    n = len(z)
    coeffs = np.fft.fft(z) / n
    freqs = np.fft.fftfreq(n, d=1.0 / n).round().astype(int)
    order = order_terms(freqs, coeffs)
    return FourierSeries(freqs[order], coeffs[order])


def evaluate(series: FourierSeries, t: np.ndarray) -> np.ndarray:
    """Evalúa la serie en los instantes ``t`` (en vueltas: ``t ∈ [0, 1)``).

    Args:
        series: Serie (completa o truncada).
        t: Array de instantes.

    Returns:
        Array complejo con los puntos de la curva.
    """
    phases = np.exp(2j * np.pi * np.outer(t, series.freqs))
    return phases @ series.coeffs


def reconstruct(series: FourierSeries, n_circles: int, n_samples: int) -> np.ndarray:
    """Reconstruye la curva con ``n_circles`` círculos en ``n_samples`` puntos.

    Args:
        series: Serie completa.
        n_circles: Círculos a usar (sin contar la frecuencia 0).
        n_samples: Número de puntos equiespaciados en ``t``.

    Returns:
        Array complejo de longitud ``n_samples``.
    """
    t = np.arange(n_samples) / n_samples
    return evaluate(series.truncate(n_circles), t)


def relative_error(z: np.ndarray, series: FourierSeries, n_circles: int) -> float:
    """Error relativo L2 de la reconstrucción con ``n_circles`` círculos.

    Se define como ``‖z − z_K‖ / ‖z‖`` evaluando en los mismos instantes en que
    se muestreó ``z``. Vale 0 si la reconstrucción es perfecta y 1 si es nula.

    Args:
        z: Curva original (la misma con la que se calculó ``series``).
        series: Serie completa de ``z``.
        n_circles: Círculos a usar.
    """
    approx = reconstruct(series, n_circles, len(z))
    return float(np.linalg.norm(z - approx) / np.linalg.norm(z))
