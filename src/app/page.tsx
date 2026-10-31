import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '@/server/http';
import { Icon } from '@/components/Icon';
import { GreetingCard } from '@/components/GreetingCard';
import { GREETINGS, LANGUAGES, type LanguageCode } from '@/lib/i18n-data';
import { getT } from '@/server/i18n';
import { LanguagePicker } from '@/components/LanguagePicker';

export const dynamic = 'force-dynamic';

export default async function Landing() {
  const { t, locale } = await getT();
  if (await currentUser()) redirect('/home');
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 16px 48px' }}>
      <header className="row between" style={{ marginBottom: 32 }}>
        <Link href="/" className="brand"><span className="brand-mark"><Icon name="sparkle" size={18} strokeWidth={2} /></span>{t("Blessly")}</Link>
        <div className="row" style={{ gap: 8 }}>
          <Link href="/login" className="btn btn-ghost btn-sm">{t("Log in")}</Link>
          <Link href="/signup" className="btn btn-dark btn-sm">{t("Start free")}</Link>
        </div>
      </header>
      <section className="two-col" style={{ alignItems: 'center', gap: 36 }}>
        <div className="stack-lg">
          <p className="eyebrow" style={{ color: 'var(--accent-ink)' }}>{t("AI wishes · smart reminders · family")}</p>
          <h1 style={{ fontSize: 'clamp(36px, 6vw, 56px)' }}>{t("Never miss a moment. Never forget someone who matters.")}</h1>
          <p style={{ fontSize: 18, color: '#4A4558' }}>{t("Blessly reminds you a week before every birthday, anniversary and festival, writes a heartfelt wish in {length} languages, and opens WhatsApp or Telegram with it ready to send.", { length: LANGUAGES.length })}</p>
          <div className="row-wrap">
            <Link href="/signup" className="btn">{t("Create your free account")}</Link>
            <Link href="/cards" className="btn btn-ghost">{t("Browse 4,000 cards")}</Link>
          </div>
          <p className="muted small">{t("Free plan · no app store needed · install it from your browser")}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 440, justifySelf: 'center', width: '100%' }}>
          <GreetingCard occasion="diwali" designIndex={3} greeting={GREETINGS.diwali[locale as LanguageCode] ?? GREETINGS.diwali.en} to={t("For Anil")} language={locale} />
          <div style={{ marginTop: 40 }}><GreetingCard occasion="birthday" designIndex={12} greeting={GREETINGS.birthday[locale as LanguageCode] ?? GREETINGS.birthday.en} to={t("For Nisha")} language={locale} /></div>
        </div>
      </section>
      <section className="stack" style={{ marginTop: 56 }}>
        <h2 style={{ fontSize: 28 }}>{t("How it works")}</h2>
        <div className="two-col" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {[
            [t('1 · Remember'), t('Add people once. Festivals for your country are already in your calendar.'), 'var(--accent-soft)'],
            [t('2 · Create'), t('AI writes the wish in your tone and language. Pick one of 250 card designs per occasion.'), 'var(--primary-soft)'],
            [t('3 · Connect'), t('One tap opens WhatsApp or Telegram with the wish ready. Email can send itself on the day.'), 'var(--green-soft)']
          ].map(([title, d, bg]) => (
            <div key={title} className="card-box" style={{ background: bg, border: 0 }}><h3 style={{ fontSize: 20, marginBottom: 6 }}>{title}</h3><p>{d}</p></div>
          ))}
        </div>
      </section>
      <footer className="row-wrap muted small" style={{ marginTop: 56, gap: 16, borderTop: '1px solid var(--line)', paddingTop: 20 }}>
        <Link href="/pricing">{t("Pricing")}</Link><Link href="/cards">{t("Card library")}</Link><Link href="/business">{t("For business")}</Link><Link href="/privacy">{t("Privacy")}</Link><Link href="/terms">{t("Terms")}</Link>
        <LanguagePicker />
      </footer>
    </div>
  );
}
