"use strict";

const assert=require("node:assert/strict");
const engine=require("./fault-engine.js");

const d1=engine.synthesize({maxN:1,frontierLimit:20,faults:["dIRF"]});
assert.equal(d1.schema,"sttmram-tags-synthesis/v3");
assert.equal(d1.method,"Fault-Descriptor Progress TAGS");
assert.equal(d1.candidates[0].coverages.dIRF,0);
assert.ok((d1.candidates[0].stateCounts.dIRF.SETUP||0)>0,"1N write must be retained as dIRF setup");

const d4=engine.synthesize({maxN:4,frontierLimit:30,faults:["dIRF"]});
assert.equal(d4.candidates[0].coverages.dIRF,0);
assert.ok((d4.candidates[0].stateCounts.dIRF.PROGRESS||0)>0,"partial repeated reads must survive pruning");
assert.ok(d4.candidates[0].descriptorProgress.dIRF>d1.candidates[0].descriptorProgress.dIRF);

const tf=engine.simulate({
  memory:{depth:4,dataWidth:2},faults:["TF"],maxInstances:1000,
  sequence:[{direction:"up",operations:[{kind:"w",pattern:"0"},{kind:"w",pattern:"1"},{kind:"r",pattern:"1"},{kind:"w",pattern:"0"},{kind:"r",pattern:"0"}]}]
});
assert.equal(tf.models[0].coverage,100);

console.log("fault-engine descriptor-progress tests passed");
