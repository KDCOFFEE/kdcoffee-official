import {supportsCustomerFlex} from './customerLineCardEvents';
import {supportsInternalFlex} from './internalLineCardEvents';
export function supportsCardPresentation(key:string){return supportsCustomerFlex(key)||supportsInternalFlex(key);}
export function cardBoundaryLabel(key:string){
 if(supportsInternalFlex(key))return '管理者通知 · 可設定文字／卡片';
 if(key==='customer.inquiry.admin_reply')return '獨立 PUSH · 詢問回覆通知';
 if(key.startsWith('customer.support.'))return '互動回覆 · 維持文字／Quick Reply';
 if(supportsCustomerFlex(key))return '會員通知 · 可設定文字／卡片';
 return '目前維持文字訊息 · 本階段未開放卡片發送';
}
