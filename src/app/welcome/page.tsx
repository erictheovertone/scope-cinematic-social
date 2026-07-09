"use client";

// import Link from "next/link";
import { useState, useEffect } from "react";
import DesktopLanding from '@/components/desktop/DesktopLanding';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useRouter } from "next/navigation";
import { useLogin } from '@privy-io/react-auth';
import FrameLoader from "@/components/FrameLoader";

// const imgScopeLogo1 = "/scope-logo.svg";

export default function Welcome() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const isDesktop = useIsDesktop();

  const { login } = useLogin({
    onComplete: () => {
      console.log('Authentication successful, redirecting...');
      router.push('/auth/callback');
    },
    onError: (error) => {
      console.log('Authentication error:', error);
    }
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 750);

    return () => clearTimeout(timer);
  }, []);

  // DESKTOP SEAM: the logged-out desktop landing (mobile welcome untouched).
  if (isDesktop) return <DesktopLanding />;

  if (isLoading) {
    return (
      <div style={{
        backgroundColor: '#000000',
        minHeight: '100dvh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <FrameLoader variant="page" />
      </div>
    );
  }

  return (
    <div
      data-name="Welcome Page"
      data-node-id="86:27"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#000',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '40px 24px 48px'
      }}
    >
      <div style={{ marginTop: 'calc(33vh - 18px)' }}>
        <img
          src="/scope-logo-new.png"
          alt="Scope"
          style={{
            height: 45,
            display: 'block',
            margin: '0 auto'
          }}
        />
      </div>

      <div style={{ width: '100%', height: '112px', border: '1px solid rgba(255,255,255,0.5)', position: 'relative' }}>
        <button
          onClick={login}
          style={{
            position: 'absolute',
            top: '2px',
            left: '2px',
            color: 'white',
            fontSize: 'var(--fs-12)',
            fontFamily: "'SK-Modernist', sans-serif",
            fontWeight: 700,
            textDecoration: 'none',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            zIndex: 1000,
            transition: 'all 0.1s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          className="hover:opacity-70 scope-auth-button"
          onPointerDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.95)';
            e.currentTarget.style.opacity = '0.8';
          }}
          onPointerUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.opacity = '1';
          }}
          onPointerLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.opacity = '1';
          }}
        >
          LOG IN
        </button>
        <button
          onClick={login}
          style={{
            position: 'absolute',
            bottom: '2px',
            right: '2px',
            color: 'white',
            fontSize: 'var(--fs-12)',
            fontFamily: "'SK-Modernist', sans-serif",
            fontWeight: 700,
            textDecoration: 'none',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            zIndex: 1000,
            transition: 'all 0.1s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          className="hover:opacity-70 scope-auth-button"
          onPointerDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.95)';
            e.currentTarget.style.opacity = '0.8';
          }}
          onPointerUp={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.opacity = '1';
          }}
          onPointerLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.opacity = '1';
          }}
        >
          SIGN UP
        </button>
      </div>
    </div>
  );
}
