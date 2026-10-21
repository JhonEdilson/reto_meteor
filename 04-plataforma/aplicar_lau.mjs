// Aplica a Lau (agente 227243) los 4 bloques de 03-diseno/lau-configuracion.md y verifica que quedaron iguales.
// Antes de cambiar nada guarda lo que había en Meteor en 04-plataforma/export/lau-antes-<fecha>.json, para poder volver atrás.
// Uso (desde la raíz de fase-02): node 04-plataforma/aplicar_lau.mjs          -> solo muestra qué cambiaría
//                                 node 04-plataforma/aplicar_lau.mjs --real   -> aplica y verifica
import { readFileSync, writeFileSync } from 'node:fs';

const LAU = 227243;
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const R = 'https://api.met.meteor.com.co/api/v1';
const api = async (metodo, ruta, cuerpo) => {
  const r = await fetch(R + ruta, { method: metodo, body: cuerpo && JSON.stringify(cuerpo),
    headers: { Authorization: 'Bearer ' + env.MET_API_KEY, 'Content-Type': 'application/json' } });
  if (!r.ok) throw new Error(`${metodo} ${ruta} -> ${r.status}: ${(await r.text()).slice(0, 500)}`);
  const j = await r.json();
  return j.data ?? j;
};

// Cada bloque es "## Título (`campo`...)" seguido de un ```text ... ```. El nombre del campo sale del título.
const md = readFileSync('03-diseno/lau-configuracion.md', 'utf8').replace(/\r\n/g, '\n');
const bloques = Object.fromEntries([...md.matchAll(/^## [^\n]*\(`(\w+)`[^\n]*\n+```text\n([\s\S]*?)\n```/gm)].map(m => [m[1], m[2]]));
const esperados = ['title', 'mission', 'instructions', 'business_prompt'];
const faltan = esperados.filter(k => !bloques[k]);
if (faltan.length) throw new Error('No encontré en el archivo los bloques: ' + faltan.join(', '));

const leer = async () => {
  const a = await api('GET', `/agents/${LAU}`);
  const b = await api('GET', `/workspaces/${env.WORKSPACE_ID}/business`);
  return { title: a.title, mission: a.mission, instructions: a.instructions, business_prompt: b.business_prompt };
};

const antes = await leer();
const cambian = esperados.filter(k => antes[k] !== bloques[k]);
console.log(cambian.length ? 'Cambian: ' + cambian.map(k => `${k} (${antes[k]?.length ?? 0} -> ${bloques[k].length} caracteres)`).join(', ') : 'Nada que cambiar: Meteor ya es igual al archivo.');

if (process.argv.includes('--real') && cambian.length) {
  const respaldo = `04-plataforma/export/lau-antes-${new Date().toISOString().slice(0, 16).replace(':', '')}.json`;
  writeFileSync(respaldo, JSON.stringify(antes, null, 2));
  console.log('Respaldo:', respaldo);
  const agente = Object.fromEntries(['title', 'mission', 'instructions'].filter(k => cambian.includes(k)).map(k => [k, bloques[k]]));
  if (Object.keys(agente).length) await api('PATCH', `/agents/${LAU}`, agente);
  if (cambian.includes('business_prompt')) await api('PATCH', `/workspaces/${env.WORKSPACE_ID}/business`, { business_prompt: bloques.business_prompt });
  const despues = await leer();
  const distintos = esperados.filter(k => despues[k] !== bloques[k]);
  console.log(distintos.length ? 'OJO, quedaron distintos: ' + distintos.join(', ') : 'Verificado: lo guardado en Meteor es igual al archivo.');
}
