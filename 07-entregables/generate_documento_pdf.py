# Genera documento-donde-tono.pdf desde documento-donde-tono.html (Playwright/Chromium, tamaño carta por @page).
# Verifica: 2 páginas, sin mojibake, cifras clave presentes; y deja un PNG por página para revisarlo a ojo.
# Uso (desde 07-entregables): python generate_documento_pdf.py
import pathlib, re
from playwright.sync_api import sync_playwright
from pypdf import PdfReader
import fitz  # PyMuPDF, solo para renderizar las páginas a PNG

aqui = pathlib.Path(__file__).parent
html = (aqui / "documento-donde-tono.html").read_text(encoding="utf-8")
pdf = aqui / "documento-donde-tono.pdf"
pdf.unlink(missing_ok=True)  # un generador que falla no debe dejar el PDF viejo para verificar

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    page.set_content(html, wait_until="networkidle")
    page.evaluate("document.fonts.ready")
    page.pdf(path=str(pdf), print_background=True, prefer_css_page_size=True)
    b.close()

r = PdfReader(str(pdf))
texto = "".join(pg.extract_text() for pg in r.pages)
plano = re.sub(r"\s+", "", texto)
print("páginas:", len(r.pages))
print("mojibake:", len(re.findall(r"[ÃÂ][\x80-\xbf]", texto)))
for dato in ["$22.000", "$15.000", "$45.000", "$6.000", "11de11", "24de24", "21pasan", "US$0,30", "26deoctubre"]:
    print(f"{dato}: {dato.replace(' ', '') in plano}")
assert len(r.pages) <= 2, "pasa de 2 páginas"

doc = fitz.open(str(pdf))
for i, pg in enumerate(doc):
    pg.get_pixmap(dpi=110).save(str(aqui / f"_revision-pag{i + 1}.png"))
print("PNG de revisión listos")
