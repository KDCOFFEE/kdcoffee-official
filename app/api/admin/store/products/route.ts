import { storeAdminHandlers } from "@/lib/storeAdminApi";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const { POST, PATCH } = storeAdminHandlers("products");
