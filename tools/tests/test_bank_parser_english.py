from pathlib import Path

import pytest

from bank_parser import ParseError, parse_english_solutions, split_sections

FIX = Path(__file__).parent / "fixtures"


def sols(name):
    text = (FIX / name).read_text(encoding="utf-8")
    return parse_english_solutions(split_sections(text)["SOLUCIONES RAZONADAS"])


def test_legacy_layout():
    s = sols("SYN-ING-901.md")
    assert sorted(s) == [1, 2]
    assert (s[1].answer, s[1].level, s[1].subtipo, s[1].ref) == (
        "a",
        "N1",
        "morfo-prefijo-negativo",
        "ING-18-003 Q33",
    )
    assert s[2].explanation == "*Tell* lleva persona."


def test_modern_layout_with_exam_anchor():
    one = sols("SYN-ING-902.md")[1]
    assert (one.answer, one.level, one.subtipo, one.ref) == (
        "a",
        None,
        "morfo-rise-raise-arouse",
        "ING-24-002 Q67",
    )
    assert one.explanation.startswith("**Ancla:**")
    assert "> *Prices" not in one.explanation
    assert "**La regla.**" in one.explanation


def test_modern_layout_without_exam_anchor_uses_subtipo_as_ref():
    two = sols("SYN-ING-902.md")[2]
    assert (two.answer, two.subtipo, two.ref) == (
        "b",
        "morfo-prefijo-negativo",
        "morfo-prefijo-negativo",
    )


def test_unknown_layout_is_an_error():
    section = "Intro.\n\n---\n\n**Solución 1:** a\n\nTexto.\n"
    with pytest.raises(ParseError, match="no English solution blocks"):
        parse_english_solutions(section)


def test_duplicate_number_is_an_error():
    block = "### 1. a) x\n\n**Ancla:** `lexico-x`.\n"
    with pytest.raises(ParseError, match="solution 1 appears twice"):
        parse_english_solutions(f"{block}\n---\n\n{block}")


def test_legacy_plural_anchors_keep_the_first_exam_anchor():
    block = (
        "**3. c) economical** · N3 · `morfo-familia-lexica-confundible` · "
        "[anclas: ING-26-001 Q66 y ING-26-002 Q63]\n\nTexto.\n"
    )
    s = parse_english_solutions(block)[3]
    assert (s.answer, s.subtipo, s.ref) == (
        "c",
        "morfo-familia-lexica-confundible",
        "ING-26-001 Q66",
    )
