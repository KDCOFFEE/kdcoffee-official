/** Isolated Owner preview only; no real credentials, seeds, sends or Production data. */
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import http from 'node:http';import net from 'node:net';import {randomBytes} from 'node:crypto';import {spawn} from 'node:child_process';
import {createAdminSessionValue,adminCookieName} from '../lib/adminAuth';
const port=3195,backendPort=3196;
for(const value of [port,backendPort])await new Promise<void>((resolve,reject)=>{const probe=net.createServer();probe.once('error',reject);probe.listen(value,'127.0.0.1',()=>probe.close(()=>resolve()));});
const qaRoot=await fs.mkdtemp(path.join(os.tmpdir(),'kd-j6g2-card-preview-'));process.env.KD_DATA_DIR=qaRoot;
for(const key of Object.keys(process.env))if(/^(RAILWAY_|LINE_|GMAIL_|GOOGLE_|SMTP_|RESEND_|CLOUDINARY_)/.test(key))delete process.env[key];
for(const key of ['AUTH_SESSION_SECRET','ADMIN_SESSION_SECRET','MEMBER_IDENTITY_SECRET'])process.env[key]=randomBytes(40).toString('hex');
process.env.ADMIN_PASSWORD='Line-Cards-QA-2026';process.env.ADMIN_OWNER_ID='owner';process.env.NEXT_TELEMETRY_DISABLED='1';
const cookie=adminCookieName+'='+createAdminSessionValue({adminId:'owner',role:'owner'}),url='http://localhost:'+port;
await fs.mkdir('qa-output/j6g2',{recursive:true});await fs.writeFile('qa-output/j6g2/owner-session.json',JSON.stringify({qaRoot,url,backendPort,launcherPid:process.pid,password:process.env.ADMIN_PASSWORD},null,2));
const proxy=http.createServer((req,res)=>{if(req.url==='/__qa/admin'){res.writeHead(303,{Location:'/admin/notifications/line-cards','Set-Cookie':cookie+'; Path=/; HttpOnly; SameSite=Lax','Cache-Control':'no-store'});res.end();return;}const upstream=http.request({hostname:'127.0.0.1',port:backendPort,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode??502,response.headers);response.pipe(res);});upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('QA app is starting');});req.pipe(upstream);});
proxy.listen(port,'127.0.0.1',()=>console.log('LINE CARD OWNER QA '+url+'/__qa/admin'));
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(backendPort)],{env:{...process.env,NODE_ENV:'production'},stdio:'inherit',windowsHide:true});child.on('exit',code=>{proxy.close();process.exitCode=code??1;});for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{child.kill();proxy.close();});
