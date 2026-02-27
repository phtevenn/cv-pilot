from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from deps import get_current_user

router = APIRouter()

_PDF_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
</style>
</head>
<body class="font-sans bg-white">
{body}
</body>
</html>
"""


@router.post("/pdf")
async def export_pdf(
    request: Request,
    user: dict = Depends(get_current_user),
) -> Response:
    body = await request.json()
    html: str = body.get("html", "")

    full_html = _PDF_TEMPLATE.format(body=html)

    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.set_viewport_size({"width": 900, "height": 20000})
        await page.set_content(full_html, wait_until="networkidle")
        pdf_bytes = await page.pdf(
            format="Letter",
            margin={
                "top": "0.4in",
                "bottom": "0.4in",
                "left": "0.5in",
                "right": "0.5in",
            },
            print_background=True,
        )
        await browser.close()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="resume.pdf"'},
    )
