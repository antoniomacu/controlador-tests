import json
from pathlib import Path

import pytest

from bank_parser import ParseError
from build_bank import build_bank, build_test, main, temas_of_scope

FIX = Path(__file__).parent / "fixtures"
MODERN = (FIX / "SYN-T9-001.md").read_text(encoding="utf-8")
LEGACY = (FIX / "SYN-T8-001.md").read_text(encoding="utf-8")
REAL_SYN = Path("~/Documents/controlador/Primer Examen/Temario/Tests/SINTETICOS").expanduser()
REAL_VAULT = Path("~/Documents/TheMind/ATC/teoria/20-REGISTRO").expanduser()


def test_temas_of_scope():
    assert temas_of_scope("T4") == [4]
    assert temas_of_scope("T12") == [1, 2]
    assert temas_of_scope("T78") == [7, 8]
    assert temas_of_scope("FULL") == list(range(1, 10))


def test_build_modern_test():
    test, questions = build_test("SYN-T9-001", MODERN, ["c", "a"], {1: "t9-uno", 2: "t9-dos"})
    assert test == {
        "id": "SYN-T9-001",
        "subject": "temario",
        "scope": "T9",
        "title": "Tema 9: Prueba",
        "questions": ["SYN-T9-001#1", "SYN-T9-001#2"],
        "limit_min": 2,
        "pass_ref": 1,
        "synthetic": True,
    }
    first = questions[0]
    assert first["id"] == "SYN-T9-001#1"
    assert first["tema"] == 9
    assert first["answer"] == "c"
    assert first["level"] == "N1"
    assert first["subtipo"] == "t9-uno"
    assert first["cite"] == "T9, pág. 3"
    assert first["hook"] == "recuerda la C."
    assert first["options"]["a"] == "Opción A1"


def test_legacy_test_uses_defaults_without_front_matter():
    test, questions = build_test("SYN-T8-001", LEGACY, ["b", "d"], {})
    assert (test["scope"], test["limit_min"], test["pass_ref"]) == ("T8", 2, 1)
    assert questions[1]["subtipo"] is None
    assert questions[1]["tema"] == 8


def test_key_file_mismatch_aborts():
    with pytest.raises(ParseError, match="SYN-T9-001: CLAVE section disagrees with claves file"):
        build_test("SYN-T9-001", MODERN, ["c", "b"], {})


def test_solution_answer_mismatch_aborts():
    broken = MODERN.replace("**Respuesta: a) Opción A2**", "**Respuesta: b) Opción B2**")
    with pytest.raises(ParseError, match="SYN-T9-001 question 2: solution says b, key says a"):
        build_test("SYN-T9-001", broken, ["c", "a"], {})


def test_missing_solution_aborts():
    broken = MODERN.split("**2.** *Pregunta dos de prueba*")[0]
    with pytest.raises(ParseError, match="SYN-T9-001: solutions found for"):
        build_test("SYN-T9-001", broken, ["c", "a"], {})


def test_declared_count_mismatch_aborts():
    broken = MODERN.replace("preguntas: 2", "preguntas: 20")
    with pytest.raises(ParseError, match="declares 20 questions but has 2"):
        build_test("SYN-T9-001", broken, ["c", "a"], {})


def test_mixed_scope_takes_tema_from_subtipo_prefix():
    text = MODERN.replace("alcance: T9", "alcance: T19")
    _, questions = build_test("SYN-T19-001", text, ["c", "a"], {1: "t1-x", 2: "t9-y"})
    assert [q["tema"] for q in questions] == [1, 9]


def test_mixed_scope_without_subtipo_aborts():
    text = MODERN.replace("alcance: T9", "alcance: T19")
    with pytest.raises(ParseError, match="question 1: mixed scope T19 needs a subtipo"):
        build_test("SYN-T19-001", text, ["c", "a"], {})


def test_build_bank_and_cli(tmp_path):
    syn = tmp_path / "syn"
    syn.mkdir()
    for name in ("SYN-T9-001.md", "SYN-T8-001.md"):
        (syn / name).write_text((FIX / name).read_text(encoding="utf-8"), encoding="utf-8")
    bank = build_bank(syn, FIX / "claves", FIX / "fichas", "2026-10-13T18:00:00+02:00")
    assert bank["schema"] == 1
    assert [t["id"] for t in bank["tests"]] == ["SYN-T8-001", "SYN-T9-001"]
    assert len(bank["questions"]) == 4

    out = tmp_path / "out" / "bank.json"
    args = ["--sinteticos", str(syn), "--claves", str(FIX / "claves")]
    args += ["--fichas", str(FIX / "fichas"), "--out", str(out)]
    assert main(args) == 0
    assert json.loads(out.read_text(encoding="utf-8"))["tests"][0]["id"] == "SYN-T8-001"


def test_cli_returns_1_and_writes_nothing_on_error(tmp_path, capsys):
    syn = tmp_path / "syn"
    syn.mkdir()
    (syn / "SYN-T9-001.md").write_text(MODERN, encoding="utf-8")
    claves = tmp_path / "claves"
    claves.mkdir()
    (claves / "SYN-T9-001.txt").write_text("DD", encoding="utf-8")
    out = tmp_path / "bank.json"
    args = ["--sinteticos", str(syn), "--claves", str(claves)]
    args += ["--fichas", str(tmp_path), "--out", str(out)]
    assert main(args) == 1
    assert "ERROR" in capsys.readouterr().err
    assert not out.exists()


def test_missing_key_file_aborts(tmp_path):
    syn = tmp_path / "syn"
    syn.mkdir()
    (syn / "SYN-T9-001.md").write_text(MODERN, encoding="utf-8")
    with pytest.raises(ParseError, match="SYN-T9-001: no key file"):
        build_bank(syn, tmp_path, tmp_path, "x")


@pytest.mark.skipif(not REAL_SYN.exists(), reason="real synthetic tests not on this machine")
def test_all_real_synthetic_tests_build():
    bank = build_bank(REAL_SYN, REAL_VAULT / "claves", REAL_VAULT / "fichas", "now")
    assert len(bank["tests"]) >= 9
    for question in bank["questions"]:
        assert question["explanation"], question["id"]
        assert question["cite"], question["id"]


def test_non_canonical_alcance_falls_back_to_the_id():
    text = MODERN.replace("alcance: T9", "alcance: T1 + T9")
    test, _ = build_test("SYN-T19-001", text, ["c", "a"], {1: "t1-x", 2: "t9-y"})
    assert test["scope"] == "T19"
