import json

import pytest

from pipeline.bonus import TYPES_EN, bonus_builder, pokemon_questions
from pipeline.pokemon_facts import build_facts

FACTS = {
    "001": {"types": ["Planta", "Veneno"], "family": ["002"]},
    "002": {"types": ["Planta", "Veneno"], "family": ["001"]},
    "004": {"types": ["Fuego"], "family": ["005"]},
    "005": {"types": ["Fuego"], "family": ["004"]},
    "007": {"types": ["Agua"], "family": []},
    "010": {"types": ["Bicho"], "family": []},
    "016": {"types": ["Normal", "Volador"], "family": []},
    "025": {"types": ["Eléctrico"], "family": []},
    "027": {"types": ["Tierra"], "family": []},
    "035": {"types": ["Hada"], "family": []},
}
NAMES = {k: f"P{k}" for k in FACTS}


def test_single_type_question():
    kind, _ = pokemon_questions("004", NAMES, FACTS, "s")
    assert kind["question"] == "¿De qué tipo es P004?"
    assert kind["options"][kind["answer"]] == "Fuego"
    assert len(set(kind["options"])) == 4


def test_dual_type_question_has_only_one_of_its_types():
    kind, _ = pokemon_questions("001", NAMES, FACTS, "s")
    assert "uno de los tipos" in kind["question"]
    assert kind["options"][kind["answer"]] in {"Planta", "Veneno"}
    assert len({"Planta", "Veneno"} & set(kind["options"])) == 1


def test_family_question():
    _, family = pokemon_questions("004", NAMES, FACTS, "s")
    assert "familia evolutiva de P004" in family["question"]
    assert family["options"][family["answer"]] == "P005"
    assert len(set(family["options"])) == 4


def test_no_family_asks_for_the_number():
    _, number = pokemon_questions("025", NAMES, FACTS, "s")
    assert number["question"] == "¿Qué número tiene P025 en la Pokédex?"
    assert number["options"][number["answer"]] == "#025"
    assert number["options"] == sorted(number["options"])


def test_deterministic_and_unknown():
    assert pokemon_questions("004", NAMES, FACTS, "x") == pokemon_questions(
        "004", NAMES, FACTS, "x"
    )
    assert pokemon_questions("999", NAMES, FACTS, "x") == []


def test_builder(tmp_path):
    path = tmp_path / "facts.json"
    path.write_text(json.dumps({"pokemon": FACTS}), encoding="utf-8")
    assert bonus_builder(None, NAMES, path) is None
    assert len(bonus_builder("pokemon", NAMES, path)("004", "s")) == 2
    with pytest.raises(ValueError):
        bonus_builder("countries", NAMES, path)
    with pytest.raises(ValueError):
        bonus_builder("pokemon", NAMES, tmp_path / "missing.json")


def test_build_facts_from_pokeapi_tables():
    type_names = [
        {"type_id": "12", "local_language_id": "7", "name": "Planta"},
        {"type_id": "4", "local_language_id": "7", "name": "Veneno"},
        {"type_id": "4", "local_language_id": "9", "name": "Poison"},
    ]
    pokemon_types = [
        {"pokemon_id": "1", "type_id": "4", "slot": "2"},
        {"pokemon_id": "1", "type_id": "12", "slot": "1"},
        {"pokemon_id": "2", "type_id": "12", "slot": "1"},
    ]
    species = [
        {"id": "1", "evolution_chain_id": "1"},
        {"id": "2", "evolution_chain_id": "1"},
    ]
    facts = build_facts(type_names, pokemon_types, species, last_id=2)
    assert facts["001"] == {"types": ["Planta", "Veneno"], "family": ["002"]}


def test_questions_in_english_translate_types():
    es = pokemon_questions("001", NAMES, FACTS, "seed")
    en = pokemon_questions("001", NAMES, FACTS, "seed", "en")
    assert en[0]["question"].startswith("Which of these is one of the types of")
    assert {"Grass", "Poison"} & set(en[0]["options"])
    assert all(o in TYPES_EN.values() for o in en[0]["options"])
    # Mismas opciones y misma respuesta en los dos idiomas (misma semilla).
    assert [TYPES_EN[o] for o in es[0]["options"]] == en[0]["options"]
    assert es[0]["answer"] == en[0]["answer"]
