from routes.gdocs import _SYSTEM_PROMPT_TEMPLATE


def test_gdocs_prompt_requires_formatter_friendly_entry_and_skill_shapes():
    assert "ENTRY FORMAT" in _SYSTEM_PROMPT_TEMPLATE
    assert "**OpenAI** • **2023 - Present**" in _SYSTEM_PROMPT_TEMPLATE
    assert "Senior Research Engineer" in _SYSTEM_PROMPT_TEMPLATE
    assert "SKILLS FORMAT" in _SYSTEM_PROMPT_TEMPLATE
    assert "Label: item, item, item" in _SYSTEM_PROMPT_TEMPLATE
    assert "MARKDOWN DISCIPLINE" in _SYSTEM_PROMPT_TEMPLATE
