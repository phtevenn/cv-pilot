"""Unit tests for job search helpers and limit validation."""

import pytest
from pydantic import ValidationError

from routes.jobs import (
    SearchRequest,
    _extract_keywords,
    _format_salary,
    _keyword_score,
    _RECO_MAX,
)


class TestExtractKeywords:
    def test_filters_stopwords(self):
        result = _extract_keywords("a the python developer and react")
        assert "python" in result
        assert "developer" in result
        assert "react" in result
        assert "the" not in result
        assert "and" not in result

    def test_lowercases_input(self):
        result = _extract_keywords("Python FastAPI AWS")
        assert "python" in result
        assert "fastapi" in result
        assert "aws" in result

    def test_empty_string(self):
        assert _extract_keywords("") == set()

    def test_short_words_excluded(self):
        # regex pattern requires at least 3 chars (one leading + {2,} more)
        result = _extract_keywords("go python")
        assert "python" in result
        assert "go" not in result

    def test_returns_set(self):
        result = _extract_keywords("python python python")
        assert isinstance(result, set)
        assert result == {"python"}


class TestKeywordScore:
    def test_counts_overlap(self):
        resume_kw = {"python", "fastapi", "docker", "aws"}
        score = _keyword_score(resume_kw, "Python developer with AWS experience")
        assert score == 2  # "python" and "aws"

    def test_no_overlap(self):
        resume_kw = {"java", "spring", "oracle"}
        score = _keyword_score(resume_kw, "React TypeScript developer")
        assert score == 0

    def test_full_overlap(self):
        resume_kw = {"python", "fastapi"}
        score = _keyword_score(resume_kw, "python fastapi backend")
        assert score == 2

    def test_empty_resume_keywords(self):
        score = _keyword_score(set(), "python developer")
        assert score == 0

    def test_empty_job_text(self):
        score = _keyword_score({"python", "fastapi"}, "")
        assert score == 0


class TestFormatSalary:
    def test_min_and_max(self):
        raw = {"job_min_salary": 80000, "job_max_salary": 120000, "job_salary_period": "YEAR"}
        assert _format_salary(raw) == "$80,000–$120,000 YEAR"

    def test_min_only(self):
        raw = {"job_min_salary": 50000, "job_salary_period": "YEAR"}
        assert _format_salary(raw) == "$50,000+ YEAR"

    def test_no_salary(self):
        assert _format_salary({}) is None

    def test_max_only_returns_none(self):
        # only max with no min → falls through to None
        raw = {"job_max_salary": 100000, "job_salary_period": "YEAR"}
        assert _format_salary(raw) is None


class TestSearchRequestValidation:
    def test_default_limit_is_zero(self):
        req = SearchRequest(job_titles="software engineer")
        assert req.limit == 0

    def test_limit_zero_accepted(self):
        req = SearchRequest(job_titles="engineer", limit=0)
        assert req.limit == 0

    def test_limit_one_accepted(self):
        req = SearchRequest(job_titles="engineer", limit=1)
        assert req.limit == 1

    def test_limit_max_boundary(self):
        req = SearchRequest(job_titles="engineer", limit=_RECO_MAX)
        assert req.limit == _RECO_MAX

    def test_limit_exceeds_max_raises(self):
        with pytest.raises(ValidationError):
            SearchRequest(job_titles="engineer", limit=_RECO_MAX + 1)

    def test_negative_limit_raises(self):
        with pytest.raises(ValidationError):
            SearchRequest(job_titles="engineer", limit=-1)

    def test_defaults(self):
        req = SearchRequest(job_titles="data scientist")
        assert req.location == ""
        assert req.remote_only is False
        assert req.limit == 0


class TestRecoMax:
    def test_reco_max_is_25(self):
        assert _RECO_MAX == 25

    def test_reco_limit_in_valid_range(self):
        from config import RECO_LIMIT
        assert 1 <= RECO_LIMIT <= _RECO_MAX
