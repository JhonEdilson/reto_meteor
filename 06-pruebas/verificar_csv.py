# Verifica los CSV de 05-datos contra el spec §5b y contra los precios que usan los escenarios
# (totales_esperados.py). Si los dos divergen, los totales esperados del banco de pruebas mienten.
# Uso: python -I 06-pruebas/verificar_csv.py  (desde la raíz de fase-02)
import csv
import pathlib
import sys

sys.stdout.reconfigure(encoding="utf-8")
AQUI = pathlib.Path(__file__).resolve().parent
DATOS = AQUI.parent / "05-datos"
sys.path.insert(0, str(AQUI))  # -I no agrega la carpeta del script al path
import totales_esperados as t  # corre también sus asserts


def leer(nombre):
    with open(DATOS / nombre, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


menu = {r["codigo"]: r for r in leer("menu.csv")}
adic = {r["codigo"]: r for r in leer("adiciones.csv")}
zonas = {r["zona"]: r for r in leer("zonas.csv")}

# Conteos: la hoja trae 25 productos; HAM-01 sale (resp. 1 de Toño)
assert len(menu) == 24 and "HAM-01" not in menu, len(menu)
assert len(adic) == 9 and len(zonas) == 8, (len(adic), len(zonas))

# Cambios de la §5b
assert menu["HAM-02"]["producto"] == "Hamburguesa clásica" and "cebolla" in menu["HAM-02"]["descripcion"]
assert menu["PIC-02"]["precio"] == "45000" and menu["SAL-03"]["precio"] == "38000"
assert menu["ALM-01"]["tiempo_min"] == "20"
assert menu["SAL-02"]["disponible"] == "Sí" and "gratinado" not in menu["SAL-02"]["descripcion"]
assert "gratinado" not in menu["PER-02"]["descripcion"]
assert adic["AD-08"]["aplica_a"] == "Salchipapas, Picadas"
assert zonas["Centro"]["tarifa"] == "6000" and zonas["Centro"]["tiempo_min"] == "25"
assert zonas["El Poblado"]["cubre"] == "No"

# Ningún precio con formato: solo dígitos
for r in list(menu.values()) + list(adic.values()):
    assert r["precio"].isdigit(), r["codigo"]
for col in (menu, adic):
    for r in col.values():
        assert r["disponible"] in ("Sí", "No"), r["codigo"]

# Los escenarios usan los mismos precios y tiempos que la carga
for cod, (precio, minutos) in t.MENU.items():
    assert int(menu[cod]["precio"]) == precio, cod
    assert int(menu[cod]["tiempo_min"] or 0) == minutos, cod
for cod, precio in t.AD.items():
    assert int(adic[cod]["precio"]) == precio, cod
for z, (tarifa, minutos) in t.ZONA.items():
    fila = zonas["Recoger en el local" if z == "Recoger" else z]
    assert (int(fila["tarifa"]), int(fila["tiempo_min"])) == (tarifa, minutos), z

print(f"CSV OK: menú {len(menu)}, adiciones {len(adic)}, zonas {len(zonas)}; coinciden con los escenarios")
