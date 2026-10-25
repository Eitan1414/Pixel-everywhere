import test from "node:test";
import assert from "node:assert/strict";
import { getV17StaffSections } from "../web/v17-admin-model.js";
const all=["applications","messages","publications","accounts","live-control","ratings"];
test("admin receives installed sections and distinct report/discussion views",()=>{
 assert.deepEqual(getV17StaffSections("admin",all).map(s=>s.id),["applications","reports","discussions","announcements","accounts","members","ratings"]);
});
test("moderator has no admin-only sections",()=>{
 const values=getV17StaffSections("moderator",all);
 assert.ok(values.some(s=>s.id==="reports"));
 assert.ok(!values.some(s=>s.id==="accounts"||s.id==="members"));
});
test("no staff access, no categories",()=>{
 assert.deepEqual(getV17StaffSections("guest",all),[]);
 assert.deepEqual(getV17StaffSections("moderator",[]),[]);
});
test("new plugin tabs are discovered when mounted",()=>{
 assert.deepEqual(getV17StaffSections("admin",["applications","suggestions"]).map(s=>s.id),["applications","suggestions"]);
});
