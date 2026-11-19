"""Calendario diario: qué puzzle toca cada fecha.

Se baraja la lista de puzzles con una semilla fija (determinista: misma semilla
y mismos puzzles -> mismo calendario) en *ciclos*: no se repite ningún puzzle
hasta que han salido todos, y cada ciclo tiene un orden distinto. Entre un ciclo
y el siguiente se evita que el mismo puzzle salga dos días seguidos.

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

Limitación conocida: si se añaden o quitan puzzles, el barajado cambia también
para fechas pasadas. Antes de publicar habrá que "congelar" los días ya jugados.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, timedelta
from typing import Any

import numpy as np

FORMAT_VERSION = 1


def shuffled_cycles(puzzle_ids: Sequence[str], n_days: int, seed: int) -> list[str]:
    """Genera ``n_days`` puzzles a base de ciclos barajados.

    Args:
        puzzle_ids: Identificadores disponibles (el orden de entrada no importa).
        n_days: Número de días a generar.
        seed: Semilla del generador aleatorio.

    Returns:
        Lista de longitud ``n_days``.

    Raises:
        ValueError: Si no hay puzzles.
    """
    pool = sorted(set(puzzle_ids))
    if not pool:
        raise ValueError("No hay puzzles para el calendario")
    result: list[str] = []
    cycle = 0
    while len(result) < n_days:
        rng = np.random.default_rng([seed, cycle])
        order = [pool[i] for i in rng.permutation(len(pool))]
        if result and len(order) > 1 and order[0] == result[-1]:
            order[0], order[1] = order[1], order[0]
        result.extend(order)
        cycle += 1
    return result[:n_days]


def build_schedule(
    collection_id: str,
    puzzle_ids: Sequence[str],
    start_date: date,
    n_days: int,
    seed: int,
    timezone: str = "Europe/Madrid",
) -> dict[str, Any]:
    """Construye el contenido de ``schedule.json``.

    Args:
        collection_id: Id de la colección.
        puzzle_ids: Ids de los puzzles disponibles.
        start_date: Fecha del puzzle número 1.
        n_days: Días a generar.
        seed: Semilla del barajado.
        timezone: Zona horaria en la que el frontend calcula "hoy".
    """
    order = shuffled_cycles(puzzle_ids, n_days, seed)
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
