from pathlib import Path

import pytest

from bank_parser import ParseError, parse_groups, parse_key, parse_key_file, split_sections

FIX = Path(__file__).parent / "fixtures"


def test_numbered_lowercase_layout():
    section = "```\n1-10   c a b d c   b c b d b\n11-12  a d\n```\n"
    assert parse_key(section) == list("cabdcbcbdbad")


def test_grouped_uppercase_layout():
    section = "\n```\nBCACB DDDCA\n```\n"
    assert parse_key(section) == list("bcacbdddca")


def test_fixture_keys():
    modern = split_sections((FIX / "SYN-T9-001.md").read_text(encoding="utf-8"))
    legacy = split_sections((FIX / "SYN-T8-001.md").read_text(encoding="utf-8"))
    assert parse_key(modern["CLAVE"]) == ["c", "a"]
    assert parse_key(legacy["CLAVE"]) == ["b", "d"]


def test_only_fenced_lines_are_read_when_a_fence_exists():
    section = "Texto con una a y una B fuera.\n```\nCA\n```\n"
    assert parse_key(section) == ["c", "a"]


def test_empty_key_is_an_error():
    with pytest.raises(ParseError, match="empty answer key"):
        parse_key("```\n```\n")


def test_key_file():
    assert parse_key_file("CABDC BCBDB\n") == list("cabdcbcbdb")


def test_groups_with_commas_ranges_and_spaces():
    value = "1: t1-a; 3,4: t1-b; 6-7: t2-c"
    assert parse_groups(value) == {1: "t1-a", 3: "t1-b", 4: "t1-b", 6: "t2-c", 7: "t2-c"}


def test_groups_empty_and_malformed():
    assert parse_groups("") == {}
    with pytest.raises(ParseError, match="missing ':'"):
        parse_groups("1 t1-a")
