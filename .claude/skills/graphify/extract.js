#!/usr/bin/env node
// Recorta el graph.json completo de Graphify (Desktop-wide, pesado) al
// subgrafo de este proyecto (data/bola-gym-graph.json, liviano).
//
// Uso: node extract.js <ruta-a-graph.json-de-graphify>
// Ejemplo: node extract.js "C:\Users\braya\OneDrive\Desktop\graphify-out\graph.json"
//
// Correr esto de nuevo cuando el usuario regenere el grafo de Graphify y
// quiera que este skill refleje el código actual (ver la sección
// "Limitaciones" en SKILL.md — el grafo no se actualiza solo).
'use strict';

const fs = require('fs');
const path = require('path');

const PREFIX = 'bola gym/';
const OUT_PATH = path.join(__dirname, 'data', 'bola-gym-graph.json');

const srcPath = process.argv[2];
if (!srcPath) {
  console.error('Uso: node extract.js <ruta-a-graph.json-de-graphify>');
  process.exit(1);
}

const g = JSON.parse(fs.readFileSync(srcPath, 'utf8'));

const nodes = g.nodes
  .filter((n) => n.source_file && n.source_file.startsWith(PREFIX))
  .map((n) => ({
    id: n.id,
    label: n.label,
    norm_label: n.norm_label,
    file: n.source_file.slice(PREFIX.length),
    line: n.source_location,
    callable: !!n._callable,
    community_name: n.community_name,
  }));

const ids = new Set(nodes.map((n) => n.id));
const links = g.links
  .filter((l) => ids.has(l.source) || ids.has(l.target))
  .map((l) => ({
    source: l.source,
    target: l.target,
    relation: l.relation,
    file: l.source_file ? l.source_file.replace(PREFIX, '') : undefined,
    line: l.source_location,
    confidence: l.confidence,
  }));

const out = {
  generated_from: `graphify-out (${srcPath})`,
  generated_at: new Date().toISOString(),
  scope: PREFIX,
  node_count: nodes.length,
  link_count: links.length,
  nodes,
  links,
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 1));
console.log(`Escribí ${nodes.length} nodos y ${links.length} links en ${OUT_PATH}`);
