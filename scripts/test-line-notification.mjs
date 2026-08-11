const token=process.env.LINE_CHANNEL_ACCESS_TOKEN;
const to=process.env.LINE_ORDER_RECIPIENT_ID;
if(!token||!to){console.error("缺少 LINE_CHANNEL_ACCESS_TOKEN 或 LINE_ORDER_RECIPIENT_ID");process.exit(1)}
const now=new Date().toLocaleString("zh-TW",{timeZone:"Asia/Taipei"});
const response=await fetch("https://api.line.me/v2/bot/message/push",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({to,messages:[{type:"text",text:`【KD Coffee LINE 測試】\n\n測試時間：${now}\n若看到這則訊息，代表網站可成功推送訂單至此群組。`}]}),signal:AbortSignal.timeout(12000)});
const text=await response.text();
if(!response.ok){console.error(`傳送失敗 HTTP ${response.status}\n${text}`);process.exit(1)}
console.log("✓ LINE 測試訊息已送出");
console.log("LINE request id:",response.headers.get("x-line-request-id")||"未提供");
