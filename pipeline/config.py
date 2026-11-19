"""Carga de la configuración del pipeline y de las colecciones.

Hay dos tipos de archivo de configuración:

* ``config.toml``: rutas y conjuntos de datos descargables (uno por proyecto).
* ``data/collections/<id>.json``: una colección = un modo de juego (países,
  animales...). Indica qué proveedor de formas usa y qué elementos pueden salir.

Todas las rutas de ``config.toml`` se resuelven relativas a la carpeta del propio
archivo, así el pipeline funciona igual se ejecute desde donde se ejecute.
"""

from __future__ import annotations

import json
import tomllib
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Dataset:
    """Un archivo descargable (p. ej. el GeoJSON de Natural Earth)."""

    name: str
    url: str
    filename: str
    license: str = ""


@dataclass(frozen=True)
class ScheduleSettings:
    """Parámetros del calendario diario."""

    start_date: date = date(2026, 12, 1)  # día del puzzle #1
    days: int = 365  # cuántos días se generan
    seed: int = 0  # semilla del barajado
    timezone: str = "Europe/Madrid"  # informativo: el frontend calcula "hoy" en esta zona


@dataclass(frozen=True)
class Settings:
    """Configuración global del pipeline, con rutas ya absolutas."""

    root: Path
    raw_dir: Path
    collections_dir: Path
    web_data_dir: Path
    preview_dir: Path
    datasets: dict[str, Dataset]
    n_points: int = 1024
    levels: tuple[int, ...] = (2, 4, 8, 16, 32, 64)
    decimals: int = 5  # decimales de los coeficientes en el JSON
    id_salt: str = ""  # sal para los identificadores opacos de los puzzles
    max_final_error: float = 0.05  # aviso si con todos los círculos el error supera esto
    schedule: ScheduleSettings = field(default_factory=ScheduleSettings)

    def __post_init__(self) -> None:
        """Valida los parámetros numéricos."""
        if self.n_points < 2 * max(self.levels) + 1:
            raise ValueError(
                f"n_points={self.n_points} es demasiado pequeño para {max(self.levels)} círculos "
                "(hacen falta al menos 2·K+1 puntos)."
            )
        if list(self.levels) != sorted(set(self.levels)) or min(self.levels) < 1:
            raise ValueError(f"levels debe ser creciente y positivo: {self.levels}")

    def dataset_path(self, name: str) -> Path:
        """Devuelve la ruta local donde se guarda (o guardará) un dataset.

        Args:
            name: Clave del dataset en ``config.toml``.

        Raises:
            KeyError: Si el dataset no está definido.
        """
        try:
            return self.raw_dir / self.datasets[name].filename
        except KeyError:
            raise KeyError(f"Dataset desconocido: {name!r}") from None

    def collection_path(self, collection_id: str) -> Path:
        """Devuelve la ruta del JSON de una colección."""
        return self.collections_dir / f"{collection_id}.json"


@dataclass(frozen=True)
class Item:
    """Un elemento que puede salir como puzzle (p. ej. un país)."""

    id: str
    name: str
    aliases: tuple[str, ...] = ()


@dataclass(frozen=True)
class Collection:
    """Un modo de juego: proveedor de formas + elementos jugables."""

    id: str
    title: str
    emoji: str
    provider: dict[str, Any]
    items: tuple[Item, ...]
    answers: dict[str, Any] = field(default_factory=dict)
    extra: dict[str, Any] = field(default_factory=dict)


def load_settings(path: Path) -> Settings:
    """Lee ``config.toml`` y resuelve sus rutas.

    Args:
        path: Ruta al archivo TOML.

    Returns:
        Configuración con rutas absolutas.
    """
    path = Path(path).resolve()
    with path.open("rb") as f:
        raw = tomllib.load(f)

    root = path.parent
    paths = raw["paths"]
    datasets = {name: Dataset(name=name, **spec) for name, spec in raw.get("datasets", {}).items()}
    puzzle = raw.get("puzzle", {})
    sched = raw.get("schedule", {})
    return Settings(
        root=root,
        raw_dir=root / paths["raw_dir"],
        collections_dir=root / paths["collections_dir"],
        web_data_dir=root / paths["web_data_dir"],
        preview_dir=root / paths["preview_dir"],
        datasets=datasets,
        n_points=int(raw.get("contour", {}).get("n_points", 1024)),
        levels=tuple(int(k) for k in puzzle.get("levels", (2, 4, 8, 16, 32, 64))),
        decimals=int(puzzle.get("decimals", 5)),
        id_salt=str(puzzle.get("id_salt", "")),
        max_final_error=float(puzzle.get("max_final_error", 0.05)),
        schedule=ScheduleSettings(**sched),
    )


def parse_collection(raw: dict[str, Any]) -> Collection:
    """Convierte el JSON de una colección en un objeto validado.

    Args:
        raw: Contenido del JSON ya parseado.

    Returns:
        La colección.

    Raises:
        ValueError: Si hay identificadores repetidos o campos obligatorios vacíos.
    """
    items = tuple(
        Item(id=it["id"], name=it["name"], aliases=tuple(it.get("aliases", [])))
        for it in raw["items"]
    )
    ids = [it.id for it in items]
    duplicated = sorted({i for i in ids if ids.count(i) > 1})
    if duplicated:
        raise ValueError(f"Identificadores repetidos en la colección: {duplicated}")
    if not items:
        raise ValueError("La colección no tiene elementos.")

    known = {"id", "title", "emoji", "provider", "items", "answers"}
    return Collection(
        id=raw["id"],
        title=raw["title"],
        emoji=raw.get("emoji", ""),
        provider=dict(raw["provider"]),
        items=items,
        answers=dict(raw.get("answers", {})),
        extra={k: v for k, v in raw.items() if k not in known},
    )


def load_collection(path: Path) -> Collection:
    """Lee y valida el JSON de una colección."""
    with Path(path).open(encoding="utf-8") as f:
        return parse_collection(json.load(f))
