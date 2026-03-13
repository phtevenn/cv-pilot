from gdocs_client import markdown_to_resume_html


def test_markdown_to_resume_html_styles_entry_lines_and_skills():
    markdown = """# Jane Doe
janedoe@example.com | linkedin.com/in/janedoe | San Francisco, CA

**EXPERIENCE**
**OpenAI** • **2023 - Present**
Senior Research Engineer
* Built **LLM** workflows for hiring ops.

**SKILLS**
Languages: Python, TypeScript, SQL
Frameworks: FastAPI, React
"""

    html = markdown_to_resume_html(markdown)

    assert 'class="rn"' in html
    assert 'class="entry"><strong>OpenAI</strong> • <strong>2023 - Present</strong></p>' in html
    assert 'class="role">Senior Research Engineer</p>' in html
    assert 'class="skill-label">Languages:</strong>' in html
    assert 'class="skill-value">Python, TypeScript, SQL</span>' in html


def test_markdown_to_resume_html_preserves_section_theming_and_inline_emphasis():
    markdown = """**SUMMARY**
Mission-driven engineer with *clear communication* and **technical depth**.
"""

    html = markdown_to_resume_html(markdown)

    assert 'class="rs">SUMMARY</p>' in html
    assert "<em>clear communication</em>" in html
    assert "<strong>technical depth</strong>" in html
