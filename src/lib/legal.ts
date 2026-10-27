// Shared legal page content (privacy, terms, contact).
// Pure strings only: worker-safe (no DOM, no import.meta, no D1) so the Worker SSR
// and the React client render exactly the same copy.

export type LegalSlug = "privacy-policy" | "terms-of-use" | "contact";

export const LEGAL_SLUGS: readonly LegalSlug[] = ["privacy-policy", "terms-of-use", "contact"];

export const LEGAL_EFFECTIVE_DATE = "22 October 2026";

/** Clearly marked placeholder used until the owner sets `contact_email` in Admin / General. */
export const PLACEHOLDER_CONTACT_EMAIL = "contact@your-domain.example";

export function isLegalSlug(value: string): value is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(value);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export interface ContactEmail {
  email: string;
  configured: boolean;
}

/** Accepts only a plain address; anything else becomes the marked placeholder. */
export function resolveContactEmail(raw?: string): ContactEmail {
  const v = String(raw || "").trim();
  const ok = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/.test(v);
  return ok ? { email: v, configured: true } : { email: PLACEHOLDER_CONTACT_EMAIL, configured: false };
}

export interface LegalPageContent {
  title: string;
  description: string;
  h1: string;
  bodyHtml: string;
}

function emailLink(c: ContactEmail): string {
  const link = `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`;
  if (c.configured) return link;
  return `${esc(c.email)}<br><em>Placeholder address: the site owner must set a real contact email in Admin / General before this page is published.</em>`;
}

const EFFECTIVE = `<p><em>Effective date: ${LEGAL_EFFECTIVE_DATE}</em></p>`;

function privacy(c: ContactEmail): LegalPageContent {
  return {
    title: "Privacy Policy | SlopeCurve",
    description:
      "How SlopeCurve handles information when you browse and play free browser games, including comments, technical logs, third-party game embeds and your privacy choices.",
    h1: "Privacy Policy",
    bodyHtml: `${EFFECTIVE}
<h2>1. Introduction and scope</h2>
<p>SlopeCurve ("SlopeCurve", "we", "us", "our") operates the website at <a href="https://slopecurve.com">slopecurve.com</a> (the "Site"). The Site is a free portal where visitors can discover browser games and play games that are embedded from third-party sources.</p>
<p>This Privacy Policy explains what information may be processed when you visit the Site, browse game pages, play an embedded game, or submit a comment. It applies to the Site only. Games, websites and services operated by third parties are governed by their own privacy policies, not this one.</p>
<p><em>Operator details: a registered legal entity name and postal address are to be confirmed by the site owner before publication, where applicable law requires them to be disclosed.</em></p>

<h2>2. Information you provide voluntarily</h2>
<p>You can use most of the Site without creating an account. We may receive information when you choose to provide it, for example:</p>
<ul>
  <li><strong>Messages you send us</strong> — your email address and the content of your message, including any details or attachments you include when reporting a problem, a copyright concern or a privacy request.</li>
  <li><strong>Comments</strong> — the display name and comment text you submit on a game page, if commenting is available.</li>
  <li><strong>Anything else you choose to share</strong> — for example, feedback or suggestions sent by email.</li>
</ul>
<p>Please do not send sensitive personal information (such as government identifiers, financial details or health information). It is not needed to use the Site or to report a problem.</p>

<h2>3. Technical information that may be processed automatically</h2>
<p>Like most websites, the Site and its infrastructure process technical information when pages are requested. Depending on the provider configuration, this can include:</p>
<ul>
  <li>IP address and approximate network location derived from it;</li>
  <li>browser type and version, operating system and device type;</li>
  <li>the page or file requested, the referring page, and the date and time of the request;</li>
  <li>diagnostic and error data, and security signals used to detect abuse or attacks.</li>
</ul>
<p>This information is processed to deliver pages and game embeds, keep the Site available, protect it against abuse, and diagnose faults. Server and edge logs may be retained for a limited period by our hosting and security providers in line with their own retention settings.</p>

<h2>4. Comments</h2>
<p>Comments are available on every game page. When you submit a comment, the Site stores the display name you enter, the comment text, the game or page the comment belongs to, the moderation status, and timestamps. Comments are held for moderation and only approved comments are shown publicly. Approved comments — including the display name you chose — are visible to other visitors, so please avoid sharing personal information in comments.</p>
<p>To reduce spam and abuse, comment submissions are rate-limited and checked for duplicates and prohibited markup. Rate limiting uses a short-lived counter kept in server memory and keyed by a technical request identifier derived from your IP address. IP addresses are not written to the comment database; they may still appear in standard infrastructure logs as described above.</p>

<h2>5. Hosting, CDN, security and infrastructure providers</h2>
<p>The Site is served through Cloudflare infrastructure, including a content delivery network, a serverless application platform, and a managed database used to store site content and comments. These providers process technical data on our behalf to deliver and protect the service, and may keep their own operational and security logs under their policies. Administrator authentication is provided by Supabase, which processes the administrator account's email address and sign-in data on our behalf. We do not process payments on the Site and do not ask visitors to create accounts.</p>

<h2>6. Cookies and similar technologies</h2>
<p>In its current configuration, the Site does not set first-party advertising or analytics cookies. Our hosting, security and content-delivery provider may set strictly necessary security cookies (for example, bot-management cookies) when requests are handled; these are controlled by that provider.</p>
<p>The administrative area requires an authenticated Supabase session (email address and password) held by an authorized administrator, and the Site's administrative APIs reject any request that does not carry a valid session token for an administrator. The session token is stored in your browser's local storage so a page reload does not sign you out; the <em>Log out</em> button clears it. Ordinary visitors are not asked to sign in and are never given an account.</p>
<p>Embedded games are loaded from third-party domains and may set their own cookies or use local storage. Those technologies are controlled by the game operators, not by us. You can block or clear cookies in your browser settings; blocking some cookies may affect how third-party games behave. The Site does not currently respond differently to browser "Do Not Track" signals.</p>

<h2>7. Third-party game embeds and external websites</h2>
<p>Games on SlopeCurve are embedded from third-party URLs inside an iframe; we do not host the games themselves. When you play an embedded game, the third-party operator may receive your IP address, device and browser information and information about your interaction with the game, and may set cookies or show advertising. We do not control those practices and cannot see or change the data a game operator collects. Please review the privacy policy of each game or website you use.</p>
<p>The Site also contains links to external websites. Following such a link takes you to a service we do not operate and whose privacy practices may differ.</p>

<h2>8. Analytics and advertising</h2>
<p>No analytics service is enabled in the current configuration of the Site. The Site includes an advertising slot that is disabled by default; no advertising network is active unless the site owner explicitly enables and configures one.</p>
<p>If advertising is enabled in the future (for example through an advertising network such as Google AdSense), the provider may use cookies or similar technologies to serve and measure ads, and may collect information such as your IP address, device information and browsing activity, subject to that provider's policies. This policy will be updated to describe any such provider before it is activated.</p>
<p>We do not sell personal information.</p>

<h2>9. How information is used</h2>
<ul>
  <li>to deliver pages, assets and embedded games and to keep the Site working;</li>
  <li>to protect the Site, its visitors and its infrastructure against spam, abuse, attacks and fraud;</li>
  <li>to moderate comments and keep public pages appropriate;</li>
  <li>to respond to messages, reports, copyright concerns and privacy requests;</li>
  <li>to diagnose faults, maintain security and improve the Site's content and performance;</li>
  <li>to comply with applicable legal obligations and enforce our <a href="/terms-of-use">Terms of Use</a>.</li>
</ul>

<h2>10. Data retention and deletion</h2>
<p>Comment records are kept until they are approved, rejected, marked as spam or deleted, or until we remove them following a request. Approved comments may remain visible until removed. Messages sent by email are kept only as long as needed to handle the matter and for reasonable record-keeping. Infrastructure and security logs are retained for limited periods according to provider settings. Where information is no longer needed, we delete it or anonymize it.</p>

<h2>11. Data security</h2>
<p>We take reasonable technical and organizational measures to protect information, including encrypted connections (HTTPS), access controls on administrative functions, and server-side validation of submitted content. However, no method of transmission over the internet and no method of electronic storage can be guaranteed to be completely secure. Please keep this in mind when deciding what to send us or post publicly.</p>

<h2>12. Children's privacy</h2>
<p>The Site is a general-audience gaming portal and is not directed to children under 13 (or the minimum age required in your country). We do not knowingly collect personal information from children. If you are a parent or guardian and believe a child has submitted personal information to us, please contact us so that we can review and delete it. Some embedded games may have their own age requirements and parental controls, which are set by their operators.</p>

<h2>13. International visitors</h2>
<p>The Site is operated using global infrastructure, and information may be processed in countries other than the one where you live. Data-protection rules in those countries may differ from those in your own. Where required, we rely on appropriate safeguards for such transfers; the third-party providers described above publish their own transfer mechanisms.</p>

<h2>14. Your privacy requests</h2>
<p>Depending on where you live, you may have rights to access, correct, delete or restrict the use of personal information, or to object to certain processing. To make a request, contact us at ${emailLink(c)} and describe what you would like us to do. Include the relevant page URL and enough detail for us to identify the information concerned.</p>
<p>We may need to verify your identity before acting on a request, and some requests may be limited by applicable law (for example, where we must retain information for legal reasons or to protect the rights of others). We will respond within the period required by applicable law.</p>

<h2>15. Third-party links and services</h2>
<p>The Site links to and embeds content from third parties. This Privacy Policy does not apply to those services. We encourage you to read the privacy information provided by any game or website you visit.</p>

<h2>16. Changes to this policy</h2>
<p>We may update this Privacy Policy to reflect changes in the Site, its providers or applicable requirements. The effective date at the top of this page shows when the current version took effect. Material changes will be reflected on this page; continued use of the Site after an update means the updated policy applies.</p>

<h2>17. Contact</h2>
<p>Questions about this Privacy Policy or about how information is handled can be sent to ${emailLink(c)}. For general help, see the <a href="/contact">Contact page</a>.</p>`,
  };
}

function terms(c: ContactEmail): LegalPageContent {
  return {
    title: "Terms of Use | SlopeCurve",
    description:
      "The rules for using SlopeCurve: free browser games, third-party embeds, acceptable use, intellectual property, comments, availability and liability.",
    h1: "Terms of Use",
    bodyHtml: `${EFFECTIVE}
<h2>1. Acceptance of these Terms</h2>
<p>These Terms of Use ("Terms") govern your access to and use of the website at <a href="https://slopecurve.com">slopecurve.com</a> (the "Site"). By accessing or using the Site, you agree to these Terms. If you do not agree, please do not use the Site.</p>

<h2>2. About SlopeCurve</h2>
<p>SlopeCurve is a free portal for discovering and playing browser games. Games are provided by third parties and embedded in the Site from external URLs; we do not develop or host those games. The Site may also include guides, articles, categories, search and comment features. No account is required to play, and no payment is requested.</p>

<h2>3. Lawful and responsible use</h2>
<p>You agree to use the Site only for lawful, personal and non-commercial purposes, and in a way that does not harm the Site, its visitors or third parties. You are responsible for complying with the laws that apply to you and with any terms imposed by the operators of games you choose to play.</p>

<h2>4. Third-party games, embedded content and external links</h2>
<p>Games and other embedded content are operated by third parties. Their availability, content, functionality and terms are controlled by those third parties and may change or disappear at any time. Some games may be unavailable in certain regions, may require a compatible browser, or may refuse to load inside an iframe. When you play a third-party game, you may be subject to that provider's terms and privacy policy. Links to external websites are provided for convenience; we do not endorse and are not responsible for those websites.</p>

<h2>5. Intellectual property</h2>
<p>The Site's original content — including its name, logo, layout, design, text and the selection and arrangement of its content — is owned by the Site operator or used with permission, and is protected by applicable intellectual-property laws. You may view and use the Site for personal, non-commercial purposes. You may not copy, republish, redistribute or create derivative works from the Site's original content without permission, except where the law allows it.</p>
<p>Third-party games, artwork, trademarks and other assets remain the property of their respective owners and are subject to their own rights and licenses. Nothing on the Site transfers ownership of, or grants you a license to, any third-party game or asset. Games are embedded only where their operators permit embedding through standard web mechanisms.</p>
<p>If you believe content on the Site infringes your rights, please see the <a href="/contact">Contact page</a> for how to reach us with the details we need to review the matter.</p>

<h2>6. Comments and user submissions</h2>
<p>If commenting is available, you are responsible for what you submit. By submitting a comment, you confirm that you have the right to post it and you grant us a non-exclusive, worldwide, royalty-free license to display, moderate, format and remove it in connection with the Site. Comments are reviewed before publication and may be edited for length, rejected or removed at our discretion.</p>
<p>You must not post content that is unlawful, defamatory, harassing, hateful, sexually explicit, misleading, spam, or that infringes another person's rights, contains malware or links to malicious sites, or discloses another person's private information without permission. Do not include personal information about yourself or others in public comments.</p>

<h2>7. Prohibited behavior</h2>
<p>You must not, and must not attempt to:</p>
<ul>
  <li>access or interfere with the Site's servers, infrastructure, administrative areas or security controls without authorization;</li>
  <li>launch attacks, including denial-of-service, flooding, injection, scraping at a volume that degrades the service, or automated abuse of forms and APIs;</li>
  <li>introduce malware, malicious code or harmful files;</li>
  <li>bypass rate limits, filters or other protective measures;</li>
  <li>use the Site to send spam, advertise unrelated services, or impersonate another person or organization;</li>
  <li>frame, mirror or republish the Site in a way that misrepresents its origin or interferes with its operation;</li>
  <li>use the Site in violation of applicable law or of a third party's rights.</li>
</ul>
<p>We may suspend or block access, remove content and take other reasonable steps where we believe these rules have been broken.</p>

<h2>8. Availability, compatibility and changes</h2>
<p>The Site is provided free of charge and on an "as available" basis. We do not guarantee uninterrupted or error-free operation, and we may change, suspend or discontinue any part of the Site (including features, pages and game listings) at any time without notice. Games may not work on every browser, device or network, and third-party game providers may impose their own technical requirements. We do not guarantee that a particular game will remain available or playable.</p>

<h2>9. Third-party services</h2>
<p>The Site relies on third-party hosting, content-delivery, security and game providers. Their services may change, be interrupted or become unavailable, and their terms and policies apply to their own offerings. We are not responsible for third-party services or content.</p>

<h2>10. Disclaimer of warranties</h2>
<p>To the maximum extent permitted by applicable law, the Site and its content are provided "as is" and "as available", without warranties of any kind, whether express, implied or statutory, including implied warranties of merchantability, fitness for a particular purpose and non-infringement. We do not warrant that the Site will be uninterrupted, secure, accurate or free of errors, or that embedded games will function correctly.</p>
<p>Nothing in these Terms excludes or limits any warranty or right that cannot be excluded or limited under the law that applies to you, including mandatory consumer-protection rights.</p>

<h2>11. Limitation of liability</h2>
<p>To the maximum extent permitted by applicable law, the Site operator and its contributors will not be liable for any indirect, incidental, special, consequential or punitive damages, or for any loss of data, profits, revenue or goodwill, arising out of or relating to your use of, or inability to use, the Site or any embedded game, even if advised of the possibility of such damages.</p>
<p>Where liability cannot lawfully be excluded, our total liability arising out of or relating to the Site will be limited to the greatest extent permitted by applicable law. Nothing in these Terms limits liability for death or personal injury caused by negligence, for fraud, or for any other liability that cannot be limited by law.</p>

<h2>12. Indemnity</h2>
<p>To the extent permitted by applicable law, you agree to indemnify and hold harmless the Site operator from claims, losses and expenses (including reasonable legal costs) arising from your misuse of the Site, your violation of these Terms, or content you submit.</p>

<h2>13. Governing law and jurisdiction</h2>
<p><em>The governing law and the courts with jurisdiction over disputes are to be confirmed by the site owner before publication. Nothing in this section deprives you of the protection of mandatory rules of the law that applies to you, including consumer-protection rules.</em></p>

<h2>14. Changes to these Terms</h2>
<p>We may update these Terms from time to time. The effective date at the top of this page shows when the current version took effect. Changes apply to your use of the Site after they are published. If you do not agree to updated Terms, please stop using the Site.</p>

<h2>15. Contact</h2>
<p>Questions about these Terms can be sent to ${emailLink(c)}. For technical or copyright matters, please use the details on the <a href="/contact">Contact page</a>.</p>`,
  };
}

function contact(c: ContactEmail): LegalPageContent {
  return {
    title: "Contact Us | SlopeCurve",
    description:
      "How to contact SlopeCurve about games, broken embeds, compatibility problems, copyright concerns, privacy requests and partnership enquiries.",
    h1: "Contact Us",
    bodyHtml: `<p>We welcome questions, bug reports and feedback about <a href="https://slopecurve.com">SlopeCurve</a>. This page explains the best way to reach us and what to include so we can help quickly. The Site does not currently provide a contact form; messages are handled by email.</p>
<h2>Where to write</h2>
<p>Email: ${emailLink(c)}</p>
<p>Please use a clear subject line such as "Broken game", "Copyright concern", "Privacy request" or "Partnership". We read every message, but we cannot guarantee a specific response time.</p>

<h2>General questions and feedback</h2>
<p>For questions about the Site, suggestions for games or categories, or general feedback, email us with the subject "Feedback". Tell us which page you are referring to and what you would like to see improved. Constructive feedback about navigation, performance or accessibility is especially useful.</p>

<h2>Broken games and technical issues</h2>
<p>If a game does not load, shows an error, or behaves unexpectedly, please include:</p>
<ul>
  <li>the full page URL where the problem occurred (for example, https://slopecurve.com/games/example-game);</li>
  <li>your browser and version, and your operating system and device type;</li>
  <li>a short description of what happened and what you expected to happen;</li>
  <li>any error message shown, and — if possible — a screenshot;</li>
  <li>whether the problem happens every time or only occasionally.</li>
</ul>
<p>This information helps us check whether the cause is on our side or with the third-party game provider.</p>

<h2>Game loading and compatibility problems</h2>
<p>Games are embedded from third-party sources and may refuse to load in some browsers, regions or networks, or may block embedding entirely. If a game does not appear, first try a current version of a major browser, disable extensions that block iframes or scripts, and check whether the game's own website loads. If the problem continues, email us using the details listed above; we will review the listing and may replace the game if its provider no longer permits embedding. Browsing our <a href="/games">games library</a> or reading <a href="/blog">guides</a> may help you find a working alternative.</p>

<h2>Copyright and intellectual property concerns</h2>
<p>If you believe content on SlopeCurve infringes your rights, email us with the subject "Copyright concern". Please include:</p>
<ul>
  <li>the URL of the page on SlopeCurve that you are concerned about;</li>
  <li>a description of the work or right you believe is affected;</li>
  <li>an explanation of why you believe the use is not authorized;</li>
  <li>your name, contact details and your relationship to the rights holder.</li>
</ul>
<p>Games are operated by third parties. Where a concern relates to a game itself, we may need to refer the matter to the game's provider or remove the embed while it is reviewed. Where applicable law provides a formal notice procedure, we will handle notices in accordance with it.</p>

<h2>Privacy requests</h2>
<p>For questions about how information is handled, or to request access to, correction of, or deletion of information you have submitted, email us with the subject "Privacy request". Include the relevant page URL, your comment display name if applicable, and a clear description of your request. See our <a href="/privacy-policy">Privacy Policy</a> for details about what is stored and why. We may ask for information to verify a request before acting on it.</p>

<h2>Business inquiries and partnerships</h2>
<p>For advertising, game submissions, content partnerships or other business proposals, email us with the subject "Business inquiry". Describe your organization, the proposal, and any relevant links. We review proposals individually and do not guarantee a partnership or listing; all games remain subject to our editorial review and to the provider's embedding permissions.</p>

<h2>What not to send</h2>
<p>Please do not send passwords, payment details, government identifiers or other sensitive information. We do not need them to answer a question or investigate a problem.</p>

<h2>Before you write</h2>
<p>Many common questions are answered on our <a href="/faq">FAQ page</a>. You can also review our <a href="/terms-of-use">Terms of Use</a> and <a href="/privacy-policy">Privacy Policy</a>.</p>`,
  };
}

export function legalPage(slug: LegalSlug, contactEmail?: string): LegalPageContent {
  const c = resolveContactEmail(contactEmail);
  switch (slug) {
    case "privacy-policy":
      return privacy(c);
    case "terms-of-use":
      return terms(c);
    case "contact":
      return contact(c);
  }
}
