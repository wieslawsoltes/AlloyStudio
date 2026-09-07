import {ModelEvaluator,validateDocument} from './document.js';
const evaluator=new ModelEvaluator();
self.onmessage=event=>{
  const {id,document}=event.data;
  try {
    const result=evaluator.evaluate(validateDocument(document));
    // Cached buffers remain owned by the worker. Clone before transfer to avoid detaching the cache.
    const outgoing=structuredClone(result),transfer=[];
    for(const b of outgoing.bodies)for(const key of ['positions','normals','indices','edges'])transfer.push(b.mesh[key].buffer);
    self.postMessage({id,result:outgoing},transfer);
  }catch(e){self.postMessage({id,error:e.message});}
};
