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
    {id:"RTF",name:"Retention fault",description:"需要明確 idle／retention interval 才能激發；一般只有 r/w 的 March 無法測試。",roles:["VTM"],relation:"single",supported:true,required_operation:"idle",not_applicable_reason:"目前 March sequence 只有 read/write，沒有 idle／retention interval，因此 RTF 無法被激發。",variants:[
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
  function setupReady(trigger,effect,states){
    const target=trigger.target||"VTM";
    let required=null;
    if(trigger.transition&&trigger.transition!=="*")required=Number(String(trigger.transition).split("->")[0]);
    else if(trigger.state!==undefined&&trigger.state!=="*")required=Number(trigger.state);
    else if(effect.state==="force0")required=0;
    else if(effect.state==="force1")required=1;
    if(required!==null&&states[target]!==required)return false;
    return Object.entries(trigger.requires||{}).every(([role,value])=>states[role]===Number(value));
  }
  function instanceDescriptorState(trigger,effect,golden,faulty,repeats,need,activated,detected){
    const pending=Object.keys(faulty).some(role=>faulty[role]!==golden[role]);
    const setup=setupReady(trigger,effect,faulty);
    const progress=Math.min(Math.max(repeats,0),Math.max(need-1,0));
    if(detected)return {label:"DETECTED",rank:1000,progress,need,killed:false};
    if(activated&&pending)return {label:"ACTIVATED",rank:800,progress,need,killed:false};
    if(progress>0)return {label:"PROGRESS",rank:400+Math.round(progress/need*300),progress,need,killed:false};
    if(setup)return {label:"SETUP",rank:200,progress:0,need,killed:false};
    return {label:activated?"KILLED":"INACTIVE",rank:0,progress:0,need,killed:activated};
  }
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
          for(const role of local)if(faultyOut[role]!==goldenOut[role])return {detected:true,activated,witness:{instance:`${variant.id} · ${Object.entries(roles).map(([r,l])=>`${r}=A${l[0]}/B${l[1]}`).join(", ")}`,element:`M${ei}`,operation_index:oi,global_projected_step:globalStep,address,bit:roles[role][1],role,operation:`r${pattern}`,golden_output:goldenOut[role],faulty_output:faultyOut[role]},descriptorState:instanceDescriptorState(trigger,effect,golden,faulty,repeats,need,activated,true)};
          if(fires)stateEffect(faulty,effect.target||"VTM",effect.state,before);
        }
      }
    }
    return {detected:false,activated,witness:null,descriptorState:instanceDescriptorState(trigger,effect,golden,faulty,repeats,need,activated,false)};
  }
  function simulateDescriptor(d,depth,width,elements,override,maxInstances,includeDescriptorStates=false){
    if(!d.supported)return {id:d.id,name:d.name,description:d.description,status:"unsupported",reason:d.unsupported_reason,injected:0,detected:0,undetected:0,coverage:null};
    if(d.required_operation&&!elements.some(element=>(element.operations||[]).some(operation=>operation.kind===d.required_operation)))return {id:d.id,name:d.name,description:d.description,status:"not-applicable",reason:d.not_applicable_reason||`需要 ${d.required_operation} operation。`,injected:0,activated:0,detected:0,undetected:0,coverage:null};
    const relation=d.relation!=="single"&&override?override:d.relation;
    const maps=[...roleMaps(depth,width,relation)],total=maps.length*d.variants.length;
    if(total>maxInstances)return {id:d.id,name:d.name,description:d.description,status:"limit",reason:`${total.toLocaleString()} instances 超過 ${maxInstances.toLocaleString()} 上限。`,injected:total,activated:0,detected:0,undetected:total,coverage:null};
    let detected=0,activated=0,first=null;const instanceStates=[];
    for(const variant of d.variants)for(const roles of maps){const r=simulateInstance(d,variant,roles,elements);if(r.activated)activated++;if(r.detected){detected++;if(!first)first=r.witness}if(includeDescriptorStates)instanceStates.push(r.descriptorState.rank)}
    const result={id:d.id,name:d.name,description:d.description,status:"complete",relation,injected:total,activated,detected,undetected:total-detected,coverage:total?Math.round(detected/total*1e8)/1e6:null,first_detection:first};
    if(includeDescriptorStates){
      result.instanceStates=instanceStates;
      result.descriptorProgress=instanceStates.length?Math.round(instanceStates.reduce((sum,value)=>sum+value,0)/instanceStates.length*1e4)/1e4:0;
      result.stateCounts=instanceStates.reduce((counts,value)=>{const label=value>=1000?"DETECTED":value>=800?"ACTIVATED":value>=400?"PROGRESS":value>=200?"SETUP":"INACTIVE";counts[label]=(counts[label]||0)+1;return counts},{});
    }
    return result;
  }
  function simulate(request){
    const started=performance.now(),depth=Number(request.memory&&request.memory.depth),width=Number(request.memory&&request.memory.dataWidth);
    if(!Number.isInteger(depth)||depth<2||depth>65536)throw new Error("Memory depth 必須為 2–65536");
    if(!Number.isInteger(width)||width<2||width>1024)throw new Error("Data width 必須為 2–1024");
    const elements=request.sequence||[];if(!elements.length)throw new Error("至少需要一個 sequence element");
    const faults=request.faults&&request.faults.length?request.faults:descriptors.map(x=>x.id),max=Number(request.maxInstances||250000),relation=request.couplingRelation||"same_word_adjacent";
    const includeDescriptorStates=Boolean(request.includeDescriptorStates);
    const models=faults.map(id=>{if(!byId[id])throw new Error(`Unknown descriptor: ${id}`);return simulateDescriptor(byId[id],depth,width,elements,relation,max,includeDescriptorStates)});
    const complete=models.filter(x=>x.status==="complete"),injected=complete.reduce((s,x)=>s+x.injected,0),detected=complete.reduce((s,x)=>s+x.detected,0);
    return {schema:"sttmram-fault-coverage/v1",memory:{depth,dataWidth:width},algorithm:request.algorithm||"Custom sequence",operationComplexity:request.operationComplexity,couplingRelation:relation,models,summary:{injected,detected,undetected:injected-detected,weightedCoverage:injected?Math.round(detected/injected*1e8)/1e6:null,executableModels:complete.length,unsupportedModels:models.length-complete.length},elapsedSeconds:Math.round((performance.now()-started)*1000)/1e6};
  }
  const patterns=["0","1","01","10"],directions=["up","down"];
  const countN=e=>e.reduce((s,x)=>s+x.operations.length,0);
  function groupMarchElements(elements){
    const grouped=[];
    for(const element of elements||[]){
      const last=grouped[grouped.length-1],operations=(element.operations||[]).map(operation=>({...operation}));
      if(last&&last.direction===element.direction)last.operations.push(...operations);
      else grouped.push({direction:element.direction,operations});
    }
    return grouped;
  }
  const candidateKey=e=>JSON.stringify(e);
  function normalizeReadPatterns(elements){
    const normalized=clone(elements);let current="0";
    for(const element of normalized)for(const operation of element.operations){if(operation.kind==="w")current=operation.pattern;else if(operation.kind==="r")operation.pattern=current}
    return normalized;
  }
  function patternBefore(elements,elementIndex,operationIndex=0){
    let pattern="0";
    for(let ei=0;ei<elements.length;ei++){
      const stop=ei===elementIndex?operationIndex:elements[ei].operations.length;
      for(let oi=0;oi<stop;oi++)if(elements[ei].operations[oi].kind==="w")pattern=elements[ei].operations[oi].pattern;
      if(ei===elementIndex)break;
    }
    return pattern;
  }
  function expandTemplate(elements){
    const out=[],push=value=>out.push(normalizeReadPatterns(value));
    for(let pos=1;pos<=elements.length;pos++){
      const expected=patternBefore(elements,pos,0);
      for(const direction of directions){
        const read=clone(elements);read.splice(pos,0,{direction,operations:[{kind:"r",pattern:expected}]});push(read);
        for(const pattern of patterns){const write=clone(elements);write.splice(pos,0,{direction,operations:[{kind:"w",pattern}]});push(write)}
      }
    }
    for(let ei=0;ei<elements.length;ei++){
      const first=patternBefore(elements,ei,0),last=patternBefore(elements,ei,elements[ei].operations.length);
      for(const [where,expected] of [["first",first],["last",last]]){
        const read=clone(elements);where==="first"?read[ei].operations.unshift({kind:"r",pattern:expected}):read[ei].operations.push({kind:"r",pattern:expected});push(read);
        for(const pattern of patterns){const write=clone(elements);where==="first"?write[ei].operations.unshift({kind:"w",pattern}):write[ei].operations.push({kind:"w",pattern});push(write)}
      }
    }
    return out;
  }
  function evaluate(elements,faults){
    const result=simulate({memory:{depth:4,dataWidth:2},sequence:elements,faults,couplingRelation:"same_word_adjacent",maxInstances:10000,includeDescriptorStates:true});
    let sum=0,total=0,detectedModels=0;const coverages={},descriptorProgress={},descriptorStates={},stateCounts={};
    result.models.forEach((m,i)=>{
      coverages[m.id]=m.coverage;descriptorProgress[m.id]=m.descriptorProgress??-1;descriptorStates[m.id]=m.instanceStates||[];stateCounts[m.id]=m.stateCounts||{};
      if(m.coverage!=null){const w=faults.length-i;sum+=m.coverage*w;total+=w;if(m.coverage>0)detectedModels++}
    });
    const stateVector=faults.flatMap(id=>descriptorStates[id]||[]);
    return {score:total?Math.round(sum/total*1e6)/1e6:0,detectedModels,coverages,priorityVector:faults.map(id=>coverages[id]==null?-1:Number(coverages[id])),descriptorProgress,descriptorVector:faults.map(id=>descriptorProgress[id]??-1),descriptorStates,stateCounts,stateVector,canonicalSummary:result.summary};
  }
  function compareCandidates(a,b,faults){
    for(let i=0;i<faults.length;i++){const delta=b.priorityVector[i]-a.priorityVector[i];if(delta)return delta}
    for(let i=0;i<faults.length;i++){const delta=b.descriptorVector[i]-a.descriptorVector[i];if(delta)return delta}
    return b.score-a.score||b.detectedModels-a.detectedModels||futurePotential(b.elements)-futurePotential(a.elements)||a.usedN-b.usedN;
  }
  function futurePotential(elements){
    let activePattern=null,readRun=0,transitions=0,lastWrite=null,directionChanges=0,lastDirection=null;const readProgress={};
    for(const element of elements){
      if(lastDirection&&lastDirection!==element.direction)directionChanges++;lastDirection=element.direction;
      for(const op of element.operations){
        if(op.kind==="r"&&activePattern!==null){readRun++;readProgress[activePattern]=Math.max(readProgress[activePattern]||0,readRun)}
        else if(op.kind==="w"){readRun=0;activePattern=op.pattern;if(lastWrite!==null&&lastWrite!==op.pattern)transitions++;lastWrite=op.pattern}
      }
    }
    const readScore=Object.entries(readProgress).reduce((sum,[pattern,count])=>sum+Math.min(4,count)*(pattern==="01"||pattern==="10"?2:1),0);
    return readScore*20+transitions*8+directionChanges*2;
  }
  function dominates(a,b){
    if(a.usedN>b.usedN||a.stateVector.length!==b.stateVector.length)return false;
    let better=a.usedN<b.usedN;
    for(let i=0;i<a.stateVector.length;i++){
      if(a.stateVector[i]<b.stateVector[i])return false;
      if(a.stateVector[i]>b.stateVector[i])better=true;
    }
    return better;
  }
  function structuralSignature(candidate){
    const flat=candidate.elements.flatMap(e=>e.operations.map(o=>`${e.direction[0]}${o.kind}${o.pattern}`));
    return `${candidate.stateVector.join(".")}|${flat.slice(-6).join(",")}`;
  }
  function pruneLevel(candidates,limit,faults){
    const ordered=[...candidates].sort((a,b)=>compareCandidates(a,b,faults)),kept=[],signatures=new Set();
    for(const candidate of ordered){
      const signature=structuralSignature(candidate);if(signatures.has(signature))continue;
      if(kept.some(other=>dominates(other,candidate))&&kept.length>=Math.ceil(limit/2))continue;
      signatures.add(signature);kept.push(candidate);if(kept.length>=limit)break;
    }
    return kept;
  }
  function fullCoverage(candidate){
    const values=candidate.priorityVector.filter(value=>value>=0);
    return values.length>0&&values.every(value=>value>=100);
  }
  function descriptorContribution(candidate,parent){
    if(!parent||candidate.stateVector.length!==parent.stateVector.length)return true;
    return candidate.stateVector.some((value,index)=>value>parent.stateVector[index]);
  }
  function minimizeCandidate(candidate,faults){
    if(!fullCoverage(candidate))return candidate;
    let elements=clone(candidate.elements),changed=true;
    while(changed){
      changed=false;
      outer:for(let ei=elements.length-1;ei>=0;ei--)for(let oi=elements[ei].operations.length-1;oi>=0;oi--){
        let trial=clone(elements);trial[ei].operations.splice(oi,1);if(!trial[ei].operations.length)trial.splice(ei,1);if(!trial.length)continue;trial=normalizeReadPatterns(trial);
        const assessed={usedN:countN(trial),elements:trial,...evaluate(trial,faults)};
        if(fullCoverage(assessed)){elements=trial;changed=true;break outer}
      }
    }
    return {usedN:countN(elements),elements,...evaluate(elements,faults),irredundant:true};
  }
  function synthesize(request){
    const started=performance.now(),maxN=Number(request.maxN??request.budgetN),frontierLimit=Number(request.frontierLimit??request.attempts??60);
    if(!Number.isInteger(maxN)||maxN<1||maxN>100)throw new Error("Maximum N 必須為 1–100");
    if(!Number.isInteger(frontierLimit)||frontierLimit<10||frontierLimit>1000)throw new Error("Frontier limit 必須為 10–1000");
    const faults=(request.faults||[]).filter(x=>byId[x]);if(!faults.length)throw new Error("至少選擇一個 fault descriptor");
    let evaluatedCandidates=0,frontier=[],history=[],stopReason="maximum-n";
    const roots=[];for(const pattern of patterns)for(const direction of directions)roots.push([{direction,operations:[{kind:"w",pattern}]}]);
    frontier=roots.map(elements=>({usedN:1,elements,...evaluate(elements,faults)}));evaluatedCandidates+=frontier.length;
    frontier=pruneLevel(frontier,frontierLimit,faults);
    history.push({n:1,generated:roots.length,evaluated:roots.length,contributed:frontier.length,improved:frontier.length,kept:frontier.length,bestScore:frontier[0]?.score??0,bestDescriptorProgress:frontier[0]?.descriptorVector??[],fullCoverage:frontier.some(fullCoverage)});
    let stoppedAtN=1;
    if(frontier.some(fullCoverage))stopReason="full-coverage";
    for(let n=2;n<=maxN&&stopReason!=="full-coverage";n++){
      const perParent=frontier.map(parent=>expandTemplate(parent.elements).map(elements=>({elements,parent}))),seen=new Set(),generated=[];
      const evaluationCap=Math.max(frontierLimit,frontierLimit*10);
      for(let round=0;generated.length<evaluationCap;round++){
        let added=false;
        for(const expansions of perParent){
          const item=expansions[round];if(!item)continue;added=true;const key=candidateKey(item.elements);if(seen.has(key))continue;seen.add(key);generated.push(item);if(generated.length>=evaluationCap)break;
        }
        if(!added)break;
      }
      const assessed=generated.map(({elements,parent})=>({usedN:n,elements,parentVector:parent.priorityVector,parentStateVector:parent.stateVector,...evaluate(elements,faults)}));evaluatedCandidates+=assessed.length;
      const contributed=assessed.filter(candidate=>descriptorContribution(candidate,{stateVector:candidate.parentStateVector}));
      const pool=contributed.length?contributed:assessed;
      frontier=pruneLevel(pool,frontierLimit,faults);stoppedAtN=n;
      const complete=frontier.some(fullCoverage);history.push({n,generated:generated.length,evaluated:assessed.length,contributed:contributed.length,improved:contributed.length,kept:frontier.length,bestScore:frontier[0]?.score??0,bestDescriptorProgress:frontier[0]?.descriptorVector??[],fullCoverage:complete});
      if(complete)stopReason="full-coverage";
      if(!frontier.length){stopReason="frontier-empty";break}
    }
    let ranked=[...frontier].sort((a,b)=>compareCandidates(a,b,faults)).slice(0,5);
    ranked=ranked.map(candidate=>minimizeCandidate(candidate,faults)).sort((a,b)=>compareCandidates(a,b,faults));
    const top=ranked.map((x,i)=>({...x,rank:i+1,name:`Descriptor TAGS March ${x.usedN}N · Candidate ${i+1}`}));
    return {schema:"sttmram-tags-synthesis/v3",method:"Fault-Descriptor Progress TAGS",maxN,frontierLimit,stoppedAtN,stopReason,history,canonicalMemory:{depth:4,dataWidth:2},faultPriority:faults,rankingMode:"detected-coverage-then-descriptor-progress",candidates:top,evaluatedCandidates,elapsedSeconds:Math.round((performance.now()-started)*1000)/1e6,note:"由 1N 逐層擴展 March template；SETUP、PROGRESS、ACTIVATED 或 DETECTED 任一 instance 前進皆視為貢獻，instance-level dominance 剪枝後，以 detected coverage 完成判定並做 full-geometry 驗證。"};
  }
  return {descriptors:clone(descriptors),simulate,synthesize,countN,groupMarchElements};
});
