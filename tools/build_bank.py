"""Build ``bank.json`` for the controlador-tests app from the synthetic Temario tests.

Usage (from ``tools/``)::

    uv run python build_bank.py            # real paths, writes app-sync/bank.json
    uv run python build_bank.py --out /tmp/bank.json

Every test is cross-checked before anything is written: the ``## CLAVE`` section must match the
archived ``claves/[ID].txt``; every solution's letter must match the key; question, key and
solution counts must agree with each other and with the declared ``preguntas``. The first
inconsistency aborts the whole build, so a bank with a wrong key can never reach the phone.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

from bank_parser import (
    ParseError,
    parse_front_matter,
    parse_groups,
    parse_key,
    parse_key_file,
    parse_questions,
    parse_solutions,
    parse_title,
    split_sections,
)

ROOT = Path("~/Documents/controlador/Primer Examen").expanduser()
VAULT = Path("~/Documents/TheMind/ATC/teoria/20-REGISTRO").expanduser()
DEFAULT_SINTETICOS = ROOT / "Temario/Tests/SINTETICOS"
DEFAULT_CLAVES = VAULT / "claves"
DEFAULT_FICHAS = VAULT / "fichas"
DEFAULT_OUT = ROOT / "app-sync/bank.json"

SCOPE_FROM_ID = re.compile(r"^SYN-(T\d+|FULL)-\d{3}$")
SUBTIPO_TEMA = re.compile(r"^t(\d)-")
CANONICAL_SCOPE = re.compile(r"^(T\d+|FULL)$")


def temas_of_scope(scope: str) -> list[int]:
    """``T4`` → ``[4]``, ``T12`` → ``[1, 2]``, ``FULL`` → ``[1..9]``."""
    if scope == "FULL":
        return list(range(1, 10))
    return [int(digit) for digit in scope[1:]]


def _leading_int(value: str | None) -> int | None:
    match = re.match(r"\s*(\d+)", value or "")
    return int(match.group(1)) if match else None


def _required_section(sections: dict[str, str], name: str, test_id: str) -> str:
    if name not in sections:
        raise ParseError(f"{test_id}: missing section ## {name}")
    return sections[name]


def build_test(
    test_id: str, text: str, key_file: list[str], subtipos: dict[int, str]
) -> tuple[dict, list[dict]]:
    """Parse and cross-check one synthetic test; return ``(test, questions)`` bank entries."""
    front = parse_front_matter(text)
    sections = split_sections(text)
    try:
        questions = parse_questions(_required_section(sections, "TEST", test_id))
        key = parse_key(_required_section(sections, "CLAVE", test_id))
        solutions = parse_solutions(_required_section(sections, "SOLUCIONES RAZONADAS", test_id))
    except ParseError as error:
        if str(error).startswith(test_id):
            raise
        raise ParseError(f"{test_id}: {error}") from error

    n = len(questions)
    declared = _leading_int(front.get("preguntas"))
    if declared is not None and declared != n:
        raise ParseError(f"{test_id}: declares {declared} questions but has {n}")
    if len(key) != n:
        raise ParseError(f"{test_id}: key has {len(key)} letters for {n} questions")
    if key != key_file:
        raise ParseError(f"{test_id}: CLAVE section disagrees with claves file")
    if sorted(solutions) != list(range(1, n + 1)):
        raise ParseError(f"{test_id}: solutions found for {sorted(solutions)}, expected 1..{n}")

    # The front matter's ``alcance`` is used only when it is a canonical code; free-form values
    # such as ``T1 + T2`` (SYN-T12-001) fall back to the code in the test ID.
    declared_scope = front.get("alcance", "")
    scope_match = SCOPE_FROM_ID.match(test_id)
    if CANONICAL_SCOPE.match(declared_scope):
        scope = declared_scope
    else:
        scope = scope_match.group(1) if scope_match else ""
    if not scope:
        raise ParseError(f"{test_id}: cannot determine scope")
    temas = temas_of_scope(scope)

    entries: list[dict] = []
    for question in questions:
        solution = solutions[question.number]
        if solution.answer != key[question.number - 1]:
            raise ParseError(
                f"{test_id} question {question.number}: solution says {solution.answer}, "
                f"key says {key[question.number - 1]}"
            )
        subtipo = subtipos.get(question.number)
        if len(temas) == 1:
            tema = temas[0]
        else:
            prefix = SUBTIPO_TEMA.match(subtipo or "")
            if not prefix or int(prefix.group(1)) not in temas:
                raise ParseError(
                    f"{test_id} question {question.number}: mixed scope {scope} needs a "
                    f"subtipo prefixed with one of {temas}"
                )
            tema = int(prefix.group(1))
        entries.append(
            {
                "id": f"{test_id}#{question.number}",
                "subject": "temario",
                "tema": tema,
                "stem": question.stem,
                "options": question.options,
                "answer": solution.answer,
                "level": solution.level,
                "subtipo": subtipo,
                "cite": solution.cite,
                "explanation": solution.explanation,
                "hook": solution.hook,
            }
        )

    test = {
        "id": test_id,
        "subject": "temario",
        "scope": scope,
        "title": parse_title(text) or test_id,
        "questions": [entry["id"] for entry in entries],
        "limit_min": _leading_int(front.get("tiempo")) or n,
        "pass_ref": _leading_int(front.get("aprobado_referencia")) or n // 2,
        "synthetic": True,
    }
    return test, entries


def _subtipos_from_ficha(path: Path) -> dict[int, str]:
    if not path.exists():
        return {}
    value = parse_front_matter(path.read_text(encoding="utf-8")).get("subtipos", "")
    return parse_groups(value)


def build_bank(sinteticos: Path, claves: Path, fichas: Path, built: str) -> dict:
    """Build the whole bank from every ``SYN-*.md`` in ``sinteticos``."""
    tests: list[dict] = []
    questions: list[dict] = []
    for path in sorted(sinteticos.glob("SYN-*.md")):
        test_id = path.stem
        key_path = claves / f"{test_id}.txt"
        if not key_path.exists():
            raise ParseError(f"{test_id}: no key file at {key_path}")
        test, entries = build_test(
            test_id,
            path.read_text(encoding="utf-8"),
            parse_key_file(key_path.read_text(encoding="utf-8")),
            _subtipos_from_ficha(fichas / f"{test_id}.md"),
        )
        tests.append(test)
        questions.extend(entries)
    return {"schema": 1, "built": built, "questions": questions, "tests": tests}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build bank.json for controlador-tests.")
    parser.add_argument("--sinteticos", type=Path, default=DEFAULT_SINTETICOS)
    parser.add_argument("--claves", type=Path, default=DEFAULT_CLAVES)
    parser.add_argument("--fichas", type=Path, default=DEFAULT_FICHAS)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args(argv)

    built = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    try:
        bank = build_bank(args.sinteticos, args.claves, args.fichas, built)
    except ParseError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(bank, ensure_ascii=False, indent=1), encoding="utf-8")
    per_tema: dict[int, int] = {}
    for question in bank["questions"]:
        per_tema[question["tema"]] = per_tema.get(question["tema"], 0) + 1
    print(f"Wrote {args.out}: {len(bank['tests'])} tests, {len(bank['questions'])} questions.")
    for tema, count in sorted(per_tema.items()):
        print(f"  Tema {tema}: {count} questions")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
