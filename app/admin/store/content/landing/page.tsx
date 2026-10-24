import { forbidden, redirect } from "next/navigation";
import { readAdminSession } from "@/lib/adminAuth";
import { readGiftCmsEditor } from "@/lib/giftCmsAdmin";
import GiftCmsEditor from "@/components/admin/GiftCmsEditor";
export const dynamic="force-dynamic";
export default async function StoreLandingEditor({searchParams}:{searchParams:Promise<{tab?:string}>}){const session=await readAdminSession();if(!session)redirect("/admin/login");if(session.role!=="owner")forbidden();const tab=(await searchParams).tab;return <GiftCmsEditor initial={await readGiftCmsEditor(undefined,true)} initialTab={tab==="visual"||tab==="seo"?tab:undefined}/>;}
