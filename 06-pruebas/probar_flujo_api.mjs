// Prueba del flujo de cotizar_pedido DENTRO de Meteor: corre cada escenario por API y compara contra lo esperado.
// Con la key de prueba (met_test_) las ejecuciones no gastan energía. Usa el borrador del flujo (use_draft).
// Uso (desde la raíz de fase-02): node 06-pruebas/probar_flujo_api.mjs
// Guarda la evidencia (id de cada run, entrada y salida) en 06-pruebas/evidencia/api-cotizar-<fecha>T<hora>.json.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { casos, rechazos } from './escenarios_cotizar.mjs';

const FLUJO = 'bd6946e6-f4a8-4271-9d1b-68bf1087ca50';  // Flujo-cotizar_pedido
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const B = `https://api.met.meteor.com.co/api/v1/workspaces/${env.WORKSPACE_ID}`;
const api = async (metodo, ruta, cuerpo) => {
  const r = await fetch(B + ruta, { method: metodo, body: cuerpo && JSON.stringify(cuerpo),
    headers: { Authorization: 'Bearer ' + env.MET_API_KEY, 'Content-Type': 'application/json' } });
  if (!r.ok) throw new Error(`${metodo} ${ruta} -> ${r.status}: ${(await r.text()).slice(0, 500)}`);
  const j = await r.json();
  return j.data ?? j;
};
const esperar = ms => new Promise(r => setTimeout(r, ms));

async function correr(lineas, tipo, zona) {
  const run = await api('POST', `/flows/${FLUJO}/run`,
    { use_draft: true, trigger_payload: { lineas: JSON.stringify(lineas), tipo, zona } });
  const id = run.id ?? run.run_id;
  for (let i = 0; i < 15; i++) {
    await esperar(2000);
    const x = await api('GET', `/flow-runs/${id}`);
    const nodos = x.nodes ?? x.node_runs ?? [];
    const fallo = nodos.find(n => n.status === 'failed' || n.status === 'error');
    if (fallo) return { id, error: fallo.error ?? fallo };
    const fin = nodos.find(n => n.output_artifact && 'result_text' in n.output_artifact);
    if (fin) {
      const t = fin.output_artifact.result_text;
      return { id, salida: typeof t === 'string' ? JSON.parse(t) : t };
    }
  }
  return { id, error: 'el run no terminó en 30 s' };
}

const evidencia = [];
let fallas = 0;
for (const [k, [lineas, tipo, zona, total, tiempo, detalle]] of Object.entries(casos)) {
  const r = await correr(lineas, tipo, zona);
  const s = r.salida;
  const ok = s?.ok === true && s.total === total && s.tiempo_estimado_min === tiempo
    && (!detalle || s.detalle.split('\n').includes(detalle));
  if (!ok) fallas++;
  evidencia.push({ prueba: k, entrada: { lineas, tipo, zona }, esperado: { total, tiempo }, run: r.id, salida: s ?? null, error: r.error ?? null, ok });
  console.log(ok ? 'OK  ' : 'FALLA', k, r.id, s ? `${s.total} ${s.tiempo_estimado_min} min` : r.error, s?.errores ?? '');
}
for (const [nombre, [lineas, tipo, zona, motivo]] of Object.entries(rechazos)) {
  const r = await correr(lineas, tipo, zona);
  const s = r.salida;
  const ok = s?.ok === false && s.errores.some(e => e.includes(motivo));
  if (!ok) fallas++;
  evidencia.push({ prueba: 'rechazo: ' + nombre, entrada: { lineas, tipo, zona }, esperado: { motivo }, run: r.id, salida: s ?? null, error: r.error ?? null, ok });
  console.log(ok ? 'OK  ' : 'FALLA', 'rechazo', nombre, r.id, s?.errores?.[0] ?? r.error ?? JSON.stringify(s));
}

mkdirSync('06-pruebas/evidencia', { recursive: true });
// Fecha y hora UTC en el nombre: una corrida nueva no pisa la evidencia de la anterior
const archivo = `06-pruebas/evidencia/api-cotizar-${new Date().toISOString().slice(0, 16).replace(':', '')}.json`;
writeFileSync(archivo, JSON.stringify({ flujo: FLUJO, fecha: new Date().toISOString(), fallas, pruebas: evidencia }, null, 2));
console.log(`\n${evidencia.length - fallas}/${evidencia.length} OK · evidencia en ${archivo}`);
process.exitCode = fallas ? 1 : 0;
