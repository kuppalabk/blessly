import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { getPlans, openWebPage, type PlansView } from '../../src/api/account';
import { t } from '../../src/i18n';
import { Button, ErrorText, Loading, Screen, Title, colors } from '../../src/ui';
import { PlanCards } from './index';

/** The public price list (website /pricing). Signed-out visitors see the plans and go to the website to sign up. */
export default function PricingScreen() {
  const [data, setData] = useState<PlansView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlans().then(setData).catch((e) => setError(e instanceof Error ? e.message : t('Could not load plans')));
  }, []);

  if (!data) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  return (
    <Screen>
      <Title>{t('Simple pricing')}</Title>
      <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 15 }}>
        {t('Free for personal wishes. Upgrade for your whole family or your business.')}
      </Text>
      <PlanCards plans={data.plans} defaultCurrency="INR" />
      <Button label={t('Terms')} variant="secondary" onPress={() => openWebPage('/terms')} />
      <Button label={t('Privacy')} variant="secondary" onPress={() => openWebPage('/privacy')} />
    </Screen>
  );
}
