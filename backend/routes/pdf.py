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
  body {{ margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
</style>
</head>
<body class="font-sans bg-white">
<div style="width:{content_width_px}px">
{body}
</div>
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
    m = body.get("margins") or {}
    top = float(m.get("top", 0.25))
    bottom = float(m.get("bottom", 0.4))
    left = float(m.get("left", 0.5))
    right = float(m.get("right", 0.5))

    # Explicit pixel width of the printable area so content reflows identically to the preview
    content_width_px = round((8.5 - left - right) * 96)
    full_html = _PDF_TEMPLATE.format(body=html, content_width_px=content_width_px)

    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.set_viewport_size({"width": 900, "height": 20000})
        await page.set_content(full_html, wait_until="networkidle")
        pdf_bytes = await page.pdf(
            format="Letter",
            margin={
                "top": f"{top}in",
                "bottom": f"{bottom}in",
                "left": f"{left}in",
                "right": f"{right}in",
            },
            print_background=True,
        )
        await browser.close()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="resume.pdf"'},
    )
