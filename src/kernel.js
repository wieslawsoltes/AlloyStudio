import {V,EPS,clamp,boundsOf,rayBox,rayTriangle} from './math.js';
/** Convex polygon boundary representation with double-precision half-space CSG.
 * This is a tessellated solid kernel, not an analytic/NURBS B-rep kernel. */
export class Face {
  constructor(points) {
    this.v=points; let n=[0,0,0];
    for(let i=1;i<points.length-1;i++){n=V.cross(V.sub(points[i],points[0]),V.sub(points[i+1],points[0]));if(V.len(n)>EPS*EPS)break;}
    this.n=V.norm(n); this.w=V.dot(this.n,points[0]);
  }
  clone(){return new Face(this.v.map(p=>p.slice()));}
  flip(){this.v.reverse();this.n=V.mul(this.n,-1);this.w=-this.w;return this;}
}
function validFace(v) { const clean=[];for(const p of v)if(!clean.length||V.distance(p,clean.at(-1))>EPS)clean.push(p);if(clean.length>2&&V.distance(clean[0],clean.at(-1))<EPS)clean.pop();if(clean.length<3)return null;const f=new Face(clean);let area=0;for(let i=1;i<clean.length-1;i++)area+=V.len(V.cross(V.sub(clean[i],clean[0]),V.sub(clean[i+1],clean[0])));return area>EPS*EPS?f:null; }
function divide(face,plane,coFront,coBack,front,back){
  const types=face.v.map(p=>{const d=V.dot(plane.n,p)-plane.w;return d>EPS?1:d<-EPS?2:0;}); const kind=types.reduce((a,b)=>a|b,0);
  if(kind===0){(V.dot(plane.n,face.n)>0?coFront:coBack).push(face);return;}
  if(kind===1){front.push(face);return;} if(kind===2){back.push(face);return;}
  const f=[],b=[];
  for(let i=0;i<face.v.length;i++){const j=(i+1)%face.v.length,ti=types[i],tj=types[j],p=face.v[i],q=face.v[j];if(ti!==2)f.push(p);if(ti!==1)b.push(p);if((ti|tj)===3){const t=(plane.w-V.dot(plane.n,p))/V.dot(plane.n,V.sub(q,p));const mid=V.mix(p,q,clamp(t,0,1));f.push(mid);b.push(mid);}}
  const ff=validFace(f),bb=validFace(b);if(ff)front.push(ff);if(bb)back.push(bb);
}
class Partition {
  constructor(faces=[],depth=0){this.plane=null;this.faces=[];this.front=null;this.back=null;if(faces.length)this.build(faces,depth);}
  build(faces,depth=0){if(!faces.length)return;if(depth>1600)throw Error('CSG tree depth exceeded. Reduce mesh detail or simplify the operation.');if(!this.plane){const p=faces[Math.floor(faces.length/2)];this.plane={n:p.n.slice(),w:p.w};}const front=[],back=[];for(const face of faces)divide(face,this.plane,this.faces,this.faces,front,back);if(front.length){this.front??=new Partition();this.front.build(front,depth+1);}if(back.length){this.back??=new Partition();this.back.build(back,depth+1);}}
  all(){return [...this.faces,...(this.front?.all()||[]),...(this.back?.all()||[])];}
  invert(){for(const f of this.faces)f.flip();if(this.plane){this.plane.n=V.mul(this.plane.n,-1);this.plane.w=-this.plane.w;}this.front?.invert();this.back?.invert();[this.front,this.back]=[this.back,this.front];}
  clip(faces){if(!this.plane)return faces.slice();let front=[],back=[];for(const f of faces)divide(f,this.plane,front,back,front,back);if(this.front)front=this.front.clip(front);back=this.back?this.back.clip(back):[];return [...front,...back];}
  clipTo(other){this.faces=other.clip(this.faces);this.front?.clipTo(other);this.back?.clipTo(other);}
}
export function boolean(a,b,mode='union') {
  if(!a.length)return mode==='union'?b.map(f=>f.clone()):[];
  if(!b.length)return mode==='intersect'?[]:a.map(f=>f.clone());
  if(a.length+b.length>60000)throw Error('Boolean input exceeds the 60,000-polygon safety budget.');
  const A=new Partition(a.map(f=>f.clone())),B=new Partition(b.map(f=>f.clone()));
  if(mode==='union'){A.clipTo(B);B.clipTo(A);B.invert();B.clipTo(A);B.invert();A.build(B.all());return A.all();}
  if(mode==='cut'){A.invert();A.clipTo(B);B.clipTo(A);B.invert();B.clipTo(A);B.invert();A.build(B.all());A.invert();return A.all();}
  if(mode==='intersect'){A.invert();B.clipTo(A);B.invert();A.clipTo(B);B.clipTo(A);A.build(B.all());A.invert();return A.all();}
  throw Error('Unknown Boolean operation.');
}
const area2=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0);
const cross2=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export function triangulate(profile){
  let p=profile.map(v=>v.slice(0,2));if(p.length>2&&Math.hypot(p[0][0]-p.at(-1)[0],p[0][1]-p.at(-1)[1])<EPS)p.pop();
  if(p.length<3||Math.abs(area2(p))<EPS)throw Error('Profile must enclose a nonzero area.');
  if(area2(p)<0)p.reverse();const ids=p.map((_,i)=>i),tris=[];let guard=0;
  while(ids.length>3){let found=false;for(let k=0;k<ids.length;k++){const a=ids[(k+ids.length-1)%ids.length],b=ids[k],c=ids[(k+1)%ids.length];if(cross2(p[a],p[b],p[c])<=EPS)continue;let inside=false;for(const i of ids){if(i===a||i===b||i===c)continue;if(cross2(p[a],p[b],p[i])>=-EPS&&cross2(p[b],p[c],p[i])>=-EPS&&cross2(p[c],p[a],p[i])>=-EPS){inside=true;break;}}if(!inside){tris.push([a,b,c]);ids.splice(k,1);found=true;break;}}
    if(!found||++guard>p.length*2)throw Error('Profile is self-intersecting, degenerate, or has unsupported nested loops.');
  }tris.push(ids.slice());return {points:p,triangles:tris};
}
export function rectangle(w,d,r=0,segments=8){w=+w;d=+d;r=clamp(+r,0,Math.min(w,d)/2-.00001);if(w<=0||d<=0)throw Error('Dimensions must be positive.');if(r<EPS)return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];const p=[];for(let c=0;c<4;c++){const a=-Math.PI/2+c*Math.PI/2,cx=(c===0||c===1?1:-1)*(w/2-r),cy=(c<2?c===0?-1:1:c===2?1:-1)*(d/2-r);for(let j=0;j<=segments;j++){const t=a+j/segments*Math.PI/2;p.push([cx+r*Math.cos(t),cy+r*Math.sin(t)]);}}return p;}
export function circle(r,segments=64){if(r<=0)throw Error('Radius must be positive.');return Array.from({length:segments},(_,i)=>[r*Math.cos(i/segments*Math.PI*2),r*Math.sin(i/segments*Math.PI*2)]);}
export function extrude(profile,height,z=0){if(!Number.isFinite(height)||Math.abs(height)<EPS)throw Error('Extrusion distance must be nonzero.');const {points:p,triangles}=triangulate(profile);const lo=Math.min(z,z+height),hi=Math.max(z,z+height),bottom=p.map(q=>[...q,lo]),top=p.map(q=>[...q,hi]),faces=[];for(const t of triangles){faces.push(new Face(t.map(i=>top[i])),new Face(t.slice().reverse().map(i=>bottom[i])));}for(let i=0;i<p.length;i++){const j=(i+1)%p.length;faces.push(new Face([bottom[i],bottom[j],top[j],top[i]]));}return faces;}
export function box(w,d,h,r=0){return extrude(rectangle(w,d,r),h);}
export function cylinder(r,h,n=64){return extrude(circle(r,n),h);}
export function sphere(r,segments=48,rings=24){if(r<=0)throw Error('Radius must be positive.');const faces=[],at=(i,j)=>{const a=i/segments*Math.PI*2,b=j/rings*Math.PI;return [r*Math.sin(b)*Math.cos(a),r*Math.sin(b)*Math.sin(a),r*Math.cos(b)];};for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){let v=[at(i,j),at(i+1,j),at(i+1,j+1),at(i,j+1)];const f=validFace(v);if(f){if(V.dot(f.n,f.v.reduce((s,p)=>V.add(s,p),[0,0,0]))<0)f.flip();faces.push(f);}}return faces;}
export function torus(major,minor,segments=64,sides=20){if(major<=minor||minor<=0)throw Error('Torus requires major radius > minor radius > 0.');const at=(i,j)=>{const a=i/segments*2*Math.PI,b=j/sides*2*Math.PI;return [(major+minor*Math.cos(b))*Math.cos(a),(major+minor*Math.cos(b))*Math.sin(a),minor*Math.sin(b)];},faces=[];for(let i=0;i<segments;i++)for(let j=0;j<sides;j++)faces.push(new Face([at(i,j),at(i+1,j),at(i+1,j+1),at(i,j+1)]));return faces;}
export function revolve(profile,degrees=360,segments=64){
  const {points:p,triangles}=triangulate(profile);if(p.some(q=>q[0]<-EPS))throw Error('Revolve profile must stay on the positive radius side of the sketch.');
  if(degrees<=0||degrees>360)throw Error('Revolution angle must be in (0, 360].');const steps=Math.max(3,Math.ceil(segments*degrees/360)),angle=degrees*Math.PI/180;
  const at=(i,j)=>[p[j][0]*Math.cos(i/steps*angle),p[j][0]*Math.sin(i/steps*angle),p[j][1]],faces=[];
  for(let i=0;i<steps;i++)for(let j=0;j<p.length;j++){const k=(j+1)%p.length;const f=validFace([at(i,j),at(i+1,j),at(i+1,k),at(i,k)]);if(f)faces.push(f);}
  if(degrees<360-EPS)for(const t of triangles){faces.push(new Face(t.map(j=>at(0,j))),new Face(t.slice().reverse().map(j=>at(steps,j))));}
  return faces;
}
export function transform(faces,p={}){const rx=(p.rx||0)*Math.PI/180,ry=(p.ry||0)*Math.PI/180,rz=(p.rz||0)*Math.PI/180,s=p.scale??1; if(s<=0||!Number.isFinite(s))throw Error('Scale must be positive.');const tx=p.x||0,ty=p.y||0,tz=p.z||0;return faces.map(f=>new Face(f.v.map(v=>{let [x,y,z]=v.map(a=>a*s);[y,z]=[y*Math.cos(rx)-z*Math.sin(rx),y*Math.sin(rx)+z*Math.cos(rx)];[x,z]=[x*Math.cos(ry)+z*Math.sin(ry),-x*Math.sin(ry)+z*Math.cos(ry)];[x,y]=[x*Math.cos(rz)-y*Math.sin(rz),x*Math.sin(rz)+y*Math.cos(rz)];return [x+tx,y+ty,z+tz];})));}
export function stats(faces){let volume=0,area=0,triangles=0;const pts=[];for(const f of faces){pts.push(...f.v);for(let i=1;i<f.v.length-1;i++){const a=f.v[0],b=f.v[i],c=f.v[i+1];volume+=V.dot(a,V.cross(b,c))/6;area+=V.len(V.cross(V.sub(b,a),V.sub(c,a)))/2;triangles++;}}return {volume:Math.abs(volume),signedVolume:volume,area,triangles,faces:faces.length,bounds:pts.length?boundsOf(pts):{min:[0,0,0],max:[0,0,0]}};}
const key=p=>p.map(v=>Math.round(v*1e5)).join(',');
export function mesh(faces){
  const normalMap=new Map(),edges=new Map(),positions=[],normals=[],indices=[];
  // BSP splits can create T-junctions. Filter coplanar split edges without showing
  // internal triangulation as a CAD feature edge. Open mesh boundaries remain visible.
  const planeKey=f=>[...f.n.map(v=>Math.round(v*1e5)),Math.round(f.w*1e4)].join(',');
  const planes=new Map();
  for(const f of faces){const k=planeKey(f);if(!planes.has(k))planes.set(k,[]);planes.get(k).push({f,b:boundsOf(f.v)});}
  function internalSplit(e){
    const n=e.ns[0],w=V.dot(n,e.a),group=planes.get(planeKey({n,w}));if(!group||group.length<2)return false;
    const tangent=V.sub(e.b,e.a),probe=V.sub(V.mix(e.a,e.b,.5),V.mul(V.norm(V.cross(n,tangent)),2e-4));
    for(const {f,b} of group){if(probe.some((x,i)=>x<b.min[i]-1e-5||x>b.max[i]+1e-5))continue;let inside=true;for(let j=0;j<f.v.length;j++){const a=f.v[j],next=f.v[(j+1)%f.v.length];if(V.dot(V.cross(V.sub(next,a),V.sub(probe,a)),n)<-1e-6){inside=false;break;}}if(inside)return true;}
    return false;
  }
  for(const face of faces){for(const v of face.v){const k=key(v);if(!normalMap.has(k))normalMap.set(k,[]);normalMap.get(k).push(face.n);}for(let i=0;i<face.v.length;i++){const a=face.v[i],b=face.v[(i+1)%face.v.length],ak=key(a),bk=key(b),k=ak<bk?ak+'|'+bk:bk+'|'+ak;if(!edges.has(k))edges.set(k,{a,b,ns:[]});edges.get(k).ns.push(face.n);}}
  for(const f of faces){const offset=positions.length/3;for(const v of f.v){positions.push(...v);const ns=normalMap.get(key(v)).filter(n=>V.dot(n,f.n)>.8);normals.push(...V.norm(ns.reduce((s,n)=>V.add(s,n),[0,0,0])));}for(let i=1;i<f.v.length-1;i++)indices.push(offset,offset+i,offset+i+1);}
  const lines=[];for(const e of edges.values()){if((e.ns.length===1&&!internalSplit(e))||e.ns.some(n=>V.dot(n,e.ns[0])<.94))lines.push(...e.a,...e.b);}
  const pos=new Float32Array(positions),idx=new Uint32Array(indices);return {positions:pos,normals:new Float32Array(normals),indices:idx,edges:new Float32Array(lines),stats:stats(faces),bvh:buildBVH(pos,idx)};
}
export function buildBVH(positions,indices){
  const tris=Array.from({length:indices.length/3},(_,i)=>i),nodes=[];
  function build(ids,depth){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const t of ids)for(let j=0;j<3;j++)for(let k=0;k<3;k++){const v=positions[indices[t*3+j]*3+k];min[k]=Math.min(min[k],v);max[k]=Math.max(max[k],v);}const i=nodes.length,node={min,max};nodes.push(node);if(ids.length<=12||depth>=32){node.triangles=ids;return i;}const spans=max.map((v,i)=>v-min[i]),axis=spans.indexOf(Math.max(...spans));const center=t=>(positions[indices[t*3]*3+axis]+positions[indices[t*3+1]*3+axis]+positions[indices[t*3+2]*3+axis])/3;ids.sort((a,b)=>center(a)-center(b));const mid=ids.length>>1;node.left=build(ids.slice(0,mid),depth+1);node.right=build(ids.slice(mid),depth+1);return i;}
  if(tris.length)build(tris,0);return nodes;
}
export function pickMesh(ray,m,accept=()=>true){if(!m.bvh?.length)return null;let best=null;const stack=[0],p=i=>Array.from(m.positions.subarray(i*3,i*3+3));while(stack.length){const node=m.bvh[stack.pop()];if(!rayBox(ray,node.min,node.max,best?.distance??Infinity))continue;if(node.triangles){for(const t of node.triangles){const hit=rayTriangle(ray,p(m.indices[t*3]),p(m.indices[t*3+1]),p(m.indices[t*3+2]));if(hit&&accept(hit)&&(!best||hit.distance<best.distance))best={...hit,triangle:t};}}else stack.push(node.left,node.right);}return best;}
export function importOBJ(text){const v=[],faces=[];for(const raw of text.split(/\r?\n/)){const parts=raw.trim().split(/\s+/);if(parts[0]==='v'){const p=parts.slice(1,4).map(Number);if(p.length!==3||p.some(x=>!Number.isFinite(x)))throw Error('Invalid OBJ vertex.');v.push(p);}if(parts[0]==='f'){const p=parts.slice(1).map(t=>{let i=parseInt(t.split('/')[0]);return v[i<0?v.length+i:i-1];});if(p.some(q=>!q)||p.length<3)throw Error('Invalid OBJ face.');for(let j=1;j<p.length-1;j++){const f=validFace([p[0],p[j],p[j+1]]);if(f)faces.push(f);}}}if(!faces.length)throw Error('OBJ contains no faces.');return faces;}
export function importSTL(buffer){
  const data=new DataView(buffer),faces=[];const count=buffer.byteLength>=84?data.getUint32(80,true):0;
  if(count>0&&84+count*50===buffer.byteLength){for(let i=0;i<count;i++){const at=84+i*50+12,v=[];for(let j=0;j<3;j++)v.push([0,1,2].map(k=>data.getFloat32(at+j*12+k*4,true)));if(v.flat().some(x=>!Number.isFinite(x)))throw Error('STL contains invalid coordinates.');const f=validFace(v);if(f)faces.push(f);}}
  else {const text=new TextDecoder().decode(buffer),re=/vertex\s+([-+\deE.]+)\s+([-+\deE.]+)\s+([-+\deE.]+)/g;let m,v=[];while((m=re.exec(text))){v.push(m.slice(1).map(Number));if(v.length===3){if(v.flat().some(x=>!Number.isFinite(x)))throw Error('Invalid STL vertex.');const f=validFace(v);if(f)faces.push(f);v=[];}}}
  if(!faces.length)throw Error('STL contains no valid triangles.');return faces;
}
export function exportSTL(meshes){const n=meshes.reduce((s,m)=>s+m.indices.length/3,0),buffer=new ArrayBuffer(84+n*50),dv=new DataView(buffer);new Uint8Array(buffer,0,80).set(new TextEncoder().encode('Alloy Studio - tessellated geometry in millimeters'));dv.setUint32(80,n,true);let offset=84;for(const m of meshes){for(let i=0;i<m.indices.length;i+=3){const ps=[0,1,2].map(j=>Array.from(m.positions.subarray(m.indices[i+j]*3,m.indices[i+j]*3+3))),normal=V.norm(V.cross(V.sub(ps[1],ps[0]),V.sub(ps[2],ps[0])));for(const a of [normal,...ps])for(const x of a){dv.setFloat32(offset,x,true);offset+=4;}dv.setUint16(offset,0,true);offset+=2;}}return buffer;}
export function exportOBJ(bodies){let text='# Alloy Studio; units: mm\n',base=1;for(const b of bodies){text+='o '+b.name.replace(/\s/g,'_')+'\n';for(let i=0;i<b.mesh.positions.length;i+=3)text+=`v ${b.mesh.positions[i]} ${b.mesh.positions[i+1]} ${b.mesh.positions[i+2]}\n`;for(let i=0;i<b.mesh.indices.length;i+=3)text+=`f ${base+b.mesh.indices[i]} ${base+b.mesh.indices[i+1]} ${base+b.mesh.indices[i+2]}\n`;base+=b.mesh.positions.length/3;}return text;}
