import numpy as np

from arxiv_corpus import describe
from arxiv_corpus.fetch import Paper


def _paper(index: int, title: str, abstract: str = "", category: str = "cs.LG") -> Paper:
    return Paper(id=f"2601.{index:05d}", title=title, abstract=abstract, category=category, year=2026)


def test_unit_rows_normalises_each_row_and_leaves_a_zero_row_zero() -> None:
    rows = describe.unit_rows(np.array([[3.0, 4.0], [0.0, 0.0]]))
    assert np.allclose(rows, [[0.6, 0.8], [0.0, 0.0]])


def test_central_indices_rank_the_members_nearest_the_centroid_first() -> None:
    unit = describe.unit_rows(np.array([[1.0, 0.0], [0.8, 0.6], [0.6, 0.8], [0.0, 1.0], [1.0, 0.0]]))
    # Members 0..3 average to a direction at 45 degrees: 1 and 2 are nearest, tied, so the smaller index first.
    assert describe.central_indices(unit, [0, 1, 2, 3], 2) == [1, 2]
    assert describe.central_indices(unit, [0, 1, 2, 3], 9) == [1, 2, 0, 3]


def test_central_indices_of_a_leaf_whose_centroid_is_zero_keep_member_order() -> None:
    unit = describe.unit_rows(np.array([[1.0, 0.0], [-1.0, 0.0]]))
    assert describe.central_indices(unit, [1, 0], 2) == [0, 1]


def test_tokens_lowercase_drop_stop_words_and_single_letters_and_keep_hyphenated_words() -> None:
    assert describe.tokens("The Self-Supervised a model, of X-rays 3D") == ["self-supervised", "model", "x-rays"]


def test_distinctive_words_rank_a_leafs_own_word_above_a_word_common_to_all() -> None:
    texts = {
        "a": ["robot grasping robot", "robot learning"],
        "b": ["language learning", "language model learning"],
    }
    words = describe.distinctive_words(texts, 2)
    assert words["a"][0] == "robot"
    assert words["b"][0] == "language"
    assert "learning" not in words["a"][:1]


def test_distinctive_words_break_a_score_tie_by_the_word() -> None:
    assert describe.distinctive_words({"a": ["zeta alpha"], "b": ["other"]}, 2)["a"] == ["alpha", "zeta"]


def test_distinctive_words_of_an_empty_class_are_empty() -> None:
    assert describe.distinctive_words({"a": ["the of"], "b": ["robot"]}, 3) == {"a": [], "b": ["robot"]}


def test_category_mix_keeps_categories_at_five_percent_by_share_then_code() -> None:
    categories = ["cs.CV"] * 19 + ["cs.RO"]
    assert describe.category_mix(categories, list(range(20))) == {"cs.CV": 0.95, "cs.RO": 0.05}
    dropped = ["cs.CV"] * 20 + ["cs.RO"]
    assert describe.category_mix(dropped, list(range(21))) == {"cs.CV": 0.952}
    tied = ["cs.RO", "cs.AI"]
    assert list(describe.category_mix(tied, [0, 1])) == ["cs.AI", "cs.RO"]


def test_describe_gives_size_central_titles_words_and_categories_per_id() -> None:
    papers = [
        _paper(0, "Robot grasping", "robot hands", "cs.RO"),
        _paper(1, "Robot walking", "robot legs", "cs.RO"),
        _paper(2, "Language models", "language tokens", "cs.CL"),
    ]
    unit = describe.unit_rows(np.array([[1.0, 0.0], [0.9, 0.1], [0.0, 1.0]]))
    result = describe.describe({"x": [0, 1], "y": [2]}, papers, unit, central_count=1)
    assert set(result) == {"x", "y"}
    assert result["x"]["size"] == 2
    assert result["x"]["central"] == [0]
    assert result["x"]["words"][0] == "robot"
    assert result["x"]["categories"] == {"cs.RO": 1.0}
    assert result["y"] == {
        "size": 1,
        "central": [2],
        "words": ["language", "models", "tokens"],
        "categories": {"cs.CL": 1.0},
    }
