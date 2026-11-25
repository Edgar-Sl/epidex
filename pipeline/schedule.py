"""Calendario diario: qué puzzle toca cada fecha.

Los puzzles salen en **ciclos al azar**: no se repite ninguno hasta que han
salido todos, cada ciclo tiene un orden distinto, y entre ciclos ninguno se
repite antes de ``min_gap`` días (30 por defecto; si la colección es más
pequeña, el máximo posible). Es determinista: misma semilla, mismos
puzzles y mismos días congelados -> mismo calendario.

Los días ya jugados no deben cambiar: ``build_schedule`` acepta los días del
calendario anterior (``frozen``) y los conserva tal cual; el resto se elige a
continuación respetando la separación mínima con ellos.

Formato de ``schedule.json`` (versión 1)::

    {
      "version": 1,
      "collection": "countries",
      "timezone": "Europe/Madrid",
      "start_date": "2026-12-01",
      "days": [
        {"date": "2026-12-01", "number": 1, "puzzle": "3f9c1a7b2e"},
        ...
      ]
    }

``number`` es el que aparece al compartir ("#12"). El navegador calcula la fecha
de hoy en ``timezone`` y busca su entrada.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, timedelta
from typing import Any

import numpy as np

FORMAT_VERSION = 1


def cycles_with_gap(
    puzzle_ids: Sequence[str],
    n_days: int,
    seed: int,
    min_gap: int = 30,
    prefix: Sequence[str] = (),
) -> list[str]:
    """Genera ``n_days`` puzzles en ciclos al azar, sin repetir en ``min_gap`` días.

    Dentro de cada ciclo salen todos los puzzles una vez, en orden aleatorio;
    cuando han salido todos empieza otro. Al empezar un ciclo, los que salieron
    hace menos de ``min_gap`` días esperan su turno.

    Args:
        puzzle_ids: Identificadores disponibles (el orden de entrada no importa).
        n_days: Número total de días (incluidos los de ``prefix``).
        seed: Semilla del generador aleatorio.
        min_gap: Días que deben pasar antes de que un puzzle pueda repetirse. Si
            hay menos puzzles que eso, se usa el máximo posible (``len - 1``).
        prefix: Días ya fijados (calendario anterior) que se conservan tal cual;
            cuentan para el ciclo en curso.

    Returns:
        Lista de longitud ``max(n_days, len(prefix))`` que empieza por ``prefix``.

    Raises:
        ValueError: Si no hay puzzles.
    """
    pool = sorted(set(puzzle_ids))
    if not pool:
        raise ValueError("No hay puzzles para el calendario")
    gap = max(0, min(min_gap, len(pool) - 1))
    remaining = set(pool)
    for pid in prefix:  # en qué punto del ciclo deja el calendario anterior
        remaining.discard(pid)
        if not remaining:
            remaining = set(pool)
    rng = np.random.default_rng([seed, len(prefix)])
    result = list(prefix)
    while len(result) < n_days:
        recent = set(result[-gap:]) if gap else set()
        # Siempre hay alguno: los recientes de este ciclo ya no quedan en
        # ``remaining`` y los del anterior son como mucho ``gap`` < len(pool).
        candidates = sorted(remaining - recent)
        pick = candidates[rng.integers(len(candidates))]
        result.append(pick)
        remaining.discard(pick)
        if not remaining:
            remaining = set(pool)
    return result


def build_schedule(
    collection_id: str,
    puzzle_ids: Sequence[str],
    start_date: date,
    n_days: int,
    seed: int,
    timezone: str = "Europe/Madrid",
    min_gap: int = 30,
    frozen: Sequence[dict[str, Any]] = (),
) -> dict[str, Any]:
    """Construye el contenido de ``schedule.json``.

    Args:
        collection_id: Id de la colección.
        puzzle_ids: Ids de los puzzles disponibles.
        start_date: Fecha del puzzle número 1.
        n_days: Días a generar.
        seed: Semilla del barajado.
        timezone: Zona horaria en la que el frontend calcula "hoy".
        min_gap: Días mínimos entre dos apariciones del mismo puzzle.
        frozen: Días de un calendario anterior que se conservan (ver ``frozen_days``).
    """
    order = cycles_with_gap(
        puzzle_ids, n_days, seed, min_gap, [d["puzzle"] for d in frozen]
    )
    days = [
        {
            "date": (start_date + timedelta(days=i)).isoformat(),
            "number": i + 1,
            "puzzle": pid,
        }
        for i, pid in enumerate(order)
    ]
    return {
        "version": FORMAT_VERSION,
        "collection": collection_id,
        "timezone": timezone,
        "start_date": start_date.isoformat(),
        "days": days,
    }


def frozen_days(
    previous: dict[str, Any] | None, start_date: date, until: date, puzzle_ids: Sequence[str]
) -> list[dict[str, Any]]:
    """Días de un calendario anterior que hay que conservar: del #1 hasta ``until``.

    Solo si el calendario anterior empieza el mismo día y todos esos puzzles
    siguen existiendo (si no, no se puede conservar sin romper la numeración).
    """
    if not previous or previous.get("start_date") != start_date.isoformat():
        return []
    ids = set(puzzle_ids)
    kept = []
    for i, day in enumerate(previous.get("days", [])):
        if day.get("date") != (start_date + timedelta(days=i)).isoformat():
            return []
        if date.fromisoformat(day["date"]) > until:
            break
        if day.get("puzzle") not in ids:
            return []
        kept.append(day)
    return kept
