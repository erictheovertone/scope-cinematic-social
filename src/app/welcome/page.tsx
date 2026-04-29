"use client";

// import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLogin } from '@privy-io/react-auth';

// const imgScopeLogo1 = "/scope-logo.svg";

export default function Welcome() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

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

  if (isLoading) {
    return (
      <div style={{
        backgroundColor: '#000000',
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          backgroundColor: '#FF0000',
          borderRadius: '50%'
        }}></div>
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
      <div>
        <img
          src="/scope-logo-1.png"
          alt="SCOPE"
          style={{
            width: '280px',
            height: 'auto',
            display: 'block',
            margin: '0 auto'
          }}
        />
      </div>

      <div style={{ width: '100%', height: '112px', border: '1px solid white', position: 'relative' }}>
        <button
          onClick={login}
          style={{
            position: 'absolute',
            top: '2px',
            left: '2px',
            color: 'white',
            fontSize: '14px',
            fontFamily: 'Menlo, monospace',
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
            fontSize: '14px',
            fontFamily: 'Menlo, monospace',
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
