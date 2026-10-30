import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { t } from '../i18n';

export const colors = {
  brand: '#5b3fd6',
  text: '#1d1b20',
  muted: '#66636f',
  line: '#dcd9e3',
  surface: '#ffffff',
  page: '#f7f6fb',
  danger: '#b00020',
};

export function Screen({ children, scroll = true, style }: { children: React.ReactNode; scroll?: boolean; style?: ViewStyle }) {
  if (!scroll) return <View style={[styles.page, style]}>{children}</View>;
  return <ScrollView style={styles.page} contentContainerStyle={[styles.pad, style]} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}

export function Title({ children }: { children: string }) {
  return <Text style={styles.h1}>{children}</Text>;
}

export function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.h2}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.muted} {...props} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Button({ label, onPress, busy, variant = 'primary', disabled }: { label: string; onPress: () => void; busy?: boolean; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean }) {
  const bg = variant === 'primary' ? colors.brand : variant === 'danger' ? colors.danger : colors.surface;
  const fg = variant === 'secondary' ? colors.brand : '#fff';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy || disabled}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, borderColor: variant === 'secondary' ? colors.brand : bg, opacity: busy || disabled ? 0.6 : pressed ? 0.85 : 1 }]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Row({ title, subtitle, onPress, right }: { title: string; subtitle?: string; onPress?: () => void; right?: React.ReactNode }) {
  const body = (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button">{body}</Pressable> : body;
}

export function Empty({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

export function ErrorText({ children }: { children: string | null }) {
  return children ? <Text style={styles.error}>{children}</Text> : null;
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator />
      <Text style={styles.hint}>{t('Loading…')}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  pad: { padding: 16, gap: 16 },
  h1: { fontSize: 26, fontWeight: '700', color: colors.text },
  h2: { fontSize: 15, fontWeight: '600', color: colors.muted, marginBottom: 8 },
  section: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, gap: 8 },
  field: { gap: 4 },
  label: { fontSize: 14, color: colors.muted },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, fontSize: 16, color: colors.text, backgroundColor: colors.surface },
  hint: { fontSize: 13, color: colors.muted },
  button: { borderRadius: 12, borderWidth: 1, padding: 14, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowSub: { fontSize: 14, color: colors.muted, marginTop: 2 },
  empty: { padding: 24, textAlign: 'center', color: colors.muted },
  error: { color: colors.danger, fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
});
