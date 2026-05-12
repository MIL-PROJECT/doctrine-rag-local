"use client";

import type { Permission } from "@/lib/auth";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  children: React.ReactNode;
  permission?: Permission;
};

/**
 * 클라이언트 전용 권한 가드. localStorage 세션은 PoC 수준이며 운영에서는 서버 검증이 필요합니다.
 * (frontend/lib/auth.ts 상단 주석 참고)
 */
export function RequireAuth({ children, permission }: Props) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const user = getCurrentUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    if (permission && !hasPermission(user, permission)) {
      router.replace("/login");
      return;
    }
    setAllowed(true);
  }, [permission, router]);

  if (!allowed) return null;
  return <>{children}</>;
}
