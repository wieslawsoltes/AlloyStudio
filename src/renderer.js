import {V,M,Camera,clamp,boundsOf} from './math.js';
import {MATERIALS} from './document.js';
const WGSL=/* wgsl */`
struct Scene { vp:mat4x4f, light:mat4x4f, eye:vec4f, settings:vec4f, section:vec4f, misc:vec4f };
@group(0) @binding(0) var<uniform> scene:Scene;
@group(0) @binding(1) var shadowMap:texture_depth_2d;
@group(0) @binding(2) var shadowSampler:sampler_comparison;
struct In { @location(0) p:vec3f, @location(1) n:vec3f, @location(2) color:vec3f, @location(3) rough:f32, @location(4) metal:f32, @location(5) id:f32 };
struct Out { @builtin(position) position:vec4f, @location(0) p:vec3f, @location(1) n:vec3f, @location(2) color:vec3f, @location(3) params:vec3f, @location(4) lightPosition:vec4f };
@vertex fn vs(v:In)->Out { var o:Out; o.position=scene.vp*vec4f(v.p,1); o.p=v.p;o.n=v.n;o.color=v.color;o.params=vec3f(v.rough,v.metal,v.id);o.lightPosition=scene.light*vec4f(v.p,1);return o; }
@vertex fn vsLine(v:In)->Out { var o:Out; o.position=scene.vp*vec4f(v.p,1);o.position.z-=0.00004*o.position.w;o.p=v.p;o.n=v.n;o.color=v.color;o.params=vec3f(v.rough,v.metal,v.id);o.lightPosition=vec4f(0);return o; }
fn shadow(v:Out)->f32 {let p=v.lightPosition.xyz/v.lightPosition.w;let uv=vec2f(p.x*.5+.5,.5-p.y*.5);var lit=0.;for(var x:i32=-1;x<=1;x++){for(var y:i32=-1;y<=1;y++){lit+=textureSampleCompareLevel(shadowMap,shadowSampler,uv+vec2f(f32(x),f32(y))/2048.,p.z-.00085);}}return mix(.38,1.,lit/9.);}
fn fresnel(cosTheta:f32,f0:vec3f)->vec3f {return f0+(vec3f(1)-f0)*pow(1.-cosTheta,5.);}
fn lighting(N:vec3f,V:vec3f,L:vec3f,base:vec3f,rough:f32,metal:f32,radiance:vec3f)->vec3f {
 let H=normalize(V+L);let nl=max(dot(N,L),0.);let nv=max(dot(N,V),.001);let nh=max(dot(N,H),0.);let hv=max(dot(H,V),0.);let a=rough*rough;let a2=a*a;let q=nh*nh*(a2-1.)+1.;let D=a2/(3.14159265*q*q+.00001);let k=(rough+1.)*(rough+1.)/8.;let G=(nv/(nv*(1.-k)+k))*(nl/(nl*(1.-k)+k));let F=fresnel(hv,mix(vec3f(.045),base,metal));let spec=D*G*F/(4.*nv*nl+.0001);let diffuse=(vec3f(1)-F)*(1.-metal)*base/3.14159265;return (diffuse+spec)*radiance*nl;
}
fn environment(r:vec3f)->vec3f {let sky=mix(vec3f(.10,.12,.15),vec3f(.9,.94,1.),smoothstep(-.4,.8,r.z));let strip=pow(max(0.,1.-abs(r.x*.8+r.y*.3-.35)*2.8),8.)*smoothstep(-.2,.6,r.z);return sky+vec3f(strip*.75);}
@fragment fn fs(v:Out,@builtin(front_facing) front:bool)->@location(0) vec4f {
 let gridDerivative=fwidth(v.p.xy/10.);let majorDerivative=fwidth(v.p.xy/50.);
 let ground=v.params.z<.5;
 if(!ground&&scene.misc.x>.5&&dot(v.p,scene.section.xyz)>scene.section.w){discard;}
 let visibility=shadow(v);
 if(ground){let coord=v.p.xy/10.;let grid=abs(fract(coord-.5)-.5)/max(gridDerivative,vec2f(.00001));let minor=1.-min(min(grid.x,grid.y),1.);let c2=v.p.xy/50.;let g2=abs(fract(c2-.5)-.5)/max(majorDerivative,vec2f(.00001));let major=1.-min(min(g2.x,g2.y),1.);let fade=exp(-length(v.p.xy)/850.);var c=vec3f(.925,.939,.95);if(scene.misc.y>.5){c-=vec3f((minor*.035+major*.035)*fade);}c*=mix(.74,1.,visibility);return vec4f(c,1);}
 var N=normalize(v.n);if(!front){N=-N;}let view=normalize(scene.eye.xyz-v.p);let base=pow(v.color,vec3f(2.2));let rough=clamp(v.params.x,.12,.95);let metal=v.params.y;
 let f0=mix(vec3f(.045),base,metal);let reflected=reflect(-view,N);let F=fresnel(max(dot(N,view),0.),f0);
 var c=base*(1.-metal)*(.24+max(N.z,0.)*.2)+environment(reflected)*F*(1.-rough*.52)*.7;
 c+=lighting(N,view,normalize(vec3f(.55,-.5,1.)),base,rough,metal,vec3f(4.,3.85,3.6))*visibility;
 c+=lighting(N,view,normalize(vec3f(-.65,.3,.6)),base,rough,metal,vec3f(1.5,1.65,1.9));
 c+=lighting(N,view,normalize(vec3f(.2,1.,.25)),base,rough,metal,vec3f(.75,.8,.95));
 c=c/(c+vec3f(.65));c=pow(c,vec3f(1./2.2));
 if(scene.settings.z>1.5){c=vec3f(.91,.93,.945);}
 if(abs(v.params.z-scene.settings.x)<.1&&scene.settings.x>.5){c=mix(c,vec3f(.17,.62,.92),.34);}
 else if(abs(v.params.z-scene.settings.y)<.1&&scene.settings.y>.5){c=mix(c,vec3f(.4,.72,.93),.17);}
 return vec4f(c,1);
}
@fragment fn fsLine(v:Out)->@location(0) vec4f {if(scene.misc.x>.5&&dot(v.p,scene.section.xyz)>scene.section.w){discard;}var c=mix(v.color,vec3f(.1,.16,.21),.72);if(abs(v.params.z-scene.settings.x)<.1&&scene.settings.x>.5){c=vec3f(.04,.43,.78);}return vec4f(c,.58);}
`;
const SHADOW=/* wgsl */`
struct Scene {vp:mat4x4f,light:mat4x4f,eye:vec4f,settings:vec4f,section:vec4f,misc:vec4f};
@group(0) @binding(0) var<uniform> scene:Scene;
struct Out {@builtin(position) position:vec4f,@location(0) p:vec3f};
@vertex fn vs(@location(0) p:vec3f)->Out {var o:Out;o.position=scene.light*vec4f(p,1);o.p=p;return o;}
@fragment fn fs(v:Out) {if(scene.misc.x>.5&&dot(v.p,scene.section.xyz)>scene.section.w){discard;}}
`;
const GL_VS=`#version 300 es
precision highp float;
layout(location=0)in vec3 aPosition;layout(location=1)in vec3 aNormal;layout(location=2)in vec3 aColor;layout(location=3)in float aRough;layout(location=4)in float aMetal;layout(location=5)in float aId;
uniform mat4 uVP;uniform float uLine;out vec3 p,n,color;out vec3 params;
void main(){gl_Position=uVP*vec4(aPosition,1.);if(uLine>.5)gl_Position.z-=.00008*gl_Position.w;p=aPosition;n=aNormal;color=aColor;params=vec3(aRough,aMetal,aId);}`;
const GL_FS=`#version 300 es
precision highp float;
in vec3 p,n,color,params;uniform vec3 uEye;uniform vec4 uSettings,uSection,uMisc;uniform float uLine;out vec4 outColor;
vec3 fresnel(float c,vec3 f){return f+(1.-f)*pow(1.-c,5.);}
vec3 lighting(vec3 N,vec3 V,vec3 L,vec3 base,float rough,float metal,vec3 radiance){vec3 H=normalize(V+L);float nl=max(dot(N,L),0.),nv=max(dot(N,V),.001),nh=max(dot(N,H),0.),hv=max(dot(H,V),0.),a=rough*rough,a2=a*a,q=nh*nh*(a2-1.)+1.,D=a2/(3.14159265*q*q+.00001),k=(rough+1.)*(rough+1.)/8.,G=(nv/(nv*(1.-k)+k))*(nl/(nl*(1.-k)+k));vec3 F=fresnel(hv,mix(vec3(.045),base,metal));return ((1.-F)*(1.-metal)*base/3.14159265+D*G*F/(4.*nv*nl+.0001))*radiance*nl;}
vec3 environment(vec3 r){float strip=pow(max(0.,1.-abs(r.x*.8+r.y*.3-.35)*2.8),8.)*smoothstep(-.2,.6,r.z);return mix(vec3(.1,.12,.15),vec3(.9,.94,1.),smoothstep(-.4,.8,r.z))+vec3(strip*.75);}
void main(){bool ground=params.z<.5;if(!ground&&uMisc.x>.5&&dot(p,uSection.xyz)>uSection.w)discard;
if(uLine>.5){vec3 c=mix(color,vec3(.1,.16,.21),.72);if(abs(params.z-uSettings.x)<.1&&uSettings.x>.5)c=vec3(.04,.43,.78);outColor=vec4(c,.58);return;}
if(ground){vec2 coord=p.xy/10.,grid=abs(fract(coord-.5)-.5)/max(fwidth(coord),vec2(.00001));float minor=1.-min(min(grid.x,grid.y),1.);vec2 c2=p.xy/50.,g2=abs(fract(c2-.5)-.5)/max(fwidth(c2),vec2(.00001));float major=1.-min(min(g2.x,g2.y),1.);vec3 c=vec3(.925,.939,.95);if(uMisc.y>.5)c-=vec3((minor*.035+major*.035)*exp(-length(p.xy)/850.));float shade=exp(-dot(p.xy/vec2(100.,70.),p.xy/vec2(100.,70.)))*.08;outColor=vec4(c-shade,1.);return;}
vec3 N=normalize(n);if(!gl_FrontFacing)N=-N;vec3 view=normalize(uEye-p),base=pow(color,vec3(2.2));float rough=clamp(params.x,.12,.95),metal=params.y;vec3 F=fresnel(max(dot(N,view),0.),mix(vec3(.045),base,metal));vec3 c=base*(1.-metal)*(.24+max(N.z,0.)*.2)+environment(reflect(-view,N))*F*(1.-rough*.52)*.7;
c+=lighting(N,view,normalize(vec3(.55,-.5,1.)),base,rough,metal,vec3(4.,3.85,3.6));c+=lighting(N,view,normalize(vec3(-.65,.3,.6)),base,rough,metal,vec3(1.5,1.65,1.9));c+=lighting(N,view,normalize(vec3(.2,1.,.25)),base,rough,metal,vec3(.75,.8,.95));c=pow(c/(c+vec3(.65)),vec3(1./2.2));if(uSettings.z>1.5)c=vec3(.91,.93,.945);if(abs(params.z-uSettings.x)<.1&&uSettings.x>.5)c=mix(c,vec3(.17,.62,.92),.34);else if(abs(params.z-uSettings.y)<.1&&uSettings.y>.5)c=mix(c,vec3(.4,.72,.93),.17);outColor=vec4(c,1.);}`;
const ATTRIBUTES=[{shaderLocation:0,offset:0,format:'float32x3'},{shaderLocation:1,offset:12,format:'float32x3'},{shaderLocation:2,offset:24,format:'float32x3'},{shaderLocation:3,offset:36,format:'float32'},{shaderLocation:4,offset:40,format:'float32'},{shaderLocation:5,offset:44,format:'float32'}];
export class Renderer {
  constructor(canvas){this.canvas=canvas;this.camera=new Camera();this.backend='Initializing';this.bodies=[];this.selected=null;this.hover=null;this.style=0;this.grid=true;this.section={enabled:false,axis:'X',offset:0};this.explode=0;this.dirty=true;this.onFrame=null;this.onError=console.warn;this.encodedMs=0;this.shadowDirty=true;}
  async initialize(){
    const forced=new URLSearchParams(location.search).get('renderer');
    if(navigator.gpu&&forced!=='webgl')try{await this.initGPU();this.backend='WebGPU';}catch(error){this.onError('WebGPU unavailable: '+error.message);const failed=this.gpu;this.gpu=null;failed?.destroy();const fresh=this.canvas.cloneNode();this.canvas.replaceWith(fresh);this.canvas=fresh;}
    if(this.backend!=='WebGPU'){this.initGL();this.backend='WebGL2';}
    this.resizeObserver=new ResizeObserver(()=>this.invalidate());this.resizeObserver.observe(this.canvas.parentElement);this.tick();return this;
  }
  async initGPU(){
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('No GPU adapter.');this.adapterInfo=adapter.info;
    const device=await adapter.requestDevice();this.gpu=device;device.addEventListener('uncapturederror',e=>{this.lastGPUError=e.error.message;this.onError(e.error.message);});
    device.lost.then(info=>{if(this.gpu!==device||this.disposed)return;this.onError('GPU device lost: '+info.message+'. Reload to restore the renderer.');this.backend='Device lost';});
    const context=this.canvas.getContext('webgpu'),format=navigator.gpu.getPreferredCanvasFormat();if(!context)throw Error('Cannot create WebGPU context.');this.context=context;this.format=format;context.configure({device,format,alphaMode:'opaque'});
    this.uniform=device.createBuffer({size:192,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    const layout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:'uniform'}},{binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'depth'}},{binding:2,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'comparison'}}]});
    const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
    this.shadowTexture=device.createTexture({size:[2048,2048],format:'depth32float',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING});
    this.bindGroup=device.createBindGroup({layout,entries:[{binding:0,resource:{buffer:this.uniform}},{binding:1,resource:this.shadowTexture.createView()},{binding:2,resource:device.createSampler({compare:'less-equal',minFilter:'linear',magFilter:'linear',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'})}]});
    const module=device.createShaderModule({code:WGSL}),info=await module.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw Error(errors.map(e=>e.message).join('\n'));
    const vertices={arrayStride:48,attributes:ATTRIBUTES};
    this.pipeline=await device.createRenderPipelineAsync({layout:pipelineLayout,vertex:{module,entryPoint:'vs',buffers:[vertices]},fragment:{module,entryPoint:'fs',targets:[{format}]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth24plus',depthWriteEnabled:true,depthCompare:'less'},multisample:{count:4}});
    this.linePipeline=await device.createRenderPipelineAsync({layout:pipelineLayout,vertex:{module,entryPoint:'vsLine',buffers:[vertices]},fragment:{module,entryPoint:'fsLine',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'line-list'},depthStencil:{format:'depth24plus',depthWriteEnabled:false,depthCompare:'less-equal'},multisample:{count:4}});
    const shadowModule=device.createShaderModule({code:SHADOW});this.shadowPipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:shadowModule,entryPoint:'vs',buffers:[{arrayStride:48,attributes:[ATTRIBUTES[0]]}]},fragment:{module:shadowModule,entryPoint:'fs',targets:[]},primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less',depthBias:2,depthBiasSlopeScale:2}});
    this.shadowBind=device.createBindGroup({layout:this.shadowPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}}]});
  }
  initGL(){const gl=this.canvas.getContext('webgl2',{antialias:true,alpha:false,preserveDrawingBuffer:true});if(!gl)throw Error('This browser cannot provide WebGPU or WebGL2.');this.gl=gl;const shader=(type,code)=>{const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};const prog=gl.createProgram();gl.attachShader(prog,shader(gl.VERTEX_SHADER,GL_VS));gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,GL_FS));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));this.program=prog;this.locations=Object.fromEntries(['uVP','uEye','uSettings','uSection','uMisc','uLine'].map(n=>[n,gl.getUniformLocation(prog,n)]));this.vbo=gl.createBuffer();this.ibo=gl.createBuffer();this.lbo=gl.createBuffer();gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);}
  offset(body){if(!this.explode)return [0,0,0];const b=body.mesh.stats.bounds,c=V.mul(V.add(b.min,b.max),.5),center=this.bounds?V.mul(V.add(this.bounds.min,this.bounds.max),.5):[0,0,0];const d=V.sub(c,center);return V.mul(d,this.explode*.9);}
  setScene(bodies){this.bodies=bodies;this.ids=new Map(bodies.map((b,i)=>[b.id,i+1]));const ps=[];for(const b of bodies)if(b.visible){ps.push(b.mesh.stats.bounds.min,b.mesh.stats.bounds.max);}this.bounds=ps.length?boundsOf(ps):null;this.upload();}
  upload(){
    const verts=[],indices=[],lines=[];const push=(p,n,color,rough,metal,id,out=verts)=>out.push(...p,...n,...color,rough,metal,id);
    for(const p of [[-2500,-2500,-.35],[2500,-2500,-.35],[2500,2500,-.35],[-2500,2500,-.35]])push(p,[0,0,1],[.93,.94,.95],1,0,0);indices.push(0,1,2,0,2,3);
    for(const body of this.bodies){if(!body.visible)continue;const m=body.mesh,material=MATERIALS[body.material]||MATERIALS.aluminum,id=this.ids.get(body.id),base=verts.length/12,offset=this.offset(body);for(let i=0;i<m.positions.length;i+=3)push([m.positions[i]+offset[0],m.positions[i+1]+offset[1],m.positions[i+2]+offset[2]],[m.normals[i],m.normals[i+1],m.normals[i+2]],material.color,material.roughness,material.metalness,id);for(const index of m.indices)indices.push(base+index);for(let i=0;i<m.edges.length;i+=3)push([m.edges[i]+offset[0],m.edges[i+1]+offset[1],m.edges[i+2]+offset[2]],[0,0,1],material.color,material.roughness,material.metalness,id,lines);}
    const vs=new Float32Array(verts),is=new Uint32Array(indices),ls=new Float32Array(lines);this.indexCount=is.length;this.lineCount=ls.length/12;this.vertexCount=vs.length/12;
    if(this.gpu){const create=(old,array,usage)=>{old?.destroy();const b=this.gpu.createBuffer({size:Math.max(4,array.byteLength),usage:usage|GPUBufferUsage.COPY_DST});if(array.byteLength)this.gpu.queue.writeBuffer(b,0,array);return b;};this.vertexBuffer=create(this.vertexBuffer,vs,GPUBufferUsage.VERTEX);this.indexBuffer=create(this.indexBuffer,is,GPUBufferUsage.INDEX);this.lineBuffer=create(this.lineBuffer,ls,GPUBufferUsage.VERTEX);}
    else if(this.gl){const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.vbo);gl.bufferData(gl.ARRAY_BUFFER,vs,gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,is,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,this.lbo);gl.bufferData(gl.ARRAY_BUFFER,ls,gl.STATIC_DRAW);}
    this.shadowDirty=true;this.invalidate();
  }
  invalidate(){this.dirty=true;}
  resize(){const rect=this.canvas.parentElement.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));this.camera.width=rect.width;this.camera.height=rect.height;if(this.canvas.width===w&&this.canvas.height===h)return;this.canvas.width=w;this.canvas.height=h;if(this.gpu){this.depthTexture?.destroy();this.msaaTexture?.destroy();this.depthTexture=this.gpu.createTexture({size:[w,h],sampleCount:4,format:'depth24plus',usage:GPUTextureUsage.RENDER_ATTACHMENT});this.msaaTexture=this.gpu.createTexture({size:[w,h],sampleCount:4,format:this.format,usage:GPUTextureUsage.RENDER_ATTACHMENT});}}
  lightMatrix(){const b=this.bounds,center=b?V.mul(V.add(b.min,b.max),.5):[0,0,20],radius=b?Math.max(50,V.distance(b.min,b.max)*.65*(1+this.explode)):150;const eye=V.add(center,V.mul(V.norm([.55,-.5,1]),radius*3));return M.mul(M.ortho(-radius,radius,-radius,radius,.1,radius*7),M.lookAt(eye,center));}
  uniforms(){const data=new Float32Array(48);data.set(this.camera.matrix(true),0);data.set(this.lightMatrix(),16);data.set([...this.camera.eye,1],32);data.set([this.ids?.get(this.selected)||0,this.ids?.get(this.hover)||0,this.style,0],36);const axis={X:[1,0,0],Y:[0,1,0],Z:[0,0,1]}[this.section.axis];data.set([...axis,this.section.offset],40);data.set([this.section.enabled?1:0,this.grid?1:0,0,0],44);return data;}
  drawGPU(){if(!this.vertexBuffer)return;const d=this.gpu;d.queue.writeBuffer(this.uniform,0,this.uniforms());const encoder=d.createCommandEncoder();
    if(this.shadowDirty){const shadow=encoder.beginRenderPass({colorAttachments:[],depthStencilAttachment:{view:this.shadowTexture.createView(),depthLoadOp:'clear',depthStoreOp:'store',depthClearValue:1}});shadow.setPipeline(this.shadowPipeline);shadow.setBindGroup(0,this.shadowBind);shadow.setVertexBuffer(0,this.vertexBuffer);shadow.setIndexBuffer(this.indexBuffer,'uint32');if(this.indexCount>6)shadow.drawIndexed(this.indexCount-6,1,6);shadow.end();this.shadowDirty=false;}
    const pass=encoder.beginRenderPass({colorAttachments:[{view:this.msaaTexture.createView(),resolveTarget:this.context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'discard',clearValue:{r:.925,g:.939,b:.95,a:1}}],depthStencilAttachment:{view:this.depthTexture.createView(),depthLoadOp:'clear',depthStoreOp:'discard',depthClearValue:1}});
    pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.bindGroup);pass.setVertexBuffer(0,this.vertexBuffer);pass.setIndexBuffer(this.indexBuffer,'uint32');pass.drawIndexed(this.indexCount);
    if(this.style!==1&&this.lineCount){pass.setPipeline(this.linePipeline);pass.setVertexBuffer(0,this.lineBuffer);pass.draw(this.lineCount);}pass.end();d.queue.submit([encoder.finish()]);
  }
  drawGL(){const gl=this.gl,l=this.locations;if(!this.indexCount)return;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(.925,.939,.95,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);gl.uniformMatrix4fv(l.uVP,false,this.camera.matrix(false));gl.uniform3fv(l.uEye,this.camera.eye);const u=this.uniforms();gl.uniform4fv(l.uSettings,u.subarray(36,40));gl.uniform4fv(l.uSection,u.subarray(40,44));gl.uniform4fv(l.uMisc,u.subarray(44,48));const bind=buffer=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffer);[3,3,3,1,1,1].forEach((size,i)=>{gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,size,gl.FLOAT,false,48,[0,12,24,36,40,44][i]);});};bind(this.vbo);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.ibo);gl.uniform1f(l.uLine,0);gl.drawElements(gl.TRIANGLES,this.indexCount,gl.UNSIGNED_INT,0);if(this.style!==1&&this.lineCount){bind(this.lbo);gl.uniform1f(l.uLine,1);gl.depthMask(false);gl.depthFunc(gl.LEQUAL);gl.drawArrays(gl.LINES,0,this.lineCount);gl.depthMask(true);gl.depthFunc(gl.LESS);}}
  tick(){if(this.disposed)return;requestAnimationFrame(()=>this.tick());if(!this.dirty)return;this.dirty=false;const start=performance.now();try{this.resize();if(this.backend==='WebGPU')this.drawGPU();else if(this.backend==='WebGL2')this.drawGL();this.encodedMs=performance.now()-start;this.onFrame?.();}catch(e){this.onError(e.message);}}
  dispose(){this.disposed=true;this.resizeObserver?.disconnect();this.vertexBuffer?.destroy();this.indexBuffer?.destroy();this.lineBuffer?.destroy();this.depthTexture?.destroy();this.msaaTexture?.destroy();this.shadowTexture?.destroy();this.gpu?.destroy();}
}
