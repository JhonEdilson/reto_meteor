// Nodo "Calcular" del flujo de cotizar_pedido (preprocess_js del GET a Zonas). Copia de lo que vive en Meteor.
// Antes de pegarlo en el panel, cada palabra en MAYÚSCULA se reemplaza por su chip:
//   MENU -> body del nodo 1 · ADIC -> body del nodo 2 · LINEAS, TIPO, ZONA -> parámetros de la Función.
// Meteor pega los chips como texto antes de correr el código (verificado 20-oct, run 218ca3ea).
const menu = MENU;
const adic = ADIC;
const lineas = LINEAS;
const tipo = "TIPO".trim().toLowerCase();
const zonaPedida = "ZONA";

const MINIMO = 15000;  // mínimo en productos para domicilio (RN-16)
const pesos = n => '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

const errores = [], detalle = [], desglose = [];
let subtotal = 0, cocina = 0;

if (!Array.isArray(lineas) || lineas.length === 0) errores.push('El pedido no trae productos.');

for (const l of Array.isArray(lineas) ? lineas : []) {
  const cod = String(l.codigo || '').toUpperCase();
  const cant = l.cantidad;
  const p = menu[cod];
  // lineas viene de lo que escribió el cliente: solo códigos con forma AAA-00 y cantidades de 1 a 20
  if (!/^[A-Z]{2,3}-\d{2}$/.test(cod) || !p) { errores.push(`No existe el producto ${cod || '(vacío)'}.`); continue; }
  if (!Number.isInteger(cant) || cant < 1 || cant > 20) { errores.push(`Cantidad no válida para ${p.producto}.`); continue; }
  if (!p.disponible) { errores.push(`${p.producto} no está disponible hoy.`); continue; }
  if (cod === 'BEB-06') { errores.push('La cerveza es solo para tomar en el local: no va a domicilio ni para recoger.'); continue; }

  let unidad = p.precio;
  const extras = [];
  // Combo: limonada en vez de gaseosa paga la diferencia contra la gaseosa personal
  if (cod === 'COM-01' && l.bebida_combo && l.bebida_combo !== 'BEB-01') {
    const b = menu[l.bebida_combo];
    if (!['BEB-03', 'BEB-04'].includes(l.bebida_combo) || !b || !b.disponible) {
      errores.push('La bebida del combo puede ser gaseosa, limonada natural o limonada de coco.'); continue;
    }
    unidad += b.precio - menu['BEB-01'].precio;
    extras.push(`con ${b.producto}`);
  }
  if (l.en_leche) {
    if (cod !== 'BEB-05') { errores.push('Solo el jugo natural se puede pedir en leche.'); continue; }
    unidad += 1000;
  }
  // Adiciones: el combo cuenta como hamburguesa (RN-04); "Todos" es cualquier cosa menos bebidas
  const cat = cod === 'COM-01' ? 'Hamburguesas' : p.categoria;
  for (const a of Array.isArray(l.adiciones) ? l.adiciones : []) {
    const ac = String(a.codigo || '').toUpperCase(), an = a.cantidad ?? 1, ad = adic[ac];
    if (!ad) { errores.push(`No existe la adición ${ac || '(vacía)'}.`); continue; }
    if (!ad.disponible) { errores.push(`${ad.nombre} no está disponible hoy.`); continue; }
    const aplica = ad.aplica.includes('Todos') ? cat !== 'Bebidas' : ad.aplica.includes(cat);
    if (!aplica) { errores.push(`${ad.nombre} no se le puede agregar a ${p.producto}.`); continue; }
    if (!Number.isInteger(an) || an < 1 || an > ad.max) { errores.push(`${ad.nombre}: máximo ${ad.max} por ${p.producto}.`); continue; }
    unidad += ad.precio * an;
    extras.push(an > 1 ? `${ad.nombre} x${an}` : ad.nombre);
  }

  // Nombre para cocina: el jugo en leche se nombra así; la nota del cliente (sabor, "sin cebolla") va al final
  const nombre = l.en_leche ? p.producto.replace(/ en agua$/i, '') + ' en leche' : p.producto;
  const nota = typeof l.nota === 'string' ? l.nota.trim().slice(0, 80) : '';
  const linea = `${cant} x ${nombre}${extras.length ? ' (' + extras.join(', ') + ')' : ''}${nota ? ' · ' + nota : ''}`;
  detalle.push(linea);                                  // para cocina: sin precios ni códigos
  desglose.push(`${linea}: ${pesos(unidad * cant)}`);   // para el cliente
  subtotal += unidad * cant;
  cocina = Math.max(cocina, p.tiempo);
}

let domicilio = 0, trayecto = 0, zona = 'Recoger en el local';
if (tipo === 'domicilio') {
  const z = payload.data.map(i => i.data).find(z => norm(z.zona) === norm(zonaPedida));
  if (!z || norm(z.zona) === norm('Recoger en el local')) {
    errores.push(`zona_desconocida: "${zonaPedida}" no está en las zonas de domicilio. Ofrece recoger en el local.`);
  } else if (!z.cubre) {
    errores.push(`No hay domicilio a ${z.zona}. ${z.notas || ''}`.trim());
  } else {
    domicilio = z.tarifa; trayecto = z.tiempo_min || 0; zona = z.zona;
  }
  // El mínimo solo se revisa con un pedido válido: con productos rechazados el subtotal está incompleto
  if (!errores.length && subtotal < MINIMO) {
    errores.push(`El domicilio pide mínimo ${pesos(MINIMO)} en productos y el pedido va en ${pesos(subtotal)}.`);
  }
} else if (tipo !== 'recoger') {
  errores.push('El tipo debe ser domicilio o recoger.');
}

if (errores.length) return { ok: false, errores };
return { ok: true, tipo, zona, detalle: detalle.join('\n'), desglose, subtotal, domicilio, total: subtotal + domicilio, tiempo_estimado_min: cocina + trayecto };
