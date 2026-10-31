import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { DESIGN_EDITOR_PATH, deleteCard, duplicateCard, getCard, occasionLabel, updateCard, type CardDetail } from '../../../src/api/designs';
import { openWebPage } from '../../../src/api/account';
import { t } from '../../../src/i18n';
import { Button, ErrorText, Field, Loading, Screen, Section, Title, colors } from '../../../src/ui';

export default function CardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [card, setCard] = useState<CardDetail | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    getCard(id)
      .then(({ design }) => {
        setCard(design);
        setTitle(design.title);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t('Card not found')));
  }, [id]);
  useFocusEffect(load);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong'));
    } finally {
      setBusy(null);
    }
  }

  if (!card) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  // Wishes and prints use the finished pictures of both pages. The editor draws them on the website,
  // so until both exist the card has to be finished there first.
  const ready = !!card.frontUrl && !!card.insideUrl;
  const finishInEditor = () => setNotice(t('Finish the card in the editor first: open the editor, then tap “Use this card for a wish” or “Print-ready PDF”.'));

  return (
    <Screen>
      <Title>{card.title}</Title>
      <Text style={styles.muted}>{t(occasionLabel(card.occasion))} · {new Date(card.updatedAt).toLocaleDateString()}</Text>

      <Section title={t('Preview')}>
        {card.frontUrl || card.insideUrl ? (
          <View style={styles.previewRow}>
            {card.frontUrl ? <Image source={{ uri: card.frontUrl }} style={styles.page} resizeMode="cover" accessibilityLabel={t('Front of the card')} /> : null}
            {card.insideUrl ? <Image source={{ uri: card.insideUrl }} style={styles.page} resizeMode="cover" accessibilityLabel={t('Inside of the card')} /> : null}
          </View>
        ) : (
          <Text style={styles.muted}>{t('This card has no pictures yet. Open the editor on the website to design it.')}</Text>
        )}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <ErrorText>{error}</ErrorText>
      </Section>

      <Section title={t('Use this card')}>
        <Button
          label={t('Use this card for a wish')}
          onPress={() => (ready ? router.push(`/create?card=${card.id}&occasion=${card.occasion}`) : finishInEditor())}
        />
        <Button
          label={t('Print and post')}
          variant="secondary"
          onPress={() => (ready ? router.push(`/designs/${card.id}/print`) : finishInEditor())}
        />
      </Section>

      <Section title={t('Edit')}>
        <Field label={t('Design name')} value={title} onChangeText={setTitle} maxLength={80} />
        <Button
          label={t('Save')}
          variant="secondary"
          disabled={!title.trim() || title.trim() === card.title}
          busy={busy === 'save'}
          onPress={() => run('save', async () => {
            await updateCard(card.id, { title: title.trim() });
            setNotice(t('Saved'));
            load();
          })}
        />
        <Button label={t('Open the editor on the website')} variant="secondary" onPress={() => openWebPage(DESIGN_EDITOR_PATH(card.id))} />
        <Button
          label={card.favourite ? t('Unfavourite') : t('Favourite')}
          variant="secondary"
          busy={busy === 'fav'}
          onPress={() => run('fav', async () => {
            await updateCard(card.id, { favourite: !card.favourite });
            load();
          })}
        />
        <Button
          label={t('Copy')}
          variant="secondary"
          busy={busy === 'copy'}
          onPress={() => run('copy', async () => {
            const { design } = await duplicateCard(card.id);
            router.push(`/designs/${design.id}`);
          })}
        />
        <Button
          label={t('Delete')}
          variant="danger"
          busy={busy === 'delete'}
          onPress={() => Alert.alert(t('Delete this card? Wishes you already sent with it will show their original design.'), undefined, [
            { text: t('Cancel'), style: 'cancel' },
            {
              text: t('Delete'), style: 'destructive', onPress: () => run('delete', async () => {
                await deleteCard(card.id);
                router.replace('/designs');
              })
            }
          ])}
        />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  notice: { color: colors.brand, fontSize: 14, lineHeight: 20 },
  previewRow: { flexDirection: 'row', gap: 10 },
  page: { flex: 1, aspectRatio: 0.75, borderRadius: 10, backgroundColor: colors.page },
});
