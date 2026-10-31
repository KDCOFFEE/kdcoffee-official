import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {spawn,spawnSync,execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {withReturnInventoryLocks,readReturnStockReceipts,type ReturnStockOperation} from "../lib/returnInventoryTransaction";
import {inventoryOperationKey} from "../lib/inventoryReceipts";
import {runInventoryOrderTransaction} from "../lib/orderInventoryTransaction";
import {readMembershipCommerceState} from "../lib/membershipCommerce";
const script=fileURLToPath(import.meta.url),loader=new URL("./return-workflow-test-bootstrap.mjs",import.meta.url).href;
const now=new Date("2026-10-30T03:00:00Z");
const operation=(id:string,quantity=3):ReturnStockOperation=>({operationId:"return-stock:"+id,transactionId:"source-hash",parentOperationId:"original-committed-hash",domain:"coffee",identity:"sku",productSlug:"original",quantity,originalQuantity:10,now});
async function apply(root:string,op:ReturnStockOperation,crash=false){process.env.KD_DATA_DIR=root;const file=path.join(root,"store/website-data.json");return withReturnInventoryLocks({scopeFile:path.join(root,"membership-commerce/.return-stock-locks",inventoryOperationKey(op.operationId)),stockFiles:[file]},async restore=>{const receipt=await restore(file,op);if(crash)process.exit(82);return receipt;});}
if(process.argv[2]?.startsWith("--worker")){await apply(process.argv[3],operation(process.argv[4],Number(process.argv[5])),process.argv[2]==="--worker-crash");}
else {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"kd-return-bridge-")),previous=process.env.KD_DATA_DIR;process.env.KD_DATA_DIR=root;delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
  let count=0;const check=async(name:string,fn:()=>unknown|Promise<unknown>)=>{await fn();console.log(`PASS ${++count} ${name}`);};
  const file=path.join(root,"store/website-data.json");await fs.mkdir(path.dirname(file),{recursive:true});
  await fs.writeFile(file,JSON.stringify({version:1,menu:{products:[{slug:"original",skus:[{id:"sku",stock:10,enabled:true}]}]}}));
  const read=async()=>JSON.parse(await fs.readFile(file,"utf8"));const stock=async()=>(await read()).menu.products[0].skus[0].stock;
  const child=(id:string,quantity:number)=>new Promise<void>((resolve,reject)=>{const proc=spawn(process.execPath,["--experimental-strip-types","--import",loader,script,"--worker",root,id,String(quantity)],{windowsHide:true,stdio:["ignore","pipe","pipe"]});let output="";proc.stdout.on("data",b=>output+=b);proc.stderr.on("data",b=>output+=b);proc.on("error",reject);proc.on("exit",code=>code===0?resolve():reject(Error(output)));});
  try {
    const original=await fs.readFile(file,"utf8");
    await check("legacy receipt collection defaults empty",async()=>assert.deepEqual(readReturnStockReceipts(await read()),{}));
    await check("read never backfills receipts or writes old state",async()=>assert.equal(await fs.readFile(file,"utf8"),original));
    const first=await apply(root,operation("first"));
    await check("first operation applies exact partial quantity 3",async()=>{assert.equal(await stock(),13);assert.equal(first.items[0].quantity,3);assert.equal(first.items[0].afterStock-first.items[0].beforeStock,3);});
    await check("stock and receipt persist together",async()=>assert.deepEqual(readReturnStockReceipts(await read())[inventoryOperationKey("return-stock:first")],first));
    const after=await fs.readFile(file,"utf8"),replay=await apply(root,operation("first"));
    await check("identical retry returns original receipt and adds zero",async()=>{assert.deepEqual(replay,first);assert.equal(await fs.readFile(file,"utf8"),after);});
    await assert.rejects(()=>apply(root,operation("first",4)));
    await check("same operationId with changed demand rejects without write",async()=>assert.equal(await fs.readFile(file,"utf8"),after));
    await Promise.all([child("concurrent",2),child("concurrent",2)]);
    await check("separate concurrent workers apply once",async()=>assert.equal(await stock(),15));
    await child("concurrent",2);
    await check("fresh process recognizes durable receipt",async()=>assert.equal(await stock(),15));
    await assert.rejects(()=>apply(root,operation("over-budget",6)));
    await check("cumulative approved restoration cannot exceed original demand",async()=>assert.equal(await stock(),15));
    const exited=spawnSync(process.execPath,["--experimental-strip-types","--import",loader,script,"--worker-crash",root,"crash","1"],{windowsHide:true,encoding:"utf8"});assert.equal(exited.status,82,exited.stderr);
    await check("hard crash after atomic mutation retains stock and receipt",async()=>{assert.equal(await stock(),16);assert.ok(readReturnStockReceipts(await read())[inventoryOperationKey("return-stock:crash")]);});
    // Explicit isolated fixture recovery only; Production's stale-lock policy is unchanged.
    async function clear(dir:string):Promise<void>{assert.ok(dir===root||dir.startsWith(root+path.sep));for(const entry of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,entry.name);if(entry.isDirectory())await clear(f);else if(entry.name.endsWith(".lock")){assert.equal(JSON.parse(await fs.readFile(f,"utf8")).pid,exited.pid);await fs.unlink(f);}}}
    await clear(root);await child("crash",1);
    await check("post-crash retry adds zero",async()=>assert.equal(await stock(),16));
    await check("malformed receipt cannot reset idempotency",async()=>assert.throws(()=>readReturnStockReceipts({returnSettlementReceipts:[]})));
    const commerceFile=path.join(root,"membership-commerce/commerce-state.json");await readMembershipCommerceState(commerceFile);
    await check("legacy commerce reads do not initialize or settle",async()=>assert.equal(await fs.stat(commerceFile).then(()=>true,()=>false),false));
    let leaked:((file:string,op:ReturnStockOperation)=>Promise<unknown>)|undefined;
    await withReturnInventoryLocks({scopeFile:path.join(root,"scope"),stockFiles:[file]},async restore=>{leaked=restore;});
    await check("receipt mutation cannot escape its lock scope",async()=>assert.throws(()=>leaked!(file,operation("escaped",1))));
    const website=JSON.parse(await fs.readFile("public/data/website-data.json","utf8"));const product=website.menu.products.find((p:{active?:boolean;purchasable?:boolean;status:string;skus?:Array<{enabled?:boolean}>})=>p.active!==false&&p.purchasable!==false&&p.status==="active"&&p.skus?.some(s=>s.enabled!==false));assert.ok(product);const sku=product.skus.find((s:{enabled?:boolean})=>s.enabled!==false);sku.stock=20;
    website.returnSettlementReceipts=(await read()).returnSettlementReceipts;await fs.writeFile(file,JSON.stringify(website));
    const result=await runInventoryOrderTransaction({websiteFile:file,orderDir:path.join(root,"orders"),initialOrderNumber:"KD20261030-80001",generateOrderNumber:()=>"KD20261030-80002",items:[{slug:product.slug,optionId:sku.id,optionLabel:sku.label,quantity:1,quotedUnitPrice:sku.price}],buildOrder:(orderNumber,priced)=>({order:{orderNumber,status:"waiting_studio_pickup_confirmation",...priced},lineText:"isolated"})});
    await check("actual Production order creation stays finalized",()=>assert.equal(result.finalized,true));
    await check("Production checkout preserves durable return receipts",async()=>assert.deepEqual((await read()).returnSettlementReceipts,website.returnSettlementReceipts));
    await check("Production inventory metadata remains unchanged in shape",()=>assert.match(String((result.order.inventoryTransaction as Record<string,unknown>).operationId),/^coffee-apply:/));
    const untouched=["lib/jsonFileStore.ts","lib/orderInventoryTransaction.ts","lib/orderIdempotency.ts","lib/orderCancellation.ts","app/api/orders/route.ts","lib/orderConfirmationEmail.ts","lib/internalLineNotifications.ts","lib/customerNotificationDelivery.ts","app/member/page.tsx","components/member/MemberCenterCopyProvider.tsx","proxy.ts"];
    await check("checkout/order numbers/global locks/email/LINE/Member/OAuth unchanged",()=>assert.equal(execFileSync("git",["diff","HEAD","--",...untouched],{encoding:"utf8"}),""));
    console.log(`RETURN TRANSACTION BRIDGE ${count}/${count} PASS; isolated data; external network disabled.`);
  }finally{if(previous===undefined)delete process.env.KD_DATA_DIR;else process.env.KD_DATA_DIR=previous;assert.ok(root.startsWith(path.join(os.tmpdir(),"kd-return-bridge-")));await fs.rm(root,{recursive:true,force:true});}
}
