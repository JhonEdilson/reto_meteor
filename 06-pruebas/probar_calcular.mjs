// Prueba local del nodo Calcular (04-plataforma/cotizar_pedido_calcular.js) con los datos REALES de las colecciones.
// Hace lo mismo que Meteor: pega los chips como texto y corre el código con el body de Zonas como payload.
// Sirve para probar la lógica gratis antes de tocar el panel; el sandbox real lo confirma probar_flujo_api.mjs.
// Uso (desde la raíz de fase-02): node 06-pruebas/probar_calcular.mjs   (solo lee, key de solo lectura)
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { casos, rechazos } from './escenarios_cotizar.mjs';

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const leer = async id => {
  const r = await fetch(`https://api.met.meteor.com.co/api/v1/collections/${id}/items?limit=100`,
    { headers: { Authorization: 'Bearer ' + env.MET_API_KEY_FLOW } });
  if (!r.ok) throw new Error(`GET ${id} -> ${r.status}: ${await r.text()}`);
  return r.json();
};
const [m, a, zonas] = await Promise.all([leer(2096), leer(2097), leer(2098)]);
// Mismas reducciones que los nodos 1 y 2
const menu = {}, adic = {};
for (const { data: d } of m.data) menu[d.codigo] = { producto: d.producto, categoria: d.categoria, precio: d.precio, tiempo: d.tiempo_min || 0, disponible: d.disponible === true };
for (const { data: d } of a.data) adic[d.codigo] = { nombre: d.adicion, precio: d.precio, max: d.maximo, disponible: d.disponible === true, aplica: (d.aplica_a || '').split(',').map(s => s.trim()) };

const fuente = readFileSync('04-plataforma/cotizar_pedido_calcular.js', 'utf8');
const cotizar = (lineas, tipo, zona) => {
  const js = fuente.replace('= MENU;', '= ' + JSON.stringify(menu) + ';').replace('= ADIC;', '= ' + JSON.stringify(adic) + ';')
    .replace('= LINEAS;', '= ' + JSON.stringify(lineas) + ';').replace('"TIPO"', JSON.stringify(tipo)).replace('"ZONA"', JSON.stringify(zona));
  return new Function('payload', js)(zonas);
};

for (const [k, [lineas, tipo, zona, total, tiempo, detalle]] of Object.entries(casos)) {
  const r = cotizar(lineas, tipo, zona);
  assert.ok(r.ok, `${k}: ${JSON.stringify(r.errores)}`);
  assert.deepEqual([r.total, r.tiempo_estimado_min], [total, tiempo], k);
  if (detalle) assert.ok(r.detalle.split('\n').includes(detalle), `${k} detalle: ${r.detalle}`);
  console.log(k, 'OK', r.total, r.tiempo_estimado_min, 'min');
}
console.log('E01 detalle para cocina:\n' + cotizar(...casos.E01.slice(0, 3)).detalle);
for (const [nombre, [lineas, tipo, zona, motivo]] of Object.entries(rechazos)) {
  const r = cotizar(lineas, tipo, zona);
  assert.ok(!r.ok && r.errores.some(e => e.includes(motivo)), `${nombre}: ${JSON.stringify(r)}`);
  console.log('rechazo OK:', nombre, '->', r.errores[0]);
}
