# Crea las colecciones de Donde Toño en Meteor y carga los CSV de esta carpeta (fuente única de los datos).
# Idempotente: si la colección ya existe por nombre no la recrea, y el import hace upsert por la clave.
# Uso (desde la raíz de fase-02):
#   python -I 05-datos/cargar_colecciones.py          -> solo muestra qué haría, no llama al import
#   python -I 05-datos/cargar_colecciones.py --real   -> crea lo que falte y carga
# OJO (verificado 20-oct): el import con dryRun=true SÍ escribió los items. No se usa dryRun como validación;
# la validación es 06-pruebas/verificar_csv.py antes de cargar y la lectura de vuelta por API después.
import csv
import json
import pathlib
import sys
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")
AQUI = pathlib.Path(__file__).resolve().parent
RAIZ = AQUI.parent
ENV = dict(l.strip().split("=", 1) for l in open(RAIZ / ".env", encoding="utf-8") if "=" in l and not l.startswith("#"))
BASE = json.load(open(RAIZ / "developers/openapi.json", encoding="utf-8"))["servers"][0]["url"].rstrip("/")
REAL = "--real" in sys.argv

# Esquema: (name, type). El name es la clave de item.data y no se puede renombrar después.
CAMPOS_PEDIDO = [
    ("cliente", "text"), ("telefono", "text"), ("tipo", "text"), ("direccion", "text"), ("barrio", "text"),
    ("zona", "text"), ("detalle", "text"), ("subtotal", "number"), ("domicilio", "number"), ("total", "number"),
    ("pago", "text"), ("para_cuando", "text"), ("tiempo_estimado_min", "number"), ("estado", "text"),
    ("notas_cocina", "text"), ("registrado_por", "text")]

COLECCIONES = {
    "Menú": {"csv": "menu.csv", "clave": "codigo", "agente": True, "campos": [
        ("codigo", "text"), ("categoria", "text"), ("producto", "text"), ("descripcion", "text"),
        ("precio", "number"), ("tiempo_min", "number"), ("disponible", "boolean"), ("notas", "text")]},
    "Adiciones": {"csv": "adiciones.csv", "clave": "codigo", "agente": True, "campos": [
        ("codigo", "text"), ("adicion", "text"), ("precio", "number"), ("aplica_a", "text"),
        ("maximo", "number"), ("disponible", "boolean")]},
    "Zonas": {"csv": "zonas.csv", "clave": "zona", "agente": True, "campos": [
        ("zona", "text"), ("tarifa", "number"), ("tiempo_min", "number"), ("cubre", "boolean"), ("notas", "text")]},
    # Pedidos arranca vacía y oculta al LLM: solo la escribe el flujo de crear_pedido (spec C-12, privacidad).
    "Pedidos": {"csv": None, "clave": None, "agente": False, "campos": CAMPOS_PEDIDO},
    # Pedidos de prueba (21-oct): los pedidos que crean las pruebas pasan por crear_pedido y caen en Pedidos, como uno real.
    # Después correr_evals.mjs los copia aquí (con el código original) y los borra de Pedidos, que queda solo con los reales.
    # Se descartó marcarlos con un campo en Pedidos: el filtro "no es" de las vistas del panel no filtra.
    "Pedidos de prueba": {"csv": None, "clave": None, "agente": False,
                          "campos": CAMPOS_PEDIDO + [("codigo_original", "text"), ("origen", "text")]},
    # Evals: un item por escenario del spec §11. Oculta al LLM: si Lau la leyera, vería las respuestas esperadas.
    # La escribe 06-pruebas/correr_evals.mjs --publicar (upsert por escenario).
    "Evals": {"csv": None, "clave": None, "agente": False, "campos": [
        ("escenario", "text"), ("nombre", "text"), ("criterio", "text"), ("cliente_dijo", "text"),
        ("esperado", "text"), ("resultado", "text"), ("como_se_califico", "text"), ("causa_y_arreglo", "text"),
        ("run_ids", "text"), ("pedido", "text"), ("transcripcion", "text"), ("fecha", "text")]},
}


def api(metodo, ruta, cuerpo=None):
    req = urllib.request.Request(BASE + ruta, method=metodo,
                                 data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
                                 headers={"Authorization": "Bearer " + ENV["MET_API_KEY"],
                                          "Content-Type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:  # no tragarse el error: se muestra el cuerpo y se corta
        sys.exit(f"{metodo} {ruta} -> {e.code}: {e.read().decode()[:500]}")


def datos(r):
    return r.get("data", r) if isinstance(r, dict) else r


def fila(r, campos):
    """CSV -> dict tipado. Vacío = se omite el campo (null en Meteor)."""
    tipos = dict(campos)
    out = {}
    for k, v in r.items():
        if v == "":
            continue
        out[k] = int(v) if tipos[k] == "number" else (v == "Sí") if tipos[k] == "boolean" else v
    return out


existentes = {c["name"]: c for c in datos(api("GET", f"/workspaces/{ENV['WORKSPACE_ID']}/collections"))
              if c.get("workspace_id") == int(ENV["WORKSPACE_ID"])}

for nombre, cfg in COLECCIONES.items():
    col = existentes.get(nombre)
    if col is None:
        if not REAL:
            print(f"{nombre}: no existe; se crea con --real ({len(cfg['campos'])} campos)")
            continue
        col = datos(api("POST", "/collections", {"name": nombre, "expose_to_agent": cfg["agente"]}))
        for name, tipo in cfg["campos"]:
            api("POST", f"/collections/{col['id']}/fields", {"name": name, "type": tipo})
        print(f"{nombre}: creada id {col['id']}")
    if cfg["csv"]:
        with open(AQUI / cfg["csv"], encoding="utf-8", newline="") as f:
            filas = [fila(r, cfg["campos"]) for r in csv.DictReader(f)]
        if not REAL:
            print(f"{nombre} (id {col['id']}): {len(filas)} filas listas; se cargan con --real")
            continue
        # Upsert por la clave: una fila igual sale como "skipped", una cambiada como "updated"
        res = datos(api("POST", f"/collections/{col['id']}/items/import",
                        {"rows": filas, "keyField": cfg["clave"], "fileName": cfg["csv"]}))
        print(f"{nombre} (id {col['id']}): {len(filas)} filas -> {json.dumps(res, ensure_ascii=False)[:300]}")
