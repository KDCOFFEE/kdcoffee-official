// Explicitly isolated QA reset only. Never use on real member storage.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {createHash} from "node:crypto";
import {atomicWriteJson,withFileLock} from "../lib/jsonFileStore";
import {validateMembershipCommerceState,type MembershipCommerceState} from "../lib/membershipCommerce";
const session=JSON.parse(await fs.readFile("qa-output/j6f2c-owner-session.json","utf8"));
const root=path.resolve(session.qaRoot);assert.ok(root.startsWith(path.resolve(os.tmpdir())+path.sep+"kd-j6f2c-owner-"));assert.equal(session.url,"http://localhost:"+Number(process.env.RETURN_REFUND_QA_PORT||3162));
const orderId=session.cases[3].orderNumber;assert.equal(orderId,"KD20261030-9304");const file=path.join(root,"membership-commerce/commerce-state.json");
const digest=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
await withFileLock(file,async()=>{const state:MembershipCommerceState=JSON.parse(await fs.readFile(file,"utf8"));validateMembershipCommerceState(state);
 const events=(state.returnEvents??[]).filter(e=>e.orderId===orderId);assert.ok(events.every(e=>e.type==="RETURN_REQUESTED"||e.type==="RETURN_WITHDRAWN"));assert.ok(!(state.returnSettlementEvents??[]).some(e=>e.plan?.orderId===orderId));
 const ids=new Set(events.map(e=>e.eventId)),keys=new Set(events.map(e=>e.idempotencyKey));const {returnEvents,idempotency,revision,updatedAt,...other}=state;void revision;void updatedAt;
 const before=digest(other),otherEvents=(returnEvents??[]).filter(e=>e.orderId!==orderId),otherKeys=Object.fromEntries(Object.entries(idempotency).filter(([key,value])=>!keys.has(key)&&!ids.has(value.resultId)));
 state.returnEvents=otherEvents;state.idempotency=otherKeys;state.revision++;state.updatedAt=new Date().toISOString();validateMembershipCommerceState(state);
 const {returnEvents:afterEvents,idempotency:afterKeys,revision:afterRevision,updatedAt:afterTime,...after}=state;void afterRevision;void afterTime;assert.equal(digest(after),before);assert.deepEqual(afterEvents,otherEvents);assert.deepEqual(afterKeys,otherKeys);
 await atomicWriteJson(file,state);console.log("Isolated Case D reset PASS; other state and settlement evidence unchanged; source order remains completed.");});
