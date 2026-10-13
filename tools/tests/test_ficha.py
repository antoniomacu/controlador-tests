import time

import pytest

from ficha import (
    FichaError,
    build_fields,
    ficha_id,
    merge_prepared,
    mmss,
    render,
    temas_from_test_id,
)


@pytest.fixture(autouse=True)
def madrid_time(monkeypatch):
    """Fichas use local time; pin the zone so results do not depend on the machine."""
    monkeypatch.setenv("TZ", "Europe/Madrid")
    time.tzset()
    yield
    monkeypatch.undo()
    time.tzset()


def item(n, key, ans, *, doubt=False, stuck=False, secs=30, at=None, cause=None):
    return {
        "q": f"SYN-T4-001#{n}",
        "key": key,
        "ans": ans,
        "doubt": doubt,
        "stuck": stuck,
        "secs": secs,
        "first_answered_at_secs": at,
        "cause": cause,
    }


def make_attempt(**overrides):
    items = [
        item(1, "c", "c", at=40),
        item(2, "a", "b", doubt=True, at=95, cause="Confundí dos conceptos"),
        item(3, "d", None, stuck=True),
        item(4, "b", "c", at=200, cause="Confundí dos conceptos"),
        item(5, "a", "a", doubt=True, at=230, cause="Dudé entre dos opciones"),
    ]
    attempt = {
        "uuid": "u-1",
        "test_id": "SYN-T4-001",
        "kind": "fixed",
        "mode": "exam",
        "attempt": 1,
        "started": "2026-10-14T20:30:00+02:00",
        "finished": "2026-10-14T20:47:12+02:00",
        "limit_min": 20,
        "total_secs": 1032,
        "status": "finished",
        "items": items,
    }
    attempt.update(overrides)
    return attempt


def test_mmss():
    assert mmss(0) == "00:00"
    assert mmss(1032) == "17:12"
    assert mmss(6000) == "100:00"


def test_ficha_id_suffix_for_repeats():
    assert ficha_id(make_attempt()) == "SYN-T4-001"
    assert ficha_id(make_attempt(attempt=3)) == "SYN-T4-001-i3"


def test_temas_from_test_id():
    assert temas_from_test_id("SYN-T4-003") == [4]
    assert temas_from_test_id("SYN-T12-001") == [1, 2]
    assert temas_from_test_id("RND-T349-20261014-203015") == [3, 4, 9]


def test_build_fields_matches_ficha_format():
    fields = build_fields(make_attempt(), {"SYN-T4-001#1": "t4-a", "SYN-T4-001#2": "t4-a"})
    assert fields == {
        "id": "SYN-T4-001",
        "categoria": "SYN",
        "dificultad": "SINTETICO",
        "modo": "Bloque",
        "intento": "1",
        "fecha": "2026-10-14",
        "preguntas": "5",
        "limite": "20",
        "tiempo": "17:12",
        "tramos": "",
        "corte": "50",
        "respuestas": "CB-CA",
        "clave": "CADBA",
        "dudas": "2, 5",
        "atascos": "3",
        "subtipos": "1,2: t4-a",
        "causas": "2,4: Confundí dos conceptos; 5: Dudé entre dos opciones",
        "sintetico": "si",
        "observaciones": "Modo examen (corte duro). Inicio 20:30, fin 20:47. Hecho en la app.",
    }


def test_tramos_every_tenth_answer_in_answer_order():
    items = [item(n, "a", "a", at=1000 - n * 10) for n in range(1, 26)]
    fields = build_fields(make_attempt(items=items), {})
    # answers at 750, 760, ... 990 s: the 10th is 840 s and the 20th is 940 s
    assert fields["tramos"] == "14:00, 15:40"


def test_random_mixed_practice_attempt():
    attempt = make_attempt(test_id="RND-T34-20261014-203015", kind="random", mode="practice")
    fields = build_fields(attempt, {})
    assert fields["modo"] == "Mixto"
    assert fields["observaciones"].startswith("Modo práctica (límite blando).")
    assert fields["subtipos"] == ""


def test_unknown_cause_is_rejected():
    attempt = make_attempt()
    attempt["items"][1]["cause"] = "Inventada"
    with pytest.raises(FichaError, match="unknown cause 'Inventada'"):
        build_fields(attempt, {})


def test_render_aligns_and_leaves_empty_fields_bare():
    text = render({"id": "X", "tramos": ""}, "\n# X\n")
    assert text == "---\nid:            X\ntramos:\n---\n\n# X\n"


PREPARED = """---
id:            SYN-T4-001
categoria:     SYN
dificultad:    SINTETICO
modo:          Bloque
intento:       1
fecha:
preguntas:     5
corte:         50

respuestas:
clave:         CADBA

subtipos:      1: t4-forma; 2-5: t4-otra
notas:
sintetico:     si
observaciones:
---

# SYN-T4-001 — ficha de registro

Cuerpo preparado.
"""


def test_merge_prepared_keeps_body_and_prepared_subtipos():
    merged = merge_prepared(PREPARED, build_fields(make_attempt(), {}))
    assert merged.endswith("\n# SYN-T4-001 — ficha de registro\n\nCuerpo preparado.\n")
    assert "subtipos:      1: t4-forma; 2-5: t4-otra\n" in merged
    assert "respuestas:    CB-CA\n" in merged
    assert "notas:\n" in merged
    assert merged.index("categoria:") < merged.index("respuestas:")


def test_merge_prepared_refuses_filled_ficha():
    filled = PREPARED.replace("respuestas:\n", "respuestas:    CCCCC\n")
    with pytest.raises(FichaError, match="already has respuestas"):
        merge_prepared(filled, build_fields(make_attempt(), {}))


def test_merge_prepared_refuses_key_mismatch():
    stale = PREPARED.replace("clave:         CADBA", "clave:         CADBB")
    with pytest.raises(FichaError, match="key in prepared ficha differs"):
        merge_prepared(stale, build_fields(make_attempt(), {}))


def test_utc_timestamps_from_the_app_become_local_date_and_times():
    attempt = make_attempt(started="2026-10-13T22:30:00Z", finished="2026-10-13T22:47:12Z")
    fields = build_fields(attempt, {})
    assert fields["fecha"] == "2026-10-14"
    assert fields["observaciones"].endswith("Inicio 00:30, fin 00:47. Hecho en la app.")
