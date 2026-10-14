"""Turn one app attempt into a ficha that ``registrar.py --intake`` accepts unchanged.

The field names and value formats follow ``Temario/GUIA-REGISTRO.md`` and the existing fichas
in ``20-REGISTRO/fichas/``. Only fields listed in ``registrar.py``'s ``CAMPOS_INTAKE`` are ever
written, because that script rejects any other field. Exam versus Practice mode goes into
``observaciones`` since ``modo`` only accepts ``Bloque`` or ``Mixto``.
"""

from __future__ import annotations

import datetime as dt
import re

from bank_parser import parse_front_matter, parse_key_file
from profiles import TEMARIO, Profile

CAUSES = TEMARIO.causes
PREPARED_WINS = ("subtipos", "corte")
TEMAS_IN_ID = re.compile(r"-T(\d+)-")


class FichaError(ValueError):
    """Raised when an attempt cannot be turned into a valid ficha."""


def _local(iso: str | None) -> dt.datetime | None:
    """Parse an ISO timestamp (``Z`` or any offset) and convert it to the Mac's local time."""
    return dt.datetime.fromisoformat(iso).astimezone() if iso else None


def mmss(secs: int) -> str:
    return f"{secs // 60:02d}:{secs % 60:02d}"


def ficha_id(attempt: dict) -> str:
    """First attempt keeps the test ID; later ones get ``-i<N>`` (registrar dedupes on id)."""
    number = attempt["attempt"]
    return attempt["test_id"] if number == 1 else f"{attempt['test_id']}-i{number}"


def temas_from_test_id(test_id: str) -> list[int]:
    match = TEMAS_IN_ID.search(test_id)
    return [int(digit) for digit in match.group(1)] if match else []


def _group_tens(letters: list[str]) -> str:
    return " ".join("".join(letters[i : i + 10]) for i in range(0, len(letters), 10))


def _compress(labels: dict[int, str]) -> str:
    """``{1: 'x', 2: 'x', 4: 'y'}`` → ``'1,2: x; 4: y'``, ordered by first question."""
    grouped: dict[str, list[int]] = {}
    for number in sorted(labels):
        grouped.setdefault(labels[number], []).append(number)
    return "; ".join(f"{','.join(map(str, nums))}: {label}" for label, nums in grouped.items())


def _tramos(items: list[dict]) -> str:
    times = sorted(
        i["first_answered_at_secs"] for i in items if i["first_answered_at_secs"] is not None
    )
    marks = [times[k] for k in (9, 19, 29, 39, 49) if k < len(times)]
    return ", ".join(mmss(t) for t in marks)


def build_fields(
    attempt: dict, subtipos_by_q: dict[str, str], profile: Profile = TEMARIO
) -> dict[str, str]:
    """Compute every ficha field for ``attempt`` (one element of ``results.json`` attempts)."""
    items = attempt["items"]
    causes: dict[int, str] = {}
    for number, entry in enumerate(items, start=1):
        cause = entry.get("cause")
        if cause is None:
            continue
        if cause not in profile.causes:
            raise FichaError(f"question {number}: unknown cause {cause!r} for {profile.subject}")
        causes[number] = cause
    subtipos = {
        n: subtipos_by_q[e["q"]] for n, e in enumerate(items, start=1) if e["q"] in subtipos_by_q
    }
    mode = (
        "Modo examen (corte duro)" if attempt["mode"] == "exam" else "Modo práctica (límite blando)"
    )
    started, finished = _local(attempt["started"]), _local(attempt["finished"])
    start = started.strftime("%H:%M") if started else ""
    end = finished.strftime("%H:%M") if finished else ""
    multi = len(temas_from_test_id(attempt["test_id"])) > 1
    fields = {
        "id": ficha_id(attempt),
        "categoria": "SYN",
        "dificultad": "SINTETICO",
        "modo": profile.fixed_modo or ("Mixto" if multi else "Bloque"),
        "intento": str(attempt["attempt"]),
        "fecha": started.date().isoformat() if started else "",
        "preguntas": str(len(items)),
        "limite": f"{attempt['limit_min']:g}",
        "tiempo": mmss(attempt["total_secs"]),
        "tramos": _tramos(items),
        "corte": profile.corte or "",
        "respuestas": _group_tens([(e["ans"] or "-").upper() for e in items]),
        "clave": _group_tens([e["key"].upper() for e in items]),
        "dudas": ", ".join(str(n) for n, e in enumerate(items, start=1) if e["doubt"]),
        "atascos": ", ".join(str(n) for n, e in enumerate(items, start=1) if e["stuck"]),
        "subtipos": _compress(subtipos),
        "causas": _compress(causes),
        "sintetico": "si",
        "observaciones": f"{mode}. Inicio {start}, fin {end}. Hecho en la app.",
    }
    if profile.corte is None:
        del fields["corte"]
    return fields


def _line(key: str, value: str) -> str:
    return f"{key + ':':<15}{value}" if value else f"{key}:"


def render(fields: dict[str, str], body: str) -> str:
    """Render a ficha: an aligned ``campo: valor`` front matter block followed by ``body``."""
    lines = ["---", *(_line(k, v) for k, v in fields.items()), "---"]
    return "\n".join(lines) + "\n" + body


def merge_prepared(prepared_text: str, fields: dict[str, str]) -> str:
    """Fill a ficha Claude prepared in advance, keeping its body and its subtipos."""
    prepared = parse_front_matter(prepared_text)
    if prepared.get("respuestas"):
        raise FichaError(f"{prepared.get('id', '?')} already has respuestas; not overwriting")
    if prepared.get("clave") and parse_key_file(prepared["clave"]) != parse_key_file(
        fields["clave"]
    ):
        raise FichaError("key in prepared ficha differs from the attempt's key (stale bank?)")

    merged: dict[str, str] = {}
    for key in [*prepared, *(k for k in fields if k not in prepared)]:
        if key in PREPARED_WINS and prepared.get(key):
            merged[key] = prepared[key]
        else:
            merged[key] = fields[key] if key in fields else prepared.get(key, "")
    body = prepared_text.split("\n---\n", 1)[1] if "\n---\n" in prepared_text else ""
    return render(merged, body)
