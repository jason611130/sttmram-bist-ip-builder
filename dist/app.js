const $ = (id) => document.getElementById(id);
const ids = ["depth","dataWidth","addrWidth","autoAddr","algoWom26","algoDirf14","algoMarchC","algoMarchCM","paperLiteral","optimizeSequence","readLatency","writeLatency","useReady"];
const defaults = {depth:256,dataWidth:32,addrWidth:8,autoAddr:true,algoWom26:true,algoDirf14:false,algoMarchC:false,algoMarchCM:false,paperLiteral:false,optimizeSequence:true,readLatency:1,writeLatency:1,useReady:false};
let files = {}, activeFile = "core", selectedFaultId = null, faultCardHtmlById = {};
let activeFaultCoverageKey = "", activeFaultCoverageLabel = "";
let faultDescriptors = [], selectedDescriptorIds = new Set(), simulationResult = null, engineOnline = false;

const faultUniverse = [
  {id:"SAF",name:"Stuck-at fault",type:"永久"},
  {id:"TF",name:"Transition fault",type:"永久"},
  {id:"RDF",name:"Read destructive fault",type:"永久"},
  {id:"IRF",name:"Incorrect read fault",type:"永久"},
  {id:"CFwd",name:"Write-disturb coupling",type:"永久"},
  {id:"dIRF",name:"Dynamic incorrect read",type:"動態"},
  {id:"RTF",name:"Retention fault",type:"暫態"},
  {id:"TRDF",name:"Transient read disturb",type:"暫態"},
  {id:"TWF",name:"Transient write fault",type:"暫態"}
];

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

function selectedAlgorithms(c){
  const list=[];
  if(c.algoWom26) list.push({id:"wom26",name:c.paperLiteral?"WOM 26N（論文原文）":"WOM 26N（狀態一致版）",short:"WOM 26N",count:26,faults:["SAF","TF","RDF","IRF","CFwd"],deterministic:true,kind:"digital",elements:womElements(c)});
  if(c.algoDirf14) list.push({id:"dirf14",name:"dIRF March 14N",short:"dIRF 14N",count:14,faults:["dIRF"],deterministic:true,kind:"digital",elements:[
    {d:0,o:[["w","0"]]},{d:0,o:[["r","0"],["w","1"],["r","1"],["r","1"],["r","1"],["r","1"]]},
    {d:1,o:[["r","1"],["w","0"],["r","0"],["r","0"],["r","0"],["r","0"]]},{d:1,o:[["r","0"]]}
  ]});
  if(c.algoMarchC) list.push({id:"marchc",name:"March C− 10N",short:"March C−",count:10,faults:["SAF","TF"],deterministic:true,kind:"digital",elements:[
    {d:0,o:[["w","0"]]},{d:0,o:[["r","0"],["w","1"]]},{d:0,o:[["r","1"],["w","0"]]},
    {d:1,o:[["r","0"],["w","1"]]},{d:1,o:[["r","1"],["w","0"]]},{d:0,o:[["r","0"]]}
  ]});
  if(c.algoMarchCM) list.push({id:"marchcm",name:"March CM 7N",short:"March CM",count:7,faults:["SAF","TF","IRF"],deterministic:true,kind:"digital",elements:[
    {d:0,o:[["w","1"],["w","0"],["r","0"],["w","1"],["w","1"],["r","1"],["r","1"]]}
  ]});
  return list;
}

function fuseWomDirf(wom){
  const elements=wom.elements.map(e=>({d:e.d,o:e.o.map(op=>[...op])}));
  // WOM already performs one read after each transition. Three repeated reads
  // complete the four-read dIRF sensitization at the same address.
  elements[1].o.push(["r","11"],["r","11"],["r","11"]);
  elements[2].o.push(["r","00"],["r","00"],["r","00"]);
  return {...wom,name:"WOM 26N + fused dIRF 6N",short:"WOM+dIRF fused",count:32,elements};
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
      executed.unshift(fuseWomDirf(wom));
      rules.push("WOM 的 write→read 已建立 dIRF 狀態；每個方向只補 3 次連續讀取（+6N），取代完整 14N。");
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
  return JSON.stringify({methods:a.methods.map(m=>m.id).sort(),optimized:c.optimizeSequence,paperLiteral:c.paperLiteral,depth:c.depth,dataWidth:c.dataWidth,addrWidth:c.addrWidth});
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
}

function renderDescriptorGrid(){
  $("descriptorGrid").innerHTML=faultDescriptors.map(d=>{
    const checked=selectedDescriptorIds.has(d.id), supported=d.supported!==false;
    return `<details class="descriptor-card ${supported?"supported":"unsupported"}"><summary><label><input type="checkbox" data-descriptor-id="${escapeHtml(d.id)}" ${checked?"checked":""}><span><strong>${escapeHtml(d.id)}</strong><small>${escapeHtml(d.name)}</small></span></label><i>${supported?d.relation:"N/A"}</i></summary><p>${escapeHtml(d.description||"")}</p><dl><div><dt>Roles</dt><dd>${escapeHtml((d.roles||[]).join(" · "))}</dd></div><div><dt>Variants</dt><dd>${d.variants?.length||0}</dd></div></dl><pre>${escapeHtml(JSON.stringify(d,null,2))}</pre></details>`;
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
    faultDescriptors=data.descriptors||[];
    selectedDescriptorIds=new Set(faultDescriptors.map(d=>d.id));
    engineOnline=true;
    $("engineDot").classList.add("online");
    $("engineStatus").textContent="本機 Fault Engine 已連線";
    $("engineHint").textContent=`${faultDescriptors.length} 個 descriptors 可用`;
    $("simulationRunBtn").disabled=false;
    renderDescriptorGrid();renderEmptySimulation();
  }catch{
    engineOnline=false;
    $("engineStatus").textContent="本機 Fault Engine 未連線";
    $("engineHint").textContent="執行 python local_engine/server.py，再重新整理此頁";
    $("simulationRunBtn").disabled=true;
    renderEmptySimulation();
  }
}

async function runLocalSimulation(){
  const c=readConfig(),a=algorithm(c),errors=validate(c);
  if(errors.length){$("simulationMessage").textContent=errors[0];$("simulationMessage").className="simulation-message error";return}
  if(!selectedDescriptorIds.size){$("simulationMessage").textContent="請至少選擇一個 Fault Descriptor。";$("simulationMessage").className="simulation-message error";return}
  const button=$("simulationRunBtn");button.disabled=true;button.textContent="本機計算中…";
  $("simulationMessage").textContent="正在產生 instances 並逐一比較 golden / faulty output…";$("simulationMessage").className="simulation-message running";
  const payload={memory:{depth:c.depth,dataWidth:c.dataWidth},algorithm:a.name,operationComplexity:`${a.count}N`,faults:[...selectedDescriptorIds],couplingRelation:$("couplingRelation").value,maxInstances:Number($("maxInstances").value),sequence:a.elements.map(e=>({direction:e.d?"down":"up",operations:e.o.map(op=>({kind:op[0],pattern:op[1]}))}))};
  try{
    const response=await fetch("/api/simulate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||"Simulation failed");
    result._configKey=activeFaultCoverageKey;renderSimulationResult(result);
  }catch(error){$("simulationMessage").textContent=`模擬失敗：${error.message}`;$("simulationMessage").className="simulation-message error"}
  finally{button.disabled=!engineOnline;button.textContent="開始本機模擬"}
}

function render(){
  const c=readConfig(),a=algorithm(c),errors=validate(c);
  $("addrWidth").disabled=c.autoAddr;
  $("paperLiteral").disabled=!c.algoWom26;
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
function markSimulationStale(){if(!simulationResult)return;$("simulationMessage").textContent="模擬設定已變更；請重新執行本機計算。";$("simulationMessage").className="simulation-message warn"}
$("descriptorGrid").onchange=e=>{const input=e.target.closest("input[data-descriptor-id]");if(!input)return;input.checked?selectedDescriptorIds.add(input.dataset.descriptorId):selectedDescriptorIds.delete(input.dataset.descriptorId);markSimulationStale()};
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
render();
connectLocalEngine();
