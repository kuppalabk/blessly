import type { Metadata, Viewport } from 'next';
import './globals.css';
import { RegisterSW } from '@/components/RegisterSW';
import { I18nProvider } from '@/components/I18n';
import { dictionary, getLocale, getT } from '@/server/i18n';
import { isRtl } from '@/lib/i18n/ui';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
  title: { default: t('Blessly — wishes and reminders for every occasion'), template: '%s · Blessly' },
  description: t('Never miss a moment. Reminders, AI-written wishes in 32 languages and beautiful cards for every occasion.'),
  manifest: '/manifest.webmanifest',
  applicationName: 'Blessly',
  appleWebApp: { capable: true, title: 'Blessly', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' }
  };
}

export const viewport: Viewport = { themeColor: '#5B3FD1', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={isRtl(locale) ? 'rtl' : 'ltr'}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=DM+Sans:wght@400;500;700&family=Caveat:wght@700&family=Playfair+Display:ital,wght@0,700;1,400&family=Yatra+One&family=Dancing+Script:wght@700&family=Pacifico&family=Abril+Fatface&display=swap" />
      </head>
      <body>
        <I18nProvider locale={locale} dict={dictionary(locale)}>{children}</I18nProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
