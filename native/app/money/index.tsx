import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { t } from '../../src/i18n';
import { Screen, Title, colors } from '../../src/ui';
import { TestMode } from './shop';

const LINKS: { href: string; icon: string; title: string; sub: string }[] = [
  { href: '/money/pots', icon: '🎁', title: 'Group gifts and fundraisers', sub: 'Everyone chips in for one gift, or raises money for a charity' },
  { href: '/money/gift-cards', icon: '💳', title: 'Gift cards', sub: 'Send a gift card by email, today or on their birthday' },
  { href: '/money/shop', icon: '🛍️', title: 'Shop', sub: 'Gifts from independent sellers, delivered' },
  { href: '/designs', icon: '✉️', title: 'Printed cards', sub: 'Print and post a card you designed — open one of your cards' },
  { href: '/money/orders', icon: '📦', title: 'My orders', sub: 'Gift cards, shop orders and printed cards' },
  { href: '/money/partners', icon: '🤝', title: 'Sell, design or fundraise with Blessly', sub: 'Seller, card designer and charity accounts' }
];

export default function MoneyScreen() {
  return (
    <Screen>
      <Title>{t('Gifts and payments')}</Title>
      <TestMode />
      <View style={{ backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden' }}>
        {LINKS.map((l) => (
          <Pressable
            key={l.href}
            accessibilityRole="button"
            onPress={() => router.push(l.href)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.line }}
          >
            <Text style={{ fontSize: 26 }}>{l.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{t(l.title)}</Text>
              <Text style={{ fontSize: 14, color: colors.muted, marginTop: 2 }}>{t(l.sub)}</Text>
            </View>
            <Text style={{ fontSize: 22, color: colors.muted }}>›</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
