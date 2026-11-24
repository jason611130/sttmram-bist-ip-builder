importScripts("fault-engine.js?v=2.34.0");
self.onmessage=function(event){
  const {id,type,payload}=event.data;
  try{
    const result=type==="synthesize"?self.FaultEngine.synthesize(payload):type==="simulate"?self.FaultEngine.simulate(payload):type==="analyze"?self.FaultEngine.analyze(payload):type==="optimize"?self.FaultEngine.optimize(payload):(()=>{throw new Error("Unknown worker request")})();
    self.postMessage({id,ok:true,result});
  }catch(error){self.postMessage({id,ok:false,error:error&&error.message?error.message:String(error)})}
};
