import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from import_results import (
    Paths,
    ResultsError,
    find_results,
    import_attempts,
    load_results,
    main,
    pending,
)

REAL_REGISTRAR = Path("~/Documents/TheMind/ATC/teoria/99-SCRIPTS/registrar.py").expanduser()
REAL_EXCEL = Path(
    "~/Documents/controlador/Primer Examen/Temario/Teoria_Maestro_v1.xlsx"
).expanduser()


def item(q, key, ans, *, doubt=False, at=None):
    return {
        "q": q,
        "key": key,
        "ans": ans,
        "doubt": doubt,
        "stuck": False,
        "secs": 50,
        "first_answered_at_secs": at,
        "cause": None,
    }


def attempt(uuid="u1", test_id="SYN-T9-001", number=1, started="2026-10-14T20:30:00+02:00"):
    return {
        "uuid": uuid,
        "test_id": test_id,
        "kind": "fixed",
        "mode": "exam",
        "attempt": number,
        "started": started,
        "finished": "2026-10-14T20:32:00+02:00",
        "limit_min": 2,
        "total_secs": 100,
        "status": "finished",
        "items": [
            item(f"{test_id}#1", "c", "c", at=50),
            item(f"{test_id}#2", "a", None, doubt=True),
        ],
    }


def make_paths(tmp_path: Path, registrar: Path | None = None) -> Paths:
    for name in ("fichas", "archive"):
        (tmp_path / name).mkdir(exist_ok=True)
    bank = tmp_path / "bank.json"
    questions = [
        {"id": "SYN-T9-001#1", "subtipo": "t9-uno"},
        {"id": "SYN-T9-001#2", "subtipo": None},
    ]
    bank.write_text(json.dumps({"schema": 1, "questions": questions, "tests": []}))
    return Paths(
        fichas=tmp_path / "fichas",
        ledger=tmp_path / "imported.json",
        archive=tmp_path / "archive",
        bank=bank,
        registrar=registrar or tmp_path / "unused.py",
        excel=None,
    )


def ok_runner(calls):
    def run(ficha, registrar, excel):
        calls.append(ficha.name)
        return subprocess.CompletedProcess([], 0, "ok", "")

    return run


def write_results(path: Path, attempts: list[dict]) -> Path:
    path.write_text(json.dumps({"schema": 1, "exported": "x", "attempts": attempts}))
    return path


def cli_args(paths: Paths, results: Path) -> list[str]:
    return [
        "--results", str(results), "--fichas", str(paths.fichas), "--ledger", str(paths.ledger),
        "--archive", str(paths.archive), "--bank", str(paths.bank),
    ]  # fmt: skip


def test_load_results_rejects_bank_and_bad_schema(tmp_path):
    bank_like = tmp_path / "x.json"
    bank_like.write_text(json.dumps({"schema": 1, "questions": [], "tests": []}))
    with pytest.raises(ResultsError, match="not a results file"):
        load_results(bank_like)
    future = tmp_path / "y.json"
    future.write_text(json.dumps({"schema": 2, "attempts": []}))
    with pytest.raises(ResultsError, match="unsupported schema 2"):
        load_results(future)


def test_find_results_picks_newest(tmp_path):
    old = write_results(tmp_path / "results-1.json", [])
    new = write_results(tmp_path / "results-2.json", [])
    (tmp_path / "other.json").write_text("{}")
    os.utime(old, (1, 1))
    assert find_results(tmp_path) == new
    with pytest.raises(FileNotFoundError):
        find_results(tmp_path / "missing")


def test_pending_skips_ledger_and_unfinished_and_sorts():
    a = attempt("a", started="2026-10-14T21:00:00+02:00")
    b = attempt("b", started="2026-10-14T20:00:00+02:00")
    c = attempt("c")
    c["status"] = "in_progress"
    results = {"attempts": [a, b, c]}
    assert [x["uuid"] for x in pending(results, {"zzz"})] == ["b", "a"]
    assert [x["uuid"] for x in pending(results, {"a", "b"})] == []


def test_import_creates_ficha_and_records_ledger(tmp_path):
    paths = make_paths(tmp_path)
    calls: list[str] = []
    registered = import_attempts([attempt()], paths, runner=ok_runner(calls))
    assert registered == ["SYN-T9-001"]
    assert calls == ["SYN-T9-001.md"]
    text = (paths.fichas / "SYN-T9-001.md").read_text(encoding="utf-8")
    assert "respuestas:    C-\n" in text
    assert "subtipos:      1: t9-uno\n" in text
    assert json.loads(paths.ledger.read_text()) == ["u1"]


def test_importing_twice_registers_nothing_the_second_time(tmp_path):
    paths = make_paths(tmp_path)
    results = write_results(tmp_path / "results-1.json", [attempt()])
    calls: list[str] = []
    args = [*cli_args(paths, results), "--yes"]
    assert main(args, runner=ok_runner(calls)) == 0
    assert main(args, runner=ok_runner(calls)) == 0
    assert calls == ["SYN-T9-001.md"]
    assert len(list(paths.archive.iterdir())) == 1


def test_prepared_ficha_is_filled_in_place(tmp_path):
    paths = make_paths(tmp_path)
    prepared = paths.fichas / "SYN-T9-001.md"
    prepared.write_text(
        "---\nid:            SYN-T9-001\nrespuestas:\nclave:         CA\n"
        "subtipos:      1-2: t9-preparado\n---\n\nCuerpo.\n",
        encoding="utf-8",
    )
    import_attempts([attempt()], paths, runner=ok_runner([]))
    text = prepared.read_text(encoding="utf-8")
    assert "subtipos:      1-2: t9-preparado\n" in text
    assert text.endswith("\nCuerpo.\n")


def test_second_attempt_gets_suffixed_ficha(tmp_path):
    paths = make_paths(tmp_path)
    calls: list[str] = []
    import_attempts([attempt("u2", number=2)], paths, runner=ok_runner(calls))
    assert calls == ["SYN-T9-001-i2.md"]
    assert "id:            SYN-T9-001-i2\n" in (paths.fichas / "SYN-T9-001-i2.md").read_text()


def test_registrar_failure_restores_ficha_and_keeps_earlier_successes(tmp_path):
    paths = make_paths(tmp_path)
    prepared = paths.fichas / "SYN-T9-002.md"
    original = "---\nid:            SYN-T9-002\nrespuestas:\nclave:         CA\n---\n\nX\n"
    prepared.write_text(original, encoding="utf-8")

    def runner(ficha, registrar, excel):
        code = 1 if ficha.name == "SYN-T9-002.md" else 0
        return subprocess.CompletedProcess([], code, "", "Ya existe SYN-T9-002")

    first = attempt("ok")
    second = attempt("bad", test_id="SYN-T9-002", started="2026-10-14T22:00:00+02:00")
    with pytest.raises(ResultsError, match="SYN-T9-002.*Ya existe"):
        import_attempts([first, second], paths, runner=runner)
    assert json.loads(paths.ledger.read_text()) == ["ok"]
    assert prepared.read_text(encoding="utf-8") == original


def test_registrar_failure_removes_new_ficha(tmp_path):
    paths = make_paths(tmp_path)

    def runner(ficha, registrar, excel):
        return subprocess.CompletedProcess([], 1, "", "boom")

    with pytest.raises(ResultsError):
        import_attempts([attempt()], paths, runner=runner)
    assert not (paths.fichas / "SYN-T9-001.md").exists()
    assert not paths.ledger.exists()


def test_cli_declined_confirmation_registers_nothing(tmp_path, monkeypatch):
    paths = make_paths(tmp_path)
    results = write_results(tmp_path / "results-1.json", [attempt()])
    monkeypatch.setattr("builtins.input", lambda prompt: "n")
    calls: list[str] = []
    assert main(cli_args(paths, results), runner=ok_runner(calls)) == 0
    assert calls == []


@pytest.mark.skipif(
    not (REAL_REGISTRAR.exists() and REAL_EXCEL.exists()), reason="real registrar not here"
)
def test_round_trip_with_real_registrar_on_excel_copy(tmp_path):
    from openpyxl import load_workbook

    excel = tmp_path / "copy.xlsx"
    shutil.copy2(REAL_EXCEL, excel)
    paths = make_paths(tmp_path, registrar=REAL_REGISTRAR)
    paths.excel = excel
    test_id = "SYN-T9-901"  # an ID that never exists in the real workbook
    registered = import_attempts([attempt("rt", test_id=test_id)], paths)
    assert registered == [test_id]
    ids = [row[0].value for row in load_workbook(excel)["Nivel Test"].iter_rows(min_row=2)]
    assert test_id in ids
