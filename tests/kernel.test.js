import test from 'node:test';
import assert from 'node:assert/strict';
import {box,cylinder,sphere,torus,boolean,transform,stats,extrude,rectangle,revolve,mesh,pickMesh,exportSTL,importSTL,exportOBJ,importOBJ,triangulate} from '../src/kernel.js';
import {expression,parameters,ModelEvaluator,demoDocument,newDocument,History,validateDocument} from '../src/document.js';
const near=(a,b,e=1e-5)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('cube signed volume and surface area',()=>{const s=stats(box(10,20,30));near(s.signedVolume,6000);near(s.area,2200);});
test('rounded rectangle is CCW with valid outward normals',()=>{const s=stats(box(20,30,5,3));assert.ok(s.signedVolume>2900&&s.signedVolume<3000);});
test('Boolean union, intersection, difference volumes',()=>{const a=box(10,10,10),b=transform(a,{x:5});near(stats(boolean(a,b,'union')).volume,1500);near(stats(boolean(a,b,'cut')).volume,500);near(stats(boolean(a,b,'intersect')).volume,500);});
test('disjoint and identical Boolean operands',()=>{const a=box(10,10,10),b=transform(a,{x:30});near(stats(boolean(a,b,'cut')).volume,1000);near(stats(boolean(a,b,'intersect')).volume,0);near(stats(boolean(a,a,'union')).volume,1000);near(stats(boolean(a,a,'cut')).volume,0);});
test('through hole removes material',()=>{const a=box(20,20,10),b=transform(cylinder(3,12),{z:-1});const cut=stats(boolean(a,b,'cut'));near(cut.volume,4000-stats(cylinder(3,10)).volume,1e-3);});
test('concave polygon extrusion and negative distance',()=>{const p=[[0,0],[10,0],[10,4],[4,4],[4,10],[0,10]];near(stats(extrude(p,5)).signedVolume,320);near(stats(extrude(p,-5)).signedVolume,320);});
test('triangulation rejects zero-area profiles',()=>assert.throws(()=>triangulate([[0,0],[1,1],[2,2]])));
test('cylinder, sphere, torus outward volume',()=>{near(stats(cylinder(10,20)).signedVolume,Math.PI*2000,11);near(stats(sphere(10)).signedVolume,4/3*Math.PI*1000,35);near(stats(torus(20,4)).signedVolume,2*Math.PI*Math.PI*20*16,150);});
test('full and partial revolution closed volumes',()=>{const profile=[[10,0],[20,0],[20,10],[10,10]];near(stats(revolve(profile)).signedVolume,Math.PI*300*10,20);near(stats(revolve(profile,180)).signedVolume,Math.PI*300*5,12);});
test('BVH returns closest surface',()=>{const m=mesh(box(10,10,10)),hit=pickMesh({o:[0,0,30],d:[0,0,-1]},m);near(hit.distance,20);near(hit.point[2],10);assert.equal(pickMesh({o:[20,20,30],d:[0,0,-1]},m),null);});
test('binary STL round trip',()=>{const faces=box(20,10,5),buffer=exportSTL([mesh(faces)]);near(stats(importSTL(buffer)).volume,1000);});
test('OBJ round trip',()=>{const faces=box(20,10,5),text=exportOBJ([{name:'cube',mesh:mesh(faces)}]);near(stats(importOBJ(text)).volume,1000);});
test('safe expression precedence, units and parameter dependencies',()=>{near(expression('2 + 3 * 4'),14);near(expression('-2^2'),-4);near(expression('2^3^2'),512);near(expression('sqrt(16) + 2 * cm'),24);assert.deepEqual({...parameters({a:20,b:'a*2',c:'b+5'})},{a:20,b:40,c:45});});
test('invalid expressions and cycles are rejected',()=>{for(const s of ['alert(1)','globalThis.x','1/0','3 mm'])assert.throws(()=>expression(s));assert.throws(()=>parameters({a:'b',b:'a'}));});
test('feature regeneration and downstream dependencies',()=>{const d=newDocument();d.parameters={w:20};d.features=[{id:'a',type:'box',name:'block',p:{width:'w',depth:10,height:5}},{id:'h',type:'hole',name:'hole',target:'a',p:{radius:2,depth:7,z:-1}}];const ev=new ModelEvaluator(),r1=ev.evaluate(d);assert.equal(r1.errors.length,0);d.parameters.w=30;const r2=ev.evaluate(d);near(r2.bodies[0].mesh.stats.volume-r1.bodies[0].mesh.stats.volume,500);});
test('history undo and redo are isolated snapshots',()=>{const h=new History(),d=newDocument();h.push(d,'rename');d.name='Renamed';const undo=h.undo(d);assert.equal(undo.doc.name,'Untitled design');assert.equal(h.redo(undo.doc).doc.name,'Renamed');});
test('schema rejects duplicate IDs and non-finite mesh geometry',()=>{const d=newDocument();d.features=[{id:'a',type:'box',name:'a',p:{}},{id:'a',type:'box',name:'b',p:{}}];assert.throws(()=>validateDocument(d));});
test('demo regenerates without errors and produces real mesh bodies',()=>{const d=demoDocument(),e=new ModelEvaluator(),r=e.evaluate(d);assert.deepEqual(r.errors,[]);assert.ok(r.bodies.length>=10);assert.ok(r.bodies.every(b=>b.mesh.stats.volume>0));const cached=e.evaluate(d);assert.equal(cached.bodies.length,r.bodies.length);console.log(`Demo: ${r.bodies.length} bodies, ${r.bodies.reduce((s,b)=>s+b.mesh.stats.triangles,0)} triangles, ${r.elapsed.toFixed(0)} ms cold, ${cached.elapsed.toFixed(1)} ms cached`);});

test('non-finite imported vertices are rejected before evaluation',()=>{
 const d=newDocument();d.features=[{id:'bad',type:'mesh',name:'Invalid',p:{faces:[[[0,0,0],[1,0,0],[0,NaN,0]]]}}];
 assert.throws(()=>validateDocument(d),/coordinate/);
});
test('untrusted identifiers, materials, metadata and units are rejected',()=>{
 for(const edit of [d=>d.features.push({id:'x" onclick="bad',type:'box',name:'x',p:{}}),d=>d.appearances.a='__proto__',d=>d.names={a:42},d=>d.units='inch',d=>d.rollback=100,d=>d.parameters={constructor:10}]){const d=newDocument();edit(d);assert.throws(()=>validateDocument(d));}
});
test('long dependency chains have bounded revision keys and hit the cache',()=>{
 const d=newDocument();d.features=[{id:'b',type:'box',name:'Block',p:{width:10,depth:10,height:10}}];let target='b';
 for(let i=0;i<60;i++){const id='move'+i;d.features.push({id,type:'move',name:'Move '+i,target,p:{x:1}});target=id;}
 const e=new ModelEvaluator(),a=e.evaluate(d);assert.deepEqual(a.errors,[]);near(a.bodies[0].mesh.stats.bounds.min[0],55);const serial=e.serial;
 const b=e.evaluate(d);assert.equal(e.serial,serial);assert.equal(a.bodies[0].mesh,b.bodies[0].mesh);
 assert.ok([...e.cache.values()].every(v=>v.key.length<1000));
 d.features[20].p.x=3;const c=e.evaluate(d);near(c.bodies[0].mesh.stats.bounds.min[0],57);assert.ok(e.serial>serial);
});
test('suppression passes a modification input through, including on cache hits',()=>{
 const d=newDocument();d.features=[{id:'a',type:'box',name:'Block',p:{width:10,depth:10,height:10}},{id:'h',type:'hole',name:'Hole',target:'a',suppressed:true,p:{radius:2,depth:12,z:-1}}];const e=new ModelEvaluator();
 for(let i=0;i<2;i++){const r=e.evaluate(d);near(r.bodies[0].mesh.stats.volume,1000);assert.equal(r.timeline[1].state,'suppressed');}
 d.features[1].suppressed=false;assert.ok(e.evaluate(d).bodies[0].mesh.stats.volume<900);
});
test('history rollback and replay preserve reference results',()=>{
 const d=newDocument();d.features=[{id:'a',type:'box',name:'Block',p:{width:10,depth:10,height:10}},{id:'m',type:'move',name:'Move',target:'a',p:{x:20}}];const e=new ModelEvaluator();d.rollback=0;near(e.evaluate(d).bodies[0].mesh.stats.bounds.min[0],-5);d.rollback=null;near(e.evaluate(d).bodies[0].mesh.stats.bounds.min[0],15);
});
test('circular patterns rotate copies about world Z',()=>{
 const d=newDocument();d.features=[{id:'a',type:'box',name:'Block',p:{width:2,depth:2,height:2,x:10}},{id:'p',type:'pattern',name:'Pattern',target:'a',p:{circular:true,count:4,angle:360}}];const r=new ModelEvaluator().evaluate(d);assert.equal(r.bodies.length,4);const b=r.bodies.find(b=>b.id==='p:1');near(b.mesh.stats.bounds.min[0],-1);near(b.mesh.stats.bounds.min[1],9);
});
test('section-aware picking rejects clipped front hits and finds the retained back surface',()=>{
 const m=mesh(box(10,10,10)),ray={o:[0,0,30],d:[0,0,-1]},hit=pickMesh(ray,m,h=>h.point[2]<=5);near(hit.distance,30);near(hit.point[2],0);
});
