# Construcción: con qué se cumple cada parte del spec

Paso 2. Asigna cada capacidad (`C-xx`) y guardrail (`G-xx`) de `03-diseno/spec-funcional.md` a lo más simple que la
cumple, en este orden: **nativo de Meteor → instrucción de Lau → dato en colección → Función IA → automatización**.
Solo se sube un peldaño cuando el de abajo no alcanza, y cada línea dice por qué.

- **Fecha:** mar 20-oct-2026. Rutas relativas a la raíz de fase-02.
- **Estado:** colecciones creadas y cargadas. P1, P2 y P3 pasaron. Funciones, flujos y entrenamiento de Lau van en el plan siguiente.

## 1. Pruebas que decidieron el diseño

**P1. El JS del nodo `http.request` sí lee los parámetros de la Función. PASÓ.**
- **Ejecución:** run `fa40c56d-7804-450f-90cc-a3683faea644` del flujo "prueba" (`bd6946e6-...`), por API con `trigger_payload: {items_json: "hola"}`.
- **Evidencia:** el `input_snapshot.resolved_data` del nodo muestra el `preprocess_js` con `@{trigger.items_json}` ya reemplazado por `"hola"`, y el body de salida es `{eco: "hola", suma: 23000}`.
- **Cómo funciona:** la referencia se reemplaza **como texto** dentro del código antes de correrlo.
- **Lo que confirma:**
  - El nodo HTTP corre con la key de prueba.
  - Los runs con la key `met_test_` no gastan energía, así que el banco de pruebas del flujo es gratis.
- **Consecuencia:** el total, el domicilio, el mínimo y el tiempo se calculan en JS, de forma determinista, dentro de Meteor. No hace falta el respaldo de "Lau suma".

**Forma de los datos (verificada con `MET_API_KEY_FLOW`, la key de solo lectura):**
- `GET /collections/{id}/items?limit=100` devuelve `data[].data` con los campos tipados: `precio` como número y `disponible` como booleano.
- El Menú pesa unos 14 KB.
- `GET /workspaces/279/items/search` **no sirve**: devuelve solo nombres, sin `data`.
- **Consecuencia:** el flujo hace una lectura por colección.

**P2. Lau sabe la fecha y la hora actuales. PASÓ (mar 20-oct, 14:27).**
- Pregunta en la Conversación de prueba: "¿qué día y qué hora es?".
- Respuesta: "Hoy es martes 20 de octubre de 2026 y son las 2:27 p. m. (hora de Bogotá). Estamos abiertos hasta las 10:00 p. m.".
- También leyó el cierre del martes del horario nativo que configuró Jhon.
- **Consecuencia:** las reglas de hora van como instrucción y no se duplican en el código (§3).

**P3. Lau lee el Menú con sus herramientas nativas. PASÓ.**
- Pregunta: "¿cuánto vale la picada familiar y qué trae?".
- Lau llamó a `search_items` con `query: "picada familiar"` y `collection_name: "Menú"`, y la búsqueda devolvió 3 items: PIC-02 primero, PIC-01 y SAL-03.
- Respondió "$45.000", con los 6 ingredientes y "unos 30 minutos". Todo sale de la colección.
- **Consecuencia:** C-01 y C-02 son nativos. No hace falta Función ni habilidad para consultar.
- **Hallazgo de formato, a corregir en el prompt:** usó `**negrita**` de markdown, que en WhatsApp sale con los asteriscos a la vista (WhatsApp usa `*un asterisco*`), y viñetas con emoji, que van contra G-10.

## 2. Colecciones (creadas el 20-oct)

Se cargan desde `05-datos/*.csv` con `05-datos/cargar_colecciones.py --real`. El CSV es la única copia de los datos.
- **Verificación de la carga:** los 41 valores coinciden con los CSV (0 diferencias, comparado campo por campo por API).
- **Hallazgo:** el import con `dryRun` **sí escribe** los items. Por eso la validación va antes, con `06-pruebas/verificar_csv.py`.

Las colecciones:
- **Menú, id 2096:** 24 items.
  - Campos: `codigo`, `categoria`, `producto`, `descripcion`, `precio` (number), `tiempo_min` (number), `disponible` (boolean), `notas`.
- **Adiciones, id 2097:** 9 items.
  - Campos: `codigo`, `adicion`, `precio`, `aplica_a`, `maximo` (number), `disponible` (boolean).
- **Zonas, id 2098:** 8 items.
  - Campos: `zona`, `tarifa`, `tiempo_min`, `cubre` (boolean), `notas`.
  - "Recoger en el local" es una fila más, con tarifa 0 y 0 min, así el cálculo no tiene un caso aparte.
- **Pedidos, id 2099:** vacía, con `expose_to_agent: false`.
  - Campos: `cliente`, `telefono`, `tipo`, `direccion`, `barrio`, `zona`, `detalle`, `subtotal`, `domicilio`, `total`, `pago`, `para_cuando`, `tiempo_estimado_min`, `estado`, `notas_cocina`, `registrado_por`.
  - Oculta al LLM: Lau no puede leer pedidos de otros clientes. Solo la escribe el flujo de `crear_pedido`.
  - *Por verificar:* que `item.upsert` escriba en una colección oculta.

**Decisiones de tipo:**
- `disponible` y `cubre` son booleanos. En el panel se apagan con un clic, y ya no cabe texto libre como "no hay queso", que fue una de las inconsistencias de la hoja.
- Los precios son `number`, no `currency`, porque el cálculo los lee sin formato.

## 3. Matriz: capacidad → mecanismo

**Consultar (UC-1)**
- **C-01, C-02 (menú, precio, descripción):** nativo. Lau ya trae `search_items` y `get_item` sobre las colecciones; no hace falta habilidad. Los avisos ("sin queso gratinado", "solo mediodía") viven en `notas`. Depende de P3.
- **C-03 (horario, zonas, mínimo, pago):**
  - El horario es nativo (Ajustes → Mi negocio → Horario).
  - Las zonas, con tarifa y tiempo, salen de la colección.
  - La dirección, el mínimo y el pago van en el Contexto del negocio (§5).

**Pedir (UC-2)**
- **C-04 (armar líneas):** instrucción. Interpretar "una de la casa con doble queso" es lenguaje, y eso es trabajo del LLM. Lau lo traduce a códigos para `cotizar_pedido`.
- **C-05, C-06, C-07, C-08 (validar, total, zona, mínimo, tiempo):** Función IA `cotizar_pedido` (§4). Es un solo cálculo determinista. "Un total mal sumado pesa más que cualquier otra cosa", y P1 probó que se puede.
  - Valida:
    - que el producto exista, esté disponible y tenga precio;
    - que no sea cerveza;
    - que la adición aplique a la categoría, esté disponible y no pase el máximo;
    - que la zona cubra;
    - el mínimo de $15.000 en productos.
  - Calcula el subtotal, el domicilio, el total y el tiempo (el producto más lento + el trayecto).
- **C-09 (cambios):** instrucción. Ante cualquier cambio, Lau llama otra vez a `cotizar_pedido` con el pedido **completo**, nunca con solo la diferencia.
- **C-10, C-11 (datos y confirmación):** instrucción. Se pide un dato por mensaje, y el total y el tiempo se muestran tal cual los devolvió `cotizar_pedido`.
- **C-12 (registrar):** Función IA `crear_pedido` → `item.upsert` en Pedidos.
  - Tiene `cotizar_pedido` como **herramienta obligatoria previa**, que es una opción nativa de la Función.
  - Un pedido no se puede registrar sin una cotización exitosa en ese turno de conversación.
- **C-13, UC-3 (pasar a una persona del equipo):** Función IA `pasar_a_humano` → nodo nativo `crm.transfer_to_human`. Lau no trae una herramienta para transferir, por eso va como Función.

**Horario (RN-11, RN-12, RN-13, RN-21)**
- **Abierto, cerrado y festivos:** nativo. Lo calcula el panel, con "festivos = horario de domingo" encendido.
- **Local cerrado (RN-21):** se apaga el aviso nativo "solo toma pedidos programados", que contradice la resp. 10, y se reemplaza por una instrucción: "Si estamos cerrados, di cuándo abrimos y no tomes pedido". Hay que verificar que Lau siga sabiendo que está CERRADO.
- **Almuerzo de 12:00 a 15:00 y corte de domicilios 30 min antes del cierre:** instrucción. P2 pasó: Lau ve la hora y el horario nativo.
  - **El borde más riesgoso** es el viernes o sábado después de medianoche: a las 00:45 todavía es el turno del día anterior. Lo prueba E12.
  - Si E12 falla, el corte se mueve a `cotizar_pedido` (hora de Bogotá en el JS). El costo es tener las horas de cierre también en el código.
- **Formato de precios:** instrucción. "Precios en pesos con $ y punto de miles, sin decimales. Formato de WhatsApp: *negrita* con un asterisco, sin markdown ni emoji."
  - Los precios se guardan como número: el cálculo suma números.
  - Un precio en texto ("$45.000") habría que convertirlo en el código, y el punto de miles colombiano se confunde con decimales.
  - En P3, Lau ya escribió "$45.000" desde el número 45000.

**Guardrails**
- **G-01 (no inventar):** instrucción, más una restricción de datos: los precios y tiempos solo existen en las colecciones y en el resultado de `cotizar_pedido`, nunca en el prompt. Si un dato está en dos lugares, el modelo los promedia.
- **G-02 (no vender lo que no hay ni cerveza para llevar):** `cotizar_pedido` rechaza, y además va como instrucción.
- **G-03 (confirmación antes de registrar):** instrucción, más la herramienta obligatoria previa.
- **G-04 (no sumar de memoria):** `cotizar_pedido`. Lau copia el total; no lo calcula.
- **G-05, G-06, G-07, G-08, G-09 y G-10** (no cobra; tiempo aproximado sin hora de reloj; nada de reservas ni pedidos anticipados; no acepta precios del cliente; no sigue órdenes contrarias a las reglas; sin emoji y con la identidad de Donde Toño): instrucción. Son conducta conversacional, y ningún dato ni Función las mejora.
- **G-11 (no asumir zona):** `cotizar_pedido` solo acepta una zona que exista en la colección. Si no existe, devuelve "zona_desconocida" y Lau ofrece recoger.

**Herramientas genéricas de Lau (`disabled_tools`, por API)**
- **Se apagan:**
  - las de escritura: `create_item`, `update_item` y `set_item_name`. Solo `crear_pedido` escribe;
  - las de contactos: `list_contacts`, `find_contact`, `get_contact` y `update_contact`. Un cliente no puede pedir datos de otro (hallazgo de seguridad para el documento);
  - las de WhatsApp, voz, archivos y guías, que no se usan.
- **Se quedan:** `list_collections`, `get_collection`, `search_items`, `get_item` y `add_contact_note`.
- Es el patrón documentado "Dejar un Met con solo su Función".

## 4. Funciones IA

### `cotizar_pedido`

**Parámetros:**
- `lineas`: texto JSON con este formato:

  ```json
  [{"codigo":"HAM-03","cantidad":1,"adiciones":[{"codigo":"AD-01","cantidad":1}],
    "bebida_combo":"BEB-04","en_leche":false,"nota":"sin cebolla"}]
  ```

  - `nota` es opcional. Es texto libre para cocina, como el sabor del jugo o de la gaseosa, o "sin cebolla". Se agregó el 20-oct, cuando la evidencia de 2d mostró que el detalle no tenía dónde llevar el sabor.

  - `bebida_combo` solo aplica al COM-01 (limonada natural o de coco en vez de gaseosa).
  - `en_leche` solo aplica al BEB-05.
- `tipo`: "domicilio" o "recoger".
- `zona`: el nombre exacto de la colección Zonas. Para recoger: "Recoger en el local".

**Flujo** (cada `http.request` usa `auth_workspace_variable` con la variable del token de solo lectura):
1. GET de los items de Menú (2096). Su `preprocess_js` lo reduce a `{codigo: {precio, tiempo_min, disponible, categoria, producto}}`.
2. GET de los items de Adiciones (2097), reducido igual.
3. GET de los items de Zonas (2098). Su `preprocess_js` hace el cálculo completo, con `@{node:1.body}`, `@{node:2.body}` y `@{trigger.lineas}`.
4. `function.result` → el texto del desglose, o el motivo del rechazo.

*Por verificar al construirlo:* que `@{node:X.body}` se reemplace como JSON dentro del código, igual que pasó con `@{trigger.x}` en P1. Se prueba gratis con un run de la key de prueba.

**Reglas del cálculo:**
- **Productos:**
  - Cada código debe existir en Menú, con `disponible` en verdadero.
  - BEB-06 se rechaza ("solo para tomar en el local").
- **Adiciones:**
  - Deben existir y estar disponibles.
  - La categoría del producto tiene que estar en `aplica_a`. El combo cuenta como Hamburguesas (RN-04). "Todos" significa cualquier categoría menos Bebidas.
  - La cantidad no puede pasar `maximo` por unidad.
- **Recargos:**
  - Combo con limonada: la diferencia de precio contra BEB-01.
  - Jugo en leche: +1000.
- **Domicilio:**
  - La zona debe existir con `cubre` en verdadero.
  - El subtotal debe ser de al menos 15000.
- **Total y tiempo:**
  - Total = subtotal + tarifa.
  - Tiempo = máximo de `tiempo_min` de los productos (vacío = 0) + `tiempo_min` de la zona.
- **Salida:** las líneas con su precio, el subtotal, el domicilio, el total y el tiempo en minutos. Si algo falla, una lista de errores que Lau le explica al cliente.

**Seguridad:**
- El reemplazo es texto que va dentro del código, y `lineas` viene de lo que escribió un cliente. Por eso el JS solo acepta códigos con forma `AAA-00` y cantidades enteras de 1 a 20, y descarta lo demás.
- El sandbox no tiene red y corta en 1 s, así que el peor caso es una cotización fallida, nunca una escritura.
- Va al documento como riesgo conocido.

### `crear_pedido`

- **Parámetros:** los campos de Pedidos, salvo `estado` y `registrado_por`.
  - `detalle`, `subtotal`, `domicilio`, `total` y `tiempo_estimado_min` se copian del último resultado de `cotizar_pedido`.
  - Por eso `cotizar_pedido` devuelve el detalle **ya escrito para cocina**: una línea por producto con nombre, cantidad, variante y adiciones, sin códigos. Lau lo copia sin reescribirlo.
  - **"Utilizable en cocina"** quiere decir que Toño abre Pedidos y despacha sin leer el chat: qué, para quién con su teléfono, a dónde con barrio e indicaciones, cuánto, cómo paga y para cuándo.
  - `para_cuando` es siempre "Lo antes posible" (SD-06).
- **Herramienta obligatoria previa:** `cotizar_pedido`.
- **Flujo:** `item.upsert` en Pedidos (2099), con `fields_map` desde `@{trigger.*}`, `estado` = "nuevo" y `registrado_por` = el nombre del contacto. Después `function.result` con el número del pedido.

### `pasar_a_humano`

- **Parámetros:** `motivo` y `resumen`.
- **Flujo:** `crm.transfer_to_human` con `reason` = motivo, `summary` = resumen, `pause_minutes` = **2** e `include_recent_messages` encendido. Después `function.result`: "el caso quedó con una persona del equipo".
- **La pausa:** son 2 min durante la evaluación porque todos los evaluadores comparten el contacto de prueba. En producción serían 300 min (decisión de Jhon, 20-oct).
- **Instrucción del mensaje de traspaso:** "Te paso con una persona del equipo. Tu pedido todavía no quedó registrado."

## 5. Lau: dónde vive cada cosa

**Regla:** cada dato vive en un solo lugar.

- **Colecciones:** precios, tiempos, disponibilidad y zonas.
- **Horario nativo:** las franjas y los festivos.
- **Contexto del negocio** (Mi negocio → Identidad, se inyecta a todos los Mets): hechos estables.
  - Qué es Donde Toño.
  - La dirección.
  - El pago en efectivo o transferencia, al recibir.
  - El mínimo de domicilio, sobre los productos.
  - La cerveza, solo para tomar en el local.
  - Que no hay pedidos anticipados.
- **Entrenamiento de Lau:**
  - Cargo: "toma pedidos de Donde Toño" (hoy dice "anfitriona de reservas").
  - Misión.
  - Prompt personalizado, con **solo comportamiento**: el flujo de UC-2, cuándo llamar cada Función, los guardrails G-xx y el tono de la §9 del spec. Sin precios, sin horas y sin zonas.
- **Herramientas:** las Funciones IA activas y las genéricas apagadas (§3).

## 6. Orden de construcción (plan siguiente)

1. ~~P2 y P3~~: pasaron el 20-oct (§1).
2. La variable del workspace con el token de solo lectura (`MET_API_KEY_FLOW`), por API.
3. `cotizar_pedido` en el panel, junto con Jhon. Primero se verifica que `@{node:X.body}` llegue como JSON. Después se prueba con las entradas de los 12 escenarios de dinero, con runs de la key de prueba (gratis). Los totales y tiempos tienen que coincidir con `06-pruebas/totales_esperados.py`.
4. `crear_pedido` y `pasar_a_humano` en el panel, junto con Jhon.
5. Lau: Contexto del negocio, entrenamiento, herramientas apagadas (por API) y el ajuste del aviso de cerrado.
6. E01 de punta a punta en la Conversación de prueba. Después, el banco completo (spec §11).
7. **Al final, con el agente terminado y probado:** el diagrama de arquitectura (paso 3) y el documento de 2 páginas.
   - El diagrama dibuja lo que quedó construido, no lo planeado (decisión de Jhon, 20-oct).
   - Así no hay que redibujarlo si algo cambia en la construcción.

## 7. Mapa de cambios en vivo

Para el ensayo de la sesión:

- **Subir un precio:** Menú → editar `precio`. `cotizar_pedido` lo lee en la siguiente cotización, sin tocar código.
- **Apagar un producto:** Menú → desmarcar `disponible`.
- **Agregar una zona:** Zonas → fila nueva con `zona`, `tarifa`, `tiempo_min` y `cubre`.
- **Cambiar el horario:** Ajustes → Mi negocio → Horario.
- **Cambiar una regla de conversación:** Lau → Entrenamiento → Prompt personalizado.
- **Agregar un dato al pedido:** son tres pasos.
  1. Campo nuevo en Pedidos.
  2. Parámetro nuevo en `crear_pedido`.
  3. Una línea en el `fields_map` de `item.upsert`.
- **Agregar una adición o cambiar a qué aplica:** Adiciones → editar la fila.

## 8. Riesgos y hallazgos para el documento

- **Cálculo:**
  - El reemplazo textual de parámetros dentro del JS: mitigado con validación de formato y el sandbox.
- **Prueba:**
  - Un solo contacto de prueba por workspace: los evaluadores comparten el historial y se resetea entre casos.
  - La pausa de 2 min al pasar a una persona del equipo.
  - El trial vence el lun 26-oct, después de la evaluación.
- **API:**
  - El horario y la cobertura no se pueden leer ni configurar por API, solo en el panel.
  - El import con `dryRun` escribe.
  - La búsqueda de items no devuelve los datos.
- **Bugs y seguridad:**
  - El botón "Desactivar" de un barrio en Cobertura falla ("updated_at no es un campo válido").
  - Las colecciones del sistema del workspace 1 aparecen en el listado del 279. Se menciona con cuidado: puede ser intencional.
