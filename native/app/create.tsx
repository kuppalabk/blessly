import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { me } from '../src/api/endpoints';
import { listPeople, type PersonView } from '../src/api/people';
import { draftWish, LANGUAGES, OCCASIONS, publishWishPage, saveWish, TONES, type Tone } from '../src/api/wishes';
import { Button, ErrorText, Field, Loading, Screen, Section, colors } from '../src/ui';
import { Chip } from './people/new';
import { t } from '../src/i18n';

const TONE_LABEL: Record<Tone, string> = { heartfelt: 'Heartfelt', funny: 'Funny', short: 'Short', poetic: 'Poetic' };
const DESIGNS = 250; // designs per occasion on the website
const PER_PAGE = 12;

const firstName = (name: string) => name.split(' ')[0] ?? name;
const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export default function CreateScreen() {
  const params = useLocalSearchParams<{ occasion?: string; person?: string; card?: string }>();
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [people, setPeople] = useState<PersonView[]>([]);
  const [senderName, setSenderName] = useState('');

  const [occasion, setOccasion] = useState(OCCASIONS.some((o) => o.id === params.occasion) ? params.occasion! : 'birthday');
  const [personId, setPersonId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [language, setLanguage] = useState('en');
  const [tone, setTone] = useState<Tone>('heartfelt');
  const [detail, setDetail] = useState('');
  const [text, setText] = useState('');
  const [variant, setVariant] = useState(0);
  const [source, setSource] = useState<'ai' | 'template' | null>(null);
  const [designIndex, setDesignIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [cardDraftId, setCardDraftId] = useState<string | null>(params.card ?? null);
  const [busy, setBusy] = useState<'draft' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rtl = LANGUAGES.find((l) => l.code === language)?.rtl ?? false;
  const pageCount = Math.ceil(DESIGNS / PER_PAGE);
  const thumbs = Array.from({ length: PER_PAGE }, (_, k) => page * PER_PAGE + k).filter((i) => i < DESIGNS);

  useEffect(() => {
    Promise.all([me(), listPeople()])
      .then(([m, r]) => {
        setSenderName(m.user.name);
        setPeople(r.people);
        const p = r.people.find((x) => x.id === params.person);
        if (p) {
          setPersonId(p.id);
          setRecipientName(firstName(p.name));
          setDetail(p.notes ?? '');
        }
        const lang = p?.language ?? m.user.language ?? 'en';
        setLanguage(LANGUAGES.some((l) => l.code === lang) ? lang : 'en');
        setReady(true);
      })
      .catch(() => setLoadError(t('Could not load.')));
  }, [params.person]);

  function choosePerson(id: string) {
    setPersonId(id);
    const p = people.find((x) => x.id === id);
    if (!p) return;
    setRecipientName(firstName(p.name));
    setDetail(p.notes ?? '');
    if (LANGUAGES.some((l) => l.code === p.language)) setLanguage(p.language);
  }

  async function draft(nextVariant: number) {
    if (!recipientName.trim()) { setError(t('Who is this wish for?')); return; }
    setBusy('draft'); setError(null); setVariant(nextVariant);
    try {
      const person = people.find((x) => x.id === personId);
      const r = await draftWish({
        occasion, language, tone, recipientName, relationship: person?.relationship, senderName,
        detail: detail || undefined, variant: nextVariant,
      });
      setText(r.draft.text);
      setSource(r.draft.source);
    } catch (e) {
      setError(errMsg(e, t('Could not write the wish')));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!text.trim()) { setError(t('Write or generate the wish first')); return; }
    setBusy('save'); setError(null);
    try {
      const { wish } = await saveWish({
        personId: personId || null, occasion, language, tone, text, designIndex, recipientName, senderName, cardDraftId, messageFileId: null,
      });
      // The wish page is created on the wish screen too, if this fails.
      await publishWishPage(wish.id).catch(() => undefined);
      router.replace(`/wishes/${wish.id}`);
    } catch (e) {
      setError(errMsg(e, t('Could not save')));
      setBusy(null);
    }
  }

  const back = (
    <Pressable accessibilityRole="button" accessibilityLabel={t('Back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.back}>
      <Text style={styles.backText}>‹</Text>
    </Pressable>
  );

  if (!ready) {
    return <Screen scroll={false}>{loadError ? <ErrorText>{loadError}</ErrorText> : <Loading />}</Screen>;
  }

  return (
    <Screen>
      <View style={styles.header}>
        {back}
        <Text style={styles.h1}>{t('Create a wish')}</Text>
      </View>

      <Section title={t('1 · Occasion and person')}>
        <Text style={styles.label}>{t('Occasion')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {OCCASIONS.map((o) => (
            <Chip key={o.id} label={t(o.label)} selected={occasion === o.id} onPress={() => { setOccasion(o.id); setDesignIndex(0); setPage(0); }} />
          ))}
        </ScrollView>
        <Text style={styles.label}>{t('From your people')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          <Chip label={t('Someone else')} selected={!personId} onPress={() => choosePerson('')} />
          {people.map((p) => <Chip key={p.id} label={`${p.name} · ${p.relationship}`} selected={personId === p.id} onPress={() => choosePerson(p.id)} />)}
        </ScrollView>
        <Field label={t('Their name on the wish')} placeholder={t('e.g. Nisha')} value={recipientName} onChangeText={setRecipientName} />
      </Section>

      <Section title={t('2 · Write the wish')}>
        <Text style={styles.label}>{t('Language')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {LANGUAGES.map((l) => <Chip key={l.code} label={l.label} selected={language === l.code} onPress={() => setLanguage(l.code)} />)}
        </ScrollView>
        <Field label={t('Personal detail (optional)')} placeholder={t('e.g. our Goa trip')} value={detail} onChangeText={setDetail} maxLength={200} />
        <View style={styles.wrap}>
          {TONES.map((k) => <Chip key={k} label={t(TONE_LABEL[k])} selected={tone === k} onPress={() => setTone(k)} />)}
        </View>
        <View style={styles.wrap}>
          <Button label={text ? t('Rewrite') : t('Write my wish')} busy={busy === 'draft'} disabled={busy === 'save'} onPress={() => draft(0)} />
          {text ? <Button label={t('Try another')} variant="secondary" disabled={busy !== null} onPress={() => draft(variant + 1)} /> : null}
        </View>
        <Field
          label={t('Your wish (edit freely)')}
          placeholder={t('Tap “Write my wish”, or type your own.')}
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          textAlign={rtl ? 'right' : 'left'}
          maxLength={2000}
        />
        {source === 'template' && language !== 'en' && tone !== 'short' && (
          <Text style={styles.hint}>{t('Built-in template. Tone variations in this language need the AI writer to be switched on.')}</Text>
        )}
      </Section>

      {cardDraftId ? (
        <Section title={t('3 · Your card')}>
          <Text style={styles.hint}>{t('The wish page shows the front and inside of this card above your message.')}</Text>
          <Button label={t('Use a ready-made design instead')} variant="secondary" onPress={() => setCardDraftId(null)} />
        </Section>
      ) : (
        <Section title={t('3 · Pick a card · design {n} · {shown} of {total} designs', { n: designIndex + 1, shown: DESIGNS, total: DESIGNS })}>
          <View style={styles.grid}>
            {thumbs.map((i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityState={{ selected: i === designIndex }}
                accessibilityLabel={`${t('Design')} ${i + 1}`}
                onPress={() => setDesignIndex(i)}
                style={[styles.design, i === designIndex && styles.designOn]}
              >
                <Text style={[styles.designText, i === designIndex && styles.designTextOn]}>{i + 1}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.pager}>
            <Button label={t('Previous')} variant="secondary" disabled={page === 0} onPress={() => setPage(page - 1)} />
            <Text style={styles.hint}>{t('Page {page} of {pages}', { page: page + 1, pages: pageCount })}</Text>
            <Button label={t('More designs')} variant="secondary" disabled={page >= pageCount - 1} onPress={() => setPage(page + 1)} />
          </View>
          <Text style={styles.hint}>{t('Card artwork is shown on the wish page. Customising a card is on the website for now.')}</Text>
        </Section>
      )}

      <Section title={t('4 · Voice or video message (optional)')}>
        <Text style={styles.hint}>{t('Voice and video messages can be added on the website.')}</Text>
      </Section>

      <ErrorText>{error}</ErrorText>
      <Button label={t('Save and send')} busy={busy === 'save'} disabled={busy === 'draft'} onPress={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  backText: { fontSize: 28, color: colors.brand, marginTop: -4 },
  h1: { fontSize: 24, fontWeight: '700', color: colors.text, flexShrink: 1 },
  label: { fontSize: 14, color: colors.muted },
  hint: { fontSize: 13, color: colors.muted },
  row: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  design: { width: 56, height: 56, borderRadius: 12, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page },
  designOn: { borderColor: colors.brand, backgroundColor: colors.brand },
  designText: { fontSize: 15, fontWeight: '600', color: colors.text },
  designTextOn: { color: '#fff' },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
});
