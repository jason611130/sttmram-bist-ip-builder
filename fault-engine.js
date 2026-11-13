(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.FaultEngine=api;
})(typeof self!=="undefined"?self:globalThis,function(){
  "use strict";
  const descriptors=[
    {id:"SAF",name:"Stuck-at fault",description:"Victim cell 永久被固定為 0 或 1。",roles:["VTM"],relation:"single",supported:true,variants:[
      {id:"SA0",initial_state:0,trigger:{target:"VTM",operation:"write"},effect:{target:"VTM",state:"force0"}},
      {id:"SA1",initial_state:1,trigger:{target:"VTM",operation:"write"},effect:{target:"VTM",state:"force1"}}]},
    {id:"TF",name:"Transition fault",description:"Victim cell 無法完成其中一個 write transition。",roles:["VTM"],relation:"single",supported:true,variants:[
      {id:"TF0to1",trigger:{target:"VTM",operation:"write",transition:"0->1"},effect:{target:"VTM",state:"hold"}},
      {id:"TF1to0",trigger:{target:"VTM",operation:"write",transition:"1->0"},effect:{target:"VTM",state:"hold"}}]},
    {id:"RDF",name:"Read destructive fault",description:"Read 先回傳原值，之後翻轉 victim cell 狀態。",roles:["VTM"],relation:"single",supported:true,variants:[
      {id:"RDF0",trigger:{target:"VTM",operation:"read",state:0},effect:{target:"VTM",state:"flip",timing:"after"}},
      {id:"RDF1",trigger:{target:"VTM",operation:"read",state:1},effect:{target:"VTM",state:"flip",timing:"after"}}]},
    {id:"IRF",name:"Incorrect read fault",description:"Stored data 不變，但 victim read output 被反相。",roles:["VTM"],relation:"single",supported:true,variants:[
      {id:"IRF0",trigger:{target:"VTM",operation:"read",state:0},effect:{target:"VTM",read_output:"invert"}},
      {id:"IRF1",trigger:{target:"VTM",operation:"read",state:1},effect:{target:"VTM",read_output:"invert"}}]},
    {id:"CFwd",name:"Write-disturb coupling fault",description:"Aggressor 的 write transition 翻轉受限制的相鄰 victim cell。",roles:["AGR","VTM"],relation:"same_word_adjacent",supported:true,variants:[
      {id:"CFwd01V0",trigger:{target:"AGR",operation:"write",transition:"0->1",requires:{VTM:0}},effect:{target:"VTM",state:"flip"}},
      {id:"CFwd01V1",trigger:{target:"AGR",operation:"write",transition:"0->1",requires:{VTM:1}},effect:{target:"VTM",state:"flip"}},
      {id:"CFwd10V0",trigger:{target:"AGR",operation:"write",transition:"1->0",requires:{VTM:0}},effect:{target:"VTM",state:"flip"}},
      {id:"CFwd10V1",trigger:{target:"AGR",operation:"write",transition:"1->0",requires:{VTM:1}},effect:{target:"VTM",state:"flip"}}]},
    {id:"dIRF",name:"Dynamic incorrect read fault",description:"連續讀取四次後，victim read output 才會反相。",roles:["VTM"],relation:"single",supported:true,variants:[
      {id:"dIRF0x4",trigger:{target:"VTM",operation:"read",state:0,repeat:4},effect:{target:"VTM",read_output:"invert"}},
      {id:"dIRF1x4",trigger:{target:"VTM",operation:"read",state:1,repeat:4},effect:{target:"VTM",read_output:"invert"}}]},
    {id:"RTF",name:"Retention fault",description:"明確 idle 操作後 victim state 翻轉；一般只有 r/w 的 March 不會活化。",roles:["VTM"],relation:"single",supported:true,variants:[
      {id:"RTF0",trigger:{target:"VTM",operation:"idle",state:0},effect:{target:"VTM",state:"flip"}},
      {id:"RTF1",trigger:{target:"VTM",operation:"idle",state:1},effect:{target:"VTM",state:"flip"}}]},
    {id:"TRDF",name:"Transient read disturb fault",description:"機率性的 read disturbance；需要 occurrence model 才能主張 coverage。",roles:["VTM"],relation:"single",supported:false,unsupported_reason:"尚未定義 deterministic occurrence probability 或 trigger window。"},
    {id:"TWF",name:"Transient write fault",description:"機率性的 write failure；需要 occurrence model 才能主張 coverage。",roles:["VTM"],relation:"single",supported:false,unsupported_reason:"尚未定義 deterministic occurrence probability 或 trigger window。"}
  ];
  const byId=Object.fromEntries(descriptors.map(x=>[x.id,x]));
  const clone=x=>JSON.parse(JSON.stringify(x));
  const bit=(p,b)=>p==="0"||p==="00"?0:p==="1"||p==="11"?1:p==="01"?(b&1):1-(b&1);
  function* roleMaps(depth,width,relation){
    if(relation==="single"){for(let a=0;a<depth;a++)for(let b=0;b<width;b++)yield {VTM:[a,b]};return}
    if(relation==="same_word_adjacent"){for(let a=0;a<depth;a++)for(let b=0;b<width-1;b++){yield {AGR:[a,b],VTM:[a,b+1]};yield {AGR:[a,b+1],VTM:[a,b]}}return}
    if(relation==="adjacent_address"){for(let a=0;a<depth-1;a++)for(let b=0;b<width;b++){yield {AGR:[a,b],VTM:[a+1,b]};yield {AGR:[a+1,b],VTM:[a,b]}}return}
    throw new Error(`Unsupported address relation: ${relation}`);
  }
  function matches(t,op,target,before,writes){
    if(t.operation!==op||(t.target||"VTM")!==target)return false;
    if(t.state!==undefined&&t.state!=="*"&&before[target]!==Number(t.state))return false;
    if(t.transition&&t.transition!=="*"){
      if(op!=="write"||t.transition!==`${before[target]}->${writes[target]}`)return false;
    }
    return Object.entries(t.requires||{}).every(([r,v])=>before[r]===Number(v));
  }
  function stateEffect(states,target,action,before){
    if(!action||action==="none")return;
    if(action==="hold")states[target]=before[target];
    else if(action==="flip")states[target]=1-before[target];
    else if(action==="force0")states[target]=0;
    else if(action==="force1")states[target]=1;
  }
  const outputEffect=(v,a)=>!a||a==="stored"?v:a==="invert"?1-v:a==="force0"?0:1;
  function simulateInstance(descriptor,variant,roles,elements){
    const golden={},faulty={}; Object.keys(roles).forEach(r=>golden[r]=faulty[r]=0);
    if(variant.initial_state!==undefined)faulty[variant.effect.target||"VTM"]=Number(variant.initial_state);
    const trigger=variant.trigger,effect=variant.effect,need=Math.max(1,Number(trigger.repeat||1));
    let repeats=0,activated=false,globalStep=0;
    const addresses=[...new Set(Object.values(roles).map(x=>x[0]))].sort((a,b)=>a-b);
    const at={}; Object.entries(roles).forEach(([r,l])=>(at[l[0]]||(at[l[0]]=[])).push(r));
    for(let ei=0;ei<elements.length;ei++){
      const element=elements[ei],ordered=element.direction==="down"?[...addresses].reverse():addresses;
      for(const address of ordered){
        const local=at[address];
        for(let oi=0;oi<(element.operations||[]).length;oi++){
          globalStep++; const operation=element.operations[oi],kind=operation.kind,pattern=String(operation.pattern||"0");
          const before={...faulty},writes={}; Object.keys(roles).forEach(r=>writes[r]=bit(pattern,roles[r][1]));
          const target=trigger.target||"VTM",op=kind==="w"?"write":kind==="r"?"read":"idle";
          const matched=local.includes(target)&&matches(trigger,op,target,before,writes);
          repeats=matched?repeats+1:0; const fires=matched&&repeats>=need;
          if(kind==="w"){
            local.forEach(r=>golden[r]=faulty[r]=writes[r]);
            if(fires){activated=true;stateEffect(faulty,effect.target||"VTM",effect.state,before)}
            continue;
          }
          if(kind==="idle"){
            if(fires){activated=true;stateEffect(faulty,effect.target||"VTM",effect.state,before)}
            continue;
          }
          if(kind!=="r")throw new Error(`Unsupported operation: ${kind}`);
          const faultyOut={},goldenOut={}; local.forEach(r=>{faultyOut[r]=faulty[r];goldenOut[r]=golden[r]});
          if(fires){activated=true;const outTarget=effect.target||"VTM";if(outTarget in faultyOut)faultyOut[outTarget]=outputEffect(faultyOut[outTarget],effect.read_output)}
          for(const role of local)if(faultyOut[role]!==goldenOut[role])return {detected:true,activated,witness:{instance:`${variant.id} · ${Object.entries(roles).map(([r,l])=>`${r}=A${l[0]}/B${l[1]}`).join(", ")}`,element:`M${ei}`,operation_index:oi,global_projected_step:globalStep,address,bit:roles[role][1],role,operation:`r${pattern}`,golden_output:goldenOut[role],faulty_output:faultyOut[role]}};
          if(fires)stateEffect(faulty,effect.target||"VTM",effect.state,before);
        }
      }
    }
    return {detected:false,activated,witness:null};
  }
  function simulateDescriptor(d,depth,width,elements,override,maxInstances){
    if(!d.supported)return {id:d.id,name:d.name,description:d.description,status:"unsupported",reason:d.unsupported_reason,injected:0,detected:0,undetected:0,coverage:null};
    const relation=d.relation!=="single"&&override?override:d.relation;
    const maps=[...roleMaps(depth,width,relation)],total=maps.length*d.variants.length;
    if(total>maxInstances)return {id:d.id,name:d.name,description:d.description,status:"limit",reason:`${total.toLocaleString()} instances 超過 ${maxInstances.toLocaleString()} 上限。`,injected:total,activated:0,detected:0,undetected:total,coverage:null};
    let detected=0,activated=0,first=null;
    for(const variant of d.variants)for(const roles of maps){const r=simulateInstance(d,variant,roles,elements);if(r.activated)activated++;if(r.detected){detected++;if(!first)first=r.witness}}
    return {id:d.id,name:d.name,description:d.description,status:"complete",relation,injected:total,activated,detected,undetected:total-detected,coverage:total?Math.round(detected/total*1e8)/1e6:null,first_detection:first};
  }
  function simulate(request){
    const started=performance.now(),depth=Number(request.memory&&request.memory.depth),width=Number(request.memory&&request.memory.dataWidth);
    if(!Number.isInteger(depth)||depth<2||depth>65536)throw new Error("Memory depth 必須為 2–65536");
    if(!Number.isInteger(width)||width<2||width>1024)throw new Error("Data width 必須為 2–1024");
    const elements=request.sequence||[];if(!elements.length)throw new Error("至少需要一個 sequence element");
    const faults=request.faults&&request.faults.length?request.faults:descriptors.map(x=>x.id),max=Number(request.maxInstances||250000),relation=request.couplingRelation||"same_word_adjacent";
    const models=faults.map(id=>{if(!byId[id])throw new Error(`Unknown descriptor: ${id}`);return simulateDescriptor(byId[id],depth,width,elements,relation,max)});
    const complete=models.filter(x=>x.status==="complete"),injected=complete.reduce((s,x)=>s+x.injected,0),detected=complete.reduce((s,x)=>s+x.detected,0);
    return {schema:"sttmram-fault-coverage/v1",memory:{depth,dataWidth:width},algorithm:request.algorithm||"Custom sequence",operationComplexity:request.operationComplexity,couplingRelation:relation,models,summary:{injected,detected,undetected:injected-detected,weightedCoverage:injected?Math.round(detected/injected*1e8)/1e6:null,executableModels:complete.length,unsupportedModels:models.length-complete.length},elapsedSeconds:Math.round((performance.now()-started)*1000)/1e6};
  }
  const patterns=["0","1","01","10"];
  const marchC=[{direction:"up",operations:[{kind:"w",pattern:"0"}]},{direction:"up",operations:[{kind:"r",pattern:"0"},{kind:"w",pattern:"1"}]},{direction:"up",operations:[{kind:"r",pattern:"1"},{kind:"w",pattern:"0"}]},{direction:"down",operations:[{kind:"r",pattern:"0"},{kind:"w",pattern:"1"}]},{direction:"down",operations:[{kind:"r",pattern:"1"},{kind:"w",pattern:"0"}]},{direction:"up",operations:[{kind:"r",pattern:"0"}]}];
  const dirf=[{direction:"up",operations:[{kind:"w",pattern:"0"}]},{direction:"up",operations:[{kind:"r",pattern:"0"},{kind:"w",pattern:"1"},...Array.from({length:4},()=>({kind:"r",pattern:"1"}))]},{direction:"down",operations:[{kind:"r",pattern:"1"},{kind:"w",pattern:"0"},...Array.from({length:4},()=>({kind:"r",pattern:"0"}))]},{direction:"down",operations:[{kind:"r",pattern:"0"}]}];
  const countN=e=>e.reduce((s,x)=>s+x.operations.length,0);
  function pad(elements,budget,pattern){const result=clone(elements);let rem=budget-countN(result),down=result.length%2===1;while(rem>0){const n=Math.min(rem,15);result.push({direction:down?"down":"up",operations:Array.from({length:n},()=>({kind:"r",pattern}))});down=!down;rem-=n}return result}
  function rng(seed){let x=seed>>>0;return()=>{x=(Math.imul(1664525,x)+1013904223)>>>0;return x/4294967296}}
  const choice=(r,a)=>a[Math.floor(r()*a.length)];
  function randomCandidate(budget,r){let current=choice(r,patterns),rem=budget-1;const elements=[{direction:choice(r,["up","down"]),operations:[{kind:"w",pattern:current}]}];while(rem>0){const choices=[[Array.from({length:Math.min(4,rem)},()=>({kind:"r",pattern:current})),current]];if(rem>=1)choices.push([[{kind:"r",pattern:current}],current]);for(const target of patterns)if(target!==current){if(rem>=2)choices.push([[{kind:"w",pattern:target},{kind:"r",pattern:target}],target]);if(rem>=3)choices.push([[{kind:"r",pattern:current},{kind:"w",pattern:target},{kind:"r",pattern:target}],target]);if(rem>=6)choices.push([[{kind:"r",pattern:current},{kind:"w",pattern:target},...Array.from({length:4},()=>({kind:"r",pattern:target}))],target])}const [ops,next]=choice(r,choices);elements.push({direction:choice(r,["up","down"]),operations:ops});current=next;rem-=ops.length}return elements}
  function evaluate(elements,faults){const result=simulate({memory:{depth:4,dataWidth:2},sequence:elements,faults,couplingRelation:"same_word_adjacent",maxInstances:10000});let sum=0,total=0,detectedModels=0;const coverages={};result.models.forEach((m,i)=>{coverages[m.id]=m.coverage;if(m.coverage!=null){const w=faults.length-i;sum+=m.coverage*w;total+=w;if(m.coverage>0)detectedModels++}});return {score:total?Math.round(sum/total*1e6)/1e6:0,detectedModels,coverages,priorityVector:faults.map(id=>coverages[id]==null?-1:Number(coverages[id])),canonicalSummary:result.summary}}
  function synthesize(request){
    const started=performance.now(),budget=Number(request.budgetN),attempts=Number(request.attempts||200);
    if(!Number.isInteger(budget)||budget<1||budget>100)throw new Error("Custom March N 必須為 1–100");
    if(!Number.isInteger(attempts)||attempts<20||attempts>1000)throw new Error("Search attempts 必須為 20–1000");
    const faults=(request.faults||[]).filter(x=>byId[x]);if(!faults.length)throw new Error("至少選擇一個 fault descriptor");
    const candidates=[];if(budget>=10)candidates.push(pad(marchC,budget,"0"));if(budget>=14)candidates.push(pad(dirf,budget,"0"));if(budget>=24)candidates.push(pad([...clone(marchC),...clone(dirf)],budget,"0"));
    const r=rng(Number(request.seed||611130)+budget*1009+attempts);for(let i=0;i<attempts;i++)candidates.push(randomCandidate(budget,r));
    const seen=new Set(),ranked=[];for(const elements of candidates){const key=JSON.stringify(elements);if(seen.has(key))continue;seen.add(key);ranked.push({usedN:countN(elements),elements,...evaluate(elements,faults)})}
    ranked.sort((a,b)=>{for(let i=0;i<faults.length;i++){const delta=b.priorityVector[i]-a.priorityVector[i];if(delta)return delta}return b.score-a.score||b.detectedModels-a.detectedModels||a.elements.length-b.elements.length});
    const top=ranked.slice(0,5).map((x,i)=>({...x,rank:i+1,name:`Custom March ${budget}N · Candidate ${i+1}`}));
    return {schema:"sttmram-march-synthesis/v1",budgetN:budget,attempts,canonicalMemory:{depth:4,dataWidth:2},faultPriority:faults,rankingMode:"lexicographic-priority",candidates:top,evaluatedCandidates:ranked.length,elapsedSeconds:Math.round((performance.now()-started)*1000)/1e6,note:"先依 fault priority 逐項比較 coverage；全部相同時才以加權分數決勝。"};
  }
  return {descriptors:clone(descriptors),simulate,synthesize,countN};
});
