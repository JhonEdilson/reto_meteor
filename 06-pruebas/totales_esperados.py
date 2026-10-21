# Recalcula total y tiempo esperados del spec con los datos limpios (hoja + respuestas de Toño, 20-oct).
# Tiempo = producto más demorado + trayecto de la zona (respuesta 6). Mínimo $15.000 en productos para domicilio.
MENU = {  # código: (precio, minutos de cocina)
    "HAM-02": (19500, 15), "HAM-03": (26000, 18), "HAM-04": (20000, 15), "PER-01": (12000, 8),
    "PER-02": (16000, 10), "SAL-01": (14000, 12), "SAL-02": (22000, 15), "PIC-02": (45000, 30),
    "COM-01": (26000, 15), "BEB-01": (4000, 0), "BEB-03": (6000, 5), "BEB-04": (9000, 5), "BEB-05": (6000, 5),
}
AD = {"AD-01": 2500, "AD-02": 3500, "AD-03": 7000, "AD-04": 2000, "AD-08": 5000}
ZONA = {"Laureles": (3000, 10), "Estadio": (3000, 10), "Conquistadores": (4000, 15), "Belén": (5000, 20),
        "La América": (5000, 20), "Centro": (6000, 25), "Recoger": (0, 0)}
MINIMO = 15000

def cotizar(lineas, zona):
    sub, coc = 0, 0
    for c, q in lineas:
        if c in MENU:
            sub += MENU[c][0] * q; coc = max(coc, MENU[c][1])
        elif c in AD:
            sub += AD[c] * q
        else:
            sub += c * q  # recargo suelto: diferencia de limonada, jugo en leche
    if zona != "Recoger":
        assert sub >= MINIMO, f"bajo el mínimo: {sub}"
    dom, tray = ZONA[zona]
    return sub + dom, coc + tray

casos = {
    "E01": (cotizar([("HAM-03", 1), ("AD-01", 1), ("AD-02", 1), ("BEB-01", 1)], "Laureles"), (39000, 28)),
    "E02": (cotizar([("COM-01", 1), (MENU["BEB-04"][0] - MENU["BEB-01"][0], 1), ("AD-01", 1)], "Recoger"), (33500, 15)),
    "E03": (cotizar([("PER-02", 1), ("AD-01", 2)], "Estadio"), (24000, 20)),
    "E05": (cotizar([("PIC-02", 1), ("AD-08", 1)], "Conquistadores"), (54000, 45)),
    "E06": (cotizar([("SAL-02", 1)], "Recoger"), (22000, 15)),
    "E07": (cotizar([("SAL-01", 2)], "Belén"), (33000, 32)),
    "E09": (cotizar([("PER-01", 2)], "Centro"), (30000, 33)),
    "E11": (cotizar([("PER-01", 1), ("BEB-01", 1)], "Laureles"), (19000, 18)),
    "E12": (cotizar([("SAL-01", 1)], "Recoger"), (14000, 12)),
    "E15": (cotizar([("HAM-04", 1), ("HAM-03", 1), ("AD-03", 1), ("BEB-05", 1), (1000, 1)], "La América"), (65000, 38)),
    "E17": (cotizar([("HAM-02", 1), ("AD-04", 1)], "Recoger"), (21500, 15)),
    "E18": (cotizar([("SAL-01", 1), ("AD-08", 1)], "Laureles"), (22000, 22)),
}
for k, (obtenido, esperado) in casos.items():
    assert obtenido == esperado, f"{k}: {obtenido} != {esperado}"
    print(k, "total", obtenido[0], "tiempo", obtenido[1], "min OK")
try:
    cotizar([("PER-01", 1)], "Laureles"); raise SystemExit("E11: debió fallar el mínimo")
except AssertionError:
    print("E11 sin gaseosa: 12000 < 15000, rechazado OK")
