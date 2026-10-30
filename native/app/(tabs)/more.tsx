import { router } from 'expo-router';
import { Screen, Section, Row, Title } from '../../src/ui';
import { t } from '../../src/i18n';

export default function MoreScreen() {
  const items: { title: string; subtitle: string; href: string }[] = [
    { title: t('Write a wish'), subtitle: t('Draft and send a wish'), href: '/create' },
    { title: t('Notifications'), subtitle: t('Alerts and reminders'), href: '/notifications' },
    { title: t('Celebrations'), subtitle: t('Parties with RSVP and photos'), href: '/celebrations' },
    { title: t('Wishlists'), subtitle: t('Gifts friends can reserve'), href: '/wishlists' },
    { title: t('Albums'), subtitle: t('Photos to share with family'), href: '/albums' },
    { title: t('Card designs'), subtitle: t('Browse the card library'), href: '/designs' },
    { title: t('Money'), subtitle: t('Group gifts, gift cards, shop'), href: '/money' },
    { title: t('Plans'), subtitle: t('Free, Family and Business'), href: '/plans' },
    { title: t('Settings'), subtitle: t('Account, security and privacy'), href: '/settings' },
  ];
  return (
    <Screen>
      <Title>{t('More')}</Title>
      <Section>
        {items.map((i) => (
          <Row key={i.href} title={i.title} subtitle={i.subtitle} onPress={() => router.push(i.href as never)} />
        ))}
      </Section>
    </Screen>
  );
}
