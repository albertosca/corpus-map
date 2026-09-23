import re

import pytest

from arxiv_corpus.categories import CATEGORIES, name_of

CODE_PATTERN = re.compile(r"^cs\.[A-Z]{2}$")


def test_has_forty_entries() -> None:
    assert len(CATEGORIES) == 40


def test_all_keys_match_code_pattern() -> None:
    assert all(CODE_PATTERN.match(code) for code in CATEGORIES)


def test_name_of_known_code() -> None:
    assert name_of("cs.CL") == "Computation and Language"


def test_name_of_unknown_code_raises_key_error() -> None:
    with pytest.raises(KeyError):
        name_of("cs.XX")
