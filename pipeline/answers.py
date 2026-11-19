"""Lista de respuestas para el autocompletado.

Debe incluir *todas* las respuestas posibles de la colección, no solo las que
salen en el juego: si la lista solo tuviera los 55 países jugables, sería una pista.

Formato de ``answers.json`` (versión 1)::

    {
      "version": 1,
      "collection": "countries",
      "answers": [
        {"id": "ITA", "name": "Italia", "aliases": []},
        {"id": "USA", "name": "Estados Unidos", "aliases": ["EE. UU.", "EEUU", "USA"]},
        ...
      ]
    }

Las respuestas se ordenan por nombre normalizado. El frontend compara usando la
misma normalización que :func:`normalize` (minúsculas, sin tildes, espacios simples).
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from pipeline.config import Collection

FORMAT_VERSION = 1


@dataclass(frozen=True)
class Answer:
    """Una respuesta posible."""

    id: str
    name: str
    aliases: tuple[str, ...] = ()


def normalize(text: str) -> str:
    """Normaliza un texto para comparar: sin tildes, minúsculas y espacios simples.

    Ejemplos: ``"  Japón "`` -> ``"japon"``; ``"EE. UU."`` -> ``"ee. uu."``.
    """
    decomposed = unicodedata.normalize("NFD", text)
    no_marks = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", no_marks).strip().casefold()


def build_answers(
    collection: Collection, provider_names: Mapping[str, str] | None = None
) -> list[Answer]:
    """Construye la lista de respuestas de una colección.

    Orden de prioridad para el nombre: ``items`` > ``answers.rename`` > proveedor.
    Los alias se acumulan de ``items``, ``answers.aliases`` y ``answers.extra``.

    Args:
        collection: Colección con su bloque ``answers``.
        provider_names: ``{id: nombre}`` del proveedor (si ``from_provider`` es true).

    Returns:
        Respuestas ordenadas por nombre normalizado.

    Raises:
        ValueError: Si dos respuestas distintas comparten un nombre o alias
            normalizado (el jugador no podría distinguirlas).
    """
    cfg: Mapping[str, Any] = collection.answers
    names: dict[str, str] = {}
    aliases: dict[str, list[str]] = {}

    if cfg.get("from_provider") and provider_names:
        names.update(provider_names)
    for fid in cfg.get("exclude", []):
        names.pop(fid, None)
    names.update(cfg.get("rename", {}))
    for extra in cfg.get("extra", []):
        names[extra["id"]] = extra["name"]
        aliases.setdefault(extra["id"], []).extend(extra.get("aliases", []))
    for fid, extra_aliases in cfg.get("aliases", {}).items():
        aliases.setdefault(fid, []).extend(extra_aliases)
    for item in collection.items:
        names[item.id] = item.name
        aliases.setdefault(item.id, []).extend(item.aliases)

    unknown = sorted(set(aliases) - set(names))
    if unknown:
        raise ValueError(f"Alias para ids que no están en la lista de respuestas: {unknown}")

    answers = []
    for fid, name in names.items():
        # Quita alias repetidos o iguales al nombre, conservando el orden.
        seen = {normalize(name)}
        unique = []
        for alias in aliases.get(fid, []):
            if normalize(alias) not in seen:
                seen.add(normalize(alias))
                unique.append(alias)
        answers.append(Answer(id=fid, name=name, aliases=tuple(unique)))

    check_collisions(answers)
    return sorted(answers, key=lambda a: normalize(a.name))


def check_collisions(answers: list[Answer]) -> None:
    """Comprueba que ningún nombre o alias normalizado apunte a dos respuestas.

    Raises:
        ValueError: Con la lista de colisiones encontradas.
    """
    owner: dict[str, str] = {}
    collisions = []
    for answer in answers:
        for text in (answer.name, *answer.aliases):
            key = normalize(text)
            if key in owner and owner[key] != answer.id:
                collisions.append(f"{text!r} ({owner[key]} y {answer.id})")
            owner.setdefault(key, answer.id)
    if collisions:
        raise ValueError("Nombres ambiguos en las respuestas: " + ", ".join(collisions))


def answers_to_dict(collection_id: str, answers: list[Answer]) -> dict[str, Any]:
    """Representación JSON de la lista de respuestas."""
    return {
        "version": FORMAT_VERSION,
        "collection": collection_id,
        "answers": [{"id": a.id, "name": a.name, "aliases": list(a.aliases)} for a in answers],
    }
