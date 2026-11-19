"""Tests de puzzles, respuestas, calendario y del JSON generado por build."""

import json
from datetime import date
from pathlib import Path

import numpy as np
import pytest

from pipeline.answers import Answer, build_answers, check_collisions, normalize
from pipeline.build import build_collection
from pipeline.config import ScheduleSettings, Settings, parse_collection
from pipeline.fourier import evaluate
from pipeline.puzzle import build_puzzle, puzzle_id, puzzle_to_dict
from pipeline.schedule import build_schedule, shuffled_cycles
from pipeline.sources.base import Shape

LEVELS = (2, 4, 8, 16, 32, 64)


# --------------------------------------------------------------------------- #
# Utilidades
# --------------------------------------------------------------------------- #
def blob(item_id: str, seed: int) -> Shape:
    """Figura cerrada aleatoria pero suave (como un país muy simplificado)."""
    rng = np.random.default_rng(seed)
    t = np.linspace(0, 2 * np.pi, 300, endpoint=False)
    r = 1 + sum(rng.uniform(0, 0.2) * np.cos(k * t + rng.uniform(0, 6)) for k in range(2, 9))
    return Shape(item_id, np.column_stack([r * np.cos(t), r * np.sin(t)]), "test")


class FakeProvider:
    """Proveedor mínimo que cumple el protocolo ShapeProvider."""

    def __init__(self, ids):
        self._shapes = {fid: blob(fid, i) for i, fid in enumerate(ids)}

    def available_ids(self):
        return sorted(self._shapes)

    def get_shape(self, item_id):
        return self._shapes[item_id]

    def names(self):
        return {fid: f"País {fid}" for fid in self._shapes}


def make_settings(tmp_path: Path, days: int = 30) -> Settings:
    return Settings(
        root=tmp_path,
        raw_dir=tmp_path / "raw",
        collections_dir=tmp_path / "collections",
        web_data_dir=tmp_path / "web",
        preview_dir=tmp_path / "preview",
        datasets={},
        n_points=512,
        levels=LEVELS,
        id_salt="test",
        schedule=ScheduleSettings(start_date=date(2026, 12, 1), days=days, seed=7),
    )


def make_collection(**answers_cfg):
    return parse_collection(
        {
            "id": "test",
            "title": "Test",
            "emoji": "🧪",
            "provider": {"type": "fake"},
            "items": [
                {"id": "AAA", "name": "Álbania", "aliases": ["Alb"]},
                {"id": "BBB", "name": "Bélgica"},
                {"id": "CCC", "name": "Chequia", "aliases": ["República Checa"]},
            ],
            "answers": {"from_provider": True, **answers_cfg},
        }
    )


def assert_valid_puzzle(data: dict) -> None:
    """Comprueba el formato de un puzzle (versión 1)."""
    assert set(data) == {
        "version", "id", "collection", "answer", "levels", "errors", "terms", "source", "colors"
    }  # fmt: skip
    assert data["version"] == 1
    assert data["levels"] == sorted(data["levels"])
    assert len(data["errors"]) == len(data["levels"])
    assert all(0 <= e <= 1 for e in data["errors"])
    assert len(data["terms"]) == max(data["levels"]) + 1
    assert data["terms"][0][0] == 0
    for freq, re_, im in data["terms"]:
        assert isinstance(freq, int)
        assert isinstance(re_, float | int) and isinstance(im, float | int)
    mags = [abs(complex(r, i)) for _, r, i in data["terms"][1:]]
    assert all(a >= b - 1e-4 for a, b in zip(mags, mags[1:], strict=False))


# --------------------------------------------------------------------------- #
# Puzzle
# --------------------------------------------------------------------------- #
def test_puzzle_formato_y_json():
    data = puzzle_to_dict(build_puzzle(blob("ITA", 1), "countries", LEVELS, 512, salt="s"))
    assert_valid_puzzle(data)
    assert json.loads(json.dumps(data)) == data
    assert data["answer"] == "ITA"


def test_puzzle_errores_no_crecen():
    puzzle = build_puzzle(blob("X", 2), "c", LEVELS, 512)
    assert all(a >= b for a, b in zip(puzzle.errors, puzzle.errors[1:], strict=False))


def test_coeficientes_guardados_reconstruyen_la_figura():
    """Los términos redondeados del JSON siguen dibujando la figura normalizada."""
    from pipeline.fourier import FourierSeries

    data = puzzle_to_dict(build_puzzle(blob("X", 3), "c", LEVELS, 512))
    terms = np.array(data["terms"])
    series = FourierSeries(terms[:, 0].astype(int), terms[:, 1] + 1j * terms[:, 2])
    z = evaluate(series, np.linspace(0, 1, 200, endpoint=False))
    assert np.abs(z).max() <= 1.05  # cabe (casi) en el círculo unidad


def test_puzzle_id_estable_y_opaco():
    a = puzzle_id("countries", "ITA", "sal")
    assert a == puzzle_id("countries", "ITA", "sal")
    assert a != puzzle_id("countries", "ITA", "otra")
    assert "ITA" not in a and len(a) == 10


def test_puzzle_conserva_colores_de_la_bandera():
    shape = Shape(
        "FRA",
        blob("FRA", 5).points,
        "flag-icons-mit-simplified",
        meta={"colors": ["#002395", "#ffffff", "#ed2939"]},
    )
    data = puzzle_to_dict(build_puzzle(shape, "flags", LEVELS, 512))
    assert data["colors"] == ["#002395", "#ffffff", "#ed2939"]


# --------------------------------------------------------------------------- #
# Respuestas
# --------------------------------------------------------------------------- #
def test_normalize():
    assert normalize("  Japón ") == "japon"
    assert normalize("REPÚBLICA   Checa") == "republica checa"
    assert normalize("Côte d'Ivoire") == "cote d'ivoire"


def test_answers_combina_fuentes_y_prioridades():
    collection = make_collection(
        exclude=["ZZZ"],
        rename={"DDD": "Dinamarca"},
        aliases={"DDD": ["Danmark"]},
        extra=[{"id": "EEE", "name": "Andorra"}],
    )
    provider_names = {"AAA": "Nombre proveedor", "DDD": "Dinamarca NE", "ZZZ": "Excluido"}
    answers = {a.id: a for a in build_answers(collection, provider_names)}
    assert answers["AAA"].name == "Álbania"  # items gana al proveedor
    assert answers["DDD"].name == "Dinamarca"  # rename
    assert answers["DDD"].aliases == ("Danmark",)
    assert "EEE" in answers and "ZZZ" not in answers
    names = [normalize(a.name) for a in build_answers(collection, provider_names)]
    assert names == sorted(names)


def test_answers_detecta_ambiguedades():
    with pytest.raises(ValueError, match="ambiguos"):
        check_collisions([Answer("A", "Congo"), Answer("B", "RD Congo", aliases=("congo",))])


def test_answers_rechaza_alias_huerfanos():
    with pytest.raises(ValueError, match="Alias"):
        build_answers(make_collection(aliases={"NOPE": ["x"]}), {})


# --------------------------------------------------------------------------- #
# Calendario
# --------------------------------------------------------------------------- #
def test_calendario_determinista_y_por_ciclos():
    ids = [f"p{i}" for i in range(10)]
    order = shuffled_cycles(ids, 35, seed=1)
    assert order == shuffled_cycles(list(reversed(ids)), 35, seed=1)
    assert order != shuffled_cycles(ids, 35, seed=2)
    for start in range(0, 30, 10):  # cada ciclo completo contiene todos una vez
        assert sorted(order[start : start + 10]) == sorted(ids)
    assert all(a != b for a, b in zip(order, order[1:], strict=False))


def test_calendario_formato():
    sched = build_schedule("c", ["a", "b", "c"], date(2026, 12, 30), 5, seed=0)
    days = sched["days"]
    assert [d["date"] for d in days] == [
        "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"
    ]  # fmt: skip
    assert [d["number"] for d in days] == [1, 2, 3, 4, 5]
    assert sched["timezone"] == "Europe/Madrid"


# --------------------------------------------------------------------------- #
# Build completo
# --------------------------------------------------------------------------- #
def test_build_genera_archivos_validos(tmp_path):
    settings = make_settings(tmp_path)
    collection = make_collection()
    out = tmp_path / "web" / "test"
    (out / "puzzles").mkdir(parents=True)
    (out / "puzzles" / "huerfano.json").write_text("{}")

    result = build_collection(collection, FakeProvider(["AAA", "BBB", "CCC"]), settings, out)

    files = sorted((out / "puzzles").glob("*.json"))
    assert len(files) == 3  # el huérfano se ha borrado
    for f in files:
        data = json.loads(f.read_text(encoding="utf-8"))
        assert_valid_puzzle(data)
        assert f.stem == data["id"]

    answers = json.loads((out / "answers.json").read_text(encoding="utf-8"))
    assert {a["id"] for a in answers["answers"]} == {"AAA", "BBB", "CCC"}

    schedule = json.loads((out / "schedule.json").read_text(encoding="utf-8"))
    assert len(schedule["days"]) == 30
    assert {d["puzzle"] for d in schedule["days"]} == {p.id for p in result.puzzles}


def test_build_solo_juega_los_items_de_la_coleccion(tmp_path):
    # DDD está en el proveedor pero no en items: es respuesta posible, no puzzle.
    settings = make_settings(tmp_path)
    out = tmp_path / "web" / "test"
    result = build_collection(
        make_collection(), FakeProvider(["AAA", "BBB", "CCC", "DDD"]), settings, out
    )
    assert {p.answer for p in result.puzzles} == {"AAA", "BBB", "CCC"}


def test_build_rechaza_dibujos_repetidos(tmp_path):
    provider = FakeProvider(["AAA", "BBB", "CCC"])
    provider._shapes["BBB"] = Shape("BBB", provider._shapes["AAA"].points, "test")
    with pytest.raises(ValueError, match="AAA, BBB"):
        build_collection(make_collection(), provider, make_settings(tmp_path), tmp_path / "o")


def test_build_acepta_mismo_dibujo_con_colores_distintos(tmp_path):
    # Como Francia e Italia: mismo contorno, pero los colores son la pista.
    provider = FakeProvider(["AAA", "BBB", "CCC"])
    points = provider._shapes["AAA"].points
    provider._shapes["AAA"] = Shape("AAA", points, "test", meta={"colors": ["#0000ff"]})
    provider._shapes["BBB"] = Shape("BBB", points, "test", meta={"colors": ["#00ff00"]})
    result = build_collection(make_collection(), provider, make_settings(tmp_path), tmp_path / "o")
    assert len(result.puzzles) == 3
