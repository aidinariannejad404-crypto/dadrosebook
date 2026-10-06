"use client";

import { useRouter } from "next/navigation";
import { OtpLogin } from "./OtpLogin";

/** /login: the OTP form; on success go to the sanitised `next` (already checked on the server). */
export function LoginView({ next }: { next: string }) {
  const router = useRouter();
  return (
    <OtpLogin
      headingLevel={1}
      onSuccess={() => {
        router.replace(next);
        router.refresh();
      }}
    />
  );
}
