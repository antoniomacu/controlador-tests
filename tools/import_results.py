"""Register the attempts exported by the controlador-tests app.

Usage (from ``tools/``)::

    uv run python import_results.py                 # newest ~/Downloads/results*.json
    uv run python import_results.py --results path/to/results.json

For every finished attempt not yet in the ledger (``app-sync/imported.json``), oldest first:
write its ficha (filling a prepared one if it exists), run ``registrar.py --intake`` on it, and
only then record the attempt's uuid in the ledger. If registrar fails, the ficha is restored to
its previous state and the run stops; the next run retries from that attempt.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from bank_parser import parse_front_matter
from ficha import FichaError, build_fields, ficha_id, merge_prepared, render
from profiles import PROFILES, subject_of

ROOT = Path("~/Documents/controlador/Primer Examen").expanduser()
VAULT = Path("~/Documents/TheMind/ATC/teoria").expanduser()
SYNC = ROOT / "app-sync"


class ResultsError(ValueError):
    """Raised for an unusable results file or a failed registration."""


@dataclass
class Route:
    """Where one subject's fichas live, which registrar writes them, and to which workbook."""

    fichas: Path
    registrar: Path
    excel: Path | None


@dataclass
class Paths:
    ledger: Path
    archive: Path
    bank: Path
    routes: dict[str, Route]


Runner = Callable[[Path, Path, Path | None], subprocess.CompletedProcess]


def load_results(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ResultsError(f"{path}: cannot read JSON ({error})") from error
    if not isinstance(data, dict) or "attempts" not in data:
        raise ResultsError(f"{path}: not a results file (no 'attempts')")
    if data.get("schema") != 1:
        raise ResultsError(f"{path}: unsupported schema {data.get('schema')}")
    return data


def find_results(downloads: Path) -> Path:
    candidates = sorted(downloads.glob("results*.json"), key=lambda p: p.stat().st_mtime)
    if not candidates:
        raise FileNotFoundError(f"no results*.json in {downloads}")
    return candidates[-1]


def load_ledger(path: Path) -> set[str]:
    return set(json.loads(path.read_text(encoding="utf-8"))) if path.exists() else set()


def save_ledger(path: Path, uuids: set[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(sorted(uuids), indent=1), encoding="utf-8")


def pending(results: dict, ledger: set[str]) -> list[dict]:
    """Finished attempts not yet registered, oldest first."""
    todo = [
        a for a in results["attempts"] if a.get("status") == "finished" and a["uuid"] not in ledger
    ]
    return sorted(todo, key=lambda a: a["started"])


def subtipos_by_question(bank: Path) -> dict[str, str]:
    if not bank.exists():
        return {}
    data = json.loads(bank.read_text(encoding="utf-8"))
    return {q["id"]: q["subtipo"] for q in data.get("questions", []) if q.get("subtipo")}


def run_registrar(ficha: Path, registrar: Path, excel: Path | None) -> subprocess.CompletedProcess:
    command = [sys.executable, str(registrar), "--intake", str(ficha)]
    if excel is not None:
        command += ["--excel", str(excel)]
    return subprocess.run(command, capture_output=True, text=True)


def _is_filled(ficha: Path) -> bool:
    return ficha.exists() and bool(
        parse_front_matter(ficha.read_text(encoding="utf-8")).get("respuestas")
    )


def renumber(attempt: dict, fichas: Path) -> dict:
    """Bump the attempt number past every ficha of this test that is already filled in.

    The phone only knows its own history, so it numbers a test taken on paper earlier, or
    retaken after the app's data was lost, as attempt 1. The vault is the authority on what
    has been registered: the attempt takes the first free ``-i<N>`` slot.
    """
    numbered = dict(attempt)
    while _is_filled(fichas / f"{ficha_id(numbered)}.md"):
        numbered["attempt"] += 1
    return numbered


def workbook_open(path: Path) -> bool:
    """True when Excel holds the workbook: its ``~$`` lock file exists or ``lsof`` lists it."""
    if (path.parent / f"~${path.name}").exists():
        return True
    if not path.exists():
        return False
    return subprocess.run(["lsof", "-t", str(path)], capture_output=True).returncode == 0


def _guard(attempts: list[dict], paths: Paths, is_open: Callable[[Path], bool]) -> None:
    """Refuse to start if Excel holds the workbook of any subject about to be imported.

    A workbook saved by Excel after ``registrar.py`` wrote to it would silently drop the new
    rows. Only the subjects present in ``attempts`` are checked, so an unrelated open workbook
    does not block the run.
    """
    for subject in sorted({subject_of(a) for a in attempts}):
        excel = paths.routes[subject].excel or PROFILES[subject].excel
        if is_open(excel):
            raise ResultsError(f"{excel.name} está abierto en Excel: ciérralo y vuelve a ejecutar.")


def import_attempts(
    attempts: list[dict],
    paths: Paths,
    runner: Runner = run_registrar,
    is_open: Callable[[Path], bool] = workbook_open,
) -> list[str]:
    """Write and register one ficha per attempt; return the registered ficha IDs."""
    _guard(attempts, paths, is_open)
    ledger = load_ledger(paths.ledger)
    subtipos = subtipos_by_question(paths.bank)
    registered: list[str] = []
    for original in attempts:
        subject = subject_of(original)
        route, profile = paths.routes[subject], PROFILES[subject]
        attempt = renumber(original, route.fichas)
        fid = ficha_id(attempt)
        target = route.fichas / f"{fid}.md"
        previous = target.read_text(encoding="utf-8") if target.exists() else None
        try:
            fields = build_fields(attempt, subtipos, profile)
            text = (
                merge_prepared(previous, fields)
                if previous is not None
                else render(fields, f"\n# {fid} — ficha de registro\n\nGenerada desde la app.\n")
            )
        except FichaError as error:
            raise ResultsError(f"{fid}: {error}") from error
        target.write_text(text, encoding="utf-8")

        result = runner(target, route.registrar, route.excel)
        if result.returncode != 0:
            if previous is None:
                target.unlink()
            else:
                target.write_text(previous, encoding="utf-8")
            detail = (result.stderr or result.stdout).strip()
            raise ResultsError(f"{fid}: registrar.py failed: {detail}")

        ledger.add(attempt["uuid"])
        save_ledger(paths.ledger, ledger)
        registered.append(fid)
    return registered


def _summary(attempt: dict) -> str:
    items = attempt["items"]
    correct = sum(1 for i in items if i["ans"] is not None and i["ans"] == i["key"])
    wrong = sum(1 for i in items if i["ans"] is not None and i["ans"] != i["key"])
    blank = len(items) - correct - wrong
    net = round(correct - 0.33 * wrong, 2)
    return (
        f"  {ficha_id(attempt)}: {correct}/{wrong}/{blank} · neta {net} · "
        f"{attempt['mode']} · {attempt['started'][:16].replace('T', ' ')}"
    )


def main(
    argv: list[str] | None = None,
    runner: Runner = run_registrar,
    is_open: Callable[[Path], bool] = workbook_open,
) -> int:
    parser = argparse.ArgumentParser(description="Register app results via registrar.py.")
    parser.add_argument("--results", type=Path, default=None)
    parser.add_argument("--yes", action="store_true", help="Do not ask for confirmation")
    parser.add_argument("--fichas", type=Path, default=PROFILES["temario"].fichas)
    parser.add_argument("--ingles-fichas", type=Path, default=PROFILES["ingles"].fichas)
    parser.add_argument("--ledger", type=Path, default=SYNC / "imported.json")
    parser.add_argument("--archive", type=Path, default=SYNC / "results")
    parser.add_argument("--bank", type=Path, default=SYNC / "bank.json")
    parser.add_argument("--registrar", type=Path, default=PROFILES["temario"].registrar)
    parser.add_argument("--ingles-registrar", type=Path, default=PROFILES["ingles"].registrar)
    parser.add_argument("--excel", type=Path, default=None)
    parser.add_argument("--ingles-excel", type=Path, default=None)
    args = parser.parse_args(argv)
    routes = {
        "temario": Route(args.fichas, args.registrar, args.excel),
        "ingles": Route(args.ingles_fichas, args.ingles_registrar, args.ingles_excel),
    }

    try:
        source = args.results or find_results(Path("~/Downloads").expanduser())
        results = load_results(source)
    except (FileNotFoundError, ResultsError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    args.archive.mkdir(parents=True, exist_ok=True)
    archived = args.archive / source.name
    if not archived.exists():
        shutil.copy2(source, archived)

    todo = pending(results, load_ledger(args.ledger))
    if not todo:
        print(f"{source.name}: nothing new to register.")
        return 0
    print(f"{source.name}: {len(todo)} new attempt(s):")
    for attempt in todo:
        subject = subject_of(attempt)
        print(f"[{subject}]" + _summary(renumber(attempt, routes[subject].fichas)))
    if not args.yes:
        answer = input(f"¿Registrar {len(todo)} ficha(s) en el Excel? [s/N] ").strip().lower()
        if answer not in ("s", "si", "sí", "y", "yes"):
            print("Cancelado. No se ha registrado nada.")
            return 0

    paths = Paths(args.ledger, args.archive, args.bank, routes)
    try:
        registered = import_attempts(todo, paths, runner=runner, is_open=is_open)
    except ResultsError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"Registered {len(registered)}: {', '.join(registered)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
