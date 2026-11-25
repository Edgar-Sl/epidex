"""Modos de juego de Pokémon: uno por generación y otro con todas mezcladas.

A partir de las tablas CSV de PokeAPI (licencia BSD-3) escribe:

* ``data/collections/gen1.json`` ... ``gen9.json`` y ``all.json``: los modos.
* ``data/pokemon_hints.json``: las pistas de cada Pokémon (tipo, fase evolutiva, habilidad,
  categoría, color, tamaño, inicial y generación), que ``build`` mete en cada
  puzzle. El juego da una al azar (ver ``web/js/core/hints.js``).

 Se suben al repo, así que solo hace falta volver a
ejecutarlo si sale una generación nueva (sube ``LAST_ID`` y añade su región a
``GENERATIONS``)::

    python -m pipeline.pokemon_collections
"""

from __future__ import annotations

import csv
import io
import json
import re
import urllib.request
from pathlib import Path
from typing import Any

BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/"
SPANISH = "7"  # local_language_id de PokeAPI
ENGLISH = "9"
LAST_ID = 1025  # hasta la 9.ª generación
ROOT = Path(__file__).resolve().parent.parent
COLLECTIONS = ROOT / "data" / "collections"
HINTS = ROOT / "data" / "pokemon_hints.json"

# Pistas de cada modo. La generación solo tiene sentido mezclándolas todas.
# Las que van en cada puzzle. El juego da una al azar (ver ``web/js/core/hints.js``).
HINT_KINDS = ["type", "stage", "genus", "ability", "tint"]

# Generación -> (número romano, región en español, región en inglés).
GENERATIONS = {
    1: ("I", "Kanto", "Kanto"),
    2: ("II", "Johto", "Johto"),
    3: ("III", "Hoenn", "Hoenn"),
    4: ("IV", "Sinnoh", "Sinnoh"),
    5: ("V", "Teselia", "Unova"),
    6: ("VI", "Kalos", "Kalos"),
    7: ("VII", "Alola", "Alola"),
    8: ("VIII", "Galar", "Galar"),
    9: ("IX", "Paldea", "Paldea"),
}

# Alias a mano (además de los que salen solos quitando signos, ver ``aliases``).
EXTRA_ALIASES = {
    "029": ["Nidoran hembra", "Nidoran F"],
    "032": ["Nidoran macho", "Nidoran M"],
    "122": ["Mister Mime"],
}


def read_csv(name: str) -> list[dict[str, str]]:
    """Descarga y lee una tabla CSV de PokeAPI."""
    with urllib.request.urlopen(BASE + name, timeout=60) as response:
        return list(csv.DictReader(io.StringIO(response.read().decode("utf-8"))))


def species_names(rows: list[dict[str, str]], last_id: int = LAST_ID) -> dict[str, str]:
    """Nombre de cada especie (``"025" -> "Pikachu"``). En España se usan los ingleses."""
    return {
        f"{int(r['pokemon_species_id']):03d}": r["name"]
        for r in rows
        if r["local_language_id"] == ENGLISH and int(r["pokemon_species_id"]) <= last_id
    }


def aliases(item_id: str, name: str) -> list[str]:
    """Formas de escribir el nombre sin signos: "Mr. Mime" -> "Mr Mime", "Ho-Oh" -> "Ho Oh"."""
    found = []
    if "’" in name:  # el apóstrofo tipográfico no está en el teclado
        found.append(name.replace("’", "'"))
    # Los dos Nidoran quedarían iguales sin el símbolo: sus alias van a mano.
    if "♀" not in name and "♂" not in name:
        plain = " ".join(re.sub(r"[.'’:]", "", name).replace("-", " ").split())
        if plain != name:
            found.append(plain)
    return found + [a for a in EXTRA_ALIASES.get(item_id, []) if a not in found]


def collection(
    cid: str, order: int, title: dict[str, str], menu: dict[str, Any], items: list[dict[str, Any]]
) -> dict[str, Any]:
    """Contenido de ``data/collections/<cid>.json`` (un modo de juego)."""
    ui = {"placeholder": "¿Quién es ese Pokémon?", "subject": "Pokémon", "art": True}
    ui_en = {"placeholder": "Who's that Pokémon?", "subject": "Pokémon", "art": True}
    return {
        "id": cid,
        "title": title["es"],
        "order": order,
        "emoji": "",
        "_comment": "Lo genera pipeline/pokemon_collections.py: no lo edites a mano.",
        "ui": ui,
        "menu": menu["es"],
        "i18n": {"en": {"title": title["en"], "ui": ui_en, "menu": menu["en"]}},
        "provider": {"type": "image", "image_dir": "data/raw/pokemon", "max_side": 256},
        "answers": {"from_provider": False},
        "hints": {
            "file": "data/pokemon_hints.json",
            "kinds": HINT_KINDS,
        },
        "items": items,
    }


def by_lang(rows: list[dict[str, str]], key: str, field: str = "name") -> dict[str, dict[str, str]]:
    """``{id: {"es": ..., "en": ...}}`` a partir de una tabla de nombres traducidos."""
    out: dict[str, dict[str, str]] = {}
    for r in rows:
        lang = {SPANISH: "es", ENGLISH: "en"}.get(r["local_language_id"])
        if lang and r.get(field):
            out.setdefault(r[key], {})[lang] = r[field]
    return out


def evolution_stage(pid: int, parent: dict[int, int], has_child: set[int]) -> str:
    """``single`` (no evoluciona), ``basic`` (fase inicial), ``middle`` o ``final``."""
    if pid not in parent:
        return "basic" if pid in has_child else "single"
    return "middle" if pid in has_child else "final"


def build_hints(
    names: dict[str, str],
    species: list[dict[str, str]],
    species_names_rows: list[dict[str, str]],
    pokemon: list[dict[str, str]],
    pokemon_types: list[dict[str, str]],
    type_names: list[dict[str, str]],
    color_names: list[dict[str, str]],
    pokemon_abilities: list[dict[str, str]] = (),
    ability_names: list[dict[str, str]] = (),
    colors: list[dict[str, str]] = (),
    last_id: int = LAST_ID,
) -> dict[str, dict[str, Any]]:
    """Pistas de cada especie. Los textos van en español e inglés; los números, tal cual."""
    sp = {int(r["id"]): r for r in species if int(r["id"]) <= last_id}
    parent = {
        i: int(r["evolves_from_species_id"]) for i, r in sp.items() if r["evolves_from_species_id"]
    }
    has_child = set(parent.values())
    genus = by_lang(species_names_rows, "pokemon_species_id", "genus")
    types_tr = by_lang(type_names, "type_id")
    colors_tr = by_lang(color_names, "pokemon_color_id")
    color_key = {r["id"]: r["identifier"] for r in colors}  # "10" -> "yellow"
    abilities_tr = by_lang(ability_names, "ability_id")
    # Habilidad principal: la del hueco 1, que no es oculta.
    main_ability = {
        int(r["pokemon_id"]): r["ability_id"]
        for r in pokemon_abilities
        if r["slot"] == "1" and r["is_hidden"] == "0" and int(r["pokemon_id"]) <= last_id
    }
    # La forma por defecto de cada especie tiene el mismo id que la especie.
    body = {int(r["id"]): r for r in pokemon if int(r["id"]) <= last_id}
    types: dict[int, list[tuple[int, str]]] = {}
    for r in pokemon_types:
        if int(r["pokemon_id"]) <= last_id:
            types.setdefault(int(r["pokemon_id"]), []).append((int(r["slot"]), r["type_id"]))
    out = {}
    for i, r in sp.items():
        pid = f"{i:03d}"
        own = [types_tr[t] for _, t in sorted(types[i])]
        out[pid] = {
            "type": {lang: " / ".join(t[lang] for t in own) for lang in ("es", "en")},
            "stage": evolution_stage(i, parent, has_child),
            "genus": genus[str(i)],
            "color": colors_tr[r["color_id"]],
            # PokeAPI da la altura en decímetros y el peso en hectogramos.
            "size": {"m": int(body[i]["height"]) / 10, "kg": int(body[i]["weight"]) / 10},
            "letter": names[pid][0].upper(),
            "generation": int(r["generation_id"]),
        }
        if i in main_ability and main_ability[i] in abilities_tr:
            out[pid]["ability"] = abilities_tr[main_ability[i]]
        if r["color_id"] in color_key:
            # Color de la silueta (pista visual): su nombre y la clave para pintarla.
            out[pid]["tint"] = {**colors_tr[r["color_id"]], "key": color_key[r["color_id"]]}
    return out


def build_collections(
    names: dict[str, str], species: list[dict[str, str]], last_id: int = LAST_ID
) -> list[dict[str, Any]]:
    """Una colección por generación y otra con todas (``all``)."""
    gen = {
        f"{int(r['id']):03d}": int(r["generation_id"]) for r in species if int(r["id"]) <= last_id
    }
    items = {
        pid: {
            "id": pid,
            "name": names[pid],
            **({"aliases": a} if (a := aliases(pid, names[pid])) else {}),
        }
        for pid in sorted(names, key=int)
    }
    out = []
    for n, (roman, region_es, region_en) in GENERATIONS.items():
        ids = [pid for pid in items if gen.get(pid) == n]
        if not ids:
            continue
        span = f"#{ids[0]}–#{ids[-1]}"
        menu = {
            "es": {"kicker": f"Gen {roman}", "name": region_es, "detail": span, "count": len(ids)},
            "en": {"kicker": f"Gen {roman}", "name": region_en, "detail": span, "count": len(ids)},
        }
        title = {"es": f"Gen {roman} · {region_es}", "en": f"Gen {roman} · {region_en}"}
        out.append(collection(f"gen{n}", n, title, menu, [items[pid] for pid in ids]))
    everything = list(items.values())
    menu = {
        "es": {
            "kicker": "Todas",
            "name": "Pokédex nacional",
            "detail": "Gen I–IX",
            "count": len(everything),
        },
        "en": {
            "kicker": "All",
            "name": "National Dex",
            "detail": "Gen I–IX",
            "count": len(everything),
        },
    }
    title = {"es": "Todas las generaciones", "en": "All generations"}
    out.append(collection("all", 100, title, menu, everything))
    return out


def main() -> None:
    """Punto de entrada del comando."""
    species = read_csv("pokemon_species.csv")
    species_names_rows = read_csv("pokemon_species_names.csv")
    names = species_names(species_names_rows)
    hints = build_hints(
        names,
        species,
        species_names_rows,
        read_csv("pokemon.csv"),
        read_csv("pokemon_types.csv"),
        read_csv("type_names.csv"),
        read_csv("pokemon_color_names.csv"),
        read_csv("pokemon_abilities.csv"),
        read_csv("ability_names.csv"),
        read_csv("pokemon_colors.csv"),
    )
    data = {
        "_comment": "Pistas de cada Pokémon, según PokeAPI (BSD-3). Lo genera "
        "pipeline/pokemon_collections.py.",
        "pokemon": hints,
    }
    HINTS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Guardado {HINTS} ({len(hints)} Pokémon)")
    for old in COLLECTIONS.glob("*.json"):
        old.unlink()
    for col in build_collections(names, species):
        path = COLLECTIONS / f"{col['id']}.json"
        lines = ",\n".join(f"    {json.dumps(i, ensure_ascii=False)}" for i in col["items"])
        head = json.dumps(
            {k: v for k, v in col.items() if k != "items"}, ensure_ascii=False, indent=2
        )
        path.write_text(f'{head[:-2]},\n  "items": [\n{lines}\n  ]\n}}\n', encoding="utf-8")
        print(f"Guardado {path} ({len(col['items'])} Pokémon)")


if __name__ == "__main__":
    main()
