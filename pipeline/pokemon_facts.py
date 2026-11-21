"""Genera ``data/pokemon_facts.json``: tipos y familia evolutiva de la 1.ª generación.

Lo usan las preguntas extra (ver ``bonus.py``). Los datos salen de las tablas
CSV de PokeAPI (licencia BSD-3) y el resultado se sube al repo, así que solo
hace falta volver a generarlo si cambia la colección::

    python -m pipeline.pokemon_facts
"""

from __future__ import annotations

import csv
import io
import json
import urllib.request
from pathlib import Path

BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/"
SPANISH = "7"  # local_language_id de PokeAPI
LAST_ID = 151  # 1.ª generación
OUT = Path(__file__).resolve().parent.parent / "data" / "pokemon_facts.json"


def read_csv(name: str) -> list[dict[str, str]]:
    """Descarga y lee una tabla CSV de PokeAPI."""
    with urllib.request.urlopen(BASE + name, timeout=60) as response:
        return list(csv.DictReader(io.StringIO(response.read().decode("utf-8"))))


def build_facts(
    type_names: list[dict[str, str]],
    pokemon_types: list[dict[str, str]],
    species: list[dict[str, str]],
    last_id: int = LAST_ID,
) -> dict[str, dict[str, list[str]]]:
    """``{"001": {"types": ["Planta", "Veneno"], "family": ["002", "003"]}, ...}``."""
    names = {r["type_id"]: r["name"] for r in type_names if r["local_language_id"] == SPANISH}
    types: dict[int, list[tuple[int, str]]] = {}
    for row in pokemon_types:
        pid = int(row["pokemon_id"])
        if pid <= last_id:
            types.setdefault(pid, []).append((int(row["slot"]), names[row["type_id"]]))
    chain = {int(r["id"]): r["evolution_chain_id"] for r in species if int(r["id"]) <= last_id}
    return {
        f"{i:03d}": {
            "types": [name for _, name in sorted(types[i])],
            "family": [f"{j:03d}" for j in sorted(chain) if j != i and chain[j] == chain[i]],
        }
        for i in range(1, last_id + 1)
    }


def main() -> None:
    """Punto de entrada del comando."""
    facts = build_facts(
        read_csv("type_names.csv"), read_csv("pokemon_types.csv"), read_csv("pokemon_species.csv")
    )
    data = {
        "_comment": "Tipos (en español) y familia evolutiva de la 1.ª generación, según "
        "PokeAPI (BSD-3). Lo genera pipeline/pokemon_facts.py.",
        "pokemon": facts,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Guardado {OUT} ({len(facts)} Pokémon)")


if __name__ == "__main__":
    main()
