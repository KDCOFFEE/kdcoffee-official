import type { ReactNode } from "react";

/** A consistent 24px line-icon family with no font, network or image dependency. */
export default function ServiceIcon({ name, className }: { name: string; className?: string }) {
  const icons: Record<string, ReactNode> = {
    orders: <><path d="M8 4H6a2 2 0 0 0-2 2v14a1 1 0 0 0 1.5.86L8 19.5l4 2 4-2 2.5 1.36A1 1 0 0 0 20 20V6a2 2 0 0 0-2-2h-2"/><rect x="8" y="2.5" width="8" height="4" rx="1.5"/><path d="M8 11h8M8 15h5"/></>,
    delivery: <><path d="M2.5 17V7a2 2 0 0 1 2-2h10v12M14.5 9h3.7l3.3 4.5V17H21M2.5 17h2M9.5 17h6M15 13h6"/><circle cx="7" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/></>,
    cancellation: <><path d="M13.5 2.5H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13.5 2.5V9H20M9 13l6 5M15 13l-6 5"/></>,
    returns: <><path d="m5 8 7-4 7 4v10l-7 4-7-4v-5M12 12v10M5 8l7 4 7-4M9 6l7 4"/><path d="M7 12H2m0 0 2.5-2.5M2 12l2.5 2.5"/></>,
    account: <><circle cx="12" cy="7.5" r="4"/><path d="M4.5 21v-2a7.5 7.5 0 0 1 15 0v2"/></>,
    kd: <><circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="6.5"/><path d="M10 8.5v7m4-7-4 3.5 4 3.5"/></>,
    subscription: <><path d="M16.5 5.5A8 8 0 0 0 3.5 10M3.5 10V5.5M3.5 10H8M7.5 18.5A8 8 0 0 0 20.5 14m0 0v4.5m0-4.5H16"/><path d="m9 10 3-2 3 2v4l-3 2-3-2z"/></>,
    coffee: <><path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h2a3 3 0 0 1 0 6h-2M3 22h16M7 6c-2-2 2-2 0-4M12 6c-2-2 2-2 0-4"/></>,
    selection: <><rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M7 2.5v5M17 2.5v5M3 10h18m-13 5 3 3 5-5"/></>,
    store: <><path d="m3 8 2-5h14l2 5M4 12v9h16v-9M3 8v2a3 3 0 0 0 4.5 2.6A3 3 0 0 0 12 12a3 3 0 0 0 4.5.6A3 3 0 0 0 21 10V8zM9 21v-6h6v6"/></>,
    gifts: <><rect x="3" y="8" width="18" height="5" rx="1.5"/><path d="M5 13v6.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V13M12 8v13M12 8C4 8 4.5 2 8 3c2.5.5 4 5 4 5Zm0 0c8 0 7.5-6 4-5-2.5.5-4 5-4 5Z"/></>,
    LINE: <><path d="M21 10.5c0 4.1-4 7.5-9 7.5h-1.5L5 21l1-4.5a6.7 6.7 0 0 1-3-6C3 6.4 7 3 12 3s9 3.4 9 7.5Z"/><circle cx="8" cy="10.5" r=".65" fill="currentColor" stroke="none"/><circle cx="12" cy="10.5" r=".65" fill="currentColor" stroke="none"/><circle cx="16" cy="10.5" r=".65" fill="currentColor" stroke="none"/></>,
    Facebook: <path d="M14.5 22v-9h3l.5-3.5h-3.5V7.2c0-1 .3-1.7 1.8-1.7H18V2.3a22 22 0 0 0-2.6-.3c-2.7 0-4.5 1.7-4.5 4.8v2.7H8V13h2.9v9Z" fill="currentColor" stroke="none"/>,
    Email: <><rect x="2.5" y="4.5" width="19" height="15" rx="3"/><path d="m3.5 6 7 5.4a2.5 2.5 0 0 0 3 0l7-5.4M3.5 18l5.5-5M20.5 18 15 13"/></>,
    Phone: <path d="M8.3 3.1 10.5 7a1.5 1.5 0 0 1-.3 1.8l-1.7 1.5a13.5 13.5 0 0 0 5.2 5.2l1.5-1.7a1.5 1.5 0 0 1 1.8-.3l3.9 2.2a1.5 1.5 0 0 1 .7 1.6l-.5 2a2.5 2.5 0 0 1-2.6 1.9C10 20.2 3.8 14 2.8 5.5a2.5 2.5 0 0 1 1.9-2.6l2-.5a1.5 1.5 0 0 1 1.6.7Z"/>,
    clock: <><circle cx="12" cy="12" r="9.5"/><path d="M12 6.5v6l3.5 2"/></>,
  };
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{icons[name] || <><circle cx="12" cy="12" r="9.5"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 4h.01"/></>}</svg>;
}
