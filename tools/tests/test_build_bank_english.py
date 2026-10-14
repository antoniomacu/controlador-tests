from pathlib import Path

import pytest

from bank_parser import ParseError
from build_bank import build_bank, build_english_test

FIX = Path(__file__).parent / "fixtures"
LEGACY = (FIX / "SYN-ING-901.md").read_text(encoding="utf-8")
MODERN = (FIX / "SYN-ING-902.md").read_text(encoding="utf-8")
REAL_ING = Path("~/Documents/controlador/Primer Examen/Ingles/tests/SINTETICOS").expanduser()
REAL_IVAULT = Path("~/Documents/TheMind/ATC/ingles/20-REGISTRO").expanduser()


def test_legacy_english_test():
    test, qs = build_english_test("SYN-ING-901", LEGACY, ["a", "b"], {})
    assert (test["subject"], test["scope"], test["limit_min"], test["pass_ref"]) == (
        "ingles",
        "ING",
        2,
        1,
    )
    assert test["title"] == "Inglés, legado de prueba"
    q = qs[0]
    assert (q["subject"], q["tema"], q["group"], q["ref"], q["level"]) == (
        "ingles",
        None,
        "morfo",
        "ING-18-003 Q33",
        "N1",
    )
    assert qs[1]["group"] == "lexico"


def test_ficha_subtipos_take_priority():
    _, qs = build_english_test("SYN-ING-902", MODERN, ["a", "b"], {2: "lexico-sinonimo-preciso"})
    assert (qs[1]["subtipo"], qs[1]["group"]) == ("lexico-sinonimo-preciso", "lexico")
    assert qs[1]["ref"] == "morfo-prefijo-negativo"


def test_key_mismatch_aborts():
    with pytest.raises(ParseError, match="SYN-ING-902: CLAVE section disagrees"):
        build_english_test("SYN-ING-902", MODERN, ["a", "c"], {})


def test_question_without_area_aborts():
    broken = MODERN.replace("`morfo-prefijo-negativo`", "`sin-area`")
    with pytest.raises(ParseError, match="SYN-ING-902 question 2: no subtipo with a valid area"):
        build_english_test("SYN-ING-902", broken, ["a", "b"], {})


def test_bank_with_both_subjects(tmp_path):
    t, i = tmp_path / "t", tmp_path / "i"
    t.mkdir()
    i.mkdir()
    for name in ("SYN-ING-901.md", "SYN-ING-902.md"):
        (i / name).write_text((FIX / name).read_text(encoding="utf-8"), encoding="utf-8")
    bank = build_bank(
        t, FIX / "claves", FIX / "fichas", "x", ingles=(i, FIX / "claves-ing", FIX / "fichas-ing")
    )
    assert [x["id"] for x in bank["tests"]] == ["SYN-ING-901", "SYN-ING-902"]
    assert bank["groups"]["ingles"] == {"lexico": "Léxico y colocación", "morfo": "Morfología"}


@pytest.mark.skipif(not REAL_ING.exists(), reason="real English tests not here")
def test_all_real_english_tests_build(tmp_path):
    empty = tmp_path / "none"
    empty.mkdir()
    bank = build_bank(
        empty,
        empty,
        empty,
        "now",
        ingles=(REAL_ING, REAL_IVAULT / "claves", REAL_IVAULT / "fichas"),
    )
    assert len(bank["tests"]) >= 4
    for q in bank["questions"]:
        assert q["explanation"] and q["group"] and q["ref"], q["id"]
