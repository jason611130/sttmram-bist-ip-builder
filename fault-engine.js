(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.FaultEngine=api;
})(typeof self!=="undefined"?self:globalThis,function(){
  "use strict";
  const descriptorDefinitions=[
    {id:"SAF",name:"Stuck-at fault",category:"static",detection_mode:"march",description:"Victim cell 永久被固定為 0 或 1。",roles:["VTM"],relation:"single",supported:true,variants:[
      {id:"SA0",initial_state:0,trigger:{target:"VTM",operation:"write"},effect:{target:"VTM",state:"force0"}},
      {id:"SA1",initial_state:1,trigger:{target:"VTM",operation:"write"},effect:{target:"VTM",state:"force1"}}]},
    {id:"TF",name:"Transition fault",category:"static",detection_mode:"march",description:"Victim cell 永久無法完成其中一個 write transition。",roles:["VTM"],relation:"single",supported:true,variants:[
      {id:"TF0to1",trigger:{target:"VTM",operation:"write",transition:"0->1"},effect:{target:"VTM",state:"hold"}},
      {id:"TF1to0",trigger:{target:"VTM",operation:"write",transition:"1->0"},effect:{target:"VTM",state:"hold"}}]},
    {id:"SWF",name:"Slow write fault",category:"static",detection_mode:"timed",description:"Cell 的 switching time 超過指定 write pulse；需要 at-speed／short-pulse write 才能與一般 TF 區分。",roles:["VTM"],relation:"single",supported:true,required_operation:"ws",not_applicable_reason:"一般功能 March 只有 untimed write；SWF 需要 at-speed／short-pulse write（ws）才能量測。",variants:[
      {id:"SWF0to1",trigger:{target:"VTM",operation:"write_short",transition:"0->1"},effect:{target:"VTM",state:"hold"}},
      {id:"SWF1to0",trigger:{target:"VTM",operation:"write_short",transition:"1->0"},effect:{target:"VTM",state:"hold"}}]},
    {id:"RDF",name:"Read destructive fault",category:"static",detection_mode:"march",description:"第一次 read 回傳原值但破壞 cell；下一次 read 才觀察到錯誤。",roles:["VTM"],relation:"single",supported:true,variants:[
      {id:"RDF0",trigger:{target:"VTM",operation:"read",state:0},effect:{target:"VTM",state:"flip",timing:"after"}},
      {id:"RDF1",trigger:{target:"VTM",operation:"read",state:1},effect:{target:"VTM",state:"flip",timing:"after"}}]},
    {id:"AF",name:"Address decoder alias fault",category:"static",detection_mode:"march",description:"Decoder alias 使一個 address 的 write 同時改寫相鄰 address。",roles:["AGR","VTM"],relation:"adjacent_address",supported:true,variants:[
      {id:"AFwrite0",trigger:{target:"AGR",operation:"write",value:0,requires:{VTM:1}},effect:{target:"VTM",state:"force0"}},
      {id:"AFwrite1",trigger:{target:"AGR",operation:"write",value:1,requires:{VTM:0}},effect:{target:"VTM",state:"force1"}}]},
    {id:"TRDF",name:"Transient read disturb fault",category:"static",detection_mode:"stochastic",description:"Read 期間以小機率造成 cell 翻轉；需要 occurrence probability／trigger window。",roles:["VTM"],relation:"single",supported:false,unsupported_reason:"尚未定義 deterministic occurrence probability 或 trigger window。"},
    {id:"CFwd",name:"Write-disturb coupling fault",category:"static",detection_mode:"march",description:"Aggressor 的 write transition 翻轉相鄰 victim cell。",roles:["AGR","VTM"],relation:"same_word_adjacent",supported:true,variants:[
      {id:"CFwd01V0",trigger:{target:"AGR",operation:"write",transition:"0->1",requires:{VTM:0}},effect:{target:"VTM",state:"flip"}},
      {id:"CFwd01V1",trigger:{target:"AGR",operation:"write",transition:"0->1",requires:{VTM:1}},effect:{target:"VTM",state:"flip"}},
      {id:"CFwd10V0",trigger:{target:"AGR",operation:"write",transition:"1->0",requires:{VTM:0}},effect:{target:"VTM",state:"flip"}},
      {id:"CFwd10V1",trigger:{target:"AGR",operation:"write",transition:"1->0",requires:{VTM:1}},effect:{target:"VTM",state:"flip"}}]},
    {id:"CFst",name:"State coupling fault",category:"static",detection_mode:"march",description:"Aggressor 的靜態資料狀態使相鄰 victim 的 write transition 失敗。",roles:["AGR","VTM"],relation:"same_word_adjacent",supported:true,variants:[
      {id:"CFstA0V01",trigger:{target:"VTM",operation:"write",transition:"0->1",requires:{AGR:0}},effect:{target:"VTM",state:"hold"}},
      {id:"CFstA0V10",trigger:{target:"VTM",operation:"write",transition:"1->0",requires:{AGR:0}},effect:{target:"VTM",state:"hold"}},
      {id:"CFstA1V01",trigger:{target:"VTM",operation:"write",transition:"0->1",requires:{AGR:1}},effect:{target:"VTM",state:"hold"}},
      {id:"CFstA1V10",trigger:{target:"VTM",operation:"write",transition:"1->0",requires:{AGR:1}},effect:{target:"VTM",state:"hold"}}]},
    {id:"CFid",name:"Idempotent coupling fault",category:"static",detection_mode:"march",description:"Aggressor 的 write transition 將相鄰 victim 強迫成固定的 0 或 1。",roles:["AGR","VTM"],relation:"same_word_adjacent",supported:true,variants:[
      {id:"CFid01F0",trigger:{target:"AGR",operation:"write",transition:"0->1",requires:{VTM:1}},effect:{target:"VTM",state:"force0"}},
      {id:"CFid01F1",trigger:{target:"AGR",operation:"write",transition:"0->1",requires:{VTM:0}},effect:{target:"VTM",state:"force1"}},
      {id:"CFid10F0",trigger:{target:"AGR",operation:"write",transition:"1->0",requires:{VTM:1}},effect:{target:"VTM",state:"force0"}},
      {id:"CFid10F1",trigger:{target:"AGR",operation:"write",transition:"1->0",requires:{VTM:0}},effect:{target:"VTM",state:"force1"}}]},
    {id:"CFin",name:"Inversion coupling fault",category:"static",detection_mode:"march",description:"Aggressor 的 write transition 使相鄰 victim 狀態反相。",roles:["AGR","VTM"],relation:"same_word_adjacent",supported:true,variants:[
      {id:"CFin01V0",trigger:{target:"AGR",operation:"write",transition:"0->1",requires:{VTM:0}},effect:{target:"VTM",state:"flip"}},
      {id:"CFin01V1",trigger:{target:"AGR",operation:"write",transition:"0->1",requires:{VTM:1}},effect:{target:"VTM",state:"flip"}},
      {id:"CFin10V0",trigger:{target:"AGR",operation:"write",transition:"1->0",requires:{VTM:0}},effect:{target:"VTM",state:"flip"}},
      {id:"CFin10V1",trigger:{target:"AGR",operation:"write",transition:"1->0",requires:{VTM:1}},effect:{target:"VTM",state:"flip"}}]},
    {id:"WDF",name:"Write destructive fault",category:"static",detection_mode:"march",description:"對 cell 執行 non-transition write（w0/0 或 w1/1）時，反而破壞並翻轉其內容。",roles:["VTM"],relation:"single",supported:true,variants:[
      {id:"WDF0",trigger:{target:"VTM",operation:"write",transition:"0->0"},effect:{target:"VTM",state:"flip"}},
      {id:"WDF1",trigger:{target:"VTM",operation:"write",transition:"1->1"},effect:{target:"VTM",state:"flip"}}]},
    {id:"TWF",name:"Transient write fault",category:"static",detection_mode:"stochastic",description:"Write switching 因熱擾動偶發失敗；需要 occurrence probability model。",roles:["VTM"],relation:"single",supported:false,unsupported_reason:"尚未定義 stochastic write-failure probability 或 pulse-width distribution。"},
    {id:"IRF",name:"Incorrect read fault",category:"static",detection_mode:"march",description:"Stored data 不變，但 victim read output 被反相。",roles:["VTM"],relation:"single",supported:true,variants:[
      {id:"IRF0",trigger:{target:"VTM",operation:"read",state:0},effect:{target:"VTM",read_output:"invert"}},
      {id:"IRF1",trigger:{target:"VTM",operation:"read",state:1},effect:{target:"VTM",read_output:"invert"}}]},
    {id:"RTF",name:"Retention fault",category:"static",detection_mode:"timed",description:"需要明確 idle／retention interval 才能激發；一般只有 r/w 的 March 無法測試。",roles:["VTM"],relation:"single",supported:true,required_operation:"idle",not_applicable_reason:"目前 March sequence 只有 read/write，沒有 idle／retention interval，因此 RTF 無法被激發。",variants:[
      {id:"RTF0",trigger:{target:"VTM",operation:"idle",state:0},effect:{target:"VTM",state:"flip"}},
      {id:"RTF1",trigger:{target:"VTM",operation:"idle",state:1},effect:{target:"VTM",state:"flip"}}]},
    {id:"DRF",name:"Deceptive read destructive fault",category:"static",detection_mode:"march",description:"第一次 read 回傳正確值，之後 cell 才翻轉；必須再讀一次才能觀察。",roles:["VTM"],relation:"single",supported:true,variants:[
      {id:"DRF0",trigger:{target:"VTM",operation:"read",state:0},effect:{target:"VTM",state:"flip",timing:"after"}},
      {id:"DRF1",trigger:{target:"VTM",operation:"read",state:1},effect:{target:"VTM",state:"flip",timing:"after"}}]},
    {id:"dIRF",name:"Dynamic incorrect read fault",category:"dynamic",detection_mode:"march",description:"同一 March element 內連續讀取四次後，victim read output 才會反相。",roles:["VTM"],relation:"single",supported:true,variants:[
      {id:"dIRF0x4",trigger:{target:"VTM",operation:"read",state:0,repeat:4},effect:{target:"VTM",read_output:"invert"}},
      {id:"dIRF1x4",trigger:{target:"VTM",operation:"read",state:1,repeat:4},effect:{target:"VTM",read_output:"invert"}}]},
    {id:"dRDF",name:"Dynamic read destructive fault",category:"dynamic",detection_mode:"march",description:"同一 March element 內第二次連續 read 才使 cell 翻轉，且該次 read 回傳錯誤值。",roles:["VTM"],relation:"single",supported:true,variants:[
      {id:"dRDF0x2",trigger:{target:"VTM",operation:"read",state:0,repeat:2},effect:{target:"VTM",state:"flip",timing:"before"}},
      {id:"dRDF1x2",trigger:{target:"VTM",operation:"read",state:1,repeat:2},effect:{target:"VTM",state:"flip",timing:"before"}}]},
    {id:"dTF",name:"Dynamic transition fault",category:"dynamic",detection_mode:"march",description:"同一 March element 內已有一次操作後，緊接的 transition write 才會失敗。",roles:["VTM"],relation:"single",supported:true,variants:[
      {id:"dTF0to1",trigger:{target:"VTM",operation:"write",transition:"0->1",requires_predecessor:true},effect:{target:"VTM",state:"hold"}},
      {id:"dTF1to0",trigger:{target:"VTM",operation:"write",transition:"1->0",requires_predecessor:true},effect:{target:"VTM",state:"hold"}}]}
  ];
  const descriptorOrder=["SAF","TF","RDF","AF","CFwd","CFst","CFid","CFin","WDF","IRF","DRF","dIRF","dRDF","dTF","RTF","TRDF","TWF","SWF"];
  const descriptors=descriptorOrder.map(id=>descriptorDefinitions.find(descriptor=>descriptor.id===id));
  const byId=Object.fromEntries(descriptors.map(x=>[x.id,x]));
  const clone=x=>JSON.parse(JSON.stringify(x));
  const bit=(p,b)=>p==="0"||p==="00"?0:p==="1"||p==="11"?1:p==="01"?(b&1):1-(b&1);
  function* roleMaps(depth,width,relation){
    if(relation==="single"){for(let a=0;a<depth;a++)for(let b=0;b<width;b++)yield {VTM:[a,b]};return}
    if(relation==="same_word_adjacent"){for(let a=0;a<depth;a++)for(let b=0;b<width-1;b++){yield {AGR:[a,b],VTM:[a,b+1]};yield {AGR:[a,b+1],VTM:[a,b]}}return}
    if(relation==="adjacent_address"){for(let a=0;a<depth-1;a++)for(let b=0;b<width;b++){yield {AGR:[a,b],VTM:[a+1,b]};yield {AGR:[a+1,b],VTM:[a,b]}}return}
    throw new Error(`Unsupported address relation: ${relation}`);
  }
  function matches(t,op,target,before,writes,hasPredecessor=false){
    if(t.operation!==op||(t.target||"VTM")!==target)return false;
    if(t.requires_predecessor&&!hasPredecessor)return false;
    if(t.value!==undefined&&writes[target]!==Number(t.value))return false;
    if(t.state!==undefined&&t.state!=="*"&&before[target]!==Number(t.state))return false;
    if(t.transition&&t.transition!=="*"){
      if((op!=="write"&&op!=="write_short")||t.transition!==`${before[target]}->${writes[target]}`)return false;
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
      // A new March element is a new full-memory pass. Dynamic consecutive-access
      // triggers must restart here because other addresses were visited in between.
      if(need>1)repeats=0;
      const element=elements[ei],ordered=element.direction==="down"?[...addresses].reverse():addresses;
      for(const address of ordered){
        const local=at[address];
        for(let oi=0;oi<(element.operations||[]).length;oi++){
          globalStep++; const operation=element.operations[oi],kind=operation.kind,pattern=String(operation.pattern||"0");
          const before={...faulty},writes={}; Object.keys(roles).forEach(r=>writes[r]=bit(pattern,roles[r][1]));
          const target=trigger.target||"VTM",op=kind==="w"?"write":kind==="ws"?"write_short":kind==="r"?"read":"idle";
          const matched=local.includes(target)&&matches(trigger,op,target,before,writes,oi>0);
          repeats=matched?repeats+1:0; const fires=matched&&repeats>=need;
          if(kind==="w"||kind==="ws"){
            local.forEach(r=>golden[r]=faulty[r]=writes[r]);
            if(fires){activated=true;stateEffect(faulty,effect.target||"VTM",effect.state,before)}
            continue;
          }
          if(kind==="idle"){
            if(fires){activated=true;stateEffect(faulty,effect.target||"VTM",effect.state,before)}
            continue;
          }
          if(kind!=="r")throw new Error(`Unsupported operation: ${kind}`);
          if(fires&&effect.timing==="before")stateEffect(faulty,effect.target||"VTM",effect.state,before);
          const faultyOut={},goldenOut={}; local.forEach(r=>{faultyOut[r]=faulty[r];goldenOut[r]=golden[r]});
          if(fires){activated=true;const outTarget=effect.target||"VTM";if(outTarget in faultyOut)faultyOut[outTarget]=outputEffect(faultyOut[outTarget],effect.read_output)}
          for(const role of local)if(faultyOut[role]!==goldenOut[role])return {detected:true,activated,witness:{instance:`${variant.id} · ${Object.entries(roles).map(([r,l])=>`${r}=A${l[0]}/B${l[1]}`).join(", ")}`,element:`M${ei}`,operation_index:oi,global_projected_step:globalStep,address,bit:roles[role][1],role,operation:`r${pattern}`,golden_output:goldenOut[role],faulty_output:faultyOut[role]},descriptorState:instanceDescriptorState(trigger,effect,golden,faulty,repeats,need,activated,true)};
          if(fires&&effect.timing!=="before")stateEffect(faulty,effect.target||"VTM",effect.state,before);
        }
      }
    }
    return {detected:false,activated,witness:null,descriptorState:instanceDescriptorState(trigger,effect,golden,faulty,repeats,need,activated,false)};
  }
  function ramsesConditionMatches(condition,kind,value,before,after,hasPredecessor){
    const flag=String(condition.flag||"").toUpperCase();
    if(condition.predecessor&&!hasPredecessor)return false;
    if(flag==="R0"||flag==="R1")return kind==="r"&&before===Number(flag[1]);
    if(flag==="W0"||flag==="W1")return (kind==="w"||kind==="ws")&&value===Number(flag[1]);
    if(flag==="WS0"||flag==="WS1")return kind==="ws"&&value===Number(flag[2]);
    if(flag==="UTR")return (kind==="w"||kind==="ws")&&before===0&&after===1;
    if(flag==="DTR")return (kind==="w"||kind==="ws")&&before===1&&after===0;
    if(flag==="NW0"||flag==="NW1"){const expected=Number(flag[2]);return (kind==="w"||kind==="ws")&&before===expected&&after===expected}
    if(flag==="IDLE0"||flag==="IDLE1")return kind==="idle"&&before===Number(flag[4]);
    return flag==="*";
  }
  function ramsesSetupReady(conditions,state){
    return conditions.some(condition=>{
      const flag=String(condition.flag||"").toUpperCase();
      if(["R0","UTR","NW0","IDLE0"].includes(flag))return state===0;
      if(["R1","DTR","NW1","IDLE1"].includes(flag))return state===1;
      return true;
    });
  }
  function simulateRamsesInstance(variant,roles,elements){
    const states={};Object.keys(roles).forEach(role=>states[role]=0);
    const agrRole=variant.suspect==="@"?"VTM":"AGR",vtmRole="VTM",addresses=[...new Set(Object.values(roles).map(location=>location[0]))].sort((a,b)=>a-b),at={};
    Object.entries(roles).forEach(([role,location])=>(at[location[0]]||(at[location[0]]=[])).push(role));
    let pending=false,activated=false,recovered=false,maxProgress=0,agrRuns=new Map(),globalStep=0,vtmAccessStep=0,activatedAtVtmStep=-1;
    for(let ei=0;ei<elements.length;ei++){
      agrRuns=new Map();const element=elements[ei],ordered=element.direction==="down"?[...addresses].reverse():addresses;
      for(const address of ordered)for(let oi=0;oi<(element.operations||[]).length;oi++){
        globalStep++;const operation=element.operations[oi],kind=operation.kind,pattern=String(operation.pattern||"0"),local=at[address],ctx={};if(local.includes(vtmRole))vtmAccessStep++;
        for(const role of local){const before=states[role],value=bit(pattern,roles[role][1]),after=(kind==="w"||kind==="ws")?value:before;ctx[role]={before,value,after}}
        if(!pending&&local.includes(agrRole))for(let ci=0;ci<(variant.agr||[]).length;ci++){
          const condition=variant.agr[ci],c=ctx[agrRole],matched=ramsesConditionMatches(condition,kind,c.value,c.before,c.after,oi>0),run=matched?(agrRuns.get(ci)||0)+1:0,need=Math.max(1,Number(condition.repeat||1));
          agrRuns.set(ci,run);maxProgress=Math.max(maxProgress,Math.min(run,need));if(matched&&run>=need){pending=true;activated=true;activatedAtVtmStep=vtmAccessStep}
        }
        if(pending&&local.includes(vtmRole)){
          const c=ctx[vtmRole],matches=conditions=>(conditions||[]).some(condition=>{const timing=condition.timing||"any",timingMatches=timing==="next"?vtmAccessStep>activatedAtVtmStep:timing==="same"?vtmAccessStep===activatedAtVtmStep:true;return timingMatches&&ramsesConditionMatches(condition,kind,c.value,c.before,c.after,oi>0)});
          if(matches(variant.rcv)){pending=false;recovered=true}
          else if(matches(variant.vtm))return {detected:true,activated:true,witness:{instance:`${variant.id} · ${Object.entries(roles).map(([role,location])=>`${role}=A${location[0]}/B${location[1]}`).join(", ")}`,element:`M${ei}`,operation_index:oi,global_projected_step:globalStep,address,bit:roles[vtmRole][1],role:vtmRole,operation:`${kind}${pattern}`,golden_output:bit(pattern,roles[vtmRole][1]),faulty_output:1-bit(pattern,roles[vtmRole][1])},descriptorState:{label:"DETECTED",rank:1000,progress:maxProgress,need:Math.max(...(variant.agr||[]).map(condition=>Number(condition.repeat||1)),1),killed:false}};
        }
        if(kind==="w"||kind==="ws")for(const role of local)states[role]=ctx[role].after;
      }
    }
    const need=Math.max(...(variant.agr||[]).map(condition=>Number(condition.repeat||1)),1),setup=ramsesSetupReady(variant.agr||[],states[agrRole]);
    const descriptorState=pending?{label:"ACTIVATED",rank:800,progress:maxProgress,need,killed:false}:maxProgress>0&&maxProgress<need?{label:"PROGRESS",rank:400+Math.round(maxProgress/need*300),progress:maxProgress,need,killed:false}:setup?{label:"SETUP",rank:200,progress:0,need,killed:false}:{label:recovered?"KILLED":"INACTIVE",rank:0,progress:0,need,killed:recovered};
    return {detected:false,activated,witness:null,descriptorState};
  }
  function simulateRamsesDescriptor(d,depth,width,elements,maxInstances,includeDescriptorStates=false){
    const variants=d.ramsesVariants||[],relation=variants.some(variant=>variant.suspect==="#")?"adjacent_address":variants.some(variant=>variant.suspect==="*")?"same_word_adjacent":"single",maps=[...roleMaps(depth,width,relation)],total=maps.length*variants.length;
    if(!variants.length)return {id:d.id,name:d.name,description:d.description,status:"unsupported",reason:"Editable descriptor 沒有可執行 variant。",injected:0,detected:0,undetected:0,coverage:null};
    if(total>maxInstances)return {id:d.id,name:d.name,description:d.description,status:"limit",reason:`${total.toLocaleString()} instances 超過 ${maxInstances.toLocaleString()} 上限。`,injected:total,activated:0,detected:0,undetected:total,coverage:null};
    let detected=0,activated=0,first=null;const instanceStates=[];
    for(const variant of variants)for(const roles of maps){const outcome=simulateRamsesInstance(variant,roles,elements);if(outcome.activated)activated++;if(outcome.detected){detected++;if(!first)first=outcome.witness}if(includeDescriptorStates)instanceStates.push(outcome.descriptorState.rank)}
    const result={id:d.id,name:d.name,description:d.description,status:"complete",relation,injected:total,activated,detected,undetected:total-detected,coverage:total?Math.round(detected/total*1e8)/1e6:null,first_detection:first};
    if(includeDescriptorStates){result.instanceStates=instanceStates;result.descriptorProgress=instanceStates.length?Math.round(instanceStates.reduce((sum,value)=>sum+value,0)/instanceStates.length*1e4)/1e4:0;result.stateCounts=instanceStates.reduce((counts,value)=>{const label=value>=1000?"DETECTED":value>=800?"ACTIVATED":value>=400?"PROGRESS":value>=200?"SETUP":"INACTIVE";counts[label]=(counts[label]||0)+1;return counts},{})}
    return result;
  }
  function simulateDescriptor(d,depth,width,elements,override,maxInstances,includeDescriptorStates=false){
    if(d.ramsesVariants)return simulateRamsesDescriptor(d,depth,width,elements,maxInstances,includeDescriptorStates);
    if(!d.supported)return {id:d.id,name:d.name,description:d.description,status:"unsupported",reason:d.unsupported_reason,injected:0,detected:0,undetected:0,coverage:null};
    if(d.required_operation&&!elements.some(element=>(element.operations||[]).some(operation=>operation.kind===d.required_operation)))return {id:d.id,name:d.name,description:d.description,status:"not-applicable",reason:d.not_applicable_reason||`需要 ${d.required_operation} operation。`,injected:0,activated:0,detected:0,undetected:0,coverage:null};
    const relation=d.relation;
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
    const descriptorOverrides=request.descriptorOverrides||{},models=faults.map(id=>{if(!byId[id])throw new Error(`Unknown descriptor: ${id}`);const descriptor=descriptorOverrides[id]?{...byId[id],...clone(descriptorOverrides[id]),id}:byId[id];return simulateDescriptor(descriptor,depth,width,elements,relation,max,includeDescriptorStates)});
    const complete=models.filter(x=>x.status==="complete"),injected=complete.reduce((s,x)=>s+x.injected,0),detected=complete.reduce((s,x)=>s+x.detected,0);
    return {schema:"sttmram-fault-coverage/v1",memory:{depth,dataWidth:width},algorithm:request.algorithm||"Custom sequence",operationComplexity:request.operationComplexity,couplingRelation:relation,models,summary:{injected,detected,undetected:injected-detected,weightedCoverage:injected?Math.round(detected/injected*1e8)/1e6:null,executableModels:complete.length,unsupportedModels:models.length-complete.length},elapsedSeconds:Math.round((performance.now()-started)*1000)/1e6};
  }
  const patterns=["0","1","01","10"],directions=["up","down"];
  const countN=e=>e.reduce((s,x)=>s+x.operations.length,0);
  function groupMarchElements(elements){
    // Preserve the real March element boundaries. Operations that are already in
    // one element share one pair of parentheses; equal directions alone do not.
    return (elements||[]).map(element=>({direction:element.direction,operations:(element.operations||[]).map(operation=>({...operation}))}));
  }
  const candidateKey=e=>JSON.stringify(e);
  function normalizeReadPatterns(elements){
    const normalized=clone(elements);let current="0";
    for(const element of normalized)for(const operation of element.operations){if(operation.kind==="w"||operation.kind==="ws")current=operation.pattern;else if(operation.kind==="r")operation.pattern=current}
    return normalized;
  }
  function patternBefore(elements,elementIndex,operationIndex=0){
    let pattern="0";
    for(let ei=0;ei<elements.length;ei++){
      const stop=ei===elementIndex?operationIndex:elements[ei].operations.length;
      for(let oi=0;oi<stop;oi++)if(elements[ei].operations[oi].kind==="w"||elements[ei].operations[oi].kind==="ws")pattern=elements[ei].operations[oi].pattern;
      if(ei===elementIndex)break;
    }
    return pattern;
  }
  function expandTemplate(elements){
    const out=[],push=value=>out.push(normalizeReadPatterns(value));
    // Extend an existing pair of parentheses first. This makes repeated-access
    // descriptors (for example dIRF r0×4) reachable before the evaluation cap
    // is consumed by candidates that start unrelated full-memory passes.
    for(let ei=0;ei<elements.length;ei++){
      const first=patternBefore(elements,ei,0),last=patternBefore(elements,ei,elements[ei].operations.length);
      for(const [where,expected] of [["first",first],["last",last]]){
        const read=clone(elements);where==="first"?read[ei].operations.unshift({kind:"r",pattern:expected}):read[ei].operations.push({kind:"r",pattern:expected});push(read);
        for(const pattern of patterns){const write=clone(elements);where==="first"?write[ei].operations.unshift({kind:"w",pattern}):write[ei].operations.push({kind:"w",pattern});push(write)}
      }
    }
    for(let pos=1;pos<=elements.length;pos++){
      const expected=patternBefore(elements,pos,0);
      for(const direction of directions){
        const read=clone(elements);read.splice(pos,0,{direction,operations:[{kind:"r",pattern:expected}]});push(read);
        for(const pattern of patterns){const write=clone(elements);write.splice(pos,0,{direction,operations:[{kind:"w",pattern}]});push(write)}
      }
    }
    return out;
  }
  function evaluate(elements,faults,descriptorOverrides){
    const result=simulate({memory:{depth:4,dataWidth:2},sequence:elements,faults,couplingRelation:"same_word_adjacent",maxInstances:10000,includeDescriptorStates:true,descriptorOverrides});
    let sum=0,total=0,detectedModels=0;const coverages={},descriptorProgress={},descriptorStates={},stateCounts={};
    result.models.forEach((m,i)=>{
      coverages[m.id]=m.coverage;descriptorProgress[m.id]=m.descriptorProgress??-1;descriptorStates[m.id]=m.instanceStates||[];stateCounts[m.id]=m.stateCounts||{};
      if(m.coverage!=null){const w=faults.length-i;sum+=m.coverage*w;total+=w;if(m.coverage>0)detectedModels++}
    });
    const stateVector=faults.flatMap(id=>descriptorStates[id]||[]);
    return {score:total?Math.round(sum/total*1e6)/1e6:0,detectedModels,coverages,priorityVector:faults.map(id=>coverages[id]==null?-1:Number(coverages[id])),descriptorProgress,descriptorVector:faults.map(id=>descriptorProgress[id]??-1),descriptorStates,stateCounts,stateVector,canonicalSummary:result.summary};
  }
  function compareCandidates(a,b,faults){
    // Strict priority: finish each fault's detected/progress objective before the
    // next fault is allowed to influence ranking.
    for(let i=0;i<faults.length;i++){
      const detectedDelta=b.priorityVector[i]-a.priorityVector[i];if(detectedDelta)return detectedDelta;
      const progressDelta=b.descriptorVector[i]-a.descriptorVector[i];if(progressDelta)return progressDelta;
    }
    return b.score-a.score||b.detectedModels-a.detectedModels||futurePotential(b.elements)-futurePotential(a.elements)||a.usedN-b.usedN;
  }
  function futurePotential(elements){
    let activePattern=null,readRun=0,transitions=0,lastWrite=null,directionChanges=0,lastDirection=null;const readProgress={};
    for(const element of elements){
      readRun=0;
      if(lastDirection&&lastDirection!==element.direction)directionChanges++;lastDirection=element.direction;
      for(const op of element.operations){
        if(op.kind==="r"&&activePattern!==null){readRun++;readProgress[activePattern]=Math.max(readProgress[activePattern]||0,readRun)}
        else if(op.kind==="w"){readRun=0;activePattern=op.pattern;if(lastWrite!==null&&lastWrite!==op.pattern)transitions++;lastWrite=op.pattern}
      }
    }
    const readScore=Object.entries(readProgress).reduce((sum,[pattern,count])=>sum+Math.min(4,count)*(pattern==="01"||pattern==="10"?2:1),0);
    return readScore*20+transitions*8+directionChanges*2;
  }
  function hybridDominates(a,b){
    // Paper TAGS coverage dominance is the first dimension. Descriptor state is
    // the second dimension, so a path that is preparing/activating a dynamic
    // fault cannot be removed only because its current detected coverage is low.
    if(a.usedN>b.usedN||a.priorityVector.length!==b.priorityVector.length||a.stateVector.length!==b.stateVector.length)return false;
    let better=a.usedN<b.usedN;
    for(let i=0;i<a.priorityVector.length;i++){
      if(a.priorityVector[i]<b.priorityVector[i])return false;
      if(a.priorityVector[i]>b.priorityVector[i])better=true;
    }
    for(let i=0;i<a.stateVector.length;i++){
      if(a.stateVector[i]<b.stateVector[i])return false;
      if(a.stateVector[i]>b.stateVector[i])better=true;
    }
    return better;
  }
  function structuralSignature(candidate){
    const structure=candidate.elements.map(e=>`${e.direction[0]}(${e.operations.map(o=>`${o.kind}${o.pattern}`).join(",")})`);
    return `${candidate.stateVector.join(".")}|${structure.slice(-6).join(";")}`;
  }
  function pruneLevel(candidates,limit,faults){
    const ordered=[...candidates].sort((a,b)=>compareCandidates(a,b,faults)),kept=[],signatures=new Set();
    for(const candidate of ordered){
      const signature=structuralSignature(candidate);if(signatures.has(signature))continue;
      if(kept.some(other=>hybridDominates(other,candidate)))continue;
      for(let i=kept.length-1;i>=0;i--)if(hybridDominates(candidate,kept[i]))kept.splice(i,1);
      signatures.add(signature);kept.push(candidate);
    }
    return kept.sort((a,b)=>compareCandidates(a,b,faults)).slice(0,limit);
  }
  function fullCoverage(candidate){
    const values=candidate.priorityVector.filter(value=>value>=0);
    return values.length>0&&values.every(value=>value>=100);
  }
  function coverageContribution(candidate,parentVector){
    if(!parentVector||candidate.priorityVector.length!==parentVector.length)return true;
    return candidate.priorityVector.some((value,index)=>value>parentVector[index]);
  }
  function descriptorContribution(candidate,parentStateVector){
    if(!parentStateVector||candidate.stateVector.length!==parentStateVector.length)return true;
    return candidate.stateVector.some((value,index)=>value>parentStateVector[index]);
  }
  function descriptorContributionForFault(candidate,parentStates,faultId){
    const current=candidate.descriptorStates[faultId]||[],previous=parentStates?.[faultId]||[];
    if(current.length!==previous.length)return current.length>0;
    return current.some((value,index)=>value>previous[index]);
  }
  function activeTargetFault(candidate,faults){
    if(!candidate)return null;
    for(let i=0;i<faults.length;i++){
      const coverage=candidate.priorityVector[i],progress=candidate.descriptorVector[i];
      if(coverage<0&&progress<0)continue;
      if(coverage<100)return faults[i];
    }
    return null;
  }
  function minimizeCandidate(candidate,faults,descriptorOverrides){
    if(!fullCoverage(candidate))return candidate;
    let elements=clone(candidate.elements),changed=true;
    while(changed){
      changed=false;
      outer:for(let ei=elements.length-1;ei>=0;ei--)for(let oi=elements[ei].operations.length-1;oi>=0;oi--){
        let trial=clone(elements);trial[ei].operations.splice(oi,1);if(!trial[ei].operations.length)trial.splice(ei,1);if(!trial.length)continue;trial=normalizeReadPatterns(trial);
        const assessed={usedN:countN(trial),elements:trial,...evaluate(trial,faults,descriptorOverrides)};
        if(fullCoverage(assessed)){elements=trial;changed=true;break outer}
      }
    }
    return {usedN:countN(elements),elements,...evaluate(elements,faults,descriptorOverrides),irredundant:true};
  }
  function synthesize(request){
    const started=performance.now(),maxN=Number(request.maxN??request.budgetN),frontierLimit=Number(request.frontierLimit??request.attempts??60);
    if(!Number.isInteger(maxN)||maxN<1||maxN>100)throw new Error("Maximum N 必須為 1–100");
    if(!Number.isInteger(frontierLimit)||frontierLimit<10||frontierLimit>1000)throw new Error("Frontier limit 必須為 10–1000");
    const faults=(request.faults||[]).filter(x=>byId[x]),descriptorOverrides=request.descriptorOverrides||{};if(!faults.length)throw new Error("至少選擇一個 fault descriptor");
    let evaluatedCandidates=0,frontier=[],history=[],stopReason="maximum-n";
    const roots=[];for(const pattern of patterns)for(const direction of directions)roots.push([{direction,operations:[{kind:"w",pattern}]}]);
    frontier=roots.map(elements=>({usedN:1,elements,...evaluate(elements,faults,descriptorOverrides)}));evaluatedCandidates+=frontier.length;
    frontier=pruneLevel(frontier,frontierLimit,faults);
    history.push({n:1,generated:roots.length,evaluated:roots.length,contributed:frontier.length,targetContributed:frontier.length,improved:frontier.length,kept:frontier.length,activeFault:activeTargetFault(frontier[0],faults),bestScore:frontier[0]?.score??0,bestDescriptorProgress:frontier[0]?.descriptorVector??[],fullCoverage:frontier.some(fullCoverage)});
    let stoppedAtN=1;
    if(frontier.some(fullCoverage))stopReason="full-coverage";
    for(let n=2;n<=maxN&&stopReason!=="full-coverage";n++){
      const targetFault=activeTargetFault(frontier[0],faults);
      const perParent=frontier.map(parent=>expandTemplate(parent.elements).map(elements=>({elements,parent}))),seen=new Set(),generated=[];
      const evaluationCap=Math.max(frontierLimit,frontierLimit*10);
      for(let round=0;generated.length<evaluationCap;round++){
        let added=false;
        for(const expansions of perParent){
          const item=expansions[round];if(!item)continue;added=true;const key=candidateKey(item.elements);if(seen.has(key))continue;seen.add(key);generated.push(item);if(generated.length>=evaluationCap)break;
        }
        if(!added)break;
      }
      const assessed=generated.map(({elements,parent})=>({usedN:n,elements,parentVector:parent.priorityVector,parentStateVector:parent.stateVector,parentDescriptorStates:parent.descriptorStates,...evaluate(elements,faults,descriptorOverrides)}));evaluatedCandidates+=assessed.length;
      const coverageContributed=assessed.filter(candidate=>coverageContribution(candidate,candidate.parentVector));
      const descriptorContributed=assessed.filter(candidate=>descriptorContribution(candidate,candidate.parentStateVector));
      const contributed=assessed.filter(candidate=>coverageContribution(candidate,candidate.parentVector)||descriptorContribution(candidate,candidate.parentStateVector));
      const targetContributed=targetFault?assessed.filter(candidate=>descriptorContributionForFault(candidate,candidate.parentDescriptorStates,targetFault)):[];
      const pool=contributed.length?contributed:assessed;
      frontier=pruneLevel(pool,frontierLimit,faults);stoppedAtN=n;
      const complete=frontier.some(fullCoverage);history.push({n,generated:generated.length,evaluated:assessed.length,coverageContributed:coverageContributed.length,descriptorContributed:descriptorContributed.length,contributed:contributed.length,targetContributed:targetContributed.length,improved:contributed.length,kept:frontier.length,activeFault:activeTargetFault(frontier[0],faults),bestScore:frontier[0]?.score??0,bestDescriptorProgress:frontier[0]?.descriptorVector??[],fullCoverage:complete});
      if(complete)stopReason="full-coverage";
      if(!frontier.length){stopReason="frontier-empty";break}
    }
    let ranked=[...frontier].sort((a,b)=>compareCandidates(a,b,faults)).slice(0,5);
    ranked=ranked.map(candidate=>minimizeCandidate(candidate,faults,descriptorOverrides)).sort((a,b)=>compareCandidates(a,b,faults));
    const top=ranked.map((x,i)=>({...x,rank:i+1,name:`Hybrid TAGS March ${x.usedN}N · Candidate ${i+1}`}));
    return {schema:"sttmram-tags-synthesis/v5",method:"Hybrid Coverage-Descriptor TAGS",maxN,frontierLimit,stoppedAtN,stopReason,history,canonicalMemory:{depth:4,dataWidth:2},faultPriority:faults,rankingMode:"coverage-contribution-plus-descriptor-pareto-with-strict-priority",activeTargetFault:activeTargetFault(top[0],faults),candidates:top,evaluatedCandidates,elapsedSeconds:Math.round((performance.now()-started)*1000)/1e6,note:"先依論文 TAGS 保留 coverage contribution，再保留 SETUP、PROGRESS、ACTIVATED、DETECTED descriptor contribution；coverage 與 descriptor state 共同做 Pareto dominance，fault priority 只用於超額候選排序。"};
  }
  function analyze(request){
    const started=performance.now(),faults=request.faults||descriptors.map(x=>x.id),elements=groupMarchElements(request.sequence||request.elements||[]),descriptorOverrides=request.descriptorOverrides||{};
    if(!elements.length)throw new Error("Analysis sequence 不可為空");
    const metrics=evaluate(elements,faults,descriptorOverrides),usedN=countN(elements);
    return {schema:"sttmram-tags-analysis/v1",method:"Fixed-Algorithm Fault-Descriptor TAGS Analysis",canonicalMemory:{depth:4,dataWidth:2},faultPriority:faults,candidate:{...metrics,rank:1,name:request.name||`Existing March ${usedN}N`,usedN,elements},elapsedSeconds:Math.round((performance.now()-started)*1000)/1e6};
  }
  // Search by operation count. Compound edits land in their true N bucket.
  // The beam is a heuristic; only full-geometry simulation accepts a solution.
  function searchMarch(request){
    const started=performance.now();
    const {memory,maxInstances,couplingRelation,descriptorOverrides={}}=request;
    const {maxN}=request,limit=request.frontierLimit??200;
    const faults=[...new Set(request.faults||[])].filter(id=>byId[id]);
    const {read=1,write=1}=request.operationCosts||{};
    if(!Number.isInteger(maxN)||maxN<1||maxN>100)throw new Error("Maximum N 必須為 1–100");
    if(!Number.isInteger(limit)||limit<10||limit>1000)throw new Error("Frontier limit 必須為 10–1000");
    if(!faults.length)throw new Error("至少選擇一種 Fault");
    if(![read,write].every(value=>Number.isSafeInteger(value)&&value>0))throw new Error("讀寫成本必須為正整數");
    const targets=Object.fromEntries(faults.map(id=>[id,request.coverageTargets?.[id]??request.coverageTarget??100]));
    if(Object.values(targets).some(value=>!Number.isFinite(value)||value<0||value>100))throw new Error("Coverage 目標必須為 0–100%");
    const cost=elements=>elements.reduce((sum,element)=>sum+element.operations.reduce((total,op)=>total+(op.kind==="r"?read:write),0),0);
    const run=(elements,geometry)=>simulate({memory:geometry,sequence:elements,faults,maxInstances,couplingRelation,descriptorOverrides});
    const meets=(detected,injected,target)=>detected>=Math.ceil(target*injected/100-1e-8);
    const classify=result=>{
      const unavailable=result.models.filter(model=>model.status==="unsupported"||model.status==="not-applicable").map(model=>model.id);
      const unmet=result.models.filter(model=>!unavailable.includes(model.id)&&(model.status!=="complete"||!model.injected||!meets(model.detected,model.injected,targets[model.id]))).map(model=>model.id);
      return {unavailable,unmet,met:!unmet.length&&result.models.some(model=>model.injected&&model.status==="complete")};
    };
    const buckets=Array.from({length:maxN+1},()=>new Map()),history=[];
    const checked=new Set(),verified=[];
    let evaluatedCandidates=0,best=null,shortlist=[];
    const put=(elements,family)=>{
      const usedN=countN(elements);
      if(!usedN||usedN>maxN||(best&&cost(elements)>=best.estimatedCost))return;
      let list=buckets[usedN].get(family);
      if(!list)buckets[usedN].set(family,list=new Map());
      if(list.size<limit*2)list.set(candidateKey(elements),elements);
    };
    const assess=elements=>({elements,usedN:countN(elements),estimatedCost:cost(elements),...evaluate(elements,faults,descriptorOverrides)});
    function verify(candidate){
      const key=candidateKey(candidate.elements);
      if(checked.has(key))return null;
      checked.add(key);
      const result=run(candidate.elements,memory),status=classify(result);
      const entry={...candidate,...status,result};
      verified.push(entry);
      if(entry.met&&(!best||entry.estimatedCost<best.estimatedCost||entry.estimatedCost===best.estimatedCost&&entry.elements.length<best.elements.length))best=entry;
      return entry;
    }
    function compare(a,b){
      if(a.met!==b.met)return a.met?-1:1;
      if(a.met)return a.estimatedCost-b.estimatedCost||a.usedN-b.usedN||a.elements.length-b.elements.length;
      for(const id of faults){
        const coverage=entry=>(entry.result?entry.result.models.find(model=>model.id===id)?.coverage:entry.coverages[id])??-1;
        const delta=Math.min(targets[id],coverage(b))-Math.min(targets[id],coverage(a));
        if(delta)return delta;
      }
      return compareCandidates(a,b,faults)||a.estimatedCost-b.estimatedCost;
    }
    function retain(candidates){
      const groups=[[],[],[]];
      for(const candidate of candidates.sort(compare)){
        const elements=candidate.elements;
        const group=elements.length===1?0:elements.every(element=>element.direction===elements[0].direction)?1:2;
        groups[group].push(candidate);
      }
      const retained=[];
      for(let i=0;retained.length<limit&&groups.some(group=>i<group.length);i++){
        for(const group of groups)if(group[i]&&retained.length<limit)retained.push(group[i]);
      }
      return retained;
    }
    // Expand the final element and independently try whole-memory passes.
    // Reading an already-activated victim is tried before starting a new write.
    function* extensions(candidate){
      const elements=candidate.elements,last=elements.at(-1),background=patternBefore(elements,elements.length);
      const missing=faults.filter(id=>candidate.coverages[id]!=null&&candidate.coverages[id]<targets[id]);
      const repeats=new Set(),targetWrites=new Set();
      for(const id of missing){
        const model=descriptorOverrides[id]||byId[id];
        for(const variant of model.ramsesVariants||model.variants||[]){
          const triggers=variant.agr||[variant.trigger];
          for(const trigger of triggers){
            if(trigger?.repeat>1)repeats.add(trigger.repeat);
            const flag=trigger?.flag;
            const target=trigger?.transition?.at(-1)??trigger?.value??
              ({W0:"0",W1:"1",NW0:"0",NW1:"1",UTR:"1",DTR:"0"})[flag];
            if(target!=null)targetWrites.add(String(target));
          }
        }
      }
      const writes=[...new Set([...targetWrites,...patterns.filter(pattern=>pattern!==background),background])];
      const r={kind:"r",pattern:background};
      const extend=operations=>[...elements.slice(0,-1),{...last,operations:[...last.operations,...operations]}];
      yield [extend([r]),"extend"];
      for(const direction of directions)yield [[...elements,{direction,operations:[r]}],"pass"];
      for(const repeat of repeats){
        let trailing=0;
        for(let i=last.operations.length-1;i>=0&&last.operations[i].kind==="r";i--)trailing++;
        if(repeat-trailing>1)yield [extend(Array.from({length:repeat-trailing},()=>r)),"repeat"];
      }
      for(const pattern of writes){
        const w={kind:"w",pattern},verify={kind:"r",pattern};
        yield [extend([w]),"extend"];
        yield [extend([w,verify]),"pair"];
        for(const direction of directions){
          yield [[...elements,{direction,operations:[w]}],"pass"];
          yield [[...elements,{direction,operations:[r,w]}],"march"];
          yield [[...elements,{direction,operations:[w,verify]}],"march"];
        }
      }
    }
    for(const pattern of patterns)for(const direction of directions)put([{direction,operations:[{kind:"w",pattern}]}],"root");
    const seeds=request.seeds||[];
    const combinations=seeds.flatMap((left,index)=>seeds.slice(index+1).map(right=>[...left,...right]));
    for(const elements of [...seeds,...combinations,seeds.flat()]){
      if(countN(elements)>maxN||!countN(elements))continue;
      const candidate=assess(elements);
      verify(candidate);
      // Keep shorter prefixes of known algorithms eligible for recombination.
      for(let end=1;end<=elements.length;end++)put(elements.slice(0,end),"seed");
    }
    for(let n=1;n<=maxN;n++){
      if(best&&n*Math.min(read,write)>=best.estimatedCost)break;
      const layer=new Map();
      function add(elements){
        const key=candidateKey(elements);
        if(!layer.has(key)&&(!best||cost(elements)<best.estimatedCost)){
          layer.set(key,assess(elements));
          evaluatedCandidates++;
        }
      }
      for(const family of buckets[n].values())for(const elements of family.values())add(elements);
      buckets[n].clear();
      let beam=retain([...layer.values()]);
      // Split at every boundary of the leading candidates in this layer.
      // A split changes address order, not N, and must be simulated again.
      for(const candidate of beam.slice(0,Math.min(16,limit))){
        candidate.elements.forEach((element,index)=>{
          for(let cut=1;cut<element.operations.length;cut++)for(const direction of directions){
            add([...candidate.elements.slice(0,index),
              {...element,operations:element.operations.slice(0,cut)},
              {direction,operations:element.operations.slice(cut)},...candidate.elements.slice(index+1)]);
          }
        });
      }
      beam=retain([...layer.values()]);
      shortlist=[...shortlist,...beam].sort(compare).slice(0,8);
      const ready=beam.filter(candidate=>faults.some(id=>candidate.coverages[id]!=null)&&faults.every(id=>candidate.coverages[id]==null||candidate.coverages[id]>=targets[id]));
      ready.sort((a,b)=>a.estimatedCost-b.estimatedCost);
      for(const candidate of ready.slice(0,6))if(!best||candidate.estimatedCost<best.estimatedCost)verify(candidate);
      history.push({n,kept:beam.length,generated:layer.size,activeFault:activeTargetFault([...beam].sort(compare)[0],faults)});
      const iterators=beam.map(extensions);
      for(let next=iterators.map(iterator=>iterator.next());next.some(item=>!item.done);next=iterators.map(iterator=>iterator.next())){
        for(const item of next)if(!item.done)put(...item.value);
      }
    }
    for(const candidate of shortlist)if(!best||candidate.estimatedCost<best.estimatedCost)verify(candidate);
    // Remove redundant operations or join adjacent passes only after full verification.
    if(best){
      let trials=0,improved=true;
      while(improved&&trials<32){
        improved=false;
        const current=best;
        outer:for(let ei=current.elements.length-1;ei>=0;ei--){
          const element=current.elements[ei];
          if(ei>0&&trials<32){
            const previous=current.elements[ei-1];
            if(previous.direction===element.direction){
              const trial=[...current.elements.slice(0,ei-1),
                {...previous,operations:[...previous.operations,...element.operations]},...current.elements.slice(ei+1)];
              trials++;
              if(verify(assess(trial))?.met){improved=true;break outer;}
            }
          }
          for(let oi=element.operations.length-1;oi>=0&&trials<32;oi--){
            let trial=clone(current.elements);
            trial[ei].operations.splice(oi,1);
            if(!trial[ei].operations.length)trial.splice(ei,1);
            if(!trial.length||trial[0].operations[0].kind!=="w")continue;
            trial=normalizeReadPatterns(trial);
            trials++;
            if(verify(assess(trial))?.met){improved=true;break outer;}
          }
        }
      }
    }
    const candidates=verified.sort(compare).slice(0,5).map((entry,index)=>({
      ...entry,rank:index+1,name:`Descriptor Beam March ${entry.usedN}N · Candidate ${index+1}`,
      coverages:Object.fromEntries(entry.result.models.map(model=>[model.id,model.coverage]))
    }));
    return {candidates,history,targets,evaluatedCandidates,maxN,frontierLimit:limit,stoppedAtN:history.at(-1)?.n??0,
      activeTargetFault:candidates[0]?.unmet[0],elapsedSeconds:(performance.now()-started)/1000};
  }
  function optimize(request){
    const started=performance.now(),faults=request.faults||descriptors.map(x=>x.id),descriptorOverrides=request.descriptorOverrides||{};let elements=groupMarchElements(request.sequence||request.elements||[]);
    if(!elements.length)throw new Error("Optimization sequence 不可為空");
    const originalN=countN(elements),baseline=evaluate(elements,faults,descriptorOverrides),preserves=metrics=>faults.every(id=>baseline.coverages[id]==null||Number(metrics.coverages[id])>=Number(baseline.coverages[id]));
    let removedN=0,passes=0,changed=true;
    while(changed){changed=false;passes++;
      outer:for(let ei=elements.length-1;ei>=0;ei--)for(let oi=elements[ei].operations.length-1;oi>=0;oi--){
        let trial=clone(elements);trial[ei].operations.splice(oi,1);if(!trial[ei].operations.length)trial.splice(ei,1);if(!trial.length)continue;trial=normalizeReadPatterns(trial);
        const metrics=evaluate(trial,faults,descriptorOverrides);if(preserves(metrics)){elements=trial;removedN++;changed=true;break outer}
      }
    }
    const metrics=evaluate(elements,faults,descriptorOverrides),usedN=countN(elements);
    return {schema:"sttmram-tags-optimization/v1",method:"Coverage-Preserving Greedy Irredundancy",canonicalMemory:{depth:4,dataWidth:2},faultPriority:faults,originalN,usedN,removedN,passes,candidate:{...metrics,rank:1,name:request.name||`Optimized March ${usedN}N`,usedN,elements,originalN,removedN},elapsedSeconds:Math.round((performance.now()-started)*1000)/1e6};
  }
  function parseCoverageTargets(source){
    const targets={};
    for(const entry of source.trim().split(/[,，]/).filter(Boolean)){
      const match=entry.trim().match(/^(\w+)\s*=\s*(\d+(?:\.\d+)?)\s*%?$/);
      if(!match||!byId[match[1]]||Number(match[2])>100)throw new Error(`Coverage 目標格式錯誤：${entry}（例如 AF=90）`);
      targets[match[1]]=Number(match[2]);
    }
    return targets;
  }
  function searchStatus(candidate){
    const outcome=candidate.met?"找到通過完整驗證的最低成本候選":
      candidate.unmet.length?`未達目標：${candidate.unmet.join("、")}。顯示目前最佳候選`:"目前沒有可驗證的 fault";
    const unavailable=candidate.unavailable.length?` · N/A：${candidate.unavailable.join("、")}`:"";
    return `${outcome} · ${candidate.usedN}N · 成本 ${candidate.estimatedCost}／address${unavailable}`;
  }
  return {descriptors:clone(descriptors),simulate,synthesize,searchMarch,parseCoverageTargets,searchStatus,analyze,optimize,countN,groupMarchElements};
});
