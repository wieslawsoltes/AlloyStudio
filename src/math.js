/** Double-precision CPU geometry; column-major Float32 matrices at the GPU boundary. */
export const EPS = 1e-6;
export const V = {
  add: (a,b) => [a[0]+b[0],a[1]+b[1],a[2]+b[2]],
  sub: (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]],
  mul: (a,s) => [a[0]*s,a[1]*s,a[2]*s],
  dot: (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross: (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  len: a => Math.hypot(...a),
  norm(a) { const l=Math.hypot(...a); return l>1e-14?this.mul(a,1/l):[0,0,1]; },
  mix: (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t),
  distance: (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])
};
export const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
export const M = {
  identity: ()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),
  mul(a,b) { const o=new Float32Array(16); for(let c=0;c<4;c++) for(let r=0;r<4;r++) for(let k=0;k<4;k++) o[c*4+r]+=a[k*4+r]*b[c*4+k]; return o; },
  lookAt(eye,target,up=[0,0,1]) { const z=V.norm(V.sub(eye,target)),x=V.norm(V.cross(up,z)),y=V.cross(z,x); return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-V.dot(x,eye),-V.dot(y,eye),-V.dot(z,eye),1]); },
  perspective(fov,aspect,near,far,webgpu=true) { const f=1/Math.tan(fov/2),nf=1/(near-far); return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(webgpu?far:far+near)*nf,-1,0,0,(webgpu?1:2)*far*near*nf,0]); },
  ortho(l,r,b,t,n,f,webgpu=true) {return new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,(webgpu?1:2)/(n-f),0,-(r+l)/(r-l),-(t+b)/(t-b),(webgpu?n:f+n)/(n-f),1]);},
  transform(m,p,w=1) { const o=[0,0,0,0]; for(let r=0;r<4;r++) o[r]=m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r]*w; return o; }
};
export class Camera {
  constructor() { this.target=[0,0,26]; this.yaw=-0.95; this.pitch=0.62; this.distance=250; this.ortho=true; this.fov=0.64; this.width=1000; this.height=700; }
  get eye() {return V.add(this.target,[this.distance*Math.cos(this.pitch)*Math.cos(this.yaw),this.distance*Math.cos(this.pitch)*Math.sin(this.yaw),this.distance*Math.sin(this.pitch)]);}
  get basis() { const forward=V.norm(V.sub(this.target,this.eye)); const right=V.norm(V.cross(forward,[0,0,1])); return {forward,right,up:V.cross(right,forward)}; }
  matrix(webgpu=true) { const aspect=this.width/this.height,h=this.distance*Math.tan(this.fov/2); const far=Math.max(5000,this.distance*10); const p=this.ortho?M.ortho(-h*aspect,h*aspect,-h,h,.01,far,webgpu):M.perspective(this.fov,aspect,.1,far,webgpu);return M.mul(p,M.lookAt(this.eye,this.target)); }
  project(p) {const q=M.transform(this.matrix(),p);return [(q[0]/q[3]*.5+.5)*this.width,(.5-q[1]/q[3]*.5)*this.height,q[2]/q[3]];}
  ray(x,y) {const {forward,right,up}=this.basis,h=Math.tan(this.fov/2),dx=(x/this.width*2-1)*h*this.width/this.height,dy=(1-y/this.height*2)*h; if(this.ortho)return {o:V.add(this.eye,V.add(V.mul(right,dx*this.distance),V.mul(up,dy*this.distance))),d:forward}; return {o:this.eye,d:V.norm(V.add(forward,V.add(V.mul(right,dx),V.mul(up,dy))))};}
  pan(dx,dy) {const {right,up}=this.basis,s=2*this.distance*Math.tan(this.fov/2)/this.height;this.target=V.add(this.target,V.add(V.mul(right,-dx*s),V.mul(up,dy*s)));}
  fit(bounds) {if(!bounds)return;this.target=V.mul(V.add(bounds.min,bounds.max),.5);const diagonal=V.distance(bounds.min,bounds.max);this.distance=Math.max(20,diagonal/(2*Math.tan(this.fov/2))*1.10/Math.min(1,this.width/this.height));}
  setView(v) { const views={iso:[-.95,.62],top:[-Math.PI/2,Math.PI/2-.0001],bottom:[-Math.PI/2,-Math.PI/2+.0001],front:[-Math.PI/2,0],back:[Math.PI/2,0],right:[0,0],left:[Math.PI,0]};if(views[v])[this.yaw,this.pitch]=views[v];}
  zoom(delta,x=this.width/2,y=this.height/2) {const a=this.ray(x,y),den=V.dot(a.d,this.basis.forward),t=V.dot(V.sub(this.target,a.o),this.basis.forward)/den,anchor=V.add(a.o,V.mul(a.d,t));this.distance=clamp(this.distance*Math.exp(delta*.001),1,1e6); const b=this.ray(x,y),t2=V.dot(V.sub(this.target,b.o),this.basis.forward)/V.dot(b.d,this.basis.forward);this.target=V.add(this.target,V.sub(anchor,V.add(b.o,V.mul(b.d,t2))));}
}
export function boundsOf(points) {const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of points)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}return {min,max};}
export function rayTriangle(ray,a,b,c) {const e1=V.sub(b,a),e2=V.sub(c,a),p=V.cross(ray.d,e2),det=V.dot(e1,p);if(Math.abs(det)<1e-10)return null;const inv=1/det,t=V.sub(ray.o,a),u=V.dot(t,p)*inv;if(u<0||u>1)return null;const q=V.cross(t,e1),v=V.dot(ray.d,q)*inv;if(v<0||u+v>1)return null;const dist=V.dot(e2,q)*inv;return dist>1e-5?{distance:dist,point:V.add(ray.o,V.mul(ray.d,dist)),normal:V.norm(V.cross(e1,e2))}:null;}
export function rayBox(ray,min,max,maxT=Infinity) {let lo=0,hi=maxT;for(let a=0;a<3;a++){if(Math.abs(ray.d[a])<1e-12){if(ray.o[a]<min[a]||ray.o[a]>max[a])return false;continue;}let t0=(min[a]-ray.o[a])/ray.d[a],t1=(max[a]-ray.o[a])/ray.d[a];if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(hi<lo)return false;}return true;}
