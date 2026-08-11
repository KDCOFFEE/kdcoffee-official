"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function MemberLink({ initialName = "" }: { initialName?: string }) {
  const pathname = usePathname();
  const [name, setName] = useState(initialName);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/member/me", {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then((response) => (response.ok ? response.json() : { member: null }))
      .then((data) => {
        if (active) {
          setName(data.member?.displayName?.trim() || "");
        }
      })
      .catch(() => {
        // Keep the server-rendered member name when a transient client request fails.
      });

    return () => {
      active = false;
    };
  }, [pathname]);

  const loginHref = useMemo(() => {
    const params = new URLSearchParams();
    if (origin) params.set("origin", origin);
    if (pathname && pathname.startsWith("/")) params.set("returnTo", pathname);
    return `/api/auth/line/login?${params.toString()}`;
  }, [origin, pathname]);

  if (name) {
    return (
      <Link className="member-link" href="/member">
        {name}
      </Link>
    );
  }

  return (
    <a className="member-link line-login-mini" href={loginHref}>
      LINE 登入
    </a>
  );
}
