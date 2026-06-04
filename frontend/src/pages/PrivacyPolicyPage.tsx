import { Link } from "react-router-dom";
import { Sparkles, ArrowLeft } from "lucide-react";

export default function PrivacyPolicyPage() {
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
          <span className="text-sm text-foreground/60">Privacy Policy</span>
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

        <h1 className="text-3xl font-bold tracking-tight" id="privacy-policy">Privacy Policy</h1>
        <p className="mt-2 text-sm text-foreground/50">Last updated: June 4, 2026</p>

        <div className="prose mt-10 max-w-none text-foreground/80 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_p]:mt-3 [&_p]:leading-relaxed [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:leading-relaxed [&_li]:mt-1 [&_table]:mt-4 [&_table]:w-full [&_table]:text-sm [&_th]:border [&_th]:border-foreground/10 [&_th]:bg-foreground/5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_td]:border [&_td]:border-foreground/10 [&_td]:px-3 [&_td]:py-2">

          {/* --- 1 --- */}
          <h2 id="introduction">1. Introduction</h2>
          <p>
            InfluenceIQ ("we," "us," or "our") is a cross-platform social media analytics dashboard
            operated by InfluenceIQ Labs. This Privacy Policy explains how we collect, use, store,
            and protect your information when you use our website and services (collectively, the "Service").
          </p>
          <p>
            By accessing or using the Service, you agree to this Privacy Policy. If you do not agree,
            please do not use the Service.
          </p>

          {/* --- 2 --- */}
          <h2 id="information-we-collect">2. Information We Collect</h2>

          <h3>2.1 Account Information</h3>
          <p>When you register, we collect:</p>
          <ul>
            <li>Email address</li>
            <li>Password (stored as a one-way bcrypt hash — we never store your plaintext password)</li>
          </ul>

          <h3>2.2 Instagram Data (via Meta Graph API)</h3>
          <p>
            When you connect your Instagram Business or Creator account, we access the following data
            through the official Meta Graph API using OAuth-based authorization:
          </p>
          <table>
            <thead>
              <tr>
                <th>Data Category</th>
                <th>Specific Data</th>
                <th>API Permission</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Profile Information</td>
                <td>Username, display name, biography, profile picture URL, followers count, follows count, media count</td>
                <td><code>instagram_business_basic</code></td>
              </tr>
              <tr>
                <td>Media Content</td>
                <td>Posts, Reels, and Carousels — including thumbnails, captions, timestamps, media type, and permalink</td>
                <td><code>instagram_business_basic</code></td>
              </tr>
              <tr>
                <td>Account Insights</td>
                <td>Daily reach, impressions, views, profile visits, engagement rate, follower demographics (age, gender, city, country)</td>
                <td><code>instagram_business_manage_insights</code></td>
              </tr>
              <tr>
                <td>Media Insights</td>
                <td>Per-post likes, comments, saves, shares, reach, impressions, video views</td>
                <td><code>instagram_business_manage_insights</code></td>
              </tr>
              <tr>
                <td>Comments</td>
                <td>Comment text and metadata for sentiment analysis and topic clustering (read-only — we do not post, modify, or delete comments)</td>
                <td><code>instagram_business_manage_comments</code></td>
              </tr>
            </tbody>
          </table>

          <h3>2.3 YouTube Data (via Google APIs)</h3>
          <p>
            When you connect your YouTube channel, we access the following data through the official
            YouTube Data API v3 and YouTube Analytics API using Google OAuth 2.0 authorization:
          </p>
          <table>
            <thead>
              <tr>
                <th>Data Category</th>
                <th>Specific Data</th>
                <th>API Scope</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Channel Information</td>
                <td>Channel name, description, profile picture, subscriber count, total view count, video count, branding metadata</td>
                <td><code>youtube.readonly</code></td>
              </tr>
              <tr>
                <td>Video Catalog</td>
                <td>Video titles, descriptions, tags, thumbnails, publish dates, duration, privacy status, category, like count, comment count, view count</td>
                <td><code>youtube.readonly</code></td>
              </tr>
              <tr>
                <td>Comments</td>
                <td>Comment text and metadata for sentiment analysis and topic clustering (read-only — we do not post, modify, or delete comments)</td>
                <td><code>youtube.readonly</code></td>
              </tr>
              <tr>
                <td>Channel Analytics</td>
                <td>Daily views, estimated watch time minutes, subscriber gains/losses, average view duration, audience retention curves, traffic source breakdown, impression click-through rates</td>
                <td><code>yt-analytics.readonly</code></td>
              </tr>
              <tr>
                <td>Audience Demographics</td>
                <td>Viewer age group, gender, country, device type</td>
                <td><code>yt-analytics.readonly</code></td>
              </tr>
              <tr>
                <td>Search Intelligence</td>
                <td>Search terms that drove views to your videos</td>
                <td><code>yt-analytics.readonly</code></td>
              </tr>
              <tr>
                <td>Revenue Metrics (optional)</td>
                <td>Estimated revenue, ad revenue, YouTube Premium revenue share, CPM, RPM, monetized playbacks. Only collected if you explicitly grant this scope.</td>
                <td><code>yt-analytics-monetary.readonly</code></td>
              </tr>
            </tbody>
          </table>

          <h3>2.4 Automatically Collected Information</h3>
          <p>When you use the Service, we may automatically collect:</p>
          <ul>
            <li>IP address and approximate location</li>
            <li>Browser type, device type, and operating system</li>
            <li>Pages visited and features used within the Service</li>
            <li>Timestamps and session duration</li>
          </ul>

          {/* --- 3 --- */}
          <h2 id="how-we-use-your-information">3. How We Use Your Information</h2>
          <p>We use the collected data exclusively to:</p>
          <ul>
            <li><strong>Provide analytics dashboards</strong> — displaying your social media performance metrics, trends, and historical comparisons</li>
            <li><strong>Generate AI-powered insights</strong> — weekly performance digests, content recommendations, "why did this flop" diagnostics, and sentiment analysis of comments</li>
            <li><strong>Enable long-term historical tracking</strong> — storing your analytics data permanently so you can monitor growth trends over months and years, including beyond platform-native retention limits</li>
            <li><strong>Power cross-platform comparisons</strong> — allowing you to view Instagram and YouTube performance side-by-side</li>
            <li><strong>Improve the Service</strong> — understanding how users interact with the product to improve features and fix bugs</li>
            <li><strong>Communicate with you</strong> — sending essential service notifications (e.g., sync errors, weekly digests)</li>
          </ul>
          <p>
            We do <strong>not</strong> sell, rent, or share your personal information or social media data
            with advertisers or third-party marketers.
          </p>

          {/* --- 4 --- */}
          <h2 id="third-party-services">4. Third-Party Service Providers</h2>
          <p>
            We share limited data with the following third-party service providers, solely for the
            purposes described below:
          </p>
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Purpose</th>
                <th>Data Shared</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>ClickHouse Cloud</td>
                <td>Database hosting — stores all analytics data</td>
                <td>All collected social media metrics and account data (encrypted at rest)</td>
              </tr>
              <tr>
                <td>Anthropic (Claude)</td>
                <td>AI-powered comment sentiment analysis and topic clustering</td>
                <td>Anonymized comment text from your posts (no personal identifiers)</td>
              </tr>
              <tr>
                <td>Ollama Cloud</td>
                <td>AI Copilot features — performance digests, content suggestions, diagnostics</td>
                <td>Aggregated analytics metrics and comment summaries (no raw personal data)</td>
              </tr>
            </tbody>
          </table>
          <p>
            Each provider is contractually obligated to process data only on our behalf and in
            accordance with this Privacy Policy.
          </p>

          {/* --- 5 --- */}
          <h2 id="data-storage-and-security">5. Data Storage and Security</h2>
          <ul>
            <li><strong>Storage:</strong> Your data is stored in ClickHouse Cloud, encrypted at rest using AES-256 encryption.</li>
            <li><strong>Transmission:</strong> All data in transit is encrypted using TLS 1.2 or higher.</li>
            <li><strong>Authentication tokens:</strong> Instagram long-lived tokens and Google OAuth refresh tokens are encrypted using AES before storage. We never store plaintext API tokens.</li>
            <li><strong>Passwords:</strong> User passwords are hashed using the bcrypt algorithm. We cannot and do not store or recover plaintext passwords.</li>
            <li><strong>Access control:</strong> Access to production systems is restricted to authorized personnel only, using role-based access controls.</li>
          </ul>

          {/* --- 6 --- */}
          <h2 id="data-retention">6. Data Retention</h2>
          <p>
            We retain your analytics data <strong>indefinitely</strong> for as long as your account is active.
            This is a core feature of the Service — enabling long-term historical analysis that social
            media platforms' native tools do not provide.
          </p>
          <p>
            If you delete your account or disconnect a social media platform, we will delete all
            associated data within <strong>30 days</strong>, unless we are required by law to retain it longer.
          </p>

          {/* --- 7 --- */}
          <h2 id="your-rights">7. Your Rights and Choices</h2>
          <p>You have the right to:</p>
          <ul>
            <li><strong>Access your data</strong> — view all data we have collected about you through your dashboard</li>
            <li><strong>Disconnect a platform</strong> — revoke our access to your Instagram or YouTube account at any time from your account settings. We will stop syncing new data immediately.</li>
            <li><strong>Delete your data</strong> — request complete deletion of all your data by disconnecting your account and selecting "Purge Data," or by contacting us at the email below</li>
            <li><strong>Export your data</strong> — request a copy of your stored data in a machine-readable format</li>
            <li><strong>Revoke access directly</strong> — you can also revoke InfluenceIQ's access at any time from:
              <ul>
                <li>Instagram: Settings → Website Permissions → Apps and Websites → Remove InfluenceIQ</li>
                <li>Google: <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a> → Remove InfluenceIQ</li>
              </ul>
            </li>
          </ul>

          {/* --- 8 --- */}
          <h2 id="meta-platform-data">8. Meta Platform Data Compliance</h2>
          <p>
            Our use of Instagram data is governed by the{" "}
            <a href="https://developers.facebook.com/terms" target="_blank" rel="noopener noreferrer">
              Meta Platform Terms
            </a>{" "}
            and the{" "}
            <a href="https://developers.facebook.com/devpolicy" target="_blank" rel="noopener noreferrer">
              Meta Developer Policies
            </a>. We:
          </p>
          <ul>
            <li>Only request permissions that are necessary for the Service's functionality</li>
            <li>Access data in <strong>read-only mode</strong> — we do not post, modify, or delete any content on your Instagram account</li>
            <li>Will delete all Instagram data upon user request or account disconnection within 30 days</li>
            <li>Do not sell or license Instagram data to any third party</li>
          </ul>

          {/* --- 9 --- */}
          <h2 id="google-api-data">9. Google API Services User Data Policy Compliance</h2>
          <p>
            InfluenceIQ's use and transfer of information received from Google APIs adheres to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. Specifically:
          </p>
          <ul>
            <li>We only request access to Google user data that is necessary for the Service's functionality as described in this policy</li>
            <li>We access YouTube data in <strong>read-only mode</strong> — we do not upload, modify, or delete any content on your YouTube channel</li>
            <li>We do not use Google user data for serving advertisements</li>
            <li>We do not allow humans to read your data unless: (a) you give us explicit consent, (b) it is necessary for security purposes (e.g., investigating abuse), (c) it is necessary to comply with applicable law, or (d) our use is limited to internal operations and the data has been aggregated and anonymized</li>
            <li>We will delete all YouTube data upon user request or account disconnection within 30 days</li>
          </ul>

          {/* --- 10 --- */}
          <h2 id="cookies">10. Cookies</h2>
          <p>
            We use <strong>essential cookies only</strong> to maintain your login session and remember
            your preferences. We do not use advertising cookies, tracking pixels, or third-party
            analytics cookies.
          </p>

          {/* --- 11 --- */}
          <h2 id="children">11. Children's Privacy</h2>
          <p>
            The Service is not directed to individuals under the age of 13 (or the applicable age of
            digital consent in your jurisdiction). We do not knowingly collect personal information
            from children. If we learn that we have collected data from a child, we will delete it promptly.
          </p>

          {/* --- 12 --- */}
          <h2 id="changes">12. Changes to This Privacy Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of material changes
            by posting the new policy on this page and updating the "Last updated" date above. Your
            continued use of the Service after any changes constitutes acceptance of the updated policy.
          </p>

          {/* --- 13 --- */}
          <h2 id="contact">13. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, wish to exercise your data rights,
            or need to report a concern, please contact us at:
          </p>
          <ul>
            <li><strong>Email:</strong> privacy@influenceiq.com</li>
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
