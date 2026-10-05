// Fixed approved compositing recipe. Default verifies in memory. No AI / website writes.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),sharp=require('sharp');
const series=path.resolve(__dirname,'..'),W=1600,H=2000;
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'APPROVED_ASSET_MANIFEST.json'),'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function bodyBounds(raw,w,h,threshold=192){
 const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let biggest=[];
 for(let start=0;start<w*h;start++){
  if(seen[start]||raw[start*4+3]<threshold)continue;
  let head=0,tail=1;queue[0]=start;seen[start]=1;
  while(head<tail){const index=queue[head++],x=index%w,y=Math.floor(index/w);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const nx=x+dx,ny=y+dy;if((dx===0&&dy===0)||nx<0||nx>=w||ny<0||ny>=h)continue;
    const n=ny*w+nx;if(!seen[n]&&raw[n*4+3]>=threshold){seen[n]=1;queue[tail++]=n;}
   }
  }
  if(tail>biggest.length)biggest=Array.from(queue.subarray(0,tail));
 }
 assert(biggest.length>10000,'No substantive package body');
 const rows=new Uint32Array(h),cols=new Uint32Array(w);for(const i of biggest){rows[Math.floor(i/w)]++;cols[i%w]++;}
 // Support in multiple pixels excludes detached specks and near-transparent edge halo.
 const minRow=Math.max(4,Math.ceil(Math.max(...rows)*.01)),minCol=Math.max(4,Math.ceil(Math.max(...cols)*.01));
 let left=w,top=h,right=-1,bottom=-1;
 for(const i of biggest){const x=i%w,y=Math.floor(i/w);if(rows[y]<minRow||cols[x]<minCol)continue;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
 return {left,top,width:right-left+1,height:bottom-top+1,right,bottom,threshold,componentPixels:biggest.length,minRow,minCol};
}
async function decoded(file){return sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});}

(async()=>{for(const m of manifest.products){
for(const [role,p] of Object.entries(m.paths))assert.equal(sha(path.join(series,p)),m.sha256[role],m.name+' '+role+' file changed');
const job=m.target,input=path.join(series,m.paths.originalCutout),{data:original,info:srcInfo}=await decoded(input),factor=job.keep?1:job.height/m.originalBody.height;
  const width=job.keep?srcInfo.width:Math.round(srcInfo.width*factor);
  const resized=job.keep?{data:original,info:srcInfo}:await sharp(input).resize({width,kernel:sharp.kernel.lanczos3}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {data:layer,info}=resized,body=bodyBounds(layer,info.width,info.height),left=Math.round(job.center-(body.left+body.width/2)),top=job.base-(body.top+body.height);
  assert(left>=0&&top>=0&&left+info.width<=W&&top+info.height<=H,'Entire package must fit');
const {data:bg,info:bgInfo}=await decoded(path.join(series,m.paths.background));assert.equal(bgInfo.width,W);assert.equal(bgInfo.height,H);
  // Background master stays identical. Rebuild shadows from the scaled body and actual bottom contour.
  const scene=Buffer.from(bg),shadow=Buffer.alloc(W*H*4),base=top+body.top+body.height,center=left+body.left+body.width/2,unit=body.height/1160,direction=job.light==='right'?-1:1;
  const support=[];for(let x=body.left;x<=body.right;x++){
   let bottom=-1;for(let y=body.bottom;y>=Math.max(body.top,body.bottom-Math.round(28*unit));y--)if(layer[(y*info.width+x)*4+3]>=192){bottom=y;break;}
   if(bottom>=0)support.push({x:left+x,y:top+bottom+1});
  }
  assert(support.length>body.width*.5,'Substantial bottom contact required');
  const supportByX=new Map(support.map(s=>[s.x,s.y]));
  for(let y=Math.max(0,base-Math.ceil(45*unit));y<Math.min(H,base+Math.ceil(95*unit));y++)for(let x=Math.max(0,Math.floor(center-body.width*.85));x<Math.min(W,Math.ceil(center+body.width*.85));x++){
   const ambient=.14*Math.exp(-.5*((x-center)/(body.width*.39))**2-.5*((y-(base+3*unit))/(13*unit))**2);
   const cast=.085*Math.exp(-.5*((x-(center+direction*body.width*.16))/(body.width*.46))**2-.5*((y-(base+16*unit))/(21*unit))**2);
   const contourY=supportByX.get(x),contact=contourY===undefined?0:.21*Math.exp(-.5*((y-contourY)/(2.8*unit))**2);
   const opacity=Math.min(.40,ambient+cast+contact),k=(y*W+x)*4;shadow[k+3]=Math.round(opacity*255);
   for(let c=0;c<3;c++)scene[k+c]=Math.round(bg[k+c]*(1-opacity));
  }
  const out=Buffer.from(scene);let opaque=0,partial=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
   const s=(y*info.width+x)*4,a=layer[s+3];if(!a)continue;const d=((top+y)*W+left+x)*4;
   for(let c=0;c<3;c++)out[d+c]=a===255?layer[s+c]:Math.round(layer[s+c]*a/255+scene[d+c]*(1-a/255));out[d+3]=255;if(a===255)opaque++;else partial++;
  }

assert.deepEqual(body,m.body);assert.equal(left,m.placement.left);assert.equal(top,m.placement.top);
assert((await decoded(path.join(series,m.paths.layer))).data.equals(layer),'Whole package layer mismatch');
assert((await decoded(path.join(series,m.paths.shadow))).data.equals(shadow),'Grounding shadow mismatch');
for(const role of ['png','webp'])assert((await decoded(path.join(series,m.paths[role]))).data.equals(out),'Approved final pixels mismatch '+role);
const png=await sharp(out,{raw:{width:W,height:H,channels:4}}).png({compressionLevel:9}).toBuffer(),webp=await sharp(out,{raw:{width:W,height:H,channels:4}}).webp({lossless:true,effort:6}).toBuffer();
assert.equal(crypto.createHash('sha256').update(png).digest('hex'),m.sha256.png);assert.equal(crypto.createHash('sha256').update(webp).digest('hex'),m.sha256.webp);
if(process.argv.includes('--write')){const output=path.join(__dirname,'reproduced',m.slug);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'final.png'),png,{flag:'wx'});fs.writeFileSync(path.join(output,'final.webp'),webp,{flag:'wx'});}
console.log(m.name+': reproducibility / layer / shadow / PNG / WebP SHA256 PASS');
}console.log('8/8 approved composite reproducibility PASS');})().catch(e=>{console.error(e);process.exit(1)});
