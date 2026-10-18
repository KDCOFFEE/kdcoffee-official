import "server-only";
import { MEMBER_CENTER_COPY_CATALOG, resolveMemberCopy, type MemberCopyOverrides } from "./memberCenterCopy";
import { readMemberCenterCopy } from "./memberCenterCopyStore";
import type { MemberAction, SupportNode, SupportSettings, SupportSource } from "./lineSupportTypes";
const epoch="1970-01-01T00:00:00.000Z";
const navSource:SupportSource={type:"Owner navigation preset",source:"LINE.AUTO.3 Owner specification",section:"editable navigation",classification:"static",needsOwner:false};
export function buildSupportPresetDraft(overrides:MemberCopyOverrides={}):SupportSettings {
  const nodes:SupportNode[]=[];
  const copy=(key:string)=>{
    const definition=MEMBER_CENTER_COPY_CATALOG.find(entry=>entry.key===key);
    if(!definition)throw new Error("Canonical support presentation source missing");
    return {text:resolveMemberCopy(overrides,definition.key),source:{type:"member display-copy helper",source:"lib/memberCenterCopyCatalog.ts + resolveMemberCopy",section:definition.key,classification:"static" as const,needsOwner:false}};
  };
  function add(id:string,parentId:string|null,title:string,type:SupportNode["type"],replyText:string,keywords:string[]=[],destination="",source=navSource,memberAction:MemberAction|""="") {
    const node:SupportNode={id,parentId,title,type,enabled:source.classification!=="missing",promptText:type==="menu"?"請選擇想了解的項目。":"",keywords,matchMode:"exact",replyText,
      linkLabel:destination||memberAction?"開啟網站查看":"",destination,memberAction:memberAction as MemberAction|"",order:type==="menu"?500:10,sourceMetadata:{...source},createdAt:epoch,updatedAt:epoch};
    nodes.push(node);return node;
  }
  const login=copy("member.dashboard.button.d2a50e44a9");
  const reward=copy("member.referral.reward.174938c940");
  const qualification=copy("member.referral.reward.710b7c9cbe");
  const team=copy("member.referral.button.0f37fcdf39");
  const share=copy("member.referral.reward.8388054bee");
  const waiting=copy("member.rewards.reward.afccb6ad2c");
  const credit=copy("member.subscription.description.4b6e30e9c5");
  const route=(file:string,section:string):SupportSource=>({type:"canonical route",source:file,section,classification:"dynamic-link",needsOwner:false});
  const staticSource=(file:string,section:string):SupportSource=>({type:"public page copy",source:file,section,classification:"static",needsOwner:false});
  const missing=(section:string):SupportSource=>({type:"missing canonical explanation",source:"phase-0 discovery",section,classification:"missing",needsOwner:true});
  const rootNode=add("root",null,"客服首頁","menu","",["客服","幫助","選單","問題","我要問","可以問什麼"]);
  rootNode.order=9999;rootNode.matchMode="contains";rootNode.promptText="想了解哪一項？請從下方分類開始。";
  const coffee=add("coffee","root","咖啡與豆單","menu","",["咖啡","焙度","風味"]);coffee.order=400;coffee.matchMode="contains";
  const orders=add("orders","root","購買、訂單與取貨","menu","",["訂單","配送","取貨","711","7-11","自取"]);orders.order=350;orders.matchMode="contains";
  const members=add("members","root","會員與回饋","menu","",["回饋","獎金","點數"]);members.order=300;members.matchMode="contains";
  add("service","root","店舖與服務","menu","",["店舖","服務","門市"]);
  add("monthly-menu","coffee","本月豆單","answer","一次閱讀本月作品、風味、規格與參考售價。",["豆單","本月豆單"],"/monthly-menu",staticSource("app/monthly-menu/page.tsx","metadata.description"));
  add("works","coffee","咖啡作品","answer","開始選購咖啡",["咖啡作品"],"/works",staticSource("app/member/page.tsx","empty orders purchase link"));
  add("choose-coffee","coffee","怎麼選咖啡","answer","",[],"",missing("standalone coffee selection guidance"));
  add("roast-flavors","coffee","焙度與風味","answer","一次閱讀本月作品、風味、規格與參考售價。",["焙度與風味"],"/monthly-menu",staticSource("app/monthly-menu/page.tsx","metadata.description"));
  const purchaseText="一般訂購可選 7-ELEVEN 取貨付款、KD Coffee 工作室自取或宅配。";
  add("purchase","coffee","購買方式","answer",purchaseText,["購買方式"],"/works",staticSource("app/checkout/page.tsx","delivery choices heading"));
  const personal=(id:string,parent:string,title:string,action:MemberAction,keywords:string[],presentation=login)=>
    add(id,parent,title,"member_action",presentation.text,keywords,"",{...presentation.source,classification:"dynamic-link"},action);
  personal("my-orders","orders","查看我的訂單","viewOrders",["我的訂單","查看我的訂單"]);
  personal("my-order-status","orders","訂單 / 配送進度","viewOrderStatus",["我的配送","訂單進度"]);
  add("seven-eleven","orders","7-ELEVEN 取貨","answer","商品到店後再付款取貨",["7-ELEVEN 取貨"],"/checkout",staticSource("app/checkout/page.tsx","711_cod delivery option"));
  add("studio-pickup","orders","工作室自取","answer","請選擇希望日期，工作室確認後會通知你。",["工作室自取"],"/checkout",staticSource("app/checkout/page.tsx","studio pickup date guidance; no preparation-day claim"));
  add("payment","orders","付款方式","answer","一般訂購可選 7-ELEVEN 取貨付款、KD Coffee 工作室自取或宅配。",["付款方式"],"/checkout",staticSource("app/checkout/page.tsx","delivery/payment options; live choices stay on site"));
  add("order-change","orders","訂單修改 / 取消","answer","",[],"",missing("universal cancellation/change explanation; action is guarded per order"));
  personal("order-help","orders","訂單協助","viewOrders",["訂單協助"]);
  personal("kd-points","members","KD 點數","viewKdPoints",["KD 點數","我的 KD 點數"],reward);
  personal("credits","members","抵用金","viewCredits",["抵用金","我的抵用金"],credit);
  add("purchase-rewards","members","購物回饋","answer",reward.text,["購物回饋"],"/member#rewards",reward.source);
  const referral=add("referral","members","推薦好友","menu",share.text,["推薦","介紹朋友"],"",share.source);referral.order=200;referral.matchMode="contains";
  add("referral-how","referral","怎麼推薦好友","answer",share.text,["怎麼推薦好友"],"/member#referral",share.source);
  add("referral-first","referral","第一代推薦回饋","answer",team.text,["第一代推薦回饋"],"/member#referral",team.source);
  const second=add("referral-second","referral","第二代推薦回饋","menu",team.text,["第二代","第二層","朋友的朋友","第二代回饋","第二代推薦回饋"],"",team.source);second.order=100;second.matchMode="contains";
  add("second-meaning","referral-second","第二代是什麼","answer","",[],"",missing("standalone second-generation definition; existing UI shows generations but no standalone explanation"));
  add("second-who","referral-second","誰算第二代","answer",team.text,["誰算第二代"],"/member#referral",team.source);
  add("second-calculation","referral-second","回饋怎麼計算","answer",reward.text,["第二代回饋怎麼計算"],"/member#rewards",{...reward.source,classification:"dynamic-link"});
  add("second-qualification","referral-second","符合資格條件","answer",qualification.text,["第二代符合資格條件"],"/member#rewards",{...qualification.source,classification:"dynamic-link"});
  add("second-release","referral-second","什麼時候入帳","answer",waiting.text,["第二代什麼時候入帳"],"/member#rewards",{...waiting.source,classification:"dynamic-link"});
  add("second-pending","referral-second","為什麼待符合資格","answer",qualification.text,["第二代待符合資格"],"/member#rewards",{...qualification.source,classification:"dynamic-link"});
  personal("second-my-rewards","referral-second","查看我的推薦回饋","viewReferralRewards",["查看我的推薦回饋","我的推薦回饋"],reward);
  add("referral-qualification","referral","推薦資格","answer",qualification.text,["推薦資格"],"/member#rewards",{...qualification.source,classification:"dynamic-link"});
  add("referral-calculation","referral","回饋計算","answer",reward.text,["回饋計算"],"/member#rewards",{...reward.source,classification:"dynamic-link"});
  add("referral-release","referral","入帳時間","answer",waiting.text,["入帳時間"],"/member#rewards",{...waiting.source,classification:"dynamic-link"});
  personal("my-referral-rewards","referral","我的推薦回饋入口","viewReferralRewards",[],reward);
  personal("subscription","members","定期配送","viewSubscriptions",["定期配送","我的定期配送"]);
  personal("member-profile","members","我的會員資料","viewMemberCenter",["我的會員資料"]);
  add("hours","service","營業時間","answer","",[],"",missing("business hours not located"));
  add("location","service","地址 / 導航","answer","高雄市鳳山區過埤路 501 號",["地址","導航"],"https://www.google.com/maps/search/?api=1&query=%E9%AB%98%E9%9B%84%E5%B8%82%E9%B3%B3%E5%B1%B1%E5%8D%80%E9%81%8E%E5%9F%A4%E8%B7%AF501%E8%99%9F",staticSource("components/layout/Footer.tsx","VISIT address + map"));
  add("contact","service","聯絡方式","answer","LINE @kdcoffee",["聯絡方式"],"https://line.me/R/ti/p/@kdcoffee",staticSource("components/layout/Footer.tsx","CONNECT"));
  add("brand","service","品牌 / 烘焙特色","answer","咖啡藝術工坊\n享受每一口咖啡的驚奇之旅。",["品牌"],"",staticSource("components/layout/Footer.tsx","brand copy; no invented roast specifics"));
  return {schemaVersion:3,revision:0,enabled:false,updatedAt:epoch,rootNodeId:"root",nodes,
    navigation:{backLabel:"返回上一層",homeLabel:"回客服首頁",previousLabel:"上一頁",nextLabel:"下一頁"},
    unlinkedText:login.text+"\n\n"+copy("member.dashboard.button.bb6d3547de").text,
    fallback:{enabled:true,text:"請從客服首頁選擇想了解的項目。",showRootChoices:true}};
}
export async function readCanonicalSupportDraft() {
  const copy=await readMemberCenterCopy();
  return buildSupportPresetDraft(copy.overrides);
}
