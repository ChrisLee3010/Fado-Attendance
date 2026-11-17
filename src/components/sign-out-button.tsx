"use client";

import { signOut } from "@/lib/session";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <button className={className} onClick={signOut}>
      Sign out
    </button>
  );
}
