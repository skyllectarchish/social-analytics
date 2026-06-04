import { Link } from "react-router-dom";
import { Sparkles, ArrowLeft } from "lucide-react";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-dvh bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-black/5 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="bg-ig grid h-7 w-7 place-items-center rounded-lg text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-display text-lg font-semibold">InfluenceIQ</span>
          </Link>
          <span className="text-xs text-foreground/40">·</span>
          <span className="text-sm text-foreground/60">Terms of Service</span>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-4 py-12">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-foreground/50 transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <h1 className="text-3xl font-bold tracking-tight" id="terms-of-service">Terms of Service</h1>
        <p className="mt-2 text-sm text-foreground/50">Last updated: June 4, 2026</p>

        <div className="prose mt-10 max-w-none text-foreground/80 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_p]:mt-3 [&_p]:leading-relaxed [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:leading-relaxed [&_li]:mt-1">

          {/* --- 1 --- */}
          <h2 id="acceptance-of-terms">1. Acceptance of Terms</h2>
          <p>
            By accessing or using the InfluenceIQ website and services (the "Service"), provided by InfluenceIQ Labs ("we," "us," or "our"), you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the Service.
          </p>

          {/* --- 2 --- */}
          <h2 id="description-of-service">2. Description of Service</h2>
          <p>
            InfluenceIQ is an analytics dashboard for content creators. We provide tools to monitor performance, analyze audience demographics, track competitors, and generate AI-powered insights for platforms like Instagram and YouTube. We reserve the right to modify, suspend, or discontinue the Service at any time, with or without notice.
          </p>

          {/* --- 3 --- */}
          <h2 id="account-registration">3. Account Registration and Security</h2>
          <p>
            To use the Service, you must create an account. You agree to:
          </p>
          <ul>
            <li>Provide accurate and complete registration information.</li>
            <li>Maintain the security of your password and identification.</li>
            <li>Accept all responsibility for all activities that occur under your account.</li>
          </ul>

          {/* --- 4 --- */}
          <h2 id="third-party-platform-terms">4. Third-Party Platform Terms</h2>
          <p>
            InfluenceIQ integrates with third-party platforms (e.g., Meta/Instagram, Google/YouTube). By connecting these accounts, you also agree to be bound by their respective Terms of Service:
          </p>
          <ul>
            <li>
              <strong>YouTube:</strong> By using our YouTube integration, you agree to be bound by the{" "}
              <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms of Service</a>.
            </li>
            <li>
              <strong>Instagram:</strong> By using our Instagram integration, you agree to be bound by the{" "}
              <a href="https://help.instagram.com/581066165581870" target="_blank" rel="noopener noreferrer">Instagram Terms of Use</a>.
            </li>
          </ul>

          {/* --- 5 --- */}
          <h2 id="acceptable-use">5. Acceptable Use Policy</h2>
          <p>
            You agree not to use the Service to:
          </p>
          <ul>
            <li>Violate any local, state, national, or international law or regulation.</li>
            <li>Infringe upon the rights of others, including privacy and intellectual property rights.</li>
            <li>Attempt to gain unauthorized access to the Service or its related systems or networks.</li>
            <li>Use the Service to transmit any viruses, malware, or other malicious code.</li>
            <li>Resell or redistribute the Service or its data without our express written permission.</li>
          </ul>

          {/* --- 6 --- */}
          <h2 id="intellectual-property">6. Intellectual Property</h2>
          <p>
            The Service and its original content (excluding User Content and data retrieved from third-party APIs), features, and functionality are and will remain the exclusive property of InfluenceIQ Labs and its licensors. Our trademarks and trade dress may not be used in connection with any product or service without our prior written consent.
          </p>

          {/* --- 7 --- */}
          <h2 id="limitation-of-liability">7. Limitation of Liability</h2>
          <p>
            In no event shall InfluenceIQ Labs, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from:
          </p>
          <ul>
            <li>Your access to or use of or inability to access or use the Service.</li>
            <li>Any conduct or content of any third party on the Service.</li>
            <li>Any content obtained from the Service, including AI-generated insights which are provided "as is" and should be independently verified.</li>
            <li>Unauthorized access, use, or alteration of your transmissions or content.</li>
          </ul>

          {/* --- 8 --- */}
          <h2 id="termination">8. Termination</h2>
          <p>
            We may terminate or suspend your account and bar access to the Service immediately, without prior notice or liability, under our sole discretion, for any reason whatsoever and without limitation, including but not limited to a breach of the Terms.
          </p>

          {/* --- 9 --- */}
          <h2 id="changes">9. Changes to Terms</h2>
          <p>
            We reserve the right, at our sole discretion, to modify or replace these Terms at any time. We will provide notice of any material changes by posting the new Terms on this page. Your continued use of the Service following the posting of any changes to these Terms constitutes acceptance of those changes.
          </p>

          {/* --- 10 --- */}
          <h2 id="contact">10. Contact Us</h2>
          <p>
            If you have any questions about these Terms, please contact us at:
          </p>
          <ul>
            <li><strong>Email:</strong> legal@influenceiq.com</li>
            <li><strong>Website:</strong> https://influenceiq.com</li>
          </ul>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-black/5 px-4 py-8">
        <div className="mx-auto flex max-w-4xl items-center justify-between text-xs text-foreground/50">
          <span>© 2026 InfluenceIQ Labs</span>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
