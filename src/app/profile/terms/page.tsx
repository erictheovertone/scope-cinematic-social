"use client";

import { useRouter } from "next/navigation";

export default function TermsOfService() {
  const router = useRouter();

  return (
    <div className="bg-black relative w-[375px] h-[812px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-[#333333]">
        <button 
          onClick={() => router.back()} 
          className="text-white text-lg"
        >
          ←
        </button>
        <h1 className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-18)]">
          Terms of Service
        </h1>
        <div className="w-6" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="space-y-6">
          <div className="text-center mb-8">
            <p className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-12)]">
              Last updated: November 2025
            </p>
          </div>

          <section>
            <h2 className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-16)] mb-4">
              1. Acceptance of Terms
            </h2>
            <p className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-13)] leading-relaxed mb-4">
              By accessing and using Scope, you accept and agree to be bound by the terms and provision of this agreement.
            </p>
          </section>

          <section>
            <h2 className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-16)] mb-4">
              2. Use License
            </h2>
            <p className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-13)] leading-relaxed mb-4">
              Permission is granted to temporarily use Scope for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
            </p>
            <ul className="space-y-2 ml-4">
              <li className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-12)] flex items-start">
                <span className="text-[#FF0000] mr-2">•</span>
                modify or copy the materials
              </li>
              <li className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-12)] flex items-start">
                <span className="text-[#FF0000] mr-2">•</span>
                use the materials for commercial purposes or public display
              </li>
              <li className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-12)] flex items-start">
                <span className="text-[#FF0000] mr-2">•</span>
                attempt to reverse engineer any software
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-16)] mb-4">
              3. Content Policy
            </h2>
            <p className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-13)] leading-relaxed mb-4">
              Users are responsible for the content they post. Content must not violate any laws or infringe on others' rights. We reserve the right to remove content that violates our community guidelines.
            </p>
          </section>

          <section>
            <h2 className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-16)] mb-4">
              4. Trading and Transactions
            </h2>
            <p className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-13)] leading-relaxed mb-4">
              Scope facilitates trading of digital content. All transactions are final. Users agree to resolve disputes directly with other users. Scope is not responsible for transaction outcomes.
            </p>
          </section>

          <section>
            <h2 className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-16)] mb-4">
              5. Privacy
            </h2>
            <p className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-13)] leading-relaxed mb-4">
              Your privacy is important to us. We collect and use information in accordance with our Privacy Policy. By using Scope, you consent to our data practices.
            </p>
          </section>

          <section>
            <h2 className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-16)] mb-4">
              6. Disclaimer
            </h2>
            <p className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-13)] leading-relaxed mb-4">
              The materials on Scope are provided on an 'as is' basis. Scope makes no warranties, expressed or implied, and hereby disclaims all other warranties including implied warranties of merchantability, fitness for a particular purpose, or non-infringement.
            </p>
          </section>

          <section>
            <h2 className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-16)] mb-4">
              7. Limitations
            </h2>
            <p className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-13)] leading-relaxed mb-4">
              In no event shall Scope or its suppliers be liable for any damages arising out of the use or inability to use the materials on Scope, even if Scope has been notified of the possibility of such damage.
            </p>
          </section>

          <section>
            <h2 className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-16)] mb-4">
              8. Revisions
            </h2>
            <p className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-13)] leading-relaxed mb-4">
              Scope may revise these terms at any time without notice. By using this platform, you agree to be bound by the current version of these terms.
            </p>
          </section>

          <section>
            <h2 className="font-['IBM_Plex_Mono'] font-medium text-white text-[var(--fs-16)] mb-4">
              9. Contact Information
            </h2>
            <p className="font-['IBM_Plex_Mono'] font-normal text-[#888888] text-[var(--fs-13)] leading-relaxed mb-8">
              If you have any questions about these Terms of Service, please contact us at legal@scope.app.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
