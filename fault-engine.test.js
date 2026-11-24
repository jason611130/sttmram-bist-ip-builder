"use strict";

const assert=require("node:assert/strict");
const engine=require("./fault-engine.js");

assert.deepEqual(engine.descriptors.map(descriptor=>descriptor.id),[
  "SAF","TF","RDF","CFwd","WDF","IRF","DRF","dIRF","dRDF","dTF","RTF","TRDF","TWF","SWF"
]);

const grouped=engine.groupMarchElements([
  {direction:"up",operations:[{kind:"w",pattern:"0"}]},
  {direction:"up",operations:[{kind:"r",pattern:"0"},{kind:"w",pattern:"1"}]},
  {direction:"down",operations:[{kind:"r",pattern:"1"}]}
]);
assert.equal(grouped.length,3);
assert.deepEqual(grouped[0],{direction:"up",operations:[{kind:"w",pattern:"0"}]});
assert.deepEqual(grouped[1],{direction:"up",operations:[{kind:"r",pattern:"0"},{kind:"w",pattern:"1"}]});
assert.equal(grouped[2].direction,"down");

const d1=engine.synthesize({maxN:1,frontierLimit:20,faults:["dIRF"]});
assert.equal(d1.schema,"sttmram-tags-synthesis/v5");
assert.equal(d1.method,"Hybrid Coverage-Descriptor TAGS");
assert.equal(d1.candidates[0].coverages.dIRF,0);
assert.ok((d1.candidates[0].stateCounts.dIRF.SETUP||0)>0,"1N write must be retained as dIRF setup");

const d4=engine.synthesize({maxN:4,frontierLimit:30,faults:["dIRF"]});
assert.equal(d4.candidates[0].coverages.dIRF,0);
assert.ok((d4.candidates[0].stateCounts.dIRF.PROGRESS||0)>0,"partial repeated reads must survive pruning");
assert.ok(d4.candidates[0].descriptorProgress.dIRF>d1.candidates[0].descriptorProgress.dIRF);
assert.ok(d4.history.some(level=>Number(level.descriptorContributed)>0),"descriptor contribution must preserve zero-coverage dynamic-fault paths");

const d5Priority=engine.synthesize({maxN:5,frontierLimit:60,faults:["dIRF","SAF","TF"]});
assert.equal(d5Priority.candidates[0].coverages.dIRF,50,"top-priority dIRF must be detected before lower-priority faults drive the search");
assert.equal(d5Priority.history[0].activeFault,"dIRF");

const dSameElement=engine.simulate({
  memory:{depth:4,dataWidth:2},faults:["dIRF"],maxInstances:1000,
  sequence:[{direction:"up",operations:[{kind:"w",pattern:"0"},{kind:"r",pattern:"0"},{kind:"r",pattern:"0"},{kind:"r",pattern:"0"},{kind:"r",pattern:"0"}]}]
});
assert.equal(dSameElement.models[0].coverage,50);

const dAcrossElements=engine.simulate({
  memory:{depth:4,dataWidth:2},faults:["dIRF"],maxInstances:1000,
  sequence:[
    {direction:"up",operations:[{kind:"w",pattern:"0"},{kind:"r",pattern:"0"}]},
    {direction:"up",operations:[{kind:"r",pattern:"0"}]},
    {direction:"up",operations:[{kind:"r",pattern:"0"}]},
    {direction:"up",operations:[{kind:"r",pattern:"0"}]}
  ]
});
assert.equal(dAcrossElements.models[0].coverage,0,"reads separated by full-memory March passes are not consecutive accesses to one cell");

const editableDirf={dIRF:{supported:true,ramsesVariants:[
  {id:"editable-dIRF0",suspect:"@",agr:[{flag:"R0",repeat:4}],vtm:[{flag:"R0",repeat:1}],rcv:[{flag:"W0",repeat:1},{flag:"W1",repeat:1}]}
]}};
const editableDirfResult=engine.simulate({
  memory:{depth:4,dataWidth:2},faults:["dIRF"],maxInstances:1000,descriptorOverrides:editableDirf,
  sequence:[{direction:"up",operations:[{kind:"w",pattern:"0"},{kind:"r",pattern:"0"},{kind:"r",pattern:"0"},{kind:"r",pattern:"0"},{kind:"r",pattern:"0"}]}]
});
assert.equal(editableDirfResult.models[0].coverage,100,"editable RAMSES descriptor must drive simulation");
assert.match(editableDirfResult.models[0].first_detection.instance,/editable-dIRF0/);

const editableRdf={RDF:{supported:true,ramsesVariants:[
  {id:"editable-RDF0",suspect:"@",agr:[{flag:"R0",repeat:1,timing:"any"}],vtm:[{flag:"R0",repeat:1,timing:"next"}],rcv:[{flag:"W0",repeat:1},{flag:"W1",repeat:1}]}
]}};
const rdfOneRead=engine.simulate({
  memory:{depth:4,dataWidth:2},faults:["RDF"],maxInstances:1000,descriptorOverrides:editableRdf,
  sequence:[{direction:"up",operations:[{kind:"w",pattern:"0"},{kind:"r",pattern:"0"}]}]
});
assert.equal(rdfOneRead.models[0].coverage,0,"RDF activation read must not also be its VTM read");
const rdfTwoReads=engine.simulate({
  memory:{depth:4,dataWidth:2},faults:["RDF"],maxInstances:1000,descriptorOverrides:editableRdf,
  sequence:[{direction:"up",operations:[{kind:"w",pattern:"0"},{kind:"r",pattern:"0"},{kind:"r",pattern:"0"}]}]
});
assert.equal(rdfTwoReads.models[0].coverage,100,"RDF must be detected by the next matching read");

const editableSaf={SAF:{supported:true,ramsesVariants:[
  {id:"editable-SA0",suspect:"@",agr:[{flag:"W1",repeat:1}],vtm:[{flag:"R1",repeat:1}],rcv:[{flag:"W0",repeat:1}]}
]}};
const safRecovered=engine.simulate({
  memory:{depth:4,dataWidth:2},faults:["SAF"],maxInstances:1000,descriptorOverrides:editableSaf,
  sequence:[{direction:"up",operations:[{kind:"w",pattern:"1"},{kind:"w",pattern:"0"},{kind:"r",pattern:"1"}]}]
});
assert.equal(safRecovered.models[0].coverage,0,"SA0 W0 recovery must clear the pending fault effect");

const tf=engine.simulate({
  memory:{depth:4,dataWidth:2},faults:["TF"],maxInstances:1000,
  sequence:[{direction:"up",operations:[{kind:"w",pattern:"0"},{kind:"w",pattern:"1"},{kind:"r",pattern:"1"},{kind:"w",pattern:"0"},{kind:"r",pattern:"0"}]}]
});
assert.equal(tf.models[0].coverage,100);

const staticReadFaults=engine.simulate({
  memory:{depth:4,dataWidth:2},faults:["RDF","DRF"],maxInstances:1000,
  sequence:[{direction:"up",operations:[{kind:"w",pattern:"0"},{kind:"r",pattern:"0"},{kind:"r",pattern:"0"},{kind:"w",pattern:"1"},{kind:"r",pattern:"1"},{kind:"r",pattern:"1"}]}]
});
assert.equal(staticReadFaults.models.find(model=>model.id==="RDF").coverage,100);
assert.equal(staticReadFaults.models.find(model=>model.id==="DRF").coverage,100);
const builtInRdfOneRead=engine.simulate({
  memory:{depth:4,dataWidth:2},faults:["RDF"],maxInstances:1000,
  sequence:[{direction:"up",operations:[{kind:"w",pattern:"0"},{kind:"r",pattern:"0"}]}]
});
assert.equal(builtInRdfOneRead.models[0].coverage,0,"built-in RDF requires a later observation read");

const wdf=engine.simulate({
  memory:{depth:4,dataWidth:2},faults:["WDF"],maxInstances:1000,
  sequence:[{direction:"up",operations:[{kind:"w",pattern:"0"},{kind:"r",pattern:"0"},{kind:"w",pattern:"1"},{kind:"w",pattern:"1"},{kind:"r",pattern:"1"}]}]
});
assert.equal(wdf.models[0].coverage,100);

const swfWithoutTimedWrite=engine.simulate({
  memory:{depth:4,dataWidth:2},faults:["SWF"],maxInstances:1000,
  sequence:[{direction:"up",operations:[{kind:"w",pattern:"0"},{kind:"w",pattern:"1"},{kind:"r",pattern:"1"}]}]
});
assert.equal(swfWithoutTimedWrite.models[0].status,"not-applicable");
assert.equal(swfWithoutTimedWrite.models[0].coverage,null);

const swfWithTimedWrite=engine.simulate({
  memory:{depth:4,dataWidth:2},faults:["SWF"],maxInstances:1000,
  sequence:[{direction:"up",operations:[{kind:"w",pattern:"0"},{kind:"ws",pattern:"1"},{kind:"r",pattern:"1"},{kind:"ws",pattern:"0"},{kind:"r",pattern:"0"}]}]
});
assert.equal(swfWithTimedWrite.models[0].coverage,100);

const dynamicReadAndTransition=engine.simulate({
  memory:{depth:4,dataWidth:2},faults:["dRDF","dTF"],maxInstances:1000,
  sequence:[{direction:"up",operations:[{kind:"w",pattern:"0"},{kind:"r",pattern:"0"},{kind:"r",pattern:"0"},{kind:"w",pattern:"1"},{kind:"r",pattern:"1"},{kind:"r",pattern:"1"},{kind:"w",pattern:"0"},{kind:"r",pattern:"0"}]}]
});
assert.equal(dynamicReadAndTransition.models.find(model=>model.id==="dRDF").coverage,100);
assert.equal(dynamicReadAndTransition.models.find(model=>model.id==="dTF").coverage,100);

const dynamicAcrossElements=engine.simulate({
  memory:{depth:4,dataWidth:2},faults:["dRDF","dTF"],maxInstances:1000,
  sequence:[
    {direction:"up",operations:[{kind:"w",pattern:"0"},{kind:"r",pattern:"0"}]},
    {direction:"up",operations:[{kind:"w",pattern:"1"},{kind:"r",pattern:"1"}]}
  ]
});
assert.equal(dynamicAcrossElements.models.find(model=>model.id==="dRDF").coverage,0);
assert.equal(dynamicAcrossElements.models.find(model=>model.id==="dTF").coverage,0);

const fixedAnalysis=engine.analyze({
  name:"March C− 10N",faults:["SAF","TF"],
  sequence:[
    {direction:"up",operations:[{kind:"w",pattern:"0"}]},
    {direction:"up",operations:[{kind:"r",pattern:"0"},{kind:"w",pattern:"1"}]},
    {direction:"up",operations:[{kind:"r",pattern:"1"},{kind:"w",pattern:"0"}]},
    {direction:"down",operations:[{kind:"r",pattern:"0"},{kind:"w",pattern:"1"}]},
    {direction:"down",operations:[{kind:"r",pattern:"1"},{kind:"w",pattern:"0"}]},
    {direction:"up",operations:[{kind:"r",pattern:"0"}]}
  ]
});
assert.equal(fixedAnalysis.schema,"sttmram-tags-analysis/v1");
assert.equal(fixedAnalysis.candidate.usedN,10);
assert.equal(fixedAnalysis.candidate.coverages.SAF,100);
assert.equal(fixedAnalysis.candidate.coverages.TF,100);

const optimized=engine.optimize({faults:["SAF","TF"],sequence:[{direction:"up",operations:[
  {kind:"w",pattern:"0"},{kind:"r",pattern:"0"},{kind:"w",pattern:"0"},{kind:"r",pattern:"0"},
  {kind:"w",pattern:"1"},{kind:"r",pattern:"1"},{kind:"w",pattern:"1"},{kind:"r",pattern:"1"}
]}]});
assert.equal(optimized.schema,"sttmram-tags-optimization/v1");
assert.ok(optimized.usedN<optimized.originalN);
assert.equal(optimized.candidate.coverages.SAF,100);
assert.equal(optimized.candidate.coverages.TF,50);

const rtfWithoutIdle=engine.simulate({
  memory:{depth:4,dataWidth:2},faults:["RTF"],maxInstances:1000,
  sequence:[{direction:"up",operations:[{kind:"w",pattern:"0"},{kind:"r",pattern:"0"}]}]
});
assert.equal(rtfWithoutIdle.models[0].status,"not-applicable");
assert.equal(rtfWithoutIdle.models[0].coverage,null);
assert.equal(rtfWithoutIdle.summary.injected,0);

const rtfWithIdle=engine.simulate({
  memory:{depth:4,dataWidth:2},faults:["RTF"],maxInstances:1000,
  sequence:[{direction:"up",operations:[{kind:"w",pattern:"0"},{kind:"idle",pattern:"0"},{kind:"r",pattern:"0"},{kind:"w",pattern:"1"},{kind:"idle",pattern:"1"},{kind:"r",pattern:"1"}]}]
});
assert.equal(rtfWithIdle.models[0].coverage,100);

console.log("fault-engine descriptor-progress tests passed");
