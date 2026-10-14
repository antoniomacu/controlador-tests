"""What differs between the Temario and English registries, in one place.

Each subject has its own fichas folder, its own ``registrar.py`` (which writes its own Excel), its
own closed list of failure causes, and slightly different ficha conventions: English fichas are
always ``modo: Mixto`` and carry no ``corte``. The importer looks everything up here, so no other
code needs subject-specific branches.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ROOT = Path("~/Documents/controlador/Primer Examen").expanduser()
ATC = Path("~/Documents/TheMind/ATC").expanduser()


@dataclass(frozen=True)
class Profile:
    subject: str
    causes: tuple[str, ...]
    fixed_modo: str | None
    corte: str | None
    fichas: Path
    registrar: Path
    excel: Path


TEMARIO = Profile(
    subject="temario",
    causes=(
        "No conocía el dato",
        "Confundí dos conceptos",
        "Lo recordaba mal",
        "Mala lectura del enunciado",
        "Dudé entre dos opciones",
        "Sin tiempo",
        "Otro",
    ),
    fixed_modo=None,
    corte="50",
    fichas=ATC / "teoria/20-REGISTRO/fichas",
    registrar=ATC / "teoria/99-SCRIPTS/registrar.py",
    excel=ROOT / "Temario/Teoria_Maestro_v1.xlsx",
)

INGLES = Profile(
    subject="ingles",
    causes=(
        "No conocia la palabra",
        "Elegi por como sonaba",
        "Confundi dos palabras proximas",
        "No conocia la regla",
        "Aplique mal la regla",
        "Mala lectura del enunciado",
        "Dude entre dos opciones",
        "Sin tiempo",
        "Otro",
    ),
    fixed_modo="Mixto",
    corte=None,
    fichas=ATC / "ingles/20-REGISTRO/fichas",
    registrar=ATC / "ingles/99-SCRIPTS/registrar.py",
    excel=ROOT / "Ingles/Ingles_Maestro_v1.xlsx",
)

PROFILES = {p.subject: p for p in (TEMARIO, INGLES)}


def subject_of(attempt: dict) -> str:
    """The exported ``subject``, or the ID prefix for exports from before it existed."""
    if attempt.get("subject") in PROFILES:
        return attempt["subject"]
    return "ingles" if attempt["test_id"].startswith(("SYN-ING-", "RND-ING-")) else "temario"
