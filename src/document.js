import {V,clamp} from './math.js';
import {Face,rectangle,circle,extrude,box,cylinder,sphere,torus,revolve,transform,boolean,mesh,stats} from './kernel.js';
export const SCHEMA_VERSION=1;
export const uid = (prefix='f')=>prefix+'_'+Math.random().toString(36).slice(2,10);
/** Pratt parser. No eval/Function; user formulas cannot execute JavaScript. Units are scalars in mm. */
export function expression(source,resolve=()=>{throw Error('Unknown parameter.');}){
  if(typeof source==='number'){if(!Number.isFinite(source))throw Error('Expected a finite number.');return source;}
  const text=String(source).trim();if(text.length>256)throw Error('Expression is too long.');const tokens=[];const re=/\s*(?:(\d*\.\d+|\d+\.?\d*)([eE][-+]?\d+)?|([A-Za-z_][A-Za-z_0-9]*)|([+\-*/^(),]))/y;let at=0;
  while(at<text.length){re.lastIndex=at;const m=re.exec(text);if(!m)throw Error(`Unexpected expression token at ${at+1}.`);tokens.push(m[1]?{number:Number(m[1]+(m[2]||''))}:m[3]||m[4]);at=re.lastIndex;}
  let i=0;const fn={sqrt:Math.sqrt,abs:Math.abs,min:Math.min,max:Math.max,sin:x=>Math.sin(x*Math.PI/180),cos:x=>Math.cos(x*Math.PI/180),tan:x=>Math.tan(x*Math.PI/180),round:Math.round,floor:Math.floor,ceil:Math.ceil};
  const constants={pi:Math.PI,mm:1,cm:10,m:1000,inch:25.4,deg:1};
  function parse(min=0){let token=tokens[i++],left;if(token?.number!==undefined)left=token.number;else if(token==='+'||token==='-')left=(token==='-'?-1:1)*parse(25);else if(token==='('){left=parse();if(tokens[i++]!==')')throw Error('Missing closing parenthesis.');}else if(typeof token==='string'&&/^[A-Za-z_]/.test(token)){if(tokens[i]==='('){i++;if(!fn[token])throw Error(`Unsupported function: ${token}`);const args=[parse()];while(tokens[i]===','){i++;args.push(parse());}if(tokens[i++]!==')')throw Error('Missing closing parenthesis.');left=fn[token](...args);}else left=Object.hasOwn(constants,token)?constants[token]:resolve(token);}else throw Error('Expected a value.');
    while(i<tokens.length){const op=tokens[i],prec=({'+':10,'-':10,'*':20,'/':20,'^':30})[op];if(prec===undefined||prec<min)break;i++;const right=parse(prec+(op==='^'?0:1));left=op==='+'?left+right:op==='-'?left-right:op==='*'?left*right:op==='/'?left/right:left**right;}
    return left;
  }
  const value=parse();if(i!==tokens.length)throw Error('Unexpected token. Use * between values and units.');if(!Number.isFinite(value)||Math.abs(value)>1e9)throw Error('Expression must produce a finite value with magnitude ≤ 1e9.');return value;
}
export function parameters(values){const result=Object.create(null),pending=new Set();function resolve(k){if(Object.hasOwn(result,k))return result[k];if(!Object.hasOwn(values,k))throw Error(`Unknown parameter: ${k}`);if(pending.has(k))throw Error(`Circular parameter: ${k}`);pending.add(k);result[k]=expression(values[k],resolve);pending.delete(k);return result[k];}for(const k of Object.keys(values))resolve(k);return result;}
export function newDocument(){return {format:'alloy-studio',version:SCHEMA_VERSION,name:'Untitled design',units:'mm',parameters:{},features:[],appearances:{},hidden:[],rollback:null};}
/** Validate untrusted project data before it reaches geometry or the DOM. */
export function validateDocument(d){
  const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const featureId=/^[A-Za-z_][A-Za-z_0-9.-]{0,99}$/;
  const bodyId=/^[A-Za-z_][A-Za-z_0-9.:-]{0,119}$/;
  if(!record(d)||d.format!=='alloy-studio'||d.version!==SCHEMA_VERSION)throw Error('Unsupported Alloy document format or version.');
  if(d.units!=='mm')throw Error('This document version requires millimeter units.');
  if(!Array.isArray(d.features)||d.features.length>500)throw Error('Document must contain at most 500 features.');
  if(typeof d.name!=='string'||d.name.length>200)throw Error('Invalid document name.');
  if(!record(d.parameters)||Object.keys(d.parameters).length>128)throw Error('Invalid parameter table; at most 128 parameters are supported.');
  for(const k of Object.keys(d.parameters))if(!/^[A-Za-z_][A-Za-z_0-9]{0,63}$/.test(k)||['pi','mm','cm','m','inch','deg','__proto__','constructor','prototype'].includes(k))throw Error('Invalid or reserved parameter name: '+k);
  parameters(d.parameters);
  if(d.rollback!=null&&(!Number.isInteger(d.rollback)||d.rollback< -1||d.rollback>=d.features.length))throw Error('Invalid timeline position.');
  const types=new Set(['box','cylinder','sphere','torus','sketch','extrude','revolve','hole','boolean','move','pattern','mesh','delete']);
  const ids=new Set();let meshVertices=0;
  for(const f of d.features){
    if(!record(f)||typeof f.id!=='string'||!featureId.test(f.id)||ids.has(f.id)||!types.has(f.type))throw Error('Invalid, duplicate, or unsupported feature.');
    ids.add(f.id);
    if(typeof f.name!=='string'||f.name.length>200||!record(f.p))throw Error('Invalid feature metadata.');
    if(f.material!==undefined&&!Object.hasOwn(MATERIALS,f.material))throw Error('Unknown material.');
    if(f.suppressed!==undefined&&typeof f.suppressed!=='boolean')throw Error('Invalid suppression flag.');
    for(const k of ['target','tool','profile'])if(f[k]!==undefined&&(typeof f[k]!=='string'||!bodyId.test(f[k])))throw Error('Invalid feature reference.');
    if(f.type==='mesh'){
      if(!Array.isArray(f.p.faces)||f.p.faces.length>100000)throw Error('Invalid or oversized mesh.');
      for(const face of f.p.faces){
        if(!Array.isArray(face)||face.length<3||face.length>1000)throw Error('Invalid mesh face.');
        for(const p of face){
          if(!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v)||Math.abs(v)>1e7))throw Error('Invalid mesh coordinate.');
          if(++meshVertices>600000)throw Error('Imported geometry exceeds the safety budget.');
        }
      }
    }
  }
  const appearances=d.appearances??{},names=d.names??{},hidden=d.hidden??[];
  if(!record(appearances)||!record(names)||!Array.isArray(hidden))throw Error('Invalid document metadata.');
  for(const [k,v] of Object.entries(appearances))if(!bodyId.test(k)||typeof v!=='string'||!Object.hasOwn(MATERIALS,v))throw Error('Invalid appearance override.');
  for(const [k,v] of Object.entries(names))if(!bodyId.test(k)||typeof v!=='string'||v.length>200)throw Error('Invalid body name override.');
  if(hidden.some(id=>typeof id!=='string'||!bodyId.test(id)))throw Error('Invalid visibility list.');
  return {...d,appearances,names,hidden,rollback:d.rollback??null};
}
export const MATERIALS={
  aluminum:{name:'Satin aluminum',color:[.66,.72,.77],metalness:.8,roughness:.29,density:2.70},
  orange:{name:'Anodized copper',color:[.79,.34,.12],metalness:.62,roughness:.33,density:2.70},
  steel:{name:'Stainless steel',color:[.52,.59,.67],metalness:.94,roughness:.2,density:7.85},
  dark:{name:'Graphite anodized',color:[.17,.22,.28],metalness:.72,roughness:.3,density:2.70},
  brass:{name:'Machined brass',color:[.68,.50,.22],metalness:.88,roughness:.24,density:8.50},
  blue:{name:'Cobalt enamel',color:[.12,.32,.53],metalness:.4,roughness:.25,density:2.70},
  white:{name:'Porcelain polymer',color:[.85,.86,.83],metalness:.05,roughness:.36,density:1.20},
  rubber:{name:'Black elastomer',color:[.065,.075,.085],metalness:0,roughness:.9,density:1.10}
};
export class ModelEvaluator {
  constructor(){this.cache=new Map();this.serial=0;}
  evaluate(doc){
    const start=performance.now(),env=parameters(doc.parameters),envKey=JSON.stringify(env),all=new Map(),active=new Map(),sketches=[],errors=[],timeline=[],liveKeys=new Set();let count=0;
    const num=(v,def=0)=>v===undefined||v===''?def:expression(v,k=>{if(!Object.hasOwn(env,k))throw Error(`Unknown parameter: ${k}`);return env[k];});
    const positive=(v,name)=>{const n=num(v);if(n<=0||n>1e5)throw Error(`${name} must be > 0 and ≤ 100,000 mm.`);return n;};
    const transformParams=p=>({x:num(p.x),y:num(p.y),z:num(p.z),rx:num(p.rx),ry:num(p.ry),rz:num(p.rz),scale:num(p.scale,1)});
    for(let index=0;index<doc.features.length;index++){
      const f=doc.features[index];if(doc.rollback!==null&&index>doc.rollback)break;
      const featureStart=performance.now();let state='ok',outputs=[],consume=[];
      try {
        const p=f.p,ids=[f.target,f.tool,f.profile].filter(Boolean),deps=ids.map(id=>{if(!all.has(id))throw Error(`Missing input: ${id}. Restore or repair the preceding feature.`);return all.get(id);});
        const cacheKey=JSON.stringify([f,envKey,deps.map(d=>d.key)]);liveKeys.add(f.id);
        if(this.cache.get(f.id)?.key===cacheKey){({outputs,consume}=this.cache.get(f.id));}
        else {
          const outputKey=++this.serial;const get=id=>all.get(id),target=get(f.target);let faces=null,material=f.material||target?.material||'aluminum',name=f.name;
          if(f.suppressed){if(target){faces=target.faces;consume=[f.target];name=target.name;}state='suppressed';}
          else switch(f.type){
            case 'box':faces=box(positive(p.width,'Width'),positive(p.depth,'Depth'),positive(p.height,'Height'),Math.max(0,num(p.radius)));break;
            case 'cylinder':faces=cylinder(positive(p.radius,'Radius'),positive(p.height,'Height'),clamp(Math.round(num(p.segments,64)),8,128));break;
            case 'sphere':faces=sphere(positive(p.radius,'Radius'));break;
            case 'torus':faces=torus(positive(p.major,'Major radius'),positive(p.minor,'Minor radius'));break;
            case 'sketch':{
              let points;if(p.shape==='rectangle')points=rectangle(positive(p.width,'Width'),positive(p.height,'Height'),Math.max(0,num(p.radius)));else if(p.shape==='circle')points=circle(positive(p.radius,'Radius'));else {if(!Array.isArray(p.points)||p.points.length<3||p.points.length>1024)throw Error('A closed sketch needs 3–1024 vertices.');points=p.points.map(q=>[num(q[0]),num(q[1])]);}
              outputs=[{id:f.id,name:f.name,kind:'sketch',points,plane:p.plane||'XY',origin:[num(p.x),num(p.y),num(p.z)],key:outputKey}];break;
            }
            case 'extrude':{
              const s=get(f.profile);if(s.kind!=='sketch')throw Error('Select a closed sketch profile.');faces=extrude(s.points,num(p.distance,20));const orient=s.plane==='XZ'?{rx:90}:s.plane==='YZ'?{ry:90}:{};faces=transform(faces,{...orient,x:s.origin[0],y:s.origin[1],z:s.origin[2]});consume=[];break;
            }
            case 'revolve':{const s=get(f.profile);if(s.kind!=='sketch')throw Error('Select a closed sketch profile.');faces=revolve(s.points,num(p.angle,360));faces=transform(faces,{x:s.origin[0],y:s.origin[1],z:s.origin[2]});break;}
            case 'hole':{
              if(!target?.faces)throw Error('Select a solid body.');const axis=p.axis||'Z',t=transformParams(p),r=positive(p.radius,'Radius'),depth=positive(p.depth,'Depth');let cutter=cylinder(r,depth,48);if(num(p.counterbore)>r&&num(p.counterdepth)>0)cutter=boolean(cutter,transform(cylinder(num(p.counterbore),num(p.counterdepth)+.02,48),{z:depth-num(p.counterdepth)}),'union');
              cutter=transform(cutter,{x:t.x,y:t.y,z:t.z,rx:axis==='Y'?-90:0,ry:axis==='X'?90:0});faces=boolean(target.faces,cutter,'cut');consume=[f.target];name=target.name;break;
            }
            case 'boolean':if(!target?.faces||!get(f.tool)?.faces)throw Error('Select two different solid bodies.');if(f.target===f.tool)throw Error('Target and tool must be different.');faces=boolean(target.faces,get(f.tool).faces,p.operation||'union');consume=[f.target,...(p.keepTool?[]:[f.tool])];name=target.name;break;
            case 'move':if(!target?.faces)throw Error('Select a solid body.');faces=transform(target.faces,transformParams(p));consume=[f.target];name=target.name;break;
            case 'pattern':{
              if(!target?.faces)throw Error('Select a solid body.');const n=clamp(Math.round(num(p.count,3)),2,40),spacing=num(p.spacing,30),axis=p.axis||'X';for(let i=1;i<n;i++){let tf;if(p.circular){const a=num(p.angle,360)/n*i;tf={rz:a};}else tf={[axis.toLowerCase()]:spacing*i};const ff=transform(target.faces,tf);outputs.push({id:f.id+':'+i,name:`${target.name} (${i+1})`,faces:ff,material,mesh:mesh(ff),key:outputKey+':'+i,featureId:f.id,kind:'body'});}break;
            }
            case 'mesh':faces=p.faces.map(v=>new Face(v));break;
            case 'delete':consume=[f.target];break;
            default:throw Error('Unsupported feature.');
          }
          if(faces){if(!['move','hole','boolean','extrude','revolve'].includes(f.type)&&!f.suppressed)faces=transform(faces,transformParams(p));if(faces.length>100000)throw Error('Result exceeds the 100,000-polygon budget.');outputs=[{id:f.id,name,faces,material,mesh:mesh(faces),key:outputKey,featureId:f.id,kind:'body'}];}
          this.cache.set(f.id,{key:cacheKey,outputs,consume});
        }
        for(const id of consume)active.delete(id);
        for(const o of outputs){all.set(o.id,o);if(o.kind==='sketch')sketches.push(o);else active.set(o.id,o);}
        if(f.suppressed)state='suppressed';
      }catch(e){state='error';errors.push({id:f.id,name:f.name,message:e.message});}
      timeline.push({id:f.id,state,ms:performance.now()-featureStart});count++;
    }
    for(const k of this.cache.keys())if(!liveKeys.has(k))this.cache.delete(k);
    const bodies=[...active.values()].map(b=>({id:b.id,name:doc.names?.[b.id]||b.name,material:doc.appearances[b.id]||b.material,featureId:b.featureId,mesh:b.mesh,visible:!doc.hidden.includes(b.id)}));
    return {bodies,sketches:sketches.map(({id,name,points,plane,origin})=>({id,name,points,plane,origin})),errors,timeline,parameters:env,elapsed:performance.now()-start,featureCount:count};
  }
}
export function demoDocument(){
  const d=newDocument();d.name='Orbital bearing mount';d.parameters={baseWidth:'160',baseDepth:'108',plate:'12',bore:'22',shaftRadius:'15',earSpacing:'64'};const fs=d.features;
  const add=(id,type,name,p={},rest={})=>{fs.push({id,type,name,p,...rest});return id;};
  let base=add('base','box','Mounting plate',{width:'baseWidth',depth:'baseDepth',height:'plate',radius:9},{material:'dark'});
  for(const [i,[x,y]] of [[-64,-39],[64,-39],[64,39],[-64,39]].entries())base=add('mount'+i,'hole',`Mounting hole ${i+1}`,{radius:4.5,depth:14,z:-1,x,y,counterbore:7.5,counterdepth:5},{target:base});
  const arch=[[-38,12],[38,12],[38,56]];for(let i=1;i<=24;i++){const a=i/24*Math.PI;arch.push([38*Math.cos(a),56+38*Math.sin(a)]);}
  add('earProfile','sketch','Bearing support profile',{shape:'polygon',points:arch,plane:'XZ',x:0,y:39,z:0});
  let ear=add('earExtrude','extrude','Bearing carrier · front',{distance:14},{profile:'earProfile',material:'orange'});
  ear=add('earBore','hole','Bearing seat',{axis:'Y',x:0,y:24,z:56,radius:'bore',depth:16},{target:ear});
  add('earRear','pattern','Rear bearing carrier',{axis:'Y',spacing:'-earSpacing',count:2},{target:ear,material:'orange'});
  let ring=add('bearing','cylinder','Angular-contact bearing',{radius:'bore',height:16,rx:90,x:0,y:40,z:56},{material:'steel'});
  ring=add('bearingCut','hole','Bearing race',{axis:'Y',radius:16,depth:18,x:0,y:23,z:56},{target:ring});
  add('bearingRear','pattern','Rear bearing',{axis:'Y',spacing:'-earSpacing',count:2},{target:ring,material:'steel'});
  let shaft=add('shaft','cylinder','Precision hollow shaft',{radius:'shaftRadius',height:108,rx:90,x:0,y:54,z:56},{material:'aluminum'});
  shaft=add('shaftBore','hole','Through shaft bore',{axis:'Y',radius:8,depth:110,x:0,y:-55,z:56},{target:shaft});
  let collar=add('collar','cylinder','Shaft locking collar',{radius:19,height:7,rx:90,x:0,y:49,z:56},{material:'dark'});
  collar=add('collarCut','hole','Collar bore',{axis:'Y',radius:'shaftRadius + 0.2',depth:9,x:0,y:41,z:56},{target:collar});
  add('collarRear','pattern','Rear collar',{axis:'Y',spacing:-91,count:2},{target:collar,material:'dark'});
  for(const [i,[x,y]] of [[-64,-39],[64,-39],[64,39],[-64,39]].entries()){
    const head=add('screw'+i,'cylinder',`Socket screw ${i+1}`,{radius:6.6,height:4.5,x,y,z:8},{material:'steel'});
    add('socket'+i,'hole',`Hex socket ${i+1}`,{radius:2.8,depth:3,x,y,z:10},{target:head});
  }
  return d;
}
export class History {
  constructor(limit=100){this.undoStack=[];this.redoStack=[];this.limit=limit;}
  push(doc,label){this.undoStack.push({doc:structuredClone(doc),label});if(this.undoStack.length>this.limit)this.undoStack.shift();this.redoStack=[];}
  undo(current){const entry=this.undoStack.pop();if(!entry)return null;this.redoStack.push({doc:structuredClone(current),label:entry.label});return entry;}
  redo(current){const entry=this.redoStack.pop();if(!entry)return null;this.undoStack.push({doc:structuredClone(current),label:entry.label});return entry;}
}
