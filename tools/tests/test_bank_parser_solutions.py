from pathlib import Path

import pytest

from bank_parser import ParseError, parse_solutions, split_sections

FIX = Path(__file__).parent / "fixtures"


def solutions_of(name: str):
    text = (FIX / name).read_text(encoding="utf-8")
    return parse_solutions(split_sections(text)["SOLUCIONES RAZONADAS"])


def test_modern_layout():
    sols = solutions_of("SYN-T9-001.md")
    assert sorted(sols) == [1, 2]
    one = sols[1]
    assert (one.answer, one.cite, one.level) == ("c", "T9, pág. 3", "N1")
    assert one.explanation == "Explicación de la uno.\n\n*Por qué no las demás:* porque no."
    assert one.hook == "recuerda la C."
    two = sols[2]
    assert (two.answer, two.cite, two.level, two.hook) == ("a", "T9, págs. 4–5", "N3", None)


def test_legacy_layout_and_trailing_section_ignored():
    sols = solutions_of("SYN-T8-001.md")
    assert sorted(sols) == [1, 2]
    assert (sols[1].answer, sols[1].cite, sols[1].level) == ("b", "T8, pág. 1", "N2")
    assert sols[1].explanation == "Explicación legado uno."
    assert sols[2].hook == "gancho legado."


def test_duplicate_solution_number_is_an_error():
    block = "**1. a) x** · [T1, pág. 1] · N1\n\nTexto.\n"
    with pytest.raises(ParseError, match="solution 1 appears twice"):
        parse_solutions(f"{block}\n---\n\n{block}")


def test_modern_block_without_question_number_is_an_error():
    with pytest.raises(ParseError, match="no question number"):
        parse_solutions("**Respuesta: a) x** · [T1, pág. 1] · N1\n\nTexto.\n")
