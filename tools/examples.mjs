import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { demoDocument, newDocument, ModelEvaluator, validateDocument } from '../src/document.js';
import { exportSTL } from '../src/kernel.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'examples');
await mkdir(root, { recursive: true });
const bearing = demoDocument();
const flange = newDocument();
flange.name = 'Precision flange';
flange.parameters = { diameter: 100, thickness: 12, bore: 14 };
flange.features.push(
  { id: 'plate', type: 'cylinder', name: 'Flange', material: 'aluminum', p: { radius: 'diameter / 2', height: 'thickness' } },
  { id: 'hub', type: 'cylinder', name: 'Hub', material: 'aluminum', p: { radius: 27, height: 26, z: 10 } },
  { id: 'join', type: 'boolean', name: 'Join hub', target: 'plate', tool: 'hub', p: { operation: 'union' } }
);
let target = 'join';
for (let i = 0; i < 6; i++) {
  const a = i / 6 * Math.PI * 2, id = 'bolt' + i;
  flange.features.push({ id, type: 'hole', name: `Bolt hole ${i + 1}`, target, p: { radius: 4.2, depth: 14, z: -1, x: 37 * Math.cos(a), y: 37 * Math.sin(a) } });
  target = id;
}
flange.features.push({ id: 'bore', type: 'hole', name: 'Central bore', target, p: { radius: 'bore', depth: 38, z: -1 } });
for (const [name, document] of [['orbital-bearing-mount', bearing], ['precision-flange', flange]]) {
  const result = new ModelEvaluator().evaluate(validateDocument(document));
  if (result.errors.length) throw new Error(JSON.stringify(result.errors));
  await writeFile(resolve(root, name + '.alloy'), JSON.stringify(document, null, 2) + '\n');
  if (name === 'orbital-bearing-mount') await writeFile(resolve(root, name + '.stl'), new Uint8Array(exportSTL(result.bodies.map(b => b.mesh))));
  console.log(`${name}: ${result.bodies.length} bodies, ${result.bodies.reduce((s, b) => s + b.mesh.stats.triangles, 0)} triangles`);
}
