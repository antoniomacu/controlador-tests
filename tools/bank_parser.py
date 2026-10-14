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


MODERN_ANSWER_RE = re.compile(
    r"^\*\*Respuesta:\s*([a-d])\)\s*(.*?)\*\*\s*·\s*\[([^\]]+)\]\s*·\s*(N[123])"
)
LEGACY_ANSWER_RE = re.compile(
    r"^\*\*(\d+)\.\s*([a-d])\)\s*(.*?)\*\*\s*·\s*\[([^\]]+)\]\s*·\s*(N[123])"
)
HOOK_RE = re.compile(r"^\*\*Gancho:\*\*\s*(.*)$", re.DOTALL)


@dataclass
class ParsedSolution:
    number: int
    answer: str
    cite: str
    level: str
    explanation: str
    hook: str | None


def _split_body(lines: list[str]) -> tuple[str, str | None]:
    paragraphs = [p.strip() for p in "\n".join(lines).split("\n\n") if p.strip()]
    hook: str | None = None
    explanation: list[str] = []
    for paragraph in paragraphs:
        match = HOOK_RE.match(paragraph)
        if match:
            hook = " ".join(match.group(1).split())
        else:
            explanation.append(paragraph)
    return "\n\n".join(explanation), hook


def parse_solutions(section: str) -> dict[int, ParsedSolution]:
    """Parse ``## SOLUCIONES RAZONADAS`` blocks separated by ``---`` lines.

    Modern layout: ``**N.** *stem*`` then ``**Respuesta: c) text** · [T4, pág. 6] · N1``.
    Legacy layout (``SYN-T1-001``): ``**1. b) 1944** · [T1, pág. 5] · N1``.
    The lines after the answer line form the explanation; a paragraph starting with
    ``**Gancho:**`` becomes the hook. Blocks without an answer line are skipped.
    """
    solutions: dict[int, ParsedSolution] = {}
    for block in re.split(r"^---\s*$", section, flags=re.MULTILINE):
        lines = block.strip().splitlines()
        number: int | None = None
        found: tuple[str, str, str] | None = None
        body_start = 0
        for index, raw in enumerate(lines):
            line = raw.strip()
            legacy = LEGACY_ANSWER_RE.match(line)
            if legacy:
                number = int(legacy.group(1))
                found = (legacy.group(2), legacy.group(4), legacy.group(5))
                body_start = index + 1
                break
            modern = MODERN_ANSWER_RE.match(line)
            if modern:
                found = (modern.group(1), modern.group(3), modern.group(4))
                body_start = index + 1
                for previous in lines[:index]:
                    head = QUESTION_RE.match(previous.strip())
                    if head:
                        number = int(head.group(1))
                break
        if found is None:
            continue
        if number is None:
            raise ParseError(f"solution block has no question number: {lines[0]!r}")
        if number in solutions:
            raise ParseError(f"solution {number} appears twice")
        explanation, hook = _split_body(lines[body_start:])
        answer, cite, level = found
        solutions[number] = ParsedSolution(number, answer, cite.strip(), level, explanation, hook)
    return solutions


AREAS = ("verbal", "nofin", "condic", "modal", "estruc", "detpro", "conpre", "lexico", "morfo")
AREA_SUBTIPO_RE = re.compile(rf"^(?:{'|'.join(AREAS)})-[a-z0-9-]+$")
EN_LEGACY_RE = re.compile(
    r"^\*\*(\d+)\.\s*([a-d])\)\s*(.*?)\*\*\s*·\s*(N[123])\s*·\s*`([^`]+)`\s*·\s*\[anclas?:\s*([^\]]+)\]"
)
EN_MODERN_RE = re.compile(r"^###\s+(\d+)\.\s*([a-d])\)\s*(.*)$")
EXAM_ANCHOR_RE = re.compile(r"ING-(?:\d{2}|PR)-\d{3}\s+Q\d+")
BACKTICK_RE = re.compile(r"`([^`]+)`")


@dataclass
class EnglishSolution:
    number: int
    answer: str
    level: str | None
    subtipo: str | None
    ref: str | None
    explanation: str


def _first_anchor(text: str) -> str:
    """The first exam anchor in ``text`` (``ING-26-001 Q66 y ING-26-002 Q63`` → the first)."""
    exam = EXAM_ANCHOR_RE.search(text)
    return " ".join(exam.group(0).split()) if exam else " ".join(text.split())


def _modern_block(number: int, answer: str, body: list[str]) -> EnglishSolution:
    lines = [line for line in body if not line.lstrip().startswith(">")]
    explanation = "\n".join(lines).strip()
    ancla = next((p for p in explanation.split("\n\n") if p.startswith("**Ancla:**")), "")
    subtipo = next((t for t in BACKTICK_RE.findall(ancla) if AREA_SUBTIPO_RE.match(t)), None)
    exam = EXAM_ANCHOR_RE.search(ancla)
    ref = " ".join(exam.group(0).split()) if exam else subtipo
    return EnglishSolution(number, answer, None, subtipo, ref, explanation)


def parse_english_solutions(section: str) -> dict[int, EnglishSolution]:
    """Parse English ``## SOLUCIONES RAZONADAS`` in the legacy or the modern layout.

    Legacy (``SYN-ING-001``): ``**1. a) illegible** · N1 · `subtipo` · [ancla: ING-18-003 Q33]``.
    Modern (``SYN-ING-002``+): ``### 1. a) rose`` heading, a quoted stem, then an ``**Ancla:**``
    paragraph holding the area-prefixed subtipo and, when there is one, the exam anchor.
    """
    solutions: dict[int, EnglishSolution] = {}
    for block in re.split(r"^---\s*$", section, flags=re.MULTILINE):
        lines = block.strip().splitlines()
        if not lines:
            continue
        head = lines[0].strip()
        legacy = EN_LEGACY_RE.match(head)
        modern = EN_MODERN_RE.match(head)
        if legacy:
            number = int(legacy.group(1))
            solution = EnglishSolution(
                number,
                legacy.group(2),
                legacy.group(4),
                legacy.group(5),
                _first_anchor(legacy.group(6)),
                "\n".join(lines[1:]).strip(),
            )
        elif modern:
            number = int(modern.group(1))
            solution = _modern_block(number, modern.group(2), lines[1:])
        else:
            continue
        if number in solutions:
            raise ParseError(f"solution {number} appears twice")
        solutions[number] = solution
    if not solutions:
        raise ParseError("no English solution blocks in a known layout")
    return solutions
