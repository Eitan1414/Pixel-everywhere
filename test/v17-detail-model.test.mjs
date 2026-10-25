import test from "node:test";
import assert from "node:assert/strict";
import {canManageAccount,reportChoices,reportPending} from "../web/v17-detail-model.js";
test("self and owner are protected",()=>{
  assert.equal(canManageAccount({id:5},5),false);
  assert.equal(canManageAccount({id:6,isOwnerAdmin:true},5),false);
  assert.equal(canManageAccount({id:7,isOwnerAdmin:false},5),true);
});
test("only actionable report types are offered",()=>{
  assert.deepEqual(reportChoices("unknown"),[]);
  assert.equal(reportPending({alert_type:"bug_report",resolved:0}),true);
  assert.equal(reportPending({alert_type:"bug_report",resolved:1}),false);
  assert.equal(reportPending({alert_type:"xp_conversion",resolved:0}),true);
});
test("consequences are explicit",()=>{
  assert.match(reportChoices("bug_report")[0].message,/50 pièces/);
  assert.match(reportChoices("xp_conversion")[1].message,/remboursées/);
});
