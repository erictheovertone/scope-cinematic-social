import "./globals.css";
import Providers from '@/components/Providers';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Scope - Cinematic Social Platform</title>
        <meta name="description" content="A cinematic social platform where creators post ultra-wide images/videos into customizable grids." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
        <link rel="dns-prefetch" href="https://auth.privy.io" />
      </head>
      <body className="bg-black text-white font-mono antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
