import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  confirmPhoneChange, openWebPage, removePhone, removeSessionsElsewhere, setPassword, signInOptions, startPhoneChange, twoStepConfirm,
  twoStepNewCodes, twoStepOff, twoStepSetup, unlinkIdentity, type SignInOptions, type TwoStepSetup
} from '../../src/api/account';
import { t } from '../../src/i18n';
import { Button, ErrorText, Field, Loading, Screen, Section, Title, colors } from '../../src/ui';

type Provider = 'google' | 'apple';
const PROVIDER_NAME: Record<Provider, string> = { google: 'Google', apple: 'Apple' };

/** The QR code comes from the server as a base64 SVG data link. */
function qrSvg(dataUrl: string) {
  const comma = dataUrl.indexOf(',');
  return atob(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
}

export default function SecurityScreen() {
  const [opts, setOpts] = useState<SignInOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [setup, setSetup] = useState<TwoStepSetup | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);

  const [pw, setPw] = useState({ current: '', next: '' });

  const [phone, setPhone] = useState('');
  const [phoneStep, setPhoneStep] = useState<{ token: string; phone: string; devCode?: string } | null>(null);
  const [phoneCode, setPhoneCode] = useState('');

  const reload = useCallback(() => {
    signInOptions().then(setOpts).catch((e) => setError(e instanceof Error ? e.message : t('Could not load')));
  }, []);
  useFocusEffect(reload);

  async function run(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    setError(null);
    setMsg(null);
    try {
      const m = await fn();
      if (m) setMsg(m);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Something went wrong'));
    } finally {
      setBusy(null);
    }
  }

  if (!opts) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  const codeOk = code.trim().length >= 6;

  return (
    <Screen>
      <Title>{t('Sign-in and security')}</Title>
      {msg ? <Text style={styles.notice}>{msg}</Text> : null}
      <ErrorText>{error}</ErrorText>

      {/* Two-step verification */}
      <Section>
        <View style={styles.headRow}>
          <Text style={styles.h2}>{t('Two-step verification')}</Text>
          <Text style={[styles.badge, opts.mfa && styles.badgeOn]}>{opts.mfa ? t('On') : t('Off')}</Text>
        </View>
        <Text style={styles.small}>
          {t('After your password (or Google, Apple or a text code), you’ll also enter a code from an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password.')}
        </Text>

        {codes ? (
          <View style={styles.codesBox}>
            <Text style={styles.bold}>{t('Save your recovery codes')}</Text>
            <Text style={styles.small}>
              {t('If you lose your phone, each code lets you in once. Keep them somewhere safe — they won’t be shown again.')}
            </Text>
            <View style={styles.codes}>
              {codes.map((c) => <Text key={c} selectable style={styles.code}>{c}</Text>)}
            </View>
            <Text style={styles.small}>{t('Press and hold a code to copy it.')}</Text>
            <Button label={t('I’ve saved them')} variant="secondary" onPress={() => setCodes(null)} />
          </View>
        ) : null}

        {!opts.mfa && !setup ? (
          <Button label={t('Turn on')} variant="secondary" busy={busy === 'setup'} onPress={() => run('setup', async () => { setSetup(await twoStepSetup()); })} />
        ) : null}

        {!opts.mfa && setup ? (
          <View style={{ gap: 10 }}>
            <Text style={styles.small}>{t('1. Scan this with your authenticator app:')}</Text>
            <View style={styles.qr} accessibilityLabel={t('QR code for your authenticator app')}>
              <SvgXml xml={qrSvg(setup.qr)} width={180} height={180} />
            </View>
            <Button
              label={t('Open authenticator app')}
              variant="secondary"
              onPress={() => Linking.openURL(setup.uri).catch(() => setError(t('No authenticator app found on this phone. Scan the code or enter the key instead.')))}
            />
            <Text style={styles.small}>
              {t('Can’t scan? Enter this key:')} <Text selectable style={styles.mono}>{setup.secret}</Text>
            </Text>
            <Field label={t('2. Enter the 6-digit code it shows')} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" maxLength={7} />
            <Button
              label={t('Confirm and turn on')}
              busy={busy === 'confirm'}
              disabled={!codeOk}
              onPress={() => run('confirm', async () => {
                const r = await twoStepConfirm(code.trim());
                setCodes(r.recoveryCodes);
                setSetup(null);
                setCode('');
                return t('Two-step verification is on.');
              })}
            />
            <Button label={t('Cancel')} variant="secondary" onPress={() => setSetup(null)} />
          </View>
        ) : null}

        {opts.mfa ? (
          <View style={{ gap: 10 }}>
            <Text style={styles.small}>
              {opts.recoveryCodesLeft === 1 ? t('1 recovery code left.') : t('{n} recovery codes left.', { n: opts.recoveryCodesLeft })}
            </Text>
            <Field label={t('Code from your app (to make changes)')} value={code} onChangeText={setCode} autoComplete="one-time-code" maxLength={20} />
            <Button
              label={t('New recovery codes')}
              variant="secondary"
              disabled={!codeOk}
              busy={busy === 'rec'}
              onPress={() => run('rec', async () => {
                const r = await twoStepNewCodes(code.trim());
                setCodes(r.recoveryCodes);
                setCode('');
              })}
            />
            <Button
              label={t('Turn off')}
              variant="secondary"
              disabled={!codeOk}
              busy={busy === 'off'}
              onPress={() => run('off', async () => {
                await twoStepOff(code.trim());
                setCode('');
                return t('Two-step verification is off.');
              })}
            />
          </View>
        ) : null}
      </Section>

      {/* Password */}
      <Section title={t('Ways to sign in')}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bold}>{t('Password')}</Text>
            <Text style={styles.small}>{opts.hasPassword ? t('Set') : t('Not set — you sign in with the options below')}</Text>
          </View>
        </View>
        {opts.hasPassword ? (
          <Field label={t('Current password')} value={pw.current} onChangeText={(current) => setPw({ ...pw, current })} secureTextEntry autoComplete="current-password" />
        ) : null}
        <Field
          label={opts.hasPassword ? t('New password') : t('Set a password')}
          value={pw.next}
          onChangeText={(next) => setPw({ ...pw, next })}
          secureTextEntry
          autoComplete="new-password"
        />
        <Button
          label={opts.hasPassword ? t('Change password') : t('Set password')}
          variant="secondary"
          disabled={pw.next.length < 8}
          busy={busy === 'pw'}
          onPress={() => run('pw', async () => {
            await setPassword(pw.current, pw.next);
            setPw({ current: '', next: '' });
            return opts.hasPassword ? t('Password changed.') : t('Password set.');
          })}
        />

        {(['google', 'apple'] as Provider[]).map((p) => {
          const linked = opts.identities.find((i) => i.provider === p);
          return (
            <View key={p} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bold}>{PROVIDER_NAME[p]}</Text>
                <Text style={styles.small}>
                  {linked ? `${t('Connected')}${linked.email ? ` · ${linked.email}` : ''}` : t('Not connected')}
                </Text>
              </View>
              {linked ? (
                <Button
                  label={t('Disconnect')}
                  variant="secondary"
                  busy={busy === 'un' + p}
                  onPress={() => run('un' + p, async () => {
                    await unlinkIdentity(p);
                    return t('{provider} disconnected.', { provider: PROVIDER_NAME[p] });
                  })}
                />
              ) : (
                // Linking runs the website's sign-in page. It needs the website session (see report).
                <Button label={t('Connect')} variant="secondary" onPress={() => openWebPage(`/api/auth/oauth/${p}?link=1`)} />
              )}
            </View>
          );
        })}

        <View style={{ gap: 8 }}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bold}>{t('Mobile number')}</Text>
              <Text style={styles.small}>
                {opts.phone ? t('{phone} · sign in with a text code', { phone: opts.phone }) : t('Add one to sign in with a text-message code')}
              </Text>
            </View>
            {opts.phone ? (
              <Button label={t('Remove')} variant="secondary" busy={busy === 'rmphone'} onPress={() => run('rmphone', async () => { await removePhone(); return t('Number removed.'); })} />
            ) : null}
          </View>
          {!phoneStep ? (
            <View style={{ gap: 8 }}>
              <Field label={t('Mobile number')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+91 98765 43210" autoComplete="tel" />
              <Button
                label={opts.phone ? t('Change number') : t('Add number')}
                variant="secondary"
                disabled={phone.trim().length < 6}
                busy={busy === 'phone'}
                onPress={() => run('phone', async () => { setPhoneStep(await startPhoneChange(phone.trim())); })}
              />
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              <Text style={styles.small}>{t('We texted a code to {phone}.', { phone: phoneStep.phone })}</Text>
              {phoneStep.devCode ? <Text style={styles.notice}>{t('Development mode — your code is')} {phoneStep.devCode}</Text> : null}
              <Field label={t('Code')} value={phoneCode} onChangeText={setPhoneCode} keyboardType="number-pad" maxLength={6} />
              <Button
                label={t('Verify')}
                disabled={phoneCode.length !== 6}
                busy={busy === 'phone2'}
                onPress={() => run('phone2', async () => {
                  await confirmPhoneChange(phoneStep.token, phoneCode);
                  setPhoneStep(null);
                  setPhoneCode('');
                  setPhone('');
                  return t('Number verified.');
                })}
              />
              <Button label={t('Cancel')} variant="secondary" onPress={() => setPhoneStep(null)} />
            </View>
          )}
        </View>
      </Section>

      {/* Devices */}
      <Section title={t('Signed-in devices')}>
        <Text style={styles.small}>
          {opts.sessions === 1
            ? t('You’re signed in on {n} device (including this one).', { n: opts.sessions })
            : t('You’re signed in on {n} devices (including this one).', { n: opts.sessions })}
        </Text>
        <Button
          label={t('Sign out of other devices')}
          variant="secondary"
          disabled={opts.sessions < 2}
          busy={busy === 'out'}
          onPress={() => run('out', async () => { await removeSessionsElsewhere(); return t('Signed out everywhere else.'); })}
        />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h2: { fontSize: 18, fontWeight: '700', color: colors.text },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { fontSize: 13, color: colors.muted, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 10, overflow: 'hidden' },
  badgeOn: { color: '#fff', backgroundColor: colors.brand, borderColor: colors.brand },
  bold: { fontSize: 16, fontWeight: '600', color: colors.text },
  small: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  notice: { color: colors.brand, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  mono: { fontFamily: 'monospace', color: colors.text },
  qr: { alignSelf: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 8 },
  codesBox: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#efeafc' },
  codes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  code: { fontFamily: 'monospace', fontSize: 15, color: colors.text, width: '45%' },
});
