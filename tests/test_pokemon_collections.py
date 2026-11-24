"""Tests del generador de modos de Pokémon (una colección por generación)."""

from pipeline.pokemon_collections import aliases, build_collections


def test_alias_sin_signos_y_colecciones_por_generacion():
    assert aliases("122", "Mr. Mime") == ["Mr Mime", "Mister Mime"]
    assert aliases("083", "Farfetch’d") == ["Farfetch'd", "Farfetchd"]
    assert aliases("029", "Nidoran♀") == ["Nidoran hembra", "Nidoran F"]
    assert aliases("025", "Pikachu") == []
    names = {"025": "Pikachu", "172": "Pichu", "1001": "Wo-Chien"}
    species = [
        {"id": "25", "generation_id": "1"},
        {"id": "172", "generation_id": "2"},
        {"id": "1001", "generation_id": "9"},
    ]
    cols = {c["id"]: c for c in build_collections(names, species)}
    assert list(cols) == ["gen1", "gen2", "gen9", "all"]
    assert [i["id"] for i in cols["all"]["items"]] == ["025", "172", "1001"]
    assert cols["gen9"]["menu"]["detail"] == "#1001–#1001"
    assert cols["gen2"]["i18n"]["en"]["menu"]["name"] == "Johto"
