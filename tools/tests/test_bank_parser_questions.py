from pathlib import Path

import pytest

from bank_parser import (
    ParseError,
    parse_front_matter,
    parse_questions,
    parse_title,
    split_sections,
)

FIX = Path(__file__).parent / "fixtures"
MODERN = (FIX / "SYN-T9-001.md").read_text(encoding="utf-8")
LEGACY = (FIX / "SYN-T8-001.md").read_text(encoding="utf-8")


def test_split_sections_uppercases_headings_and_ignores_preamble():
    sections = split_sections(LEGACY)
    assert list(sections) == ["TEST", "CLAVE", "SOLUCIONES RAZONADAS", "CÓMO REGISTRARLO"]
    assert "**1.** Legado uno:" in sections["TEST"]


def test_front_matter_parsed_and_absent():
    front = parse_front_matter(MODERN)
    assert front["alcance"] == "T9"
    assert front["tiempo"] == "2 min"
    assert front["aprobado_referencia"] == "1/2"
    assert parse_front_matter(LEGACY) == {}


def test_front_matter_strips_quotes():
    assert parse_front_matter('---\nfuente: "a.pdf"\n---\n') == {"fuente": "a.pdf"}


def test_title_after_dash_or_whole_heading():
    assert parse_title(MODERN) == "Tema 9: Prueba"
    assert parse_title("# Solo título\n") == "Solo título"
    assert parse_title("sin título\n") == ""


def test_questions_multiline_stem_and_option_continuation():
    questions = parse_questions(split_sections(MODERN)["TEST"])
    assert [q.number for q in questions] == [1, 2]
    assert questions[0].stem == "Pregunta uno de prueba, con el enunciado en dos líneas:"
    assert questions[0].options == {
        "a": "Opción A1",
        "b": "Opción B1",
        "c": "Opción C1",
        "d": "Opción D1",
    }
    assert questions[1].options["b"] == "Opción B2 que continúa"
    assert questions[1].options["d"] == "Opción D2"  # trailing note ignored


def test_question_missing_an_option_is_an_error():
    section = "**1.** Q\n\na) x\nb) y\nc) z\n"
    with pytest.raises(ParseError, match="question 1 has options abc"):
        parse_questions(section)


def test_non_consecutive_numbers_are_an_error():
    section = "**1.** Q\na) 1\nb) 2\nc) 3\nd) 4\n\n**3.** R\na) 1\nb) 2\nc) 3\nd) 4\n"
    with pytest.raises(ParseError, match="not numbered 1..n"):
        parse_questions(section)
