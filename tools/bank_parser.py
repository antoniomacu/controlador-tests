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


KEY_RANGE_PREFIX = re.compile(r"^\s*\d+\s*-\s*\d+")
KEY_LETTER = re.compile(r"[A-Da-d]")


def _key_letters(lines: list[str]) -> list[str]:
    letters: list[str] = []
    for line in lines:
        letters.extend(ch.lower() for ch in KEY_LETTER.findall(KEY_RANGE_PREFIX.sub("", line)))
    return letters


def parse_key(section: str) -> list[str]:
    """Parse a ``## CLAVE`` section in either layout.

    Layout 1 (``SYN-T1-001``): grouped uppercase letters, ``BCACB DDDCA``.
    Layout 2 (later tests): numbered rows of lowercase letters, ``1-10   c a b d c   b c b d b``.
    If the section has a code fence, only the lines inside it are read.
    """
    lines = section.splitlines()
    fences = [i for i, line in enumerate(lines) if line.strip().startswith("```")]
    if len(fences) >= 2:
        lines = lines[fences[0] + 1 : fences[1]]
    letters = _key_letters(lines)
    if not letters:
        raise ParseError("empty answer key")
    return letters


def parse_key_file(text: str) -> list[str]:
    """Parse an archived key file from ``20-REGISTRO/claves/`` (``CABDC BCBDB ...``)."""
    return _key_letters(text.splitlines())


def parse_groups(value: str) -> dict[int, str]:
    """Parse the ficha group syntax ``"1,3: label; 4-6: other"`` into ``{number: label}``."""
    mapping: dict[int, str] = {}
    for group in value.split(";"):
        group = group.strip()
        if not group:
            continue
        if ":" not in group:
            raise ParseError(f"group missing ':': {group!r}")
        numbers, label = group.split(":", 1)
        for chunk in numbers.replace(" ", "").split(","):
            if not chunk:
                continue
            if "-" in chunk:
                start, end = (int(part) for part in chunk.split("-"))
                for number in range(start, end + 1):
                    mapping[number] = label.strip()
            else:
                mapping[int(chunk)] = label.strip()
    return mapping
