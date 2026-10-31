import Link from 'next/link';
import { LEGAL, LegalPage } from '@/components/LegalPage';

export const metadata = { title: 'Terms of use' };

export default function Terms() {
  return (
    <LegalPage title="Terms of use">
      <p>These terms are an agreement between you and {LEGAL.company} for using Blessly. By creating an account you accept them. Please also read our <Link href="/privacy">privacy policy</Link>.</p>

      <h2>Your account</h2>
      <ul>
        <li>You must be 18 or over (or have a parent or guardian’s permission) and give accurate details.</li>
        <li>Keep your password safe; you’re responsible for what happens in your account.</li>
      </ul>

      <h2>Using Blessly fairly</h2>
      <ul>
        <li>Only add people you know, and only the details you need to send them wishes.</li>
        <li>Don’t use Blessly to send spam, harass anyone, or share anything unlawful, hateful or sexual involving minors, or that you don’t have the right to share (including photos of other people without their agreement).</li>
        <li>Don’t try to break, overload or get around the security or limits of the service.</li>
        <li>We may remove content or suspend accounts that break these rules, and will tell you why unless the law or safety prevents it.</li>
      </ul>

      <h2>Your content</h2>
      <p>You own what you create and upload. You give us permission to store, process and show it only to provide the service (for example to show your wish page to the people you share it with). AI-drafted wishes are suggestions; check them before sending.</p>

      <h2>Sending through other apps</h2>
      <p>WhatsApp, Telegram, SMS, email and social apps are run by other companies. For personal use, Blessly prepares the message and opens your app; you press send. Their own terms apply.</p>

      <h2>Plans and payments</h2>
      <ul>
        <li>The Free plan costs nothing. Family and Business plans are subscriptions billed monthly or yearly in advance through Razorpay (India) or Stripe (elsewhere), and renew automatically until cancelled.</li>
        <li>Cancel any time on the <Link href="/plans">Plans</Link> page; your plan keeps working until the end of the period you paid for. We don’t refund partial periods unless the law requires it.</li>
        <li>Prices may change for future periods; we’ll tell you at least 30 days before a change affects you.</li>
        <li>If a payment fails, we give you a short grace period before moving the account to the Free plan. Nothing you created is deleted, but some features become read-only above the free limits.</li>
      </ul>

      <h2 id="business">Extra terms for businesses</h2>
      <ul>
        <li><b>Consent is your responsibility.</b> Only add customers who agreed to receive messages from your business, record how they agreed, and honour opt-outs. Blessly stops messages to anyone who unsubscribes or replies STOP.</li>
        <li><b>WhatsApp.</b> You connect your own WhatsApp Business account and must follow Meta’s WhatsApp Business and Commerce policies. Meta charges your WhatsApp account for messages; those charges are separate from your Blessly plan.</li>
        <li><b>Your customers’ data.</b> For customer data, you are the controller and Blessly processes it on your behalf to send the messages you set up. We keep it confidential, protect it, use it for nothing else, and delete it when you delete it or close your account.</li>
        <li>We may pause sending if we receive complaints, see signs of spam, or if WhatsApp warns about your number’s quality, and we will tell you why.</li>
        <li>Team members you invite act on your behalf; you’re responsible for what they do.</li>
      </ul>

      <h2>Availability and liability</h2>
      <p>We work hard to keep Blessly running and reminders on time, but we can’t promise it will always be available or error-free, or that every message will be delivered by other services. To the extent the law allows, our total liability to you is limited to what you paid us in the 12 months before the claim. Nothing in these terms limits liability that cannot be limited by law, or your statutory rights as a consumer.</p>

      <h2>Ending</h2>
      <p>You can delete your account at any time in <Link href="/settings">Settings</Link>. We may close accounts that seriously or repeatedly break these terms.</p>

      <h2>Changes and contact</h2>
      <p>We’ll give notice in the app before material changes take effect. Questions: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.</p>
      <p>These terms are governed by the law of the country where {LEGAL.company} is established, without taking away the protection of the law where you live.</p>
    </LegalPage>
  );
}
