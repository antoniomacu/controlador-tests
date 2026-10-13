"""Parse synthetic test Markdown files (``SYN-*.md``) into plain data structures.

A synthetic test has three sections: ``## TEST`` (questions), ``## CLAVE`` (answer key) and
``## SOLUCIONES RAZONADAS`` (one block per question with answer, page citation, level,
explanation and an optional "Gancho" memory hook). Two historical layouts exist for the key and
for the solutions; both are supported. This module only parses — consistency checks across
sections live in ``build_bank.py``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

LETTERS = ("a", "b", "c", "d")

QUESTION_RE = re.compile(r"^\*\*(\d+)\.\*\*\s*(.*)$")
OPTION_RE = re.compile(r"^([a-d])\)\s*(.*)$")


class ParseError(ValueError):
    """Raised when a synthetic test file cannot be parsed."""


@dataclass
class ParsedQuestion:
    number: int
    stem: str
    options: dict[str, str]


def split_sections(text: str) -> dict[str, str]:
    """Split a document on ``## `` headings; keys are the uppercased heading text."""
    sections: dict[str, str] = {}
    name: str | None = None
    buffer: list[str] = []
    for line in text.splitlines():
        if line.startswith("## "):
            if name is not None:
                sections[name] = "\n".join(buffer)
            name, buffer = line[3:].strip().upper(), []
        elif name is not None:
            buffer.append(line)
    if name is not None:
        sections[name] = "\n".join(buffer)
    return sections


def parse_front_matter(text: str) -> dict[str, str]:
    """Return the ``key: value`` pairs of a leading ``---`` block, or ``{}`` if there is none."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    front: dict[str, str] = {}
    for line in lines[1:]:
        if line.strip() == "---":
            break
        if ":" in line:
            key, value = line.split(":", 1)
            front[key.strip()] = value.strip().strip('"')
    return front


def parse_title(text: str) -> str:
    """Return the part of the first ``# `` heading after the em dash, or the whole heading."""
    for line in text.splitlines():
        if line.startswith("# "):
            heading = line[2:].strip()
            return heading.split(" — ", 1)[1].strip() if " — " in heading else heading
    return ""


def parse_questions(section: str) -> list[ParsedQuestion]:
    """Parse the ``## TEST`` section.

    A question starts with ``**N.** stem``. Lines before the first option extend the stem. An
    option is ``a) text``; a non-blank line directly after an option (no blank line between)
    continues that option. Text separated from the options by a blank line is ignored.
    """
    questions: list[ParsedQuestion] = []
    current: ParsedQuestion | None = None
    last_option: str | None = None
    previous_blank = True
    for raw in section.splitlines():
        line = raw.strip()
        if not line or line == "---":
            previous_blank = True
            continue
        match = QUESTION_RE.match(line)
        if match:
            current = ParsedQuestion(int(match.group(1)), match.group(2).strip(), {})
            questions.append(current)
            last_option, previous_blank = None, False
            continue
        if current is None:
            continue
        match = OPTION_RE.match(line)
        if match:
            last_option = match.group(1)
            current.options[last_option] = match.group(2).strip()
        elif last_option is None:
            current.stem = f"{current.stem} {line}".strip()
        elif not previous_blank:
            current.options[last_option] = f"{current.options[last_option]} {line}"
        previous_blank = False

    for index, question in enumerate(questions, start=1):
        if question.number != index:
            raise ParseError(f"questions are not numbered 1..n (found {question.number})")
        if tuple(sorted(question.options)) != LETTERS:
            found = "".join(sorted(question.options))
            raise ParseError(f"question {question.number} has options {found}, expected abcd")
    return questions
