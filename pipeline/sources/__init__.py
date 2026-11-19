"""Proveedores de formas y registro para crearlos a partir de la configuración.

Cada colección declara en su JSON un bloque ``"provider"`` con un ``"type"``.
:func:`create_provider` busca ese tipo en :data:`PROVIDER_FACTORIES` y construye
el proveedor. Para añadir uno nuevo:

1. Crea ``pipeline/sources/<nombre>.py`` con una clase que cumpla
   :class:`~pipeline.sources.base.ShapeProvider`.
2. Añade aquí una función ``_make_<nombre>(spec, settings)`` y regístrala.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

from pipeline.config import Settings
from pipeline.sources.base import Shape, ShapeProvider
from pipeline.sources.image import ImageProvider

__all__ = ["Shape", "ShapeProvider", "create_provider", "PROVIDER_FACTORIES"]

ProviderFactory = Callable[[Mapping[str, Any], Settings], ShapeProvider]


def _make_image(spec: Mapping[str, Any], settings: Settings) -> ShapeProvider:
    return ImageProvider(settings.root / spec["image_dir"], spec.get("max_side", 256))


PROVIDER_FACTORIES: dict[str, ProviderFactory] = {
    "image": _make_image,
}


def create_provider(spec: Mapping[str, Any], settings: Settings) -> ShapeProvider:
    """Crea el proveedor descrito en el bloque ``"provider"`` de una colección.

    Args:
        spec: Bloque ``"provider"`` (debe tener al menos ``"type"``).
        settings: Configuración global, para resolver rutas.

    Returns:
        El proveedor listo para usar.

    Raises:
        ValueError: Si el tipo no está registrado.
    """
    kind = spec.get("type")
    try:
        factory = PROVIDER_FACTORIES[kind]
    except KeyError:
        known = ", ".join(sorted(PROVIDER_FACTORIES))
        raise ValueError(
            f"Tipo de proveedor desconocido: {kind!r} (disponibles: {known})"
        ) from None
    return factory(spec, settings)
