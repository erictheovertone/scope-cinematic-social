"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ScopeLoader from "@/components/ScopeLoader";

export default function Transition() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to home after animation duration
    const redirectTimer = setTimeout(() => {
      router.push("/");
    }, 2000);

    return () => {
      clearTimeout(redirectTimer);
    };
  }, [router]);

  return (
    <div className="bg-black relative w-[375px] h-[812px] mx-auto flex items-center justify-center">
      
      <ScopeLoader size="lg" label="Loading" />

    </div>
  );
}
