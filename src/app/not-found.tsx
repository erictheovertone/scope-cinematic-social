'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="bg-black screen-min flex items-center justify-center">
      <div className="text-center">
        <div className="w-[15px] h-[15px] bg-[#E5E1DB] rounded-full mx-auto mb-4"></div>
        <h1 className="font-['IBM_Plex_Mono'] font-medium text-[#E5E1DB] text-[var(--fs-14)] tracking-[-0.28px] leading-[140%] mb-2">
          Page Not Found
        </h1>
        <Link href="/" className="font-['IBM_Plex_Mono'] font-normal text-[#CCCCCC] text-[var(--fs-11)] tracking-[-0.22px] leading-[140%] hover:text-[#E5E1DB]">
          Return Home
        </Link>
      </div>
    </div>
  );
}
