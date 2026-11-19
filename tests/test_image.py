"""Tests del proveedor de imágenes (máscara, componentes, agujeros y trazado)."""

import numpy as np
import pytest
from PIL import Image

from pipeline.contour import signed_area
from pipeline.sources.image import (
    ImageProvider,
    close_mask,
    fill_holes,
    largest_component,
    otsu_threshold,
    trace_boundary,
)


def test_trazado_de_un_rectangulo_en_orden():
    mask = np.zeros((6, 7), bool)
    mask[1:4, 2:6] = True
    points = trace_boundary(mask)
    # Perímetro de un rectángulo de 4x3 píxeles: 10 píxeles de borde, sin repetir.
    assert len(points) == 10
    assert len({tuple(p) for p in points}) == 10
    assert points[0].tolist() == [2, 1]  # empieza por el más alto y a la izquierda


def test_trazado_sigue_entrantes():
    # Una "U": el borde debe entrar en la muesca.
    mask = np.ones((5, 5), bool)
    mask[0:3, 2] = False
    points = {tuple(p) for p in trace_boundary(mask)}
    assert (1.0, 2.0) in points and (3.0, 2.0) in points


def test_componente_mayor_y_agujeros():
    mask = np.zeros((10, 10), bool)
    mask[1:8, 1:8] = True
    mask[3:5, 3:5] = False  # agujero
    mask[9, 9] = True  # mota suelta
    main = largest_component(mask)
    assert not main[9, 9]
    filled = fill_holes(main)
    assert filled[3:5, 3:5].all()


def test_cierre_une_grietas_pequeñas():
    mask = np.zeros((9, 9), bool)
    mask[2:7, 2:7] = True
    mask[2:7, 4] = False  # grieta de un píxel
    assert close_mask(mask)[2:7, 4].all()


def test_otsu_separa_dos_niveles():
    gray = np.array([[20] * 10 + [220] * 10] * 4, dtype=float)
    assert 20 <= otsu_threshold(gray) < 220


def test_proveedor_con_png_transparente(tmp_path):
    rgba = np.zeros((60, 80, 4), np.uint8)
    rgba[10:50, 20:60] = (255, 0, 0, 255)
    Image.fromarray(rgba, "RGBA").save(tmp_path / "001.png")
    provider = ImageProvider(tmp_path)
    assert provider.available_ids() == ["001"]
    shape = provider.get_shape("001")
    width = np.ptp(shape.points[:, 0])
    height = np.ptp(shape.points[:, 1])
    assert width == pytest.approx(39) and height == pytest.approx(39)
    # El trazado va en sentido horario tal como se ve (área con signo negativo).
    assert signed_area(shape.points) < 0
    with pytest.raises(KeyError):
        provider.get_shape("999")
