#!/usr/bin/env node
// Consulta el grafo de código de este proyecto (extraído de Graphify) sin
// tener que cargar el JSON completo a mano. Ver SKILL.md para el contexto.
'use strict';

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'data', 'bola-gym-graph.json');
const graph = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

const byId = new Map(graph.nodes.map((n) => [n.id, n]));

function fmtNode(n) {
  if (!n) return '(desconocido)';
  return `${n.label}  —  ${n.file}:${n.line || '?'}`;
}

function cmdFiles() {
  const files = [...new Set(graph.nodes.map((n) => n.file))].sort();
  console.log(files.join('\n'));
}

function cmdSymbols(file) {
  if (!file) return usage();
  const rows = graph.nodes.filter((n) => n.file === file || n.file.endsWith('/' + file));
  if (!rows.length) {
    console.log(`Sin símbolos indexados para "${file}". Probá "node query.js files" para ver los archivos cubiertos.`);
    return;
  }
  for (const n of rows.sort((a, b) => (a.line || '').localeCompare(b.line || ''))) {
    console.log(`${n.line || '?'}\t${n.label}`);
  }
}

function findSymbol(term) {
  const t = term.toLowerCase();
  return graph.nodes.filter(
    (n) => n.norm_label.includes(t) || n.label.toLowerCase().includes(t) || n.id.includes(t)
  );
}

function cmdSearch(term) {
  if (!term) return usage();
  const matches = findSymbol(term);
  if (!matches.length) {
    console.log(`Sin coincidencias para "${term}".`);
    return;
  }
  for (const n of matches) console.log(`${n.id}\t${fmtNode(n)}`);
}

function cmdCalls(term) {
  if (!term) return usage();
  const matches = findSymbol(term);
  if (!matches.length) {
    console.log(`No encontré "${term}". Probá "node query.js search ${term}" primero.`);
    return;
  }
  for (const n of matches) {
    console.log(`\n${fmtNode(n)}`);
    const out = graph.links.filter((l) => l.source === n.id && l.relation === 'calls');
    if (!out.length) {
      console.log('  (no llama a nada indexado)');
      continue;
    }
    for (const l of out) console.log(`  -> ${fmtNode(byId.get(l.target))}`);
  }
}

function cmdCallers(term) {
  if (!term) return usage();
  const matches = findSymbol(term);
  if (!matches.length) {
    console.log(`No encontré "${term}". Probá "node query.js search ${term}" primero.`);
    return;
  }
  for (const n of matches) {
    console.log(`\n${fmtNode(n)}`);
    const inn = graph.links.filter((l) => l.target === n.id && l.relation === 'calls');
    if (!inn.length) {
      console.log('  (nada indexado lo llama — puede ser un handler de UI/evento, no una llamada directa)');
      continue;
    }
    for (const l of inn) console.log(`  <- ${fmtNode(byId.get(l.source))}`);
  }
}

function usage() {
  console.log(`Uso: node query.js <comando> [argumento]

  files                 lista los archivos cubiertos por el grafo
  symbols <archivo>     lista funciones/símbolos definidos en un archivo (ej: app.js)
  search <término>      busca funciones por nombre (parcial, sin importar mayúsculas)
  calls <término>       qué funciones llama <término>
  callers <término>     qué funciones llaman a <término>
`);
}

const [, , cmd, arg] = process.argv;
switch (cmd) {
  case 'files': cmdFiles(); break;
  case 'symbols': cmdSymbols(arg); break;
  case 'search': cmdSearch(arg); break;
  case 'calls': cmdCalls(arg); break;
  case 'callers': cmdCallers(arg); break;
  default: usage();
}
