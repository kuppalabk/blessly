import Link from 'next/link';
import { LEGAL, LegalPage } from '@/components/LegalPage';

export const metadata = { title: 'Privacy policy' };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>{LEGAL.company === "Blessly" ? "Blessly (“we”)" : `${LEGAL.company} (“Blessly”, “we”)`} helps you remember the occasions that matter and send wishes. This policy explains what we collect, why, who helps us, and the choices you have. It applies to the Blessly website and app.</p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Your account:</b> name, email, password (stored only as a secure hash), country, timezone and language.</li>
        <li><b>People you add:</b> names, relationships, birthdays and other dates, and — if you add them — their mobile number, email and notes. You tell us about them; please only add people you know and keep it to what you need for wishes.</li>
        <li><b>What you create:</b> wishes, cards, wish pages and the messages friends leave on them, scheduled sends, family circles, events, RSVPs and tasks, photo albums and photos.</li>
        <li><b>Photos:</b> we make resized copies and remove hidden information such as GPS location before storing them.</li>
        <li><b>Business customers:</b> if you use Blessly for business, the customer details you upload or add, with the consent you record for each one, and the messages sent to them.</li>
        <li><b>Devices and usage:</b> push-notification tokens if you turn notifications on, when you last used Blessly, and basic technical logs (such as IP address) to keep the service secure.</li>
        <li><b>Payments:</b> handled by our payment partners. We keep the plan, dates and status, never your full card or bank details.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To provide the service you asked for: reminders, wishes, sharing, family circles, albums and business messages (performance of our contract with you).</li>
        <li>To keep accounts and the service secure and prevent abuse (our legitimate interests).</li>
        <li>To send messages to people and customers only when you ask us to, and only where consent has been given.</li>
        <li>To meet legal obligations, such as tax records for payments.</li>
      </ul>
      <p>We don’t sell personal data and don’t use it for advertising profiles.</p>

      <h2>Who helps us (processors)</h2>
      <ul>
        <li>Hosting and database providers, which store the data.</li>
        <li>Email delivery (Resend) for reminders and emails you send.</li>
        <li>AI writing (Anthropic) when you ask Blessly to draft a wish — we send the occasion, tone, language and the names and details you typed, not your contacts.</li>
        <li>Meta (WhatsApp Business Platform) for business messages sent from a business’s own WhatsApp number.</li>
        <li>Payments: Razorpay (India) and Stripe (elsewhere).</li>
        <li>Photo storage (an S3-compatible storage provider).</li>
        <li>Browser push services (Google, Apple, Mozilla) to deliver notifications you turned on.</li>
      </ul>
      <p>They may only use the data to provide their service to us. Some are outside your country; where required, we use appropriate safeguards such as standard contractual clauses.</p>

      <h2>Who can see what</h2>
      <ul>
        <li>People you add are private to you unless you share them with a family circle — then everyone in that circle can see them and gets their reminders.</li>
        <li>Wish pages and shared albums can be opened by anyone with the link. Turn sharing off at any time.</li>
        <li>Our support team sees only summary information. If they need to look at your account to help you, they use a read-only view, it is logged, and you are told.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>We keep your data while your account is open. When you delete your account, your data is deleted straight away from the live service (family circles you own pass to the next member). Copies in our hosting provider’s backups are overwritten on their normal schedule, usually within 30 days. Payment records are kept as long as tax law requires.</p>

      <h2>Your rights and choices</h2>
      <ul>
        <li><b>Download your data</b> and <b>delete your account</b> any time in <Link href="/settings">Settings</Link>.</li>
        <li>Correct your details in Settings, or edit and delete people, wishes and photos in the app.</li>
        <li>Turn notifications off in Settings or your device settings.</li>
        <li>Business customers can unsubscribe with the link in any email or by replying STOP on WhatsApp.</li>
        <li>Depending on where you live (for example under the GDPR in the UK and EU, or India’s Digital Personal Data Protection Act 2023), you can also ask for access, correction, erasure, restriction or portability, object to processing, withdraw consent, and nominate someone to exercise your rights. Email <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.</li>
        <li>You can complain to your data protection authority (for example the ICO in the UK) or, in India, to the Data Protection Board after contacting our grievance officer.</li>
      </ul>

      <h2>Children</h2>
      <p>Blessly is for people aged 18 and over. Under-18s may only use it with a parent or guardian’s consent and supervision.</p>

      <h2>Security</h2>
      <p>We use encryption in transit, hashed passwords, encrypted business credentials, signed photo links, rate limits and access checks, and we review our security regularly. No service is perfectly secure; tell us at <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a> if you find a problem.</p>

      <h2>Contact</h2>
      <p>{LEGAL.company}{LEGAL.address ? `, ${LEGAL.address}` : ''}. Email <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.{LEGAL.grievance ? ` Grievance officer (India): ${LEGAL.grievance}.` : ''}</p>
      <p>We’ll post changes here and tell you in the app about important ones.</p>
    </LegalPage>
  );
}
