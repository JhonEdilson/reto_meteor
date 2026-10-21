// Evals de conversación: le escribe a Lau como cliente por API (POST /runs) y aplica los checks automáticos.
// La key de prueba (met_test_) no debita Energía (verificado el 21-oct: livemode false y sin transacciones nuevas).
// OJO: no es un sandbox. crear_pedido escribe en Pedidos de verdad. Después de revisarlo (E16), el runner copia el pedido
//   a "Pedidos de prueba" con su código original y lo borra de Pedidos, que queda solo con los reales.
//   node 06-pruebas/correr_evals.mjs --mover <código> <origen>  -> lo mismo, para un pedido de una prueba manual.
// OJO 2: la key de prueba tiene un tope diario de runs (~50 el 21-oct; responde 429 test_run_daily_cap).
//   Con --live usa MET_API_KEY_LIVE: sin tope, pero cada turno debita Energía (~US$0,01 medido el 21-oct).
//   Scopes de esa key: runs:execute, runs:read, collections:read, items:read, items:write.
// Uso (desde la raíz de fase-02):
//   node 06-pruebas/correr_evals.mjs                 -> todos los escenarios (E13 solo después de las 15:00)
//   node 06-pruebas/correr_evals.mjs E07 E15         -> solo esos
//   node 06-pruebas/correr_evals.mjs --publicar <json> -> sube a la colección Evals el veredicto final de esa corrida
// El veredicto final lo pone una persona en el JSON (campo `juicio` de cada escenario) leyendo la transcripción:
//   { "resultado": "Pasa" | "Falla", "nota": "causa y arreglo si falló" }. Sin juicio, la fila sube como "Pendiente".
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { casos } from './escenarios_cotizar.mjs';
import { escenarios, confirmar } from './escenarios_conversacion.mjs';

const PEDIDOS = 2099, EVALS = 2146, PEDIDOS_PRUEBA = 2148;
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const R = 'https://api.met.meteor.com.co/api/v1';
const LIVE = process.argv.includes('--live');
const KEY = LIVE ? env.MET_API_KEY_LIVE : env.MET_API_KEY;
const api = async (metodo, ruta, cuerpo) => {
  const r = await fetch(R + ruta, { method: metodo, body: cuerpo && JSON.stringify(cuerpo),
    headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' } });
  if (!r.ok) throw new Error(`${metodo} ${ruta} -> ${r.status}: ${(await r.text()).slice(0, 500)}`);
  const j = await r.json();
  return j.data ?? j;
};
const esperar = ms => new Promise(r => setTimeout(r, ms));
const pesos = n => n.toLocaleString('es-CO');  // 39000 -> "39.000"

// Checks globales: nada de markdown de negrita, emojis ni códigos internos del menú (HAM-02, AD-01...).
const PROHIBIDOS_GLOBALES = [[/\*\*/, '**'], [/\p{Extended_Pictographic}/u, 'emoji'], [/\b[A-Z]{2,3}-\d{2}\b/, 'código interno']];

async function turno(input, conversation_id) {
  let r = await api('POST', `/workspaces/${env.WORKSPACE_ID}/runs`, { met: 'Lau', input, ...(conversation_id && { conversation_id }) });
  for (let i = 0; i < 30 && !['completed', 'failed'].includes(r.status); i++) { await esperar(2000); r = await api('GET', `/runs/${r.id}`); }
  if (r.status !== 'completed') throw new Error(`run ${r.id} terminó en ${r.status}: ${r.error}`);
  if (r.livemode !== LIVE) throw new Error(`run ${r.id} con livemode=${r.livemode}, y se pidió ${LIVE ? '--live' : 'prueba'}: revisar la key`);
  const herramientas = (r.events ?? []).filter(e => e.data?.type === 'tool_use').map(e => e.data.tool_name);
  return { id: r.id, conv: r.conversation_id, salida: r.output ?? '', herramientas };
}

// Mueve un pedido de prueba de Pedidos a "Pedidos de prueba". El DELETE es definitivo (no hay papelera), así que
// primero se crea la copia, se lee de vuelta y solo si quedó igual se borra el original.
async function moverAPrueba(it, origen) {
  const { es_prueba, ...datos } = it.data;  // es_prueba fue la marca descartada del 21-oct; no se copia
  const copia = await api('POST', `/collections/${PEDIDOS_PRUEBA}/items`,
    { data: { ...datos, codigo_original: it.code, origen } });
  const leida = await api('GET', `/items/${copia.id}`);
  const iguales = ['cliente', 'detalle', 'total'].every(k => leida.data?.[k] === it.data[k]) && leida.data?.codigo_original === it.code;
  if (!iguales) throw new Error(`la copia ${copia.id} de ${it.code} no quedó igual; no se borra el original`);
  await api('DELETE', `/items/${it.id}`);
  return copia.id;
}

// E16: el pedido registrado tiene los 6 datos, el detalle se lee sin traducir y el total es el cotizado.
async function revisarPedido(k, esperado) {
  const items = await api('GET', `/collections/${PEDIDOS}/items?sort=-created_at&limit=20`);
  const it = (items.items ?? items).find(x => String(x.data?.cliente ?? '').includes(`PRUEBA eval ${k}`));
  if (!it) return { ok: false, fallas: ['no se encontró el pedido en Pedidos'] };
  const d = it.data, fallas = [];
  for (const c of ['cliente', 'telefono', 'tipo', 'detalle', 'total', 'pago', 'para_cuando']) if (d[c] == null || d[c] === '') fallas.push(`falta ${c}`);
  if (d.tipo === 'domicilio') for (const c of ['direccion', 'barrio', 'zona']) if (!d[c]) fallas.push(`falta ${c}`);
  if (/[{}\[\]]|\b[A-Z]{2,3}-\d{2}\b/.test(d.detalle ?? '')) fallas.push('el detalle trae JSON o códigos');
  if (esperado && d.total !== esperado) fallas.push(`total registrado ${d.total} ≠ ${esperado}`);
  const movido_a = await moverAPrueba(it, `eval ${k}`);
  return { ok: !fallas.length, fallas, item: it.id, codigo: it.code ?? null, movido_a, datos: d };
}

async function correr(k, e) {
  const [total, tiempo] = e.cotiza ? casos[e.cotiza].slice(3, 5) : [];
  const turnos = [...e.turnos, ...(e.confirmar ? [confirmar(k, ...e.confirmar)] : [])];
  const trans = []; let conv;
  for (const t of turnos) {
    const r = await turno(t, conv); conv = r.conv;
    trans.push({ cliente: t, lau: r.salida, run: r.id, herramientas: r.herramientas });
  }
  // La regla 7 de Lau pide el "sí" sobre el resumen final. Si después de dar los datos muestra el resumen y pregunta,
  // el cliente responde una vez más, como lo haría una persona (E01 del 21-oct).
  if (e.confirmar && !trans.some(x => x.herramientas.includes('crear_pedido'))) {
    const r = await turno('Sí, confirmo.', conv);
    trans.push({ cliente: 'Sí, confirmo.', lau: r.salida, run: r.id, herramientas: r.herramientas });
  }
  const todo = trans.map(x => x.lau).join('\n'), usadas = new Set(trans.flatMap(x => x.herramientas));
  const checks = [];
  if (total != null) {
    checks.push([`total $${pesos(total)}`, todo.includes(pesos(total))]);
    checks.push([`${tiempo} min`, new RegExp(`\\b${tiempo}\\s*min`).test(todo)]);
  }
  for (const f of e.debe ?? []) checks.push([`llama ${f}`, usadas.has(f)]);
  for (const f of e.no_debe ?? []) checks.push([`no llama ${f}`, !usadas.has(f)]);
  for (const [re, nombre] of PROHIBIDOS_GLOBALES) checks.push([`sin ${nombre}`, !re.test(todo)]);
  for (const p of e.prohibido ?? []) checks.push([`sin "${p}"`, !todo.includes(p)]);
  for (const p of e.menciona ?? []) checks.push([`dice "${p}"`, todo.includes(p)]);
  const pedido = e.confirmar && usadas.has('crear_pedido') ? await revisarPedido(k, total) : null;
  if (pedido) checks.push(['E16: pedido completo', pedido.ok]);
  return { escenario: k, nombre: e.nombre, criterio: e.criterio, esperado: e.juicio, conversation_id: conv,
    auto_ok: checks.every(c => c[1]), checks, pedido, transcripcion: trans, juicio: null };
}

const args = process.argv.slice(2).filter(a => a !== '--live');
if (args[0] === '--mover') {
  // Pedido de una prueba manual: se busca por su código en Pedidos y se mueve.
  const items = await api('GET', `/collections/${PEDIDOS}/items?limit=100`);
  const it = (items.items ?? items).find(x => x.code === args[1]);
  if (!it) throw new Error(`No está el pedido ${args[1]} en Pedidos`);
  console.log(`${it.code} (${it.data.cliente}, $${pesos(it.data.total)}) -> Pedidos de prueba, item ${await moverAPrueba(it, args[2] ?? 'manual')}`);
} else if (args[0] === '--publicar') {
  const corrida = JSON.parse(readFileSync(args[1], 'utf8'));
  const rows = corrida.resultados.map(r => ({
    escenario: r.escenario, nombre: r.nombre, criterio: r.criterio,
    cliente_dijo: r.transcripcion.map(x => x.cliente).join(' / '), esperado: r.esperado,
    resultado: r.juicio?.resultado ?? 'Pendiente',
    como_se_califico: r.como_se_califico === 'manual'
      ? 'Manual: Jhon en la Conversación de prueba + captura en 06-pruebas/evidencia/manual/'
      : `${r.como_se_califico ?? 'API'}: checks automáticos ${r.auto_ok ? 'OK' : 'con fallas'} + lectura de la transcripción`,
    causa_y_arreglo: r.juicio?.nota ?? '', run_ids: r.transcripcion.map(x => x.run).join(', '),
    pedido: r.pedido?.codigo ?? r.pedido?.item ?? '', fecha: corrida.fecha,
    transcripcion: r.transcripcion.map(x => `Cliente: ${x.cliente}\nLau: ${x.lau}`).join('\n\n'),
  }));
  const res = await api('POST', `/collections/${EVALS}/items/import`, { rows, keyField: 'escenario', fileName: 'evals.json' });
  console.log(`Evals (id ${EVALS}): ${rows.length} filas ->`, JSON.stringify(res).slice(0, 300));
} else {
  const hora = new Date().getHours();
  const elegidos = args.length ? args : Object.keys(escenarios).filter(k => !(escenarios[k].despues_de > hora));
  const resultados = [];
  for (const k of elegidos) {
    try {
      const r = await correr(k, escenarios[k]);
      resultados.push(r);
      console.log(r.auto_ok ? 'OK   ' : 'FALLA', k, r.nombre, '|', r.checks.filter(c => !c[1]).map(c => c[0]).join(', ') || 'todos los checks');
    } catch (err) {
      resultados.push({ escenario: k, nombre: escenarios[k].nombre, error: String(err) });
      console.log('ERROR', k, String(err).slice(0, 300));
    }
  }
  const fecha = new Date().toISOString();
  mkdirSync('06-pruebas/evidencia', { recursive: true });
  const archivo = `06-pruebas/evidencia/evals-${fecha.slice(0, 16).replace(':', '')}.json`;
  writeFileSync(archivo, JSON.stringify({ fecha, resultados }, null, 2));
  console.log(`\n${resultados.filter(r => r.auto_ok).length}/${resultados.length} con checks automáticos OK. Evidencia: ${archivo}`);
}
