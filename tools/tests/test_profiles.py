from profiles import INGLES, TEMARIO, subject_of


def test_subject_from_field_or_prefix():
    assert subject_of({"subject": "ingles", "test_id": "X"}) == "ingles"
    assert subject_of({"test_id": "SYN-ING-004"}) == "ingles"
    assert subject_of({"test_id": "RND-ING-20261014-203015"}) == "ingles"
    assert subject_of({"test_id": "SYN-T4-001"}) == "temario"


def test_profiles_differ_where_the_registries_differ():
    assert INGLES.fixed_modo == "Mixto" and INGLES.corte is None
    assert TEMARIO.fixed_modo is None and TEMARIO.corte == "50"
    assert "Aplique mal la regla" in INGLES.causes
    assert "Confundí dos conceptos" in TEMARIO.causes
    assert INGLES.excel.name == "Ingles_Maestro_v1.xlsx"
