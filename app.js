const $ = (id) => document.getElementById(id);
const ids = ["depth","dataWidth","addrWidth","autoAddr","algoWom26","algoDirf14","algoMarchC","algoMarchCM","repeatWom26","repeatDirf14","repeatMarchC","repeatMarchCM","paperLiteral","optimizeSequence","synthBudget","synthAttempts","enableCustomMarch","readLatency","writeLatency","useReady"];
const defaults = {depth:256,dataWidth:32,addrWidth:8,autoAddr:true,algoWom26:true,algoDirf14:false,algoMarchC:false,algoMarchCM:false,repeatWom26:1,repeatDirf14:1,repeatMarchC:1,repeatMarchCM:1,paperLiteral:false,optimizeSequence:true,synthBudget:10,synthAttempts:200,enableCustomMarch:false,readLatency:1,writeLatency:1,useReady:false};
let files = {}, activeFile = "core", selectedFaultId = null, faultCardHtmlById = {};
let activeFaultCoverageKey = "", activeFaultCoverageLabel = "";
let faultDescriptors = [], selectedDescriptorIds = new Set(), faultPriority = [], simulationResult = null, engineOnline = false;
let synthesisResult = null, customMarch = null;
try{customMarch=JSON.parse(localStorage.getItem("sttmram-custom-march"))||null}catch{customMarch=null}
let bistBrowserPriority=FaultEngine.descriptors.map(d=>d.id),bistBrowserSelected=new Set(bistBrowserPriority),bistBrowserSynthesis=null,bistBrowserRequestId=0;
const bistBrowserPending=new Map(),bistBrowserWorker=new Worker("fault-worker.js?v=2.21.0");
bistBrowserWorker.onmessage=({data})=>{const pending=bistBrowserPending.get(data.id);if(!pending)return;bistBrowserPending.delete(data.id);data.ok?pending.resolve(data.result):pending.reject(new Error(data.error))};
bistBrowserWorker.onerror=error=>setBistBrowserStatus(`Worker 錯誤：${error.message}`,"error");
function callBistBrowserWorker(type,payload){return new Promise((resolve,reject)=>{const id=++bistBrowserRequestId;bistBrowserPending.set(id,{resolve,reject});bistBrowserWorker.postMessage({id,type,payload})})}

const faultUniverse = [
  {id:"SAF",name:"Stuck-at fault",type:"永久",description:"Cell 永久固定為 0 或 1，任何 write 都無法改變其狀態。",roles:["VTM"],relation:"single",supported:true},
  {id:"TF",name:"Transition fault",type:"永久",description:"Cell 的 0→1 或 1→0 寫入轉換失敗。",roles:["VTM"],relation:"single",supported:true},
  {id:"RDF",name:"Read destructive fault",type:"永久",description:"Read 能回傳原值，但讀取動作會破壞並翻轉 cell 狀態。",roles:["VTM"],relation:"single",supported:true},
  {id:"IRF",name:"Incorrect read fault",type:"永久",description:"Cell 狀態正確，但 read output 回傳相反資料。",roles:["VTM"],relation:"single",supported:true},
  {id:"CFwd",name:"Write-disturb coupling",type:"永久",description:"AGR 的 write transition 擾動相鄰 VTM，使 victim 狀態翻轉。",roles:["AGR","VTM"],relation:"same_word_adjacent",supported:true},
  {id:"dIRF",name:"Dynamic incorrect read",type:"動態",description:"必須連續讀取多次才會讓 victim read output 出錯。",roles:["VTM"],relation:"single",supported:true},
  {id:"RTF",name:"Retention fault",type:"暫態",description:"Cell 在 idle／等待期間無法保持資料並發生翻轉。",roles:["VTM"],relation:"single",supported:true},
  {id:"TRDF",name:"Transient read disturb",type:"暫態",description:"Read 期間偶發擾動；沒有 occurrence model 時不能宣稱 deterministic coverage。",roles:["VTM"],relation:"single",supported:false},
  {id:"TWF",name:"Transient write fault",type:"暫態",description:"Write 偶發失敗；沒有 occurrence model 時不能宣稱 deterministic coverage。",roles:["VTM"],relation:"single",supported:false}
];

function loadBistBrowserSettings(){
  try{
    const saved=JSON.parse(localStorage.getItem("sttmram-simulator-settings"));if(!saved)return;
    if(Array.isArray(saved.priority))bistBrowserPriority=[...saved.priority.filter(id=>FaultEngine.descriptors.some(d=>d.id===id)),...FaultEngine.descriptors.map(d=>d.id).filter(id=>!saved.priority.includes(id))];
    if(Array.isArray(saved.selected))bistBrowserSelected=new Set(saved.selected);
    if(saved.budget)$("bistBrowserBudget").value=saved.budget;
    if(saved.attempts)$("bistBrowserAttempts").value=saved.attempts;
    if(saved.relation)$("bistBrowserRelation").value=saved.relation;
  }catch{}
}
function saveBistBrowserSettings(){
  let saved={};try{saved=JSON.parse(localStorage.getItem("sttmram-simulator-settings"))||{}}catch{}
  Object.assign(saved,{budget:+$("bistBrowserBudget").value,attempts:+$("bistBrowserAttempts").value,relation:$("bistBrowserRelation").value,priority:bistBrowserPriority,selected:[...bistBrowserSelected]});
  localStorage.setItem("sttmram-simulator-settings",JSON.stringify(saved));
}
function bistDescriptorInstances(d,depth,width,relation){
  if(!d.supported)return 0;
  const active=d.relation!=="single"?relation:"single";
  const maps=active==="single"?depth*width:active==="same_word_adjacent"?depth*Math.max(0,width-1)*2:Math.max(0,depth-1)*width*2;
  return maps*(d.variants?.length||1);
}
function updateBistBrowserLimit(c=readConfig()){
  const relation=$("bistBrowserRelation").value,counts=bistBrowserPriority.filter(id=>bistBrowserSelected.has(id)).map(id=>{const d=FaultEngine.descriptors.find(x=>x.id===id);return {id,count:bistDescriptorInstances(d,c.depth,c.dataWidth,relation)}});
  const largest=counts.reduce((best,x)=>x.count>best.count?x:best,{id:"—",count:1});
  $("bistBrowserLimit").value=largest.count;
  $("bistBrowserLimitNote").textContent=`${largest.id} 最大需求；依 ${c.depth.toLocaleString()} × ${c.dataWidth.toLocaleString()} 自動計算`;
  return largest.count;
}
function renderBistBrowserPriority(){
  const list=$("bistFaultPriorityList");
  list.innerHTML=bistBrowserPriority.map((id,index)=>{const d=FaultEngine.descriptors.find(x=>x.id===id);return `<article class="priority-item ${bistBrowserSelected.has(id)?"selected":""}" data-bist-priority-item="${id}"><label><input type="checkbox" data-bist-fault="${id}" ${bistBrowserSelected.has(id)?"checked":""}><span><strong>${escapeHtml(id)} · ${escapeHtml(d.name)}</strong><small>${escapeHtml(d.description)}</small></span></label><div><button type="button" class="drag-handle" data-bist-drag="${id}" aria-label="拖曳 ${id} 改變優先序">⠿</button><button type="button" data-bist-move="up" data-id="${id}" ${index===0?"disabled":""}>↑</button><button type="button" data-bist-move="down" data-id="${id}" ${index===bistBrowserPriority.length-1?"disabled":""}>↓</button></div></article>`}).join("");
  list.querySelectorAll("input[data-bist-fault]").forEach(input=>input.onchange=()=>{input.checked?bistBrowserSelected.add(input.dataset.bistFault):bistBrowserSelected.delete(input.dataset.bistFault);saveBistBrowserSettings();renderBistBrowserPriority()});
  list.querySelectorAll("button[data-bist-move]").forEach(button=>button.onclick=()=>{const i=bistBrowserPriority.indexOf(button.dataset.id),j=button.dataset.bistMove==="up"?i-1:i+1;[bistBrowserPriority[i],bistBrowserPriority[j]]=[bistBrowserPriority[j],bistBrowserPriority[i]];saveBistBrowserSettings();renderBistBrowserPriority()});
  let dragged=null;
  const clear=()=>list.querySelectorAll(".priority-item").forEach(item=>item.classList.remove("dragging","drop-before","drop-after"));
  list.querySelectorAll(".drag-handle").forEach(handle=>{const item=handle.closest(".priority-item");handle.onpointerdown=()=>{item.draggable=true;item.dataset.dragArmed="1"};handle.onpointerup=handle.onpointercancel=()=>{if(!dragged){item.draggable=false;delete item.dataset.dragArmed}}});
  list.querySelectorAll(".priority-item").forEach(item=>{
    item.ondragstart=event=>{if(item.dataset.dragArmed!=="1"){event.preventDefault();return}dragged=item.dataset.bistPriorityItem;event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",dragged);item.classList.add("dragging")};
    item.ondragover=event=>{if(!dragged||dragged===item.dataset.bistPriorityItem)return;event.preventDefault();clear();list.querySelector(`[data-bist-priority-item="${dragged}"]`)?.classList.add("dragging");item.classList.add(event.clientY>item.getBoundingClientRect().top+item.offsetHeight/2?"drop-after":"drop-before")};
    item.ondrop=event=>{event.preventDefault();if(!dragged||dragged===item.dataset.bistPriorityItem)return;const after=event.clientY>item.getBoundingClientRect().top+item.offsetHeight/2;bistBrowserPriority.splice(bistBrowserPriority.indexOf(dragged),1);bistBrowserPriority.splice(bistBrowserPriority.indexOf(item.dataset.bistPriorityItem)+(after?1:0),0,dragged);saveBistBrowserSettings();renderBistBrowserPriority()};
    item.ondragend=()=>{item.draggable=false;delete item.dataset.dragArmed;dragged=null;clear()};
  });
  updateBistBrowserLimit();
}

function readConfig(){
  const c={}; ids.forEach(id=>{const e=$(id);c[id]=e.type==="checkbox"?e.checked:(e.type==="number"?Number(e.value):e.value.trim())});
  if(c.autoAddr){c.addrWidth=Math.max(1,Math.ceil(Math.log2(Math.max(2,c.depth))));$("addrWidth").value=c.addrWidth}
  c.ceLow=true; c.weLow=true; c.maskLow=true;
  return c;
}

function womElements(c){
  const tail = c.paperLiteral ? [
    {d:0,o:[["r","00"],["w","01"],["r","01"]]},{d:0,o:[["r","01"],["w","10"],["r","10"]]},
    {d:1,o:[["r","01"],["w","10"],["r","10"]]},{d:1,o:[["r","10"],["w","11"],["r","11"]]},{d:0,o:[["r","11"]]}
  ] : [
    {d:0,o:[["r","00"],["w","01"],["r","01"]]},{d:0,o:[["r","01"],["w","10"],["r","10"]]},
    {d:1,o:[["r","10"],["w","01"],["r","01"]]},{d:1,o:[["r","01"],["w","11"],["r","11"]]},{d:0,o:[["r","11"]]}
  ];
  return [
    {d:0,o:[["w","00"]]},{d:0,o:[["r","00"],["w","11"],["r","11"]]},{d:1,o:[["r","11"],["w","00"],["r","00"]]},
    {d:1,o:[["r","00"],["w","11"],["r","11"]]},{d:1,o:[["r","11"],["w","00"]]},{d:0,o:[["r","00"]]},...tail
  ];
}

function repeatElements(elements,repeat){return Array.from({length:repeat},()=>elements.map(e=>({d:e.d,o:e.o.map(op=>[...op])}))).flat()}
function repeatedMethod(method,repeat){
  const unitElements=method.unitElements||method.elements,unitCount=method.unitCount||method.count;
  return {...method,unitElements,unitCount,repeat,count:unitCount*repeat,elements:repeatElements(unitElements,repeat),name:`${method.baseName||method.name}${repeat>1?` ×${repeat}`:""}`,short:`${method.baseShort||method.short}${repeat>1?` ×${repeat}`:""}`};
}
function selectedAlgorithms(c){
  const list=[];
  if(c.algoWom26) list.push(repeatedMethod({id:"wom26",baseName:c.paperLiteral?"WOM 26N（論文原文）":"WOM 26N（狀態一致版）",baseShort:"WOM 26N",count:26,faults:["SAF","TF","RDF","IRF","CFwd"],deterministic:true,kind:"digital",elements:womElements(c)},c.repeatWom26));
  if(c.algoDirf14) list.push(repeatedMethod({id:"dirf14",baseName:"dIRF March 14N",baseShort:"dIRF 14N",count:14,faults:["dIRF"],deterministic:true,kind:"digital",elements:[
    {d:0,o:[["w","0"]]},{d:0,o:[["r","0"],["w","1"],["r","1"],["r","1"],["r","1"],["r","1"]]},
    {d:1,o:[["r","1"],["w","0"],["r","0"],["r","0"],["r","0"],["r","0"]]},{d:1,o:[["r","0"]]}
  ]},c.repeatDirf14));
  if(c.algoMarchC) list.push(repeatedMethod({id:"marchc",baseName:"March C− 10N",baseShort:"March C−",count:10,faults:["SAF","TF"],deterministic:true,kind:"digital",elements:[
    {d:0,o:[["w","0"]]},{d:0,o:[["r","0"],["w","1"]]},{d:0,o:[["r","1"],["w","0"]]},
    {d:1,o:[["r","0"],["w","1"]]},{d:1,o:[["r","1"],["w","0"]]},{d:0,o:[["r","0"]]}
  ]},c.repeatMarchC));
  if(c.algoMarchCM) list.push(repeatedMethod({id:"marchcm",baseName:"March CM 7N",baseShort:"March CM",count:7,faults:["SAF","TF","IRF"],deterministic:true,kind:"digital",elements:[
    {d:0,o:[["w","1"],["w","0"],["r","0"],["w","1"],["w","1"],["r","1"],["r","1"]]}
  ]},c.repeatMarchCM));
  if(c.enableCustomMarch&&customMarch)list.push({id:"custom-synth",name:customMarch.name,short:`Custom ${customMarch.usedN}N`,count:customMarch.usedN,repeat:1,faults:Object.entries(customMarch.coverages||{}).filter(([,coverage])=>Number(coverage)>0).map(([id])=>id),deterministic:true,kind:"digital",elements:customMarch.elements.map(e=>({d:e.direction==="down"?1:0,o:e.operations.map(op=>[op.kind,op.pattern])}))});
  return list;
}

function fuseWomDirf(wom){
  const elements=wom.unitElements.map(e=>({d:e.d,o:e.o.map(op=>[...op])}));
  // WOM already performs one read after each transition. Three repeated reads
  // complete the four-read dIRF sensitization at the same address.
  elements[1].o.push(["r","11"],["r","11"],["r","11"]);
  elements[2].o.push(["r","00"],["r","00"],["r","00"]);
  return {...wom,id:"wom-dirf-fused",name:"WOM 26N + fused dIRF 6N",short:"WOM+dIRF fused",repeat:1,unitCount:32,count:32,unitElements:elements,elements};
}

function algorithm(c){
  const methods=selectedAlgorithms(c), digital=methods;
  const faultSet=new Set(methods.flatMap(x=>x.faults));
  const deterministicSet=new Set(methods.filter(x=>x.deterministic).flatMap(x=>x.faults));
  const baseCount=digital.reduce((sum,x)=>sum+x.count,0);
  let executed=[...digital], rules=[];
  if(c.optimizeSequence){
    const wom=digital.find(x=>x.id==="wom26"), dirf=digital.find(x=>x.id==="dirf14"), marchc=digital.find(x=>x.id==="marchc");
    if(wom && dirf){
      executed=executed.filter(x=>x.id!=="wom26" && x.id!=="dirf14");
      const fused=[fuseWomDirf(wom)];
      if(wom.repeat>1)fused.push(repeatedMethod(wom,wom.repeat-1));
      if(dirf.repeat>1)fused.push(repeatedMethod(dirf,dirf.repeat-1));
      executed.unshift(...fused);
      rules.push("第一組 WOM 與 dIRF 共用狀態並融合為 32N；其餘指定次數維持獨立執行。");
    }
    if(wom && marchc){
      executed=executed.filter(x=>x.id!=="marchc");
      rules.push("在目前 9 類 STT cell fault 模型內，March C− 的 SAF/TF 已被 WOM 涵蓋，因此省略 10N。");
    }
  }
  const count=executed.reduce((sum,x)=>sum+x.count,0);
  return {
    name:executed.length?executed.map(x=>x.name).join(" + "):"尚未選擇數位 March test",
    count,baseCount,savingsN:baseCount-count,rules,optimized:c.optimizeSequence&&rules.length>0,
    faults:[...faultSet],deterministic:[...deterministicSet],methods,
    elements:executed.flatMap(x=>x.elements)
  };
}

function validate(c){
  const errors=[];
  const methods=selectedAlgorithms(c);
  if(!methods.length)errors.push("請至少選擇一個測試演算法");
  else if(!methods.some(x=>x.kind==="digital"))errors.push("產生 BIST RTL 至少需要一個 Digital March 演算法");
  if(!Number.isInteger(c.depth)||c.depth<2)errors.push("Depth 必須是大於 1 的整數");
  if(!Number.isInteger(c.dataWidth)||c.dataWidth<2)errors.push("Data width 必須至少為 2");
  [c.repeatWom26,c.repeatDirf14,c.repeatMarchC,c.repeatMarchCM].forEach(value=>{if(!Number.isInteger(value)||value<1||value>20)errors.push("每個 March 演算法的執行次數必須為 1–20")});
  if(!Number.isInteger(c.synthBudget)||c.synthBudget<1||c.synthBudget>100)errors.push("Custom March N 必須為 1–100")
  if(!Number.isInteger(c.synthAttempts)||c.synthAttempts<20||c.synthAttempts>1000)errors.push("Search attempts 必須為 20–1000")
  if(c.enableCustomMarch&&!customMarch)errors.push("請先搜尋並選定一個 Custom March 候選")
  if((1<<Math.min(c.addrWidth,30))<c.depth && c.addrWidth<=30)errors.push("Address width 無法涵蓋 depth");
  return errors;
}

function patExpr(p){return p==="0"||p==="00"?"PAT_00":p==="1"||p==="11"?"PAT_11":p==="01"?"PAT_01":"PAT_10"}
function decoderCases(a){
  let s="";
  a.elements.forEach((e,i)=>{s+=`      ${i}: begin\n        elem_down = 1'b${e.d}; elem_ops = 4'd${e.o.length};\n        case (op_idx)\n`;
    e.o.forEach((o,j)=>s+=`          ${j}: begin op_is_read = 1'b${o[0]==="r"?1:0}; op_pattern = ${patExpr(o[1])}; end\n`);
    s+="          default: ;\n        endcase\n      end\n";
  }); return s;
}

function genCore(c,a){
const elemWidth=Math.max(1,Math.ceil(Math.log2(Math.max(1,a.elements.length))));
return `// Generated by STT-MRAM BIST IP Builder
// Algorithm: ${a.name}; nominal complexity: ${a.count}N
// Language: Verilog-2001
// BIST is a standalone controller. mem_* control pins are OUTPUTS.
module sttmram_bist_core #(
  parameter ADDR_WIDTH=${c.addrWidth}, DATA_WIDTH=${c.dataWidth}, DEPTH=${c.depth},
  parameter READ_LATENCY=${c.readLatency}, WRITE_LATENCY=${c.writeLatency},
  parameter USE_READY=${c.useReady?1:0}, ACTIVE_LOW_CE=${c.ceLow?1:0},
  parameter ACTIVE_LOW_WE=${c.weLow?1:0}, ACTIVE_LOW_MASK=${c.maskLow?1:0}
)(
  input  clk, rst_n, start,
  output reg busy, done, fail,
  output reg [31:0] error_count,
  output reg [ADDR_WIDTH-1:0] first_fail_addr,
  output mem_ce, mem_we,
  output reg [ADDR_WIDTH-1:0] mem_addr,
  output [DATA_WIDTH-1:0] mem_wdata, mem_wmask,
  input  [DATA_WIDTH-1:0] mem_rdata,
  input  mem_ready
);
  localparam ELEM_COUNT=${a.elements.length};
  localparam ELEM_WIDTH=${elemWidth};
  localparam [DATA_WIDTH-1:0] PAT_00={DATA_WIDTH{1'b0}};
  localparam [DATA_WIDTH-1:0] PAT_11={DATA_WIDTH{1'b1}};
  function [DATA_WIDTH-1:0] alt01;
    integer i;
    begin
      for(i=0;i<DATA_WIDTH;i=i+1) alt01[i]=i%2;
    end
  endfunction
  localparam [DATA_WIDTH-1:0] PAT_01=alt01();
  localparam [DATA_WIDTH-1:0] PAT_10=~PAT_01;

  localparam [1:0] IDLE=2'd0, ISSUE=2'd1, WAIT_OP=2'd2;
  reg [1:0] state;
  reg [ELEM_WIDTH-1:0] elem;
  reg [3:0] op_idx, elem_ops;
  reg elem_down, op_is_read;
  reg [DATA_WIDTH-1:0] op_pattern;
  reg [7:0] wait_count;
  wire ce_i, write_i, op_done;

  always @* begin
    elem_down=1'b0; elem_ops=4'd1; op_is_read=1'b0; op_pattern=PAT_00;
    case (elem)
${decoderCases(a)}      default: ;
    endcase
  end

  assign ce_i=(state==ISSUE);
  assign write_i=ce_i && !op_is_read;
  assign mem_ce=ACTIVE_LOW_CE ? ~ce_i : ce_i;
  assign mem_we=ACTIVE_LOW_WE ? ~write_i : write_i;
  assign mem_wdata=op_pattern;
  assign mem_wmask=ACTIVE_LOW_MASK ? {DATA_WIDTH{1'b0}} : {DATA_WIDTH{1'b1}};
  assign op_done=USE_READY ? mem_ready :
                 (wait_count >= ((op_is_read?READ_LATENCY:WRITE_LATENCY)-1));

  always @(posedge clk or negedge rst_n) begin
    if(!rst_n) begin
      state<=IDLE; busy<=1'b0; done<=1'b0; fail<=1'b0; error_count<=32'd0;
      first_fail_addr<={ADDR_WIDTH{1'b0}}; mem_addr<={ADDR_WIDTH{1'b0}};
      elem<=0; op_idx<=0; wait_count<=0;
    end else begin
      done<=0;
      case(state)
        IDLE: if(start) begin
          busy<=1'b1; fail<=1'b0; error_count<=32'd0; first_fail_addr<={ADDR_WIDTH{1'b0}};
          elem<=0; op_idx<=0; mem_addr<={ADDR_WIDTH{1'b0}}; state<=ISSUE;
        end
        ISSUE: begin wait_count<=0; state<=WAIT_OP; end
        WAIT_OP: begin
          if(op_done) begin
            if(op_is_read && mem_rdata!==op_pattern) begin
              if(!fail) first_fail_addr<=mem_addr;
              fail<=1; error_count<=error_count+1'b1;
            end
            if(op_idx+1 < elem_ops) begin op_idx<=op_idx+1'b1; state<=ISSUE; end
            else begin
              op_idx<=0;
              if((!elem_down && mem_addr==DEPTH-1)||(elem_down && mem_addr==0)) begin
                if(elem==ELEM_COUNT-1) begin busy<=0; done<=1; state<=IDLE; end
                else begin
                  elem<=elem+1'b1;
                  mem_addr<=${a.elements.length>1?`(${a.elements.map((e,i)=>`(elem+1==${i} && 1'b${e.d})`).join(" || ")}) ? (DEPTH-1) : {ADDR_WIDTH{1'b0}};`:`{ADDR_WIDTH{1'b0}};`}
                  state<=ISSUE;
                end
              end else begin mem_addr<=elem_down ? mem_addr-1'b1 : mem_addr+1'b1; state<=ISSUE; end
            end
          end else wait_count<=wait_count+1'b1;
        end
        default: state<=IDLE;
      endcase
    end
  end
endmodule
`}

function genLink(c){
return `// Generic integration wrapper: BIST and memory remain separate blocks.
// Connect the mem_* ports to the selected memory macro outside this module.
module sttmram_bist_memory_link #(
  parameter ADDR_WIDTH=${c.addrWidth}, DATA_WIDTH=${c.dataWidth}, DEPTH=${c.depth}
)(
  input clk, rst_n, bist_start,
  output bist_busy, bist_done, bist_fail,
  output [31:0] bist_error_count,
  output mem_ce, mem_we,
  output [ADDR_WIDTH-1:0] mem_addr,
  output [DATA_WIDTH-1:0] mem_wdata, mem_wmask,
  input  [DATA_WIDTH-1:0] mem_rdata,
  input  mem_ready
);
  wire [ADDR_WIDTH-1:0] first_fail_addr;

  sttmram_bist_core #(.ADDR_WIDTH(ADDR_WIDTH),.DATA_WIDTH(DATA_WIDTH),.DEPTH(DEPTH)) u_bist (
    .clk(clk), .rst_n(rst_n), .start(bist_start),
    .busy(bist_busy), .done(bist_done), .fail(bist_fail),
    .error_count(bist_error_count), .first_fail_addr(first_fail_addr),
    .mem_ce(mem_ce), .mem_we(mem_we), .mem_addr(mem_addr),
    .mem_wdata(mem_wdata), .mem_wmask(mem_wmask),
    .mem_rdata(mem_rdata), .mem_ready(mem_ready)
  );
endmodule
`}

function genTb(c){
return `\`timescale 1ns/1ps
module tb_sttmram_bist;
  localparam DEPTH=${c.depth}, DATA_WIDTH=${c.dataWidth}, ADDR_WIDTH=${c.addrWidth};
  reg clk, rst_n, start, ready;
  wire busy, done, fail, ce, we;
  wire [ADDR_WIDTH-1:0] addr, first_fail_addr;
  wire [DATA_WIDTH-1:0] wdata, wmask;
  reg [DATA_WIDTH-1:0] rdata;
  wire [31:0] error_count;
  reg [DATA_WIDTH-1:0] mem[0:DEPTH-1];
  reg inject_stuck_at;
  integer fault_addr, fault_bit;
  always #5 clk=~clk;

  sttmram_bist_core #(.ADDR_WIDTH(ADDR_WIDTH),.DATA_WIDTH(DATA_WIDTH),.DEPTH(DEPTH)) dut(
    .clk(clk),.rst_n(rst_n),.start(start),.busy(busy),.done(done),.fail(fail),
    .error_count(error_count),.first_fail_addr(first_fail_addr),
    .mem_ce(ce),.mem_we(we),.mem_addr(addr),.mem_wdata(wdata),.mem_wmask(wmask),
    .mem_rdata(rdata),.mem_ready(ready));

  wire ce_active=${c.ceLow?"!ce":"ce"};
  wire wr_active=${c.weLow?"!we":"we"};
  always @(posedge clk) if(ce_active && wr_active) mem[addr] <= wdata;
  always @* begin
    rdata=mem[addr];
    if(inject_stuck_at && addr==fault_addr) rdata[fault_bit]=1'b0;
  end

  task run_bist;
    input with_fault;
    begin
      inject_stuck_at=with_fault; @(posedge clk); start<=1'b1; @(posedge clk); start<=1'b0;
      wait(done); $display("fault=%0d fail=%0d count=%0d first_addr=%0d",with_fault,fail,error_count,first_fail_addr);
    end
  endtask
  initial begin
    clk=1'b0; rst_n=1'b0; start=1'b0; ready=1'b1;
    inject_stuck_at=1'b0; fault_addr=3; fault_bit=0;
    repeat(3) @(posedge clk); rst_n<=1'b1;
    run_bist(1'b0); if(fail) begin $display("ERROR: Fault-free memory failed"); $finish; end
    run_bist(1'b1); if(!fail) begin $display("ERROR: Injected fault escaped"); $finish; end
    $display("PASS"); $finish;
  end
endmodule
`}

function guide(c,a){return `STT-MRAM BIST 整合說明
=======================

選用方法：${a.methods.map(x=>x.name).join("、")}
數位 RTL sequence：${a.name}
原始測試複雜度：${a.baseCount}N
最佳化後複雜度：${a.count}N
節省：${a.savingsN}N（${a.baseCount?((a.savingsN/a.baseCount)*100).toFixed(1):"0.0"}%）
實際名目操作：${a.count} × DEPTH = ${a.count*c.depth} 次 memory operations
故障模型聯集：${a.faults.join(" · ") || "無"}
模型種類 coverage：${a.faults.length}/9 = ${(a.faults.length/9*100).toFixed(1)}%

Sequence 最佳化
----------------
${a.optimized?a.rules.map((r,i)=>`${i+1}. ${r}`).join("\n"):"未套用合併規則；RTL 使用原始演算法串接。"}
最佳化是依目前 fault-model mapping 所做的 coverage-equivalent rewrite。正式 sign-off 前仍須以 fault injection 比較原始與最佳化 sequence。

Coverage 定義
-------------
這是 survey 中 9 類 cell-level fault model 的種類聯集，不是 fault-injection instance coverage。
重複 fault 只計一次。若要得到實際 defect/fault-instance coverage，仍須建立 fault list、逐一注入並比較 golden 與 faulty response。

純數位方法的限制
----------------
本工具只產生可由 memory 數位介面直接執行的 March BIST。
RTF、TRDF 與 TWF 目前維持未涵蓋；不把 weak-current、burn-in 或 sense-current 類比 DfT 算入 coverage。

Memory geometry（必須依 datasheet）
---------------------------------
Depth = ${c.depth} 個可定址 words
Data width = ${c.dataWidth} bits/word
Address width = ${c.addrWidth} bits
Macro organization = ${c.depth} × ${c.dataWidth} bits

注意：Depth 是 datasheet organization 中「×」左邊的數字，不是總容量。
例如 256 × 32 macro 應填 Depth=256、Data width=32、Address width=8。

訊號方向
--------
BIST → Memory（BIST output / Memory input）
  mem_ce, mem_we, mem_addr, mem_wdata, mem_wmask

Memory → BIST（Memory output / BIST input）
  mem_rdata, mem_ready（若 macro 沒有 ready，可固定為 1）

整合原則
--------
1. sttmram_bist_core 不包含 memory macro，可以獨立 synthesis。
2. bist_memory_link 僅將通用 mem_* 介面帶到 module ports，不綁定任何 macro 名稱或腳位。
3. normal mode 和 BIST mode 共用 memory 時，請在 wrapper 外加入 mux；切換只能在 memory idle 時進行。
4. READ_LATENCY 必須從 datasheet 的 clock-to-Q timing 設定。
5. 目前產生的 core 預設 CE／WE／MASK 為 active-low；之後確定 macro 規格再於 RTL parameter 調整。
6. 第一次失敗位址保存在 first_fail_addr，總錯誤次數在 error_count。

${c.paperLiteral?"警告：目前使用論文原文 WOM sequence；其後半段相鄰 element 的資料狀態不一致，fault-free array 可能報錯。":"WOM 使用狀態一致版本；請在交付前讓教授確認論文原文中的疑似 sequence typo。"}
`}

function faultCoverageKey(c,a){
  return JSON.stringify({methods:a.methods.map(m=>[m.id,m.repeat,m.count,m.name]).sort(),optimized:c.optimizeSequence,paperLiteral:c.paperLiteral,depth:c.depth,dataWidth:c.dataWidth,addrWidth:c.addrWidth,priority:faultPriority.filter(id=>selectedDescriptorIds.has(id))});
}

function renderFaultCoverage(c,a){
  activeFaultCoverageKey=faultCoverageKey(c,a);
  activeFaultCoverageLabel=`${a.methods.map(m=>m.short).join(" + ")||"未選擇演算法"} · ${a.count}N · ${c.depth} × ${c.dataWidth}`;
  $("coverageConfigLabel").textContent=activeFaultCoverageLabel;
  if(simulationResult&&simulationResult._configKey!==activeFaultCoverageKey){
    $("simulationMessage").textContent="設定已變更；按「開始本機模擬」重新產生 coverage。";
    $("simulationMessage").className="simulation-message warn";
  }
  if(!simulationResult)renderEmptySimulation();
}

function faultCoverageCsv(){
  if(!simulationResult)return "";
  const rows=[["configuration",activeFaultCoverageLabel],["fault","name","status","injected","activated","detected","undetected","coverage","first_detection"]];
  simulationResult.models.forEach(item=>rows.push([item.id,item.name,item.status,item.injected,item.activated??"",item.detected,item.undetected,item.coverage??"N/A",formatEvidence(item.first_detection)]));
  return rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(",")).join("\r\n");
}

function escapeHtml(value){return String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]))}
function formatEvidence(w){return w?`${w.element} / ${w.operation} / A${w.address} B${w.bit}: ${w.golden_output}→${w.faulty_output}`:"—"}
function renderEmptySimulation(){
  const source=faultDescriptors.length?faultDescriptors:faultUniverse;
  $("faultCoverageRows").innerHTML=source.map(f=>`<tr><td><span class="fault-code">${escapeHtml(f.id)}</span><br><small>${escapeHtml(f.name)}</small></td><td colspan="6" class="not-run">尚未由本機引擎計算</td></tr>`).join("");
  $("faultCoverageSummary").innerHTML=`<div><span>Total injected</span><strong>—</strong></div><div><span>Total detected</span><strong>—</strong></div><div><span>Weighted coverage</span><strong>—</strong></div><div><span>Engine</span><strong>${engineOnline?"Ready":"Offline"}</strong></div>`;
  $("faultCoverageChart").innerHTML='<p class="bar-note">執行本機 fault simulation 後顯示各 fault coverage。</p>';
}

function renderDescriptorGrid(){
  const byId=Object.fromEntries(faultDescriptors.map(d=>[d.id,d]));
  const ordered=faultPriority.map(id=>byId[id]).filter(Boolean);
  $("descriptorGrid").innerHTML=ordered.map((d,index)=>{
    const checked=selectedDescriptorIds.has(d.id), supported=d.supported!==false;
    return `<article class="descriptor-card ${supported?"supported":"unsupported"}"><header><label><input type="checkbox" data-descriptor-id="${escapeHtml(d.id)}" ${checked?"checked":""}><span><strong>P${index+1} · ${escapeHtml(d.id)}</strong><small>${escapeHtml(d.name)}</small></span></label><div class="priority-actions"><button type="button" data-priority-move="up" data-priority-id="${escapeHtml(d.id)}" ${index===0?"disabled":""} aria-label="提高 ${escapeHtml(d.id)} 優先序">↑</button><button type="button" data-priority-move="down" data-priority-id="${escapeHtml(d.id)}" ${index===ordered.length-1?"disabled":""} aria-label="降低 ${escapeHtml(d.id)} 優先序">↓</button></div></header><p class="descriptor-description">${escapeHtml(d.description||"")}</p><div class="descriptor-meta"><span>Roles: ${escapeHtml((d.roles||[]).join(" · "))}</span><span>${supported?escapeHtml(d.relation):"N/A"}</span><span>${d.variants?.length||0} variants</span></div><details><summary>完整 descriptor</summary><pre>${escapeHtml(JSON.stringify(d,null,2))}</pre></details></article>`;
  }).join("");
}

function renderSimulationResult(result){
  simulationResult=result;
  $("coverageCsvBtn").disabled=false;
  $("faultCoverageRows").innerHTML=result.models.map(item=>{
    const status=item.status, coverage=item.coverage==null?"N/A":`${Number(item.coverage).toFixed(2)}%`;
    const cls=status!=="complete"?"not-run":item.coverage===100?"complete":item.coverage>0?"partial":"invalid";
    const evidence=item.first_detection?`<button class="evidence-btn" data-evidence="${escapeHtml(item.id)}" title="${escapeHtml(item.first_detection.instance)}">${escapeHtml(formatEvidence(item.first_detection))}</button>`:`<span>${escapeHtml(item.reason||"—")}</span>`;
    return `<tr><td><span class="fault-code">${escapeHtml(item.id)}</span><br><small>${escapeHtml(item.name)}</small></td><td>${Number(item.injected).toLocaleString()}</td><td>${item.activated==null?"—":Number(item.activated).toLocaleString()}</td><td>${Number(item.detected).toLocaleString()}</td><td>${Number(item.undetected).toLocaleString()}</td><td class="coverage-value ${cls}">${coverage}</td><td class="evidence-cell">${evidence}</td></tr>`;
  }).join("");
  const s=result.summary;
  $("faultCoverageSummary").innerHTML=`<div><span>Total injected</span><strong>${Number(s.injected).toLocaleString()}</strong></div><div><span>Total detected</span><strong>${Number(s.detected).toLocaleString()}</strong></div><div><span>Weighted coverage</span><strong>${s.weightedCoverage==null?"N/A":`${Number(s.weightedCoverage).toFixed(2)}%`}</strong></div><div><span>Runtime</span><strong>${Number(result.elapsedSeconds).toFixed(3)} s</strong></div>`;
  $("faultCoverageChart").innerHTML=result.models.map(item=>{const value=item.coverage==null?null:Number(item.coverage);return `<div class="bar-row"><label title="${escapeHtml(item.name)}">${escapeHtml(item.id)}</label><div class="bar-track"><div class="bar-fill ${value==null?"na":""}" style="width:${value==null?100:Math.max(0,Math.min(100,value))}%"></div></div><strong>${value==null?"N/A":`${value.toFixed(1)}%`}</strong></div>`}).join("");
  $("simulationMessage").textContent=`本機計算完成 · ${result.models.length} 個 fault models · 結果已保存：${result.resultFile||"local engine"}`;
  $("simulationMessage").className="simulation-message ok";
}

async function connectLocalEngine(){
  try{
    const health=await fetch("/api/health",{cache:"no-store"});
    const healthData=await health.json();
    if(!health.ok||!healthData.ok)throw new Error("engine unavailable");
    const response=await fetch("/api/descriptors",{cache:"no-store"});
    const data=await response.json();
    const incoming=data.descriptors||[];
    const wasEmpty=!faultDescriptors.length;
    faultDescriptors=incoming;
    if(wasEmpty||!selectedDescriptorIds.size)selectedDescriptorIds=new Set(faultDescriptors.map(d=>d.id));
    faultPriority=[...faultPriority.filter(id=>faultDescriptors.some(d=>d.id===id)),...faultDescriptors.map(d=>d.id).filter(id=>!faultPriority.includes(id))];
    engineOnline=true;
    $("engineDot").classList.add("online");
    $("engineStatus").textContent="本機 Fault Engine 已連線";
    $("engineHint").textContent=`${faultDescriptors.length} 個 descriptors 可用`;
    $("simulationRunBtn").disabled=false;
    $("synthSearchBtn").disabled=false;
    renderDescriptorGrid();renderEmptySimulation();
  }catch{
    engineOnline=false;
    if(!faultDescriptors.length){faultDescriptors=faultUniverse.map(f=>({...f,variants:[]}));selectedDescriptorIds=new Set(faultDescriptors.map(d=>d.id));faultPriority=faultDescriptors.map(d=>d.id)}
    $("engineStatus").textContent="本機 Fault Engine 未連線";
    $("engineHint").textContent="執行 python local_engine/server.py，再重新整理此頁";
    $("simulationRunBtn").disabled=true;
    $("synthSearchBtn").disabled=true;
    renderDescriptorGrid();renderEmptySimulation();
  }
}

async function runLocalSimulation(){
  const c=readConfig(),a=algorithm(c),errors=validate(c);
  if(errors.length){$("simulationMessage").textContent=errors[0];$("simulationMessage").className="simulation-message error";return}
  if(!selectedDescriptorIds.size){$("simulationMessage").textContent="請至少選擇一個 Fault Descriptor。";$("simulationMessage").className="simulation-message error";return}
  const button=$("simulationRunBtn");button.disabled=true;button.textContent="本機計算中…";
  $("simulationMessage").textContent="正在產生 instances 並逐一比較 golden / faulty output…";$("simulationMessage").className="simulation-message running";
  const payload={memory:{depth:c.depth,dataWidth:c.dataWidth},algorithm:a.name,operationComplexity:`${a.count}N`,faults:faultPriority.filter(id=>selectedDescriptorIds.has(id)),couplingRelation:$("couplingRelation").value,maxInstances:Number($("maxInstances").value),sequence:a.elements.map(e=>({direction:e.d?"down":"up",operations:e.o.map(op=>({kind:op[0],pattern:op[1]}))}))};
  try{
    const response=await fetch("/api/simulate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||"Simulation failed");
    result._configKey=activeFaultCoverageKey;renderSimulationResult(result);
  }catch(error){$("simulationMessage").textContent=`模擬失敗：${error.message}`;$("simulationMessage").className="simulation-message error"}
  finally{button.disabled=!engineOnline;button.textContent="開始本機模擬"}
}

function synthSequenceText(elements){
  return elements.map((element,index)=>{const dir=element.direction==="down"?"↓":"↑";const ops=[];element.operations.forEach(op=>{const key=`${op.kind}${op.pattern}`,last=ops[ops.length-1];if(last&&last.key===key)last.count++;else ops.push({key,count:1})});return `M${index} ${dir} (${ops.map(op=>`${op.key}${op.count>1?`×${op.count}`:""}`).join(", ")})`}).join("; ");
}
function renderSynthesisResults(){
  if(!synthesisResult){$("synthesisResults").innerHTML="";return}
  $("customMarchStatus").textContent=`已評估 ${synthesisResult.evaluatedCandidates} 個候選 · ${Number(synthesisResult.elapsedSeconds).toFixed(3)} s`;
  const chart=`<div class="synthesis-chart"><div class="chart-heading"><div><span>CANONICAL SEARCH SCORE</span><strong>Top candidate comparison</strong></div><div class="chart-legend"><i></i>Weighted score</div></div><div class="candidate-bars">${synthesisResult.candidates.map((candidate,index)=>`<div class="bar-row"><label>Candidate ${index+1}</label><div class="bar-track"><div class="bar-fill" style="width:${Math.max(0,Math.min(100,Number(candidate.score)))}%"></div></div><strong>${Number(candidate.score).toFixed(1)}</strong></div>`).join("")}</div><p class="bar-note">所有候選皆使用 ${synthesisResult.budgetN}N；此分數依 fault priority 加權。</p></div>`;
  $("synthesisResults").innerHTML=chart+synthesisResult.candidates.map((candidate,index)=>{
    const coverage=Object.entries(candidate.coverages).map(([id,value])=>`<span>${escapeHtml(id)} ${value==null?"N/A":`${Number(value).toFixed(0)}%`}</span>`).join("");
    return `<article class="synth-candidate ${index===0?"best":""}"><div class="synth-rank"><span>RANK ${index+1}</span><strong>${Number(candidate.score).toFixed(1)}</strong></div><div class="synth-info"><strong>${escapeHtml(candidate.name)}</strong><small>${candidate.usedN}N · ${candidate.elements.length} elements · canonical weighted score</small><div class="synth-coverages">${coverage}</div><div class="synth-sequence">${escapeHtml(synthSequenceText(candidate.elements))}</div></div><button type="button" data-use-candidate="${index}">${customMarch&&JSON.stringify(customMarch.elements)===JSON.stringify(candidate.elements)?"已選定":"使用此候選"}</button></article>`;
  }).join("");
}
async function runSynthesis(){
  if(!engineOnline)return;
  const budget=Number($("synthBudget").value),attempts=Number($("synthAttempts").value);
  if(!Number.isInteger(budget)||budget<1||budget>100){$("customMarchStatus").textContent="N budget 必須為 1–100";return}
  if(!Number.isInteger(attempts)||attempts<20||attempts>1000){$("customMarchStatus").textContent="Search attempts 必須為 20–1000";return}
  const faults=faultPriority.filter(id=>selectedDescriptorIds.has(id));
  if(!faults.length){$("customMarchStatus").textContent="請先選擇至少一個 Fault Descriptor";return}
  const button=$("synthSearchBtn");button.disabled=true;button.textContent="搜尋中…";$("customMarchStatus").textContent=`正在搜尋 ${budget}N sequence…`;
  try{
    const response=await fetch("/api/synthesize",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({budgetN:budget,attempts,faults,seed:611130})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||"Synthesis failed");synthesisResult=result;renderSynthesisResults();
  }catch(error){$("customMarchStatus").textContent=`搜尋失敗：${error.message}`}
  finally{button.disabled=!engineOnline;button.textContent="搜尋最佳 March"}
}
function useSynthesisCandidate(index){
  const candidate=synthesisResult?.candidates?.[index];if(!candidate)return;
  customMarch={...candidate,name:`Custom March ${candidate.usedN}N（自動搜尋）`};
  localStorage.setItem("sttmram-custom-march",JSON.stringify(customMarch));
  $("enableCustomMarch").disabled=false;$("enableCustomMarch").checked=true;
  $("customMarchStatus").textContent=`已選定 ${customMarch.name} · score ${Number(customMarch.score).toFixed(1)}`;
  renderSynthesisResults();render();
}

function setBistBrowserStatus(message,state="ready"){$("bistBrowserStatus").className=`worker-status ${state}`;$("bistBrowserStatus").querySelector("span").textContent=message}
function renderBistBrowserCoverage(result,candidate){
  const colors={SAF:"#78a6d0",TF:"#8ab6a2",RDF:"#c99873",IRF:"#a996ce",CFwd:"#d29a9a",dIRF:"#7fb7bc",RTF:"#c3ad6e",TRDF:"#8d98a3",TWF:"#9b8f9d"};
  $("bistBrowserChart").innerHTML=`<div class="vertical-chart"><div class="vertical-axis"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div><div class="vertical-plot">${result.models.map(m=>{const value=m.coverage==null?null:Number(m.coverage),color=colors[m.id]||"#7899b7";return `<div class="vertical-column ${value==null?"na":""}" style="--fault-color:${color}" title="${escapeHtml(m.description)}"><strong>${value==null?"N/A":`${value.toFixed(1)}%`}</strong><div class="vertical-bar"><span style="height:${value==null?100:Math.max(0,Math.min(100,value))}%"></span></div><b>${escapeHtml(m.id)}</b><small>${value==null?"N/A":`${Number(m.detected).toLocaleString()}/${Number(m.injected).toLocaleString()}`}</small></div>`}).join("")}</div></div>`;
  const summary=result.summary;$("bistBrowserOverall").innerHTML=`<strong>${summary.weightedCoverage==null?"—":`${Number(summary.weightedCoverage).toFixed(2)}%`}</strong><small>full-geometry instance coverage</small>`;
  $("bistBrowserSequence").innerHTML=`<div><span>Selected candidate</span><strong>${escapeHtml(candidate.name)}</strong><small>${candidate.usedN}N · canonical weighted score ${Number(candidate.score).toFixed(1)}% · ranking: priority-first</small></div><code>${escapeHtml(synthSequenceText(candidate.elements))}</code>`;
}
async function runBistBrowserSearch(){
  const c=readConfig(),budget=Number($("bistBrowserBudget").value),attempts=Number($("bistBrowserAttempts").value),faults=bistBrowserPriority.filter(id=>bistBrowserSelected.has(id));
  if(!Number.isInteger(budget)||budget<1||budget>100){setBistBrowserStatus("N budget 必須為 1–100","error");return}
  if(!Number.isInteger(attempts)||attempts<20||attempts>1000){setBistBrowserStatus("Search attempts 必須為 20–1000","error");return}
  if(!faults.length){setBistBrowserStatus("至少選擇一種 Fault","error");return}
  const button=$("bistBrowserSearchBtn");button.disabled=true;saveBistBrowserSettings();setBistBrowserStatus("依 Fault priority 搜尋候選演算法…","busy");
  try{
    bistBrowserSynthesis=await callBistBrowserWorker("synthesize",{budgetN:budget,attempts,faults,seed:611130});
    const candidate=bistBrowserSynthesis.candidates[0];if(!candidate)throw new Error("沒有可用候選演算法");
    customMarch={...candidate,name:`Custom March ${candidate.usedN}N（BIST 自動搜尋）`};localStorage.setItem("sttmram-custom-march",JSON.stringify(customMarch));localStorage.setItem("sttmram-custom-march-enabled","true");$("enableCustomMarch").disabled=false;$("enableCustomMarch").checked=true;
    setBistBrowserStatus(`已選定第一順位最佳候選，正在 ${c.depth} × ${c.dataWidth} geometry 注入…`,"busy");
    const result=await callBistBrowserWorker("simulate",{memory:{depth:c.depth,dataWidth:c.dataWidth},algorithm:customMarch.name,operationComplexity:`${candidate.usedN}N`,sequence:candidate.elements,faults,couplingRelation:$("bistBrowserRelation").value,maxInstances:updateBistBrowserLimit(c)});
    renderBistBrowserCoverage(result,candidate);render();setBistBrowserStatus(`完整模擬完成：${Number(result.summary.detected).toLocaleString()} / ${Number(result.summary.injected).toLocaleString()} instances detected`,"done");
  }catch(error){setBistBrowserStatus(`搜尋失敗：${error.message}`,"error")}
  finally{button.disabled=false}
}

function render(){
  const c=readConfig(),a=algorithm(c),errors=validate(c);
  updateBistBrowserLimit(c);
  $("addrWidth").disabled=c.autoAddr;
  $("paperLiteral").disabled=!c.algoWom26;
  $("enableCustomMarch").disabled=!customMarch;
  if(customMarch&&!synthesisResult)$("customMarchStatus").textContent=`已保存 ${customMarch.name} · score ${Number(customMarch.score).toFixed(1)}`;
  [["repeatWom26",c.algoWom26],["repeatDirf14",c.algoDirf14],["repeatMarchC",c.algoMarchC],["repeatMarchCM",c.algoMarchCM]].forEach(([id,enabled])=>$(id).disabled=!enabled);
  $("algoNote").className="note"+(c.paperLiteral&&c.algoWom26?" warn":"");
  $("algoNote").textContent=c.paperLiteral&&c.algoWom26?"警告：論文後半段的起始 expected pattern 與前一 element 結束狀態不一致。":`${a.methods.length} 個數位方法已選；${a.optimized?`已從 ${a.baseCount}N 壓縮為 ${a.count}N。`:`March 複雜度 ${a.count}N。`}`;
  const v=$("validation");v.textContent=errors.length?errors[0]:"參數有效";v.className="validation "+(errors.length?"error":"ok");
  $("summary").innerHTML=`<div class="metric"><span>Selected methods</span><strong>${a.methods.length}</strong></div><div class="metric"><span>Optimized operations</span><strong>${(a.count*c.depth).toLocaleString()}</strong></div><div class="metric"><span>Saved operations</span><strong>${(a.savingsN*c.depth).toLocaleString()}</strong></div><div class="metric"><span>Fault union</span><strong>${a.faults.length} / 9</strong></div>`;
  renderCoverage(c,a);
  renderSequence(c,a);
  if(!errors.length){files={core:{name:"sttmram_bist_core.v",text:genCore(c,a)},link:{name:"sttmram_bist_memory_link.v",text:genLink(c)},tb:{name:"tb_sttmram_bist.v",text:genTb(c)},guide:{name:"README.txt",text:guide(c,a)}}}
  showFile(activeFile); localStorage.setItem("sttmram-bist-config",JSON.stringify(c));
}

function renderCoverage(c,a){
  const covered=new Set(a.faults), deterministic=new Set(a.deterministic);
  const percent=covered.size/faultUniverse.length*100;
  $("coverageRing").style.setProperty("--coverage",`${percent*3.6}deg`);
  $("coveragePercent").textContent=`${percent.toFixed(1)}%`;
  const savedPct=a.baseCount?(a.savingsN/a.baseCount*100):0;
  $("optimizerPanel").className="optimizer-panel "+(a.optimized?"active":"idle");
  $("optimizerPanel").innerHTML=`<div class="optimizer-score"><span>${a.optimized?"OPTIMIZED":"ORIGINAL"}</span><strong>${a.baseCount}N <i>→</i> ${a.count}N</strong><small>${a.savingsN}N saved · ${savedPct.toFixed(1)}%</small></div><div class="optimizer-rules">${a.rules.length?a.rules.map(r=>`<p>✓ ${r}</p>`).join(""):"<p>目前組合沒有可套用的共用 sequence 規則。</p>"}<small>正式定案前仍需以 fault injection 驗證 coverage 等價性。</small></div>`;
  $("coverageStats").innerHTML=`
    <div><span>Covered models</span><strong>${covered.size} / ${faultUniverse.length}</strong></div>
    <div><span>Deterministic digital</span><strong>${deterministic.size} / ${faultUniverse.length}</strong></div>
    <div><span>Uncovered</span><strong>${faultUniverse.length-covered.size}</strong></div>
    <div><span>Complexity</span><strong>${a.count}N digital</strong></div>`;
  $("faultMatrix").innerHTML=faultUniverse.map(f=>{
    const hit=covered.has(f.id), det=deterministic.has(f.id);
    const sources=a.methods.filter(m=>m.faults.includes(f.id)).map(m=>m.short).join("、");
    return `<article class="fault-card ${hit?"covered":"miss"}"><div><strong>${f.id}</strong><span>${f.type}</span></div><p>${f.name}</p><small>${hit?`✓ ${sources}`:"— 純數位方法尚未涵蓋"}</small></article>`;
  }).join("");
  renderFaultCoverage(c,a);
}

function compressedOps(ops){
  const groups=[];
  ops.forEach(op=>{
    const key=op.join("");
    const last=groups[groups.length-1];
    if(last&&last.key===key)last.count++;
    else groups.push({key,kind:op[0],pattern:op[1],count:1});
  });
  return groups;
}

function elementRefs(a,predicate){
  return a.elements.map((e,i)=>predicate(e)?`M${i}`:null).filter(Boolean);
}

function faultExplanation(f,a){
  const allReads=elementRefs(a,e=>e.o.some(op=>op[0]==="r"));
  const transitions=elementRefs(a,e=>e.o.some(op=>op[0]==="w")&&e.o.some(op=>op[0]==="r"));
  const checker=elementRefs(a,e=>e.o.some(op=>op[1]==="01"||op[1]==="10"));
  const repeated=elementRefs(a,e=>compressedOps(e.o).some(g=>g.kind==="r"&&g.count>=4));
  const descriptions={
    SAF:{fault:"記憶單元永久固定在 0 或 1；不論寫入什麼資料，cell 都無法離開固定值。",detect:"分別寫入全 0 與全 1後讀回；固定值與 expected data 不同時，comparator 會產生 mismatch。",refs:transitions.slice(0,4)},
    TF:{fault:"記憶單元有一個轉換方向失效，例如無法由 0→1 或無法由 1→0。",detect:"強制執行 00→11 與 11→00，再緊接著讀回；未完成轉換的 cell 會被抓到。",refs:transitions.slice(0,5)},
    RDF:{fault:"Read destructive fault：讀取動作本身破壞 cell 內容，使儲存值在 read 後翻轉。",detect:"對同一背景進行 read 與後續 read 比較；若第一次讀取破壞資料，當次或下一次讀取會出現 mismatch。",refs:allReads.slice(0,6)},
    IRF:{fault:"Cell 內部資料仍然正確，但 sense／read path 回傳錯誤值；讀取不一定會改變儲存狀態。",detect:"每次 read 都和 expected pattern 比較，感測值錯誤時 comparator 立即將 fail 拉高。",refs:allReads.slice(0,6)},
    CFwd:{fault:"Write-disturb coupling fault：寫入 aggressor bit 時產生擾動，造成同一 word 或鄰近的 victim bit 改變。",detect:"使用 01／10 checkerboard 讓 aggressor 與 victim 交替切換，再讀回確認 victim 沒有被寫入動作干擾。",refs:checker},
    dIRF:{fault:"單次 read 可能正常，但連續多次讀取同一位址後才回傳錯誤值，因此稱為 dynamic IRF。",detect:"寫入後對相同 address 連續讀取 4 次，觸發並觀察需要多次 read 才出現的錯誤。",refs:repeated},
    RTF:{fault:"Retention fault：cell 在沒有 read／write 的期間，因保持能力不足而隨時間遺失資料。",detect:"目前純數位 sequence 沒有加入 retention 等待時間或 weak-current／burn-in 控制，因此不計入 coverage。",refs:[]},
    TRDF:{fault:"Transient read disturb fault：讀取期間出現暫態擾動，使 cell 或 sensing 結果偶發翻轉，錯誤不一定能重現。",detect:"目前沒有 sense-current monitor 或可保證重現暫態事件的方法，因此純數位 March sequence 不宣稱涵蓋。",refs:[]},
    TWF:{fault:"Transient write fault：某次寫入偶發未完成目標磁化切換，但再次寫入相同資料可能成功。",detect:"故障具有隨機性；目前 survey 沒有有限次純數位 March sequence 能保證觸發，因此維持未涵蓋。",refs:[]}
  };
  return descriptions[f.id];
}

function renderSequence(c,a){
  $("sequenceTotal").innerHTML=`<span>實際執行</span><strong>${a.count}N</strong><small>${(a.count*c.depth).toLocaleString()} ops @ depth ${c.depth}</small>`;
  const formula=a.elements.map((e,i)=>{
    const dir=e.d?"↓":"↑";
    const ops=compressedOps(e.o).map(g=>`${g.kind}${g.pattern}${g.count>1?`×${g.count}`:""}`).join(", ");
    return `<span><b>M${i}</b> ${dir} (${ops})</span>`;
  });
  $("sequenceFormula").innerHTML=formula.join('<i>;</i>');
  $("sequenceTimeline").innerHTML=a.elements.map((e,i)=>{
    const dir=e.d?"↓":"↑",range=e.d?"DEPTH−1 → 0":"0 → DEPTH−1";
    const ops=compressedOps(e.o).map(g=>`<span class="op ${g.kind==="r"?"read":"write"}"><b>${g.kind.toUpperCase()}</b>${g.pattern}${g.count>1?`<sup>×${g.count}</sup>`:""}</span>`).join('<i>→</i>');
    return `<article class="sequence-element"><header><span>M${i}</span><strong>${dir}</strong><small>${range}</small></header><div class="op-flow">${ops}</div></article>`;
  }).join("");
  const covered=new Set(a.faults);
  const faultEntries=faultUniverse.map(f=>{
    const detail=faultExplanation(f,a),hit=covered.has(f.id);
    const html=`<article class="detect-row ${hit?"hit":"miss"}"><div><strong>${f.id}</strong><span>${hit?"DETECTED":"NOT COVERED"}</span></div><p class="fault-definition"><b>Fault 說明</b>${detail.fault}</p><p class="detect-method"><b>偵測方式</b>${detail.detect}</p><small>${detail.refs.length?`Sequence evidence: ${detail.refs.join(" · ")}`:"目前沒有對應的純數位 sequence"}</small></article>`;
    return {id:f.id,name:f.name,hit,html};
  });
  faultCardHtmlById=Object.fromEntries(faultEntries.map(x=>[x.id,x.html]));
  $("faultNameGrid").innerHTML=faultEntries.map(x=>`<button type="button" class="fault-name-btn ${x.hit?"hit":"miss"}${selectedFaultId===x.id?" active":""}" data-fault="${x.id}" aria-expanded="${selectedFaultId===x.id}"><strong>${x.id}</strong><span>${x.name}</span><i>${x.hit?"已涵蓋":"未涵蓋"}</i></button>`).join("");
  $("faultDialogMap").innerHTML=faultEntries.map(x=>x.html).join("");
  renderSelectedFault();
}
function renderSelectedFault(){const detail=$("faultSingleDetail");if(!selectedFaultId||!faultCardHtmlById[selectedFaultId]){detail.hidden=true;detail.innerHTML=""}else{detail.hidden=false;detail.innerHTML=faultCardHtmlById[selectedFaultId]}document.querySelectorAll(".fault-name-btn").forEach(btn=>{const active=btn.dataset.fault===selectedFaultId;btn.classList.toggle("active",active);btn.setAttribute("aria-expanded",String(active))})}
function showFile(key){activeFile=key;document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.file===key));const f=files[key];if(!f)return;$("codeOutput").textContent=f.text;$("fileLabel").textContent=key==="guide"?"Integration notes":(key==="tb"?"Verilog-2001 · Simulation":"Verilog-2001 · Synthesizable")}
function download(name,text){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:"text/plain"}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
ids.forEach(id=>$(id).addEventListener("input",render));
$("generateBtn").onclick=render;$("resetBtn").onclick=()=>{Object.entries(defaults).forEach(([k,v])=>{const e=$(k);if(e)e.type==="checkbox"?e.checked=v:e.value=v});render()};
document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>showFile(t.dataset.file));
function setCodeCollapsed(collapsed){
  $("verilogContent").hidden=collapsed;
  $("codeExport").classList.toggle("collapsed",collapsed);
  $("codeCollapseBtn").textContent=collapsed?"展開":"收合";
  $("codeCollapseBtn").setAttribute("aria-expanded",String(!collapsed));
  localStorage.setItem("sttmram-verilog-collapsed",collapsed?"1":"0");
}
$("codeCollapseBtn").onclick=()=>setCodeCollapsed(!$("verilogContent").hidden);
setCodeCollapsed(localStorage.getItem("sttmram-verilog-collapsed")==="1");
$("copyBtn").onclick=async()=>{await navigator.clipboard.writeText(files[activeFile].text);$("copyBtn").textContent="已複製";setTimeout(()=>$("copyBtn").textContent="複製",1200)};
$("downloadBtn").onclick=()=>download(files[activeFile].name,files[activeFile].text);
$("downloadAllBtn").onclick=()=>Object.values(files).forEach((f,i)=>setTimeout(()=>download(f.name,f.text),i*180));
$("coverageCsvBtn").onclick=()=>download("sttmram_fault_coverage.csv",faultCoverageCsv());
$("simulationRunBtn").onclick=runLocalSimulation;
$("synthSearchBtn").onclick=runSynthesis;
$("bistBrowserSearchBtn").onclick=runBistBrowserSearch;
[$("bistBrowserBudget"),$("bistBrowserAttempts"),$("bistBrowserRelation")].forEach(control=>control.addEventListener("change",()=>{saveBistBrowserSettings();updateBistBrowserLimit();setBistBrowserStatus("設定已更新；請重新搜尋最佳 March") }));
$("synthesisResults").onclick=e=>{const button=e.target.closest("button[data-use-candidate]");if(button)useSynthesisCandidate(Number(button.dataset.useCandidate))};
function markSimulationStale(){if(!simulationResult)return;$("simulationMessage").textContent="模擬設定已變更；請重新執行本機計算。";$("simulationMessage").className="simulation-message warn"}
$("descriptorGrid").onchange=e=>{const input=e.target.closest("input[data-descriptor-id]");if(!input)return;input.checked?selectedDescriptorIds.add(input.dataset.descriptorId):selectedDescriptorIds.delete(input.dataset.descriptorId);markSimulationStale();render()};
$("descriptorGrid").onclick=e=>{const button=e.target.closest("button[data-priority-move]");if(!button)return;const index=faultPriority.indexOf(button.dataset.priorityId),next=button.dataset.priorityMove==="up"?index-1:index+1;if(index<0||next<0||next>=faultPriority.length)return;[faultPriority[index],faultPriority[next]]=[faultPriority[next],faultPriority[index]];renderDescriptorGrid();markSimulationStale();render()};
$("couplingRelation").onchange=markSimulationStale;
$("maxInstances").oninput=markSimulationStale;
$("loadLatestBtn").onclick=async()=>{try{const response=await fetch("/api/results/latest",{cache:"no-store"});const data=await response.json();if(!data.result)throw new Error("沒有保存的結果");data.result._configKey=activeFaultCoverageKey;renderSimulationResult(data.result)}catch(error){$("simulationMessage").textContent=`無法載入：${error.message}`;$("simulationMessage").className="simulation-message error"}};
const descriptorTemplate={id:"CUSTOM_TF",name:"Custom transition fault",description:"Example descriptor",roles:["VTM"],relation:"single",supported:true,variants:[{id:"CUSTOM_0to1",trigger:{target:"VTM",operation:"write",transition:"0->1"},effect:{target:"VTM",state:"hold"}}]};
$("descriptorTemplateBtn").onclick=()=>{$("descriptorJson").value=JSON.stringify(descriptorTemplate,null,2)};
$("descriptorSaveBtn").onclick=async()=>{const status=$("descriptorSaveStatus");try{const descriptor=JSON.parse($("descriptorJson").value);const response=await fetch("/api/descriptors",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({descriptor})});const data=await response.json();if(!response.ok)throw new Error(data.error||"儲存失敗");status.textContent=`已儲存 ${descriptor.id}`;await connectLocalEngine()}catch(error){status.textContent=`錯誤：${error.message}`}};
$("faultNameGrid").onclick=e=>{const btn=e.target.closest(".fault-name-btn");if(!btn)return;selectedFaultId=selectedFaultId===btn.dataset.fault?null:btn.dataset.fault;renderSelectedFault()};
$("faultExpandBtn").onclick=()=>$("faultDialog").showModal();
$("faultCloseBtn").onclick=()=>$("faultDialog").close();
$("faultDialog").onclick=e=>{if(e.target===$("faultDialog"))$("faultDialog").close()};
try{const saved=JSON.parse(localStorage.getItem("sttmram-bist-config"));if(saved)Object.entries(saved).forEach(([k,v])=>{const e=$(k);if(e)e.type==="checkbox"?e.checked=v:e.value=v})}catch{}
if(customMarch&&localStorage.getItem("sttmram-custom-march-enabled")==="true")$("enableCustomMarch").checked=true;
loadBistBrowserSettings();renderBistBrowserPriority();render();
