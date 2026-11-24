const $=id=>document.getElementById(id);
const descriptors=FaultEngine.descriptors;
let priority=descriptors.map(x=>x.id),selected=new Set(priority),synthesis=null,chosen=null,requestId=0;
const pending=new Map();
const worker=new Worker("fault-worker.js?v=2.37.0");
worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.ok?p.resolve(data.result):p.reject(new Error(data.error))};
worker.onerror=error=>setStatus(`Worker 錯誤：${error.message}`,"error");
function callWorker(type,payload){return new Promise((resolve,reject)=>{const id=++requestId;pending.set(id,{resolve,reject});worker.postMessage({id,type,payload})})}
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=n=>Number(n||0).toLocaleString();
let analysisMode="search";
const descriptorStorageKey="sttmram-ramses-descriptor-overrides-v1";
let descriptorOverrides={},editingDescriptorId=null;
try{descriptorOverrides=JSON.parse(localStorage.getItem(descriptorStorageKey))||{}}catch{descriptorOverrides={}}
const descriptorTemplates={
  SAF:`# SA0\nAGR := W1\nSPT := @\nVTM := R1\nRCV := W0\n\n# SA1\nAGR := W0\nSPT := @\nVTM := R0\nRCV := W1`,
  TF:`# TF0to1\nAGR := UTR\nSPT := @\nVTM := R1\nRCV := W0\n\n# TF1to0\nAGR := DTR\nSPT := @\nVTM := R0\nRCV := W1`,
  RDF:`# RDF0\nAGR := R0\nSPT := @\nVTM := NEXT(R0)\nRCV := W0, W1\n\n# RDF1\nAGR := R1\nSPT := @\nVTM := NEXT(R1)\nRCV := W0, W1`,
  AF:`# AF_ALIAS_W0\nAGR := W0\nSPT := #\nVTM := R1\nRCV := W1\n\n# AF_ALIAS_W1\nAGR := W1\nSPT := #\nVTM := R0\nRCV := W0`,
  CFwd:`# CFwd_UTR_V0\nAGR := UTR\nSPT := *\nVTM := R0\nRCV := W0, W1\n\n# CFwd_UTR_V1\nAGR := UTR\nSPT := *\nVTM := R1\nRCV := W0, W1\n\n# CFwd_DTR_V0\nAGR := DTR\nSPT := *\nVTM := R0\nRCV := W0, W1\n\n# CFwd_DTR_V1\nAGR := DTR\nSPT := *\nVTM := R1\nRCV := W0, W1`,
  CFst:`# CFst_A0_V1\nAGR := R0\nSPT := *\nVTM := R1\nRCV := W0, W1\n\n# CFst_A1_V0\nAGR := R1\nSPT := *\nVTM := R0\nRCV := W0, W1`,
  CFid:`# CFid_UTR_F0\nAGR := UTR\nSPT := *\nVTM := R1\nRCV := W0, W1\n\n# CFid_DTR_F1\nAGR := DTR\nSPT := *\nVTM := R0\nRCV := W0, W1`,
  CFin:`# CFin_UTR\nAGR := UTR\nSPT := *\nVTM := R0, R1\nRCV := W0, W1\n\n# CFin_DTR\nAGR := DTR\nSPT := *\nVTM := R0, R1\nRCV := W0, W1`,
  WDF:`# WDF0\nAGR := NW0\nSPT := @\nVTM := R0\nRCV := W1\n\n# WDF1\nAGR := NW1\nSPT := @\nVTM := R1\nRCV := W0`,
  IRF:`# IRF0\nAGR := R0\nSPT := @\nVTM := R0\nRCV := W0, W1\n\n# IRF1\nAGR := R1\nSPT := @\nVTM := R1\nRCV := W0, W1`,
  DRF:`# DRF0\nAGR := R0x2\nSPT := @\nVTM := R0\nRCV := W0, W1\n\n# DRF1\nAGR := R1x2\nSPT := @\nVTM := R1\nRCV := W0, W1`,
  dIRF:`# dIRF0x4\nAGR := R0x4\nSPT := @\nVTM := R0\nRCV := W0, W1\n\n# dIRF1x4\nAGR := R1x4\nSPT := @\nVTM := R1\nRCV := W0, W1`,
  dRDF:`# dRDF0x2\nAGR := R0x2\nSPT := @\nVTM := R0\nRCV := W0, W1\n\n# dRDF1x2\nAGR := R1x2\nSPT := @\nVTM := R1\nRCV := W0, W1`,
  dTF:`# dTF0to1\nAGR := UTR+PRE\nSPT := @\nVTM := R1\nRCV := W0\n\n# dTF1to0\nAGR := DTR+PRE\nSPT := @\nVTM := R0\nRCV := W1`,
  RTF:`# RTF0\nAGR := IDLE0\nSPT := @\nVTM := R0\nRCV := W0, W1\n\n# RTF1\nAGR := IDLE1\nSPT := @\nVTM := R1\nRCV := W0, W1`,
  TRDF:`# TRDF0\nAGR := R0\nSPT := @\nVTM := R0\nRCV := W0, W1\n\n# TRDF1\nAGR := R1\nSPT := @\nVTM := R1\nRCV := W0, W1`,
  TWF:`# TWF0to1\nAGR := UTR\nSPT := @\nVTM := R1\nRCV := W0\n\n# TWF1to0\nAGR := DTR\nSPT := @\nVTM := R0\nRCV := W1`,
  SWF:`# SWF0to1\nAGR := WS1\nSPT := @\nVTM := R1\nRCV := W0\n\n# SWF1to0\nAGR := WS0\nSPT := @\nVTM := R0\nRCV := W1`
};
function parseDescriptorCondition(token,lineNumber){
  let value=token.trim().toUpperCase();if(!value||value==="-")return null;
  let timing="any";const timed=value.match(/^(NEXT|SAME)\((.+)\)$/);if(timed){timing=timed[1].toLowerCase();value=timed[2].trim()}
  const predecessor=value.endsWith("+PRE");if(predecessor)value=value.slice(0,-4);
  let repeat=1;const repeated=value.match(/^(R[01])X(\d+)$/);if(repeated){value=repeated[1];repeat=Number(repeated[2])}
  const allowed=["R0","R1","W0","W1","WS0","WS1","UTR","DTR","NW0","NW1","IDLE0","IDLE1","*"];
  if(!allowed.includes(value))throw new Error(`第 ${lineNumber} 行：不支援的 operation flag「${token.trim()}」`);
  if(!Number.isInteger(repeat)||repeat<1||repeat>100)throw new Error(`第 ${lineNumber} 行：repeat 必須為 1–100`);
  return {flag:value,repeat,predecessor,timing};
}
function parseDescriptorSource(source){
  const variants=[];let current=null;
  source.split(/\r?\n/).forEach((raw,index)=>{const line=raw.replace(/\/\*.*?\*\//g,"").trim();if(!line)return;if(line.startsWith("#")){if(current)variants.push(current);const id=line.slice(1).trim();if(!id)throw new Error(`第 ${index+1} 行：# 後面需要 variant 名稱`);current={id,fields:{}};return}if(!current)throw new Error(`第 ${index+1} 行：請先用 # 建立 variant`);const match=line.match(/^(AGR|SPT|VTM|RCV)\s*:=\s*(.+)$/i);if(!match)throw new Error(`第 ${index+1} 行：格式必須是 AGR／SPT／VTM／RCV := value`);current.fields[match[1].toUpperCase()]={value:match[2].trim(),line:index+1}});if(current)variants.push(current);
  if(!variants.length)throw new Error("至少需要一個 # variant");
  return variants.map(block=>{for(const field of ["AGR","SPT","VTM","RCV"])if(!block.fields[field])throw new Error(`${block.id} 缺少 ${field}`);const suspect=block.fields.SPT.value;if(!["@","*","#"].includes(suspect))throw new Error(`${block.id}：SPT 只能是 @、* 或 #`);const conditions=field=>block.fields[field].value.split(",").map(token=>parseDescriptorCondition(token,block.fields[field].line)).filter(Boolean);const agr=conditions("AGR"),vtm=conditions("VTM"),rcv=conditions("RCV");if(!agr.length||!vtm.length)throw new Error(`${block.id}：AGR 與 VTM 不可為空`);return {id:block.id,suspect,agr,vtm,rcv}});
}
function descriptorOverridesPayload(){return descriptorOverrides}
function activeDescriptor(id){const base=descriptors.find(descriptor=>descriptor.id===id);return descriptorOverrides[id]?{...base,...descriptorOverrides[id]}:base}
function invalidateResults(){synthesis=null;chosen=null;$("candidateList").innerHTML="";$("selectedSequence").innerHTML='<p class="empty-state">Descriptor 已變更，請重新執行分析。</p>';$("faultChartGrid").innerHTML='<p class="empty-state">Descriptor 已變更，請重新計算 coverage。</p>';$("simulateBtn").disabled=true;$("useBuilderBtn").disabled=true}
function openDescriptorEditor(id){editingDescriptorId=id;const descriptor=activeDescriptor(id);$("descriptorEditorTitle").textContent=`${id} · ${descriptor.name}`;$("descriptorSource").value=descriptorOverrides[id]?.sourceText||descriptorTemplates[id]||"";$("descriptorEditor").hidden=false;$("descriptorEditorStatus").textContent=descriptorOverrides[id]?"目前使用自訂 RAMSES descriptor":"目前使用內建 physical fault model；儲存後改用此 RAMSES descriptor";$("descriptorEditor").scrollIntoView({behavior:"smooth",block:"nearest"})}
function saveDescriptorEditor(){try{const sourceText=$("descriptorSource").value.trim(),ramsesVariants=parseDescriptorSource(sourceText),base=descriptors.find(descriptor=>descriptor.id===editingDescriptorId);descriptorOverrides[editingDescriptorId]={name:base.name,description:base.description,category:base.category,supported:true,sourceText,ramsesVariants};localStorage.setItem(descriptorStorageKey,JSON.stringify(descriptorOverrides));$("descriptorEditorStatus").textContent=`已儲存 ${ramsesVariants.length} 個 variant；下次搜尋會使用新定義`;invalidateResults();renderPriority();updateAutoLimit()}catch(error){$("descriptorEditorStatus").textContent=error.message}}
function resetDescriptorEditor(){if(!editingDescriptorId)return;delete descriptorOverrides[editingDescriptorId];localStorage.setItem(descriptorStorageKey,JSON.stringify(descriptorOverrides));$("descriptorSource").value=descriptorTemplates[editingDescriptorId]||"";$("descriptorEditorStatus").textContent="已還原內建 physical fault model";invalidateResults();renderPriority();updateAutoLimit()}
const marchElement=(direction,operations)=>({direction,operations:operations.map(([kind,pattern])=>({kind,pattern}))});
const fixedAlgorithms=[
  {id:"Wom26",name:"WOM March 26N",sequence:[marchElement("up",[["w","00"]]),marchElement("up",[["r","00"],["w","11"],["r","11"]]),marchElement("down",[["r","11"],["w","00"],["r","00"]]),marchElement("down",[["r","00"],["w","11"],["r","11"]]),marchElement("down",[["r","11"],["w","00"]]),marchElement("up",[["r","00"]]),marchElement("up",[["r","00"],["w","01"],["r","01"]]),marchElement("up",[["r","01"],["w","10"],["r","10"]]),marchElement("down",[["r","10"],["w","01"],["r","01"]]),marchElement("down",[["r","01"],["w","11"],["r","11"]]),marchElement("up",[["r","11"]])]},
  {id:"Dirf14",name:"dIRF March 14N",sequence:[marchElement("up",[["w","0"]]),marchElement("up",[["r","0"],["w","1"],["r","1"],["r","1"],["r","1"],["r","1"]]),marchElement("down",[["r","1"],["w","0"],["r","0"],["r","0"],["r","0"],["r","0"]]),marchElement("down",[["r","0"]])]},
  {id:"MarchC",name:"March C− 10N",sequence:[marchElement("up",[["w","0"]]),marchElement("up",[["r","0"],["w","1"]]),marchElement("up",[["r","1"],["w","0"]]),marchElement("down",[["r","0"],["w","1"]]),marchElement("down",[["r","1"],["w","0"]]),marchElement("up",[["r","0"]])]},
  {id:"MarchCM",name:"March CM 7N",sequence:[marchElement("up",[["w","1"],["w","0"],["r","0"],["w","1"],["w","1"],["r","1"],["r","1"]])]}
];
function selectedFixedAlgorithms(){return fixedAlgorithms.filter(algorithm=>$("existing"+algorithm.id).checked).map(algorithm=>({...algorithm,sequence:algorithm.sequence.map(element=>({direction:element.direction,operations:element.operations.map(operation=>({...operation}))}))}))}
function setStatus(text,state="ready"){$("workerStatus").className=`worker-status ${state}`;$('workerStatus').querySelector("span").textContent=text}
function saveSettings(){localStorage.setItem("sttmram-simulator-settings",JSON.stringify({depth:+$("simDepth").value,width:+$("simWidth").value,budget:+$("simBudget").value,attempts:+$("simAttempts").value,prioritySchema:4,priority,selected:[...selected],analysisMode,existing:Object.fromEntries(fixedAlgorithms.map(algorithm=>[algorithm.id,{selected:$("existing"+algorithm.id).checked}]))}))}
function moveConditionalFaultsLast(ids){const tail=["RTF","TRDF","TWF","SWF"];return [...ids.filter(id=>!tail.includes(id)),...tail.filter(id=>ids.includes(id))]}
function loadSettings(){try{const s=JSON.parse(localStorage.getItem("sttmram-simulator-settings"));if(!s)return;const schema=Number(s.prioritySchema||0);if(schema<4&&(!s.attempts||Number(s.attempts)===60))s.attempts=200;$("simDepth").value=s.depth||256;$("simWidth").value=s.width||32;$("simBudget").value=s.budget||12;$("simAttempts").value=s.attempts||200;analysisMode=s.analysisMode==="existing"?"existing":"search";document.querySelector(`input[name="analysisMode"][value="${analysisMode}"]`).checked=true;fixedAlgorithms.forEach(algorithm=>{const saved=s.existing?.[algorithm.id];if(saved)$("existing"+algorithm.id).checked=Boolean(saved.selected)});const previousPriority=Array.isArray(s.priority)?s.priority:[];if(previousPriority.length)priority=[...previousPriority.filter(id=>descriptors.some(d=>d.id===id)),...descriptors.map(d=>d.id).filter(id=>!previousPriority.includes(id))];if(schema<3)priority=moveConditionalFaultsLast(priority);if(Array.isArray(s.selected)){selected=new Set(s.selected);descriptors.filter(d=>!previousPriority.includes(d.id)).forEach(d=>selected.add(d.id))}delete s.relation;s.prioritySchema=4;s.priority=priority;s.selected=[...selected];localStorage.setItem("sttmram-simulator-settings",JSON.stringify(s))}catch{}}
function renderAnalysisMode(){analysisMode=document.querySelector('input[name="analysisMode"]:checked')?.value||"search";$("searchModePanel").hidden=analysisMode!=="search";$("existingModePanel").hidden=analysisMode!=="existing";$("searchBtn").textContent=analysisMode==="search"?"搜尋最快 March":"分析已開發的 March 演算法";$("candidateMeta").textContent=analysisMode==="search"?"尚未搜尋":"尚未分析";saveSettings()}
function descriptorInstances(d,depth,width,relation){
  if(!d.supported||d.required_operation&&!d.ramsesVariants)return 0;
  const activeRelation=d.ramsesVariants?(d.ramsesVariants.some(variant=>variant.suspect==="#")?"adjacent_address":d.ramsesVariants.some(variant=>variant.suspect==="*")?"same_word_adjacent":"single"):d.relation;
  const maps=activeRelation==="single"?depth*width:activeRelation==="same_word_adjacent"?depth*Math.max(0,width-1)*2:Math.max(0,depth-1)*width*2;
  return maps*(d.ramsesVariants?.length||d.variants?.length||1);
}
function updateAutoLimit(){
  const depth=Number($("simDepth").value),width=Number($("simWidth").value),relation="same_word_adjacent";
  if(!Number.isInteger(depth)||depth<2||!Number.isInteger(width)||width<2){$("simLimit").value=1;$("simLimitNote").textContent="請先輸入有效的 Memory geometry";return 1}
  const counts=priority.filter(id=>selected.has(id)).map(id=>({id,count:descriptorInstances(activeDescriptor(id),depth,width,relation)}));
  const largest=counts.reduce((best,x)=>x.count>best.count?x:best,{id:"—",count:1});
  $("simLimit").value=largest.count;
  $("simLimitNote").textContent=`${largest.id} 最大需求；依 ${depth.toLocaleString()} × ${width.toLocaleString()} 自動計算`;
  return largest.count;
}
function renderPriority(){
  $("faultPriorityList").innerHTML=priority.map((id,index)=>{const d=activeDescriptor(id),category=d.category==="dynamic"?"Dynamic":"Static",custom=Boolean(descriptorOverrides[id]);return `<article class="priority-item ${selected.has(id)?"selected":""} ${custom?"custom-descriptor":""}" data-priority-item="${id}"><label><input type="checkbox" data-fault="${id}" ${selected.has(id)?"checked":""}><span><strong>${esc(id)} · ${esc(d.name)}${custom?' <i>自訂</i>':''}</strong><small>${category} · ${esc(d.description)}</small></span></label><div><button type="button" class="descriptor-edit-button" data-edit-descriptor="${id}" aria-label="編輯 ${id} descriptor" title="編輯 AGR／SPT／VTM／RCV">✎</button><button type="button" class="drag-handle" data-drag-id="${id}" aria-label="拖曳 ${id} 改變優先序" title="拖曳改變順序">⠿</button><button data-move="up" data-id="${id}" ${index===0?"disabled":""} aria-label="提高 ${id} 優先序">↑</button><button data-move="down" data-id="${id}" ${index===priority.length-1?"disabled":""} aria-label="降低 ${id} 優先序">↓</button></div></article>`}).join("");
  $("faultPriorityList").querySelectorAll("input").forEach(input=>input.onchange=()=>{input.checked?selected.add(input.dataset.fault):selected.delete(input.dataset.fault);saveSettings();renderPriority()});
  $("faultPriorityList").querySelectorAll("button[data-edit-descriptor]").forEach(button=>button.onclick=()=>openDescriptorEditor(button.dataset.editDescriptor));
  $("faultPriorityList").querySelectorAll("button[data-move]").forEach(button=>button.onclick=()=>{const i=priority.indexOf(button.dataset.id),j=button.dataset.move==="up"?i-1:i+1;[priority[i],priority[j]]=[priority[j],priority[i]];saveSettings();renderPriority()});
  let draggedId=null;
  const clearDrag=()=>$("faultPriorityList").querySelectorAll(".priority-item").forEach(item=>item.classList.remove("dragging","drop-before","drop-after"));
  $("faultPriorityList").querySelectorAll(".drag-handle").forEach(handle=>{
    const item=handle.closest(".priority-item");
    handle.onpointerdown=()=>{item.draggable=true;item.dataset.dragArmed="1"};
    const disarm=()=>{if(!draggedId){item.draggable=false;delete item.dataset.dragArmed}};
    handle.onpointerup=disarm;
    handle.onpointercancel=disarm;
  });
  $("faultPriorityList").querySelectorAll(".priority-item").forEach(item=>{
    item.ondragstart=event=>{if(item.dataset.dragArmed!=="1"){event.preventDefault();return}draggedId=item.dataset.priorityItem;item.classList.add("dragging");event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",draggedId)};
    item.ondragover=event=>{if(!draggedId||draggedId===item.dataset.priorityItem)return;event.preventDefault();clearDrag();document.querySelector(`[data-priority-item="${draggedId}"]`)?.classList.add("dragging");const after=event.clientY>item.getBoundingClientRect().top+item.offsetHeight/2;item.classList.add(after?"drop-after":"drop-before")};
    item.ondrop=event=>{event.preventDefault();if(!draggedId||draggedId===item.dataset.priorityItem)return;const from=priority.indexOf(draggedId),target=priority.indexOf(item.dataset.priorityItem),after=event.clientY>item.getBoundingClientRect().top+item.offsetHeight/2;priority.splice(from,1);let to=priority.indexOf(item.dataset.priorityItem)+(after?1:0);priority.splice(to,0,draggedId);saveSettings();renderPriority()};
    item.ondragend=()=>{item.draggable=false;delete item.dataset.dragArmed;draggedId=null;clearDrag()};
  });
  updateAutoLimit();
}
function validate(){const depth=+$('simDepth').value,width=+$('simWidth').value,budget=+$('simBudget').value,attempts=+$('simAttempts').value;if(!Number.isInteger(depth)||depth<2||depth>65536)throw new Error("Memory depth 必須為 2–65536");if(!Number.isInteger(width)||width<2||width>1024)throw new Error("Data width 必須為 2–1024");if(analysisMode==="search"&&(!Number.isInteger(budget)||budget<1||budget>100))throw new Error("Maximum N 必須為 1–100");if(analysisMode==="search"&&(!Number.isInteger(attempts)||attempts<10||attempts>1000))throw new Error("Pareto resource guard 必須為 10–1000");const faults=priority.filter(id=>selected.has(id));if(!faults.length)throw new Error("至少選擇一種 fault");const algorithms=analysisMode==="existing"?selectedFixedAlgorithms():[];if(analysisMode==="existing"&&!algorithms.length)throw new Error("至少選擇一個已開發的 March 演算法");const limit=updateAutoLimit();return {depth,width,budget,attempts,limit,faults,algorithms,relation:"same_word_adjacent"}}
const opText=op=>`${op.kind}${op.pattern}`;
function groupedElements(elements){return FaultEngine.groupMarchElements(elements)}
function sequenceText(elements){return groupedElements(elements).map((e,i)=>`M${i} ${e.direction==="down"?"⇓":"⇑"} (${e.operations.map(opText).join(", ")})`).join("; ")}
function renderCandidates(){
  $("candidateMeta").textContent=synthesis.mode==="existing"?`Existing March TAGS · ${synthesis.candidates.length} candidates · ${synthesis.elapsedSeconds.toFixed(3)} s`:`Beam Search · 評估 ${synthesis.evaluatedCandidates.toLocaleString()} 個搜尋候選 · ${synthesis.elapsedSeconds.toFixed(3)} s`;
  $("candidateList").innerHTML=synthesis.candidates.map(c=>`<article class="candidate-card ${chosen&&chosen.rank===c.rank?"chosen":""}"><div class="candidate-score"><small>HYBRID PRIORITY SCORE</small><strong>${c.score.toFixed(1)}%</strong></div><div><h3>${esc(c.name)}</h3><p>${esc(sequenceText(c.elements))}</p><div class="coverage-chips">${Object.entries(c.coverages).map(([id,v])=>{const p=Number(c.descriptorProgress?.[id]);return `<span>${id} D ${v==null?"N/A":`${Number(v).toFixed(0)}%`} · P ${Number.isFinite(p)&&p>=0?`${(p/10).toFixed(0)}%`:"N/A"}</span>`}).join("")}</div></div><button data-rank="${c.rank}" type="button">${chosen&&chosen.rank===c.rank?"已選擇":"選擇"}</button></article>`).join("");
  $("candidateList").querySelectorAll("button").forEach(button=>button.onclick=()=>selectCandidateAndUpdate(Number(button.dataset.rank)));
}
function chooseCandidate(rank){chosen=synthesis.candidates.find(x=>x.rank===rank);renderCandidates();$("selectedSequence").innerHTML=`<div class="sequence-summary"><strong>${esc(chosen.name)}</strong><span>${chosen.usedN}N · detected score ${chosen.score.toFixed(1)}% ${chosen.estimatedCost==null?"":` · 成本 ${chosen.estimatedCost}／address`}</span></div><div class="sequence-elements">${groupedElements(chosen.elements).map((e,i)=>`<article><span>M${i}</span><strong>${e.direction==="down"?"⇓ down":"⇑ up"}</strong><code>${esc(e.operations.map(opText).join(", "))}</code></article>`).join("")}</div>`;$("simulateBtn").disabled=false;$("useBuilderBtn").disabled=false;const {depth,width}=validate();$("fullRunHint").textContent=`將在 ${depth} × ${width} memory 上依序注入。`}
async function selectCandidateAndUpdate(rank){try{chooseCandidate(rank);setStatus(`${chosen.name} 已選定，正在更新 Fault Coverage…`,"busy");await simulate(true)}catch{}}
function setBusy(busy,label){$("searchBtn").disabled=busy;$("simulateBtn").disabled=busy||!chosen;document.querySelectorAll(".candidate-card button").forEach(button=>button.disabled=busy);if(busy)setStatus(label,"busy")}
function compareFullGeometry(a,b,faults){const map=result=>Object.fromEntries(result.models.map(model=>[model.id,model.coverage==null?-1:Number(model.coverage)])),am=map(a.result),bm=map(b.result);for(const fault of faults){const delta=(bm[fault]??-1)-(am[fault]??-1);if(delta)return delta}return Number(b.result.summary.weightedCoverage??-1)-Number(a.result.summary.weightedCoverage??-1)||a.candidate.usedN-b.candidate.usedN}
async function analyzeExisting(c){
  const definitions=[...c.algorithms];
  if(c.algorithms.length>1){const combinedSequence=c.algorithms.flatMap(algorithm=>algorithm.sequence);definitions.push({name:"已選演算法 Coverage-preserving 合併",sequence:combinedSequence,optimize:true,algorithmCount:c.algorithms.length})}
  const analyzed=[];let elapsed=0;
  for(let index=0;index<definitions.length;index++){
    const definition=definitions[index];setStatus(definition.optimize?`正在移除不提升 coverage 的重複步驟：${FaultEngine.countN(definition.sequence)}N…`:`正在進行既有演算法 TAGS 分析 ${index+1}/${definitions.length}：${definition.name}`,"busy");
    const analysis=await callWorker(definition.optimize?"optimize":"analyze",{name:definition.name,sequence:definition.sequence,faults:c.faults,descriptorOverrides:descriptorOverridesPayload()});elapsed+=analysis.elapsedSeconds;
    if(definition.optimize)analysis.candidate.name=`優化合併 ${analysis.usedN}N（原 ${analysis.originalN}N，${definition.algorithmCount} 種）`;
    analyzed.push(analysis.candidate);
  }
  const verified=[];
  for(let index=0;index<analyzed.length;index++){
    const candidate=analyzed[index];setStatus(`正在用 full geometry 驗證 ${index+1}/${analyzed.length}：${candidate.name}`,"busy");
    const result=await callWorker("simulate",{memory:{depth:c.depth,dataWidth:c.width},algorithm:candidate.name,operationComplexity:`${candidate.usedN}N`,sequence:candidate.elements,faults:c.faults,couplingRelation:c.relation,maxInstances:c.limit,descriptorOverrides:descriptorOverridesPayload()});verified.push({candidate,result});elapsed+=result.elapsedSeconds;
  }
  verified.sort((a,b)=>compareFullGeometry(a,b,c.faults));verified.forEach((entry,index)=>entry.candidate.rank=index+1);
  synthesis={mode:"existing",method:"Existing March Fault-Descriptor TAGS Analysis",candidates:verified.map(entry=>entry.candidate),evaluatedCandidates:verified.length,elapsedSeconds:elapsed,activeTargetFault:null,stoppedAtN:Math.max(...verified.map(entry=>entry.candidate.usedN))};
  chosen=synthesis.candidates[0];renderCandidates();chooseCandidate(chosen.rank);renderFaultCards(verified[0].result);
  setStatus(`既有演算法 TAGS 分析完成：${chosen.name} · ${fmt(verified[0].result.summary.detected)} / ${fmt(verified[0].result.summary.injected)} detected`,"done");
}
async function search(){
  try{
    const c=validate();
    saveSettings();
    if(analysisMode==="existing"){
      setBusy(true,"正在分析既有 March 演算法…");
      await analyzeExisting(c);
      return;
    }
    const coverageTarget=$("simCoverageTarget").valueAsNumber;
    const coverageTargets=FaultEngine.parseCoverageTargets($("simCoverageOverrides").value);
    const operationCosts={read:$("simReadCost").valueAsNumber,write:$("simWriteCost").valueAsNumber};
    const seeds=fixedAlgorithms.map(algorithm=>algorithm.sequence);
    setBusy(true,`搜尋最多 ${c.budget}N，並驗證完整 memory geometry…`);
    const result=await callWorker("searchMarch",{
      maxN:c.budget,frontierLimit:c.attempts,faults:c.faults,
      memory:{depth:c.depth,dataWidth:c.width},maxInstances:c.limit,couplingRelation:c.relation,
      descriptorOverrides:descriptorOverridesPayload(),seeds,coverageTarget,coverageTargets,operationCosts
    });
    if(!result.candidates.length)throw new Error("沒有可用候選演算法");
    synthesis={...result,mode:"search"};
    chooseCandidate(1);
    renderFaultCards(chosen.result);
    setStatus(FaultEngine.searchStatus(chosen),"done");
  }catch(error){setStatus(error.message,"error")}
  finally{setBusy(false,"")}
}
function witnessText(w){return w?`${w.element} / ${w.operation} @ A${w.address}, B${w.bit}`:"尚無 detection witness"}
function renderFaultCards(result){
  const colors={SAF:"#78a6d0",TF:"#8ab6a2",SWF:"#b7a36c",RDF:"#c99873",AF:"#9cb0c4",TRDF:"#8d98a3",CFwd:"#d29a9a",CFst:"#c69db7",CFid:"#b99191",CFin:"#a888ba",WDF:"#c47f88",TWF:"#9b8f9d",IRF:"#a996ce",RTF:"#c3ad6e",DRF:"#d7a17d",dIRF:"#7fb7bc",dRDF:"#69a5b5",dTF:"#82a7d1"};
  $("faultChartGrid").innerHTML=`<div class="vertical-chart"><div class="vertical-axis"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div><div class="vertical-plot" style="--fault-count:${result.models.length}">${result.models.map(m=>{const value=m.coverage==null?null:Number(m.coverage),color=colors[m.id]||"#7899b7";return `<div class="vertical-column ${value==null?"na":""}" style="--fault-color:${color}" title="${esc(m.description)}"><strong>${value==null?"N/A":`${value.toFixed(1)}%`}</strong><div class="vertical-bar" role="img" aria-label="${esc(m.id)} coverage ${value==null?"N/A":value+"%"}"><span style="height:${value==null?100:Math.max(0,Math.min(100,value))}%"></span></div><b>${esc(m.id)}</b><small>${value==null?"N/A":`${fmt(m.detected)}/${fmt(m.injected)}`}</small></div>`}).join("")}</div></div>`;
  const s=result.summary;$("coverageOverall").innerHTML=`<strong>${s.weightedCoverage==null?"—":`${s.weightedCoverage.toFixed(2)}%`}</strong><small>full-geometry instance coverage</small>`;$("coverageFoot").innerHTML=`<span>${result.memory.depth} × ${result.memory.dataWidth}</span><span>${fmt(s.detected)} / ${fmt(s.injected)} detected</span><span>${result.elapsedSeconds.toFixed(3)} s</span><span>${s.executableModels} executable · ${s.unsupportedModels} N/A</span>`;
}
async function simulate(auto=false){try{const c=validate();setBusy(true,`正在 ${c.depth} × ${c.width} geometry 注入 fault instances…`);const result=await callWorker("simulate",{memory:{depth:c.depth,dataWidth:c.width},algorithm:chosen.name,operationComplexity:`${chosen.usedN}N`,sequence:chosen.elements,faults:c.faults,couplingRelation:c.relation,maxInstances:c.limit,descriptorOverrides:descriptorOverridesPayload()});renderFaultCards(result);setStatus(`搜尋與完整模擬完成：${fmt(result.summary.detected)} / ${fmt(result.summary.injected)} instances detected`,"done");if(!auto)$("faultChartGrid").scrollIntoView({behavior:"smooth",block:"start"})}catch(error){setStatus(error.message,"error");if(auto)throw error}finally{setBusy(false,"")}}
function useInBuilder(){
  if(!chosen)return;
  const {result,...sequence}=chosen;
  localStorage.setItem("sttmram-custom-march",JSON.stringify(sequence));
  localStorage.setItem("sttmram-custom-march-enabled","true");
  location.href="index.html?custom=1";
}
loadSettings();renderPriority();renderAnalysisMode();$("searchBtn").onclick=search;$("simulateBtn").onclick=simulate;$("useBuilderBtn").onclick=useInBuilder;$("descriptorSaveBtn").onclick=saveDescriptorEditor;$("descriptorResetBtn").onclick=resetDescriptorEditor;$("descriptorCloseBtn").onclick=()=>{$("descriptorEditor").hidden=true};[$("simDepth"),$("simWidth")].forEach(x=>x.addEventListener("input",updateAutoLimit));document.querySelectorAll('input[name="analysisMode"]').forEach(input=>input.addEventListener("change",()=>{synthesis=null;chosen=null;$("candidateList").innerHTML="";$("selectedSequence").innerHTML='<p class="empty-state">執行分析後，這裡會顯示完整執行序列。</p>';$("faultChartGrid").innerHTML='<p class="empty-state">執行分析後，coverage 會顯示在這裡。</p>';$("simulateBtn").disabled=true;$("useBuilderBtn").disabled=true;renderAnalysisMode()}));document.querySelectorAll("input,select").forEach(x=>x.addEventListener("change",()=>{updateAutoLimit();saveSettings()}));
