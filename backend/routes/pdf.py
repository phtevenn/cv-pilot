import markdown as md_lib
from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from deps import get_current_user

router = APIRouter()

_PDF_CSS = """
body {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.5;
  color: #1a1a1a;
  max-width: 720px;
  margin: 0 auto;
  padding: 0;
}
h1 { font-size: 22pt; font-weight: 700; margin: 0 0 4px; }
h2 {
  font-size: 11pt; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em;
  border-bottom: 1.5px solid #333;
  margin: 18px 0 8px; padding-bottom: 3px;
}
h3 { font-size: 10.5pt; font-weight: 600; margin: 10px 0 2px; }
p { margin: 3px 0 6px; }
ul { margin: 4px 0 8px; padding-left: 18px; }
li { margin: 2px 0; }
strong { font-weight: 600; }
a { color: #1a0dab; text-decoration: none; }
/* Bold-only paragraph → styled as a section header */
p > strong:only-child {
  display: block;
  font-size: 10.5pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1.5px solid #333;
  margin-top: 16px;
  padding-bottom: 3px;
}
"""

_PDF_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>{css}</style>
</head>
<body>{body}</body>
</html>
"""


@router.post("/pdf")
async def export_pdf(
    request: Request,
    user: dict = Depends(get_current_user),
) -> Response:
    body = await request.json()
    content: str = body.get("content", "")

    html_body = md_lib.markdown(
        content,
        extensions=["tables", "nl2br", "sane_lists"],
    )
    full_html = _PDF_TEMPLATE.format(css=_PDF_CSS, body=html_body)

    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.set_content(full_html, wait_until="networkidle")
        pdf_bytes = await page.pdf(
            format="Letter",
            margin={
                "top": "0.6in",
                "bottom": "0.6in",
                "left": "0.75in",
                "right": "0.75in",
            },
            print_background=True,
        )
        await browser.close()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="resume.pdf"'},
    )
