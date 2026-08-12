"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function MemberLink({ initialName = "" }: { initialName?: string }) {
  const pathname = usePathname();
  const [name, setName] = useState(initialName);

  useEffect(() => {
    let active = true;
    fetch("/api/member/me", {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then((response) => (response.ok ? response.json() : { member: null }))
      .then((data) => {
        if (active) {
          setName(
            data.member
              ? data.member.displayName?.trim() || "KD Coffee 會員"
              : "",
          );
        }
      })
      .catch(() => {
        // Keep the server-rendered member name when a transient client request fails.
      });

    return () => {
      active = false;
    };
  }, [pathname]);

  if (name) {
    return (
      <Link className="member-link" href="/member">
        {name}
      </Link>
    );
  }

  return (
    <Link className="member-link line-login-mini" href="/member">
      會員登入
    </Link>
  );
}
