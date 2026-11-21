"""Preguntas extra: dos preguntas tipo test al acabar la partida.

Adivinar la silueta dura unos segundos; las preguntas extra alargan el rato y
ponen a prueba lo que sabes del Pokémon del día. Cada pregunta tiene cuatro
opciones y una correcta::

    {"question": "¿De qué tipo es Charmander?",
     "options": ["Agua", "Fuego", "Roca", "Bicho"],
     "answer": 1}

Se generan aquí, una vez, y van dentro del archivo del puzzle: son las mismas
para todo el mundo. Las opciones se barajan con una semilla que sale del id del
puzzle, así que generarlas otra vez da lo mismo.

Preguntas (colecciones con ``"bonus": {"type": "pokemon", ...}``):

1. **Tipo**: de qué tipo es. Si tiene dos, cuál de las opciones es uno de ellos
   (las otras tres no son ninguno de los dos).
2. **Familia**: cuál de los cuatro es de su misma línea evolutiva. Las opciones
   falsas comparten tipo con él cuando se puede, para que no sea regalado. Si no
   tiene familia en la 1.ª generación (Tauros, Lapras...), qué número tiene en
   la Pokédex.

Los datos (``data/pokemon_facts.json``) salen de PokeAPI con
``python -m pipeline.pokemon_facts``.
"""

from __future__ import annotations

import json
import random
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Any

Question = dict[str, Any]
Facts = Mapping[str, Mapping[str, list[str]]]

# Los números falsos de la Pokédex quedan a esta distancia como mucho.
NUMBER_SPREAD = 20


# Textos de las preguntas por idioma. Los tipos están en español en los datos.
TEXTS: dict[str, dict[str, str]] = {
    "es": {
        "type": "¿De qué tipo es {name}?",
        "one_type": "¿Cuál de estos es uno de los tipos de {name}?",
        "family": "¿Cuál de estos es de la familia evolutiva de {name}?",
        "number": "¿Qué número tiene {name} en la Pokédex?",
    },
    "en": {
        "type": "What type is {name}?",
        "one_type": "Which of these is one of the types of {name}?",
        "family": "Which of these is in the same evolution family as {name}?",
        "number": "What is the Pokédex number of {name}?",
    },
}

TYPES_EN = {
    "Acero": "Steel",
    "Agua": "Water",
    "Bicho": "Bug",
    "Dragón": "Dragon",
    "Eléctrico": "Electric",
    "Fantasma": "Ghost",
    "Fuego": "Fire",
    "Hada": "Fairy",
    "Hielo": "Ice",
    "Lucha": "Fighting",
    "Normal": "Normal",
    "Planta": "Grass",
    "Psíquico": "Psychic",
    "Roca": "Rock",
    "Tierra": "Ground",
    "Veneno": "Poison",
    "Volador": "Flying",
}


def _text(lang: str, key: str, **values: str) -> str:
    return TEXTS.get(lang, TEXTS["es"])[key].format(**values)


def type_name(spanish: str, lang: str) -> str:
    """Nombre de un tipo en ``lang`` (los datos lo traen en español)."""
    return TYPES_EN.get(spanish, spanish) if lang == "en" else spanish


def load_pokemon_facts(path: Path) -> dict[str, dict[str, list[str]]]:
    """Tipos y familia de cada Pokémon (ver ``pokemon_facts.py``)."""
    return json.loads(Path(path).read_text(encoding="utf-8"))["pokemon"]


def _shuffled(correct: str, wrong: list[str], rng: random.Random) -> Question:
    options = [correct, *wrong]
    rng.shuffle(options)
    return {"options": options, "answer": options.index(correct)}


def type_question(
    answer: str, name: str, facts: Facts, rng: random.Random, lang: str = "es"
) -> Question | None:
    """De qué tipo es (o cuál es uno de sus tipos, si tiene dos)."""
    own = list(facts[answer]["types"])
    all_types = sorted({t for f in facts.values() for t in f["types"]})
    others = [t for t in all_types if t not in own]
    if not own or len(others) < 3:
        return None
    question = _text(lang, "type" if len(own) == 1 else "one_type", name=name)
    shuffled = _shuffled(rng.choice(own), rng.sample(others, 3), rng)
    return {
        "question": question,
        "options": [type_name(t, lang) for t in shuffled["options"]],
        "answer": shuffled["answer"],
    }


def family_question(
    answer: str,
    name: str,
    names: Mapping[str, str],
    facts: Facts,
    rng: random.Random,
    lang: str = "es",
) -> Question | None:
    """Cuál es de su familia evolutiva (o, si no tiene, qué número tiene)."""
    family = [p for p in facts[answer]["family"] if p in names]
    if not family:
        return number_question(answer, name, rng, lang)
    outsiders = [p for p in facts if p != answer and p not in family and p in names]
    own_types = set(facts[answer]["types"])
    similar = [p for p in outsiders if own_types & set(facts[p]["types"])]
    # Sin repetir familias entre las falsas: si no, dos opciones se delatan entre sí.
    wrong: list[str] = []
    for pool in (similar, outsiders):
        for p in rng.sample(pool, len(pool)):
            if len(wrong) == 3:
                break
            if p not in wrong and not set(facts[p]["family"]) & set(wrong):
                wrong.append(p)
    if len(wrong) < 3:
        return None
    shuffled = _shuffled(rng.choice(family), wrong, rng)
    return {
        "question": _text(lang, "family", name=name),
        "options": [names[p] for p in shuffled["options"]],
        "answer": shuffled["answer"],
    }


def number_question(
    answer: str, name: str, rng: random.Random, lang: str = "es"
) -> Question | None:
    """Qué número tiene en la Pokédex (opciones cercanas)."""
    if not answer.isdigit():
        return None
    n = int(answer)
    near = [k for k in range(max(1, n - NUMBER_SPREAD), n + NUMBER_SPREAD + 1) if k != n]
    near = [k for k in near if k <= 151]
    if len(near) < 3:
        return None
    shuffled = _shuffled(f"#{n:03d}", [f"#{k:03d}" for k in rng.sample(near, 3)], rng)
    # Los números se leen mejor en orden.
    options = sorted(shuffled["options"])
    return {
        "question": _text(lang, "number", name=name),
        "options": options,
        "answer": options.index(f"#{n:03d}"),
    }


def pokemon_questions(
    answer: str, names: Mapping[str, str], facts: Facts, seed: str, lang: str = "es"
) -> list[Question]:
    """Preguntas extra de un Pokémon (puede haber menos de dos si faltan datos)."""
    name = names.get(answer)
    if name is None or answer not in facts:
        return []
    rng = random.Random(seed)
    questions = [
        type_question(answer, name, facts, rng, lang),
        family_question(answer, name, names, facts, rng, lang),
    ]
    return [q for q in questions if q is not None]


def bonus_builder(
    kind: str | None, names: Mapping[str, str], facts_path: Path | None, lang: str = "es"
) -> Callable[[str, str], list[Question]] | None:
    """Función ``(respuesta, semilla) -> preguntas`` para una colección, o ``None``.

    Raises:
        ValueError: Si el tipo no existe o falta el archivo de datos.
    """
    if not kind:
        return None
    if kind != "pokemon":
        raise ValueError(f"Tipo de preguntas extra desconocido: {kind!r}")
    if facts_path is None or not Path(facts_path).exists():
        raise ValueError("Faltan los datos de Pokémon (python -m pipeline.pokemon_facts).")
    facts = load_pokemon_facts(facts_path)
    return lambda answer, seed: pokemon_questions(answer, names, facts, seed, lang)
