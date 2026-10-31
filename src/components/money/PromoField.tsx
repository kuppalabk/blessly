'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/components/api';
import { useT } from '@/components/I18n';

export type PromoQuote = { code: string; label: string; discountText: string; totalText: string; priceText: string };

/**
 * Promo code box for a purchase form. It checks the code with the server (same rules as the order) and
 * tells the parent which code to send with the order. It re-checks when the order changes.
 */
export function PromoField({ purpose, body, onChange }: { purpose: 'shop' | 'print' | 'giftcard'; body: Record<string, unknown>; onChange: (code: string | undefined) => void }) {
  const { t } = useT();
  const [input, setInput] = useState('');
  const [quote, setQuote] = useState<PromoQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const applied = useRef<string | null>(null);
  const bodyKey = JSON.stringify(body);

  async function apply(code: string) {
    setBusy(true); setError(null);
    try {
      const q = await api<PromoQuote>('/api/promo/quote', { body: { ...body, purpose, code } });
      setQuote(q); applied.current = q.code; onChange(q.code);
    } catch (e) {
      setQuote(null); applied.current = null; onChange(undefined);
      setError(e instanceof Error ? e.message : t("That code isn’t valid"));
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    setQuote(null); setInput(''); setError(null); applied.current = null; onChange(undefined);
  }

  // The price changed (quantity, product or amount): check the code again so the total shown stays right.
  useEffect(() => {
    if (applied.current) void apply(applied.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bodyKey]);

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: 1 }}>
          {t("Promo code")}
          <input className="input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={40} autoComplete="off" spellCheck={false} placeholder={t("Have a code?")} style={{ textTransform: 'uppercase' }} disabled={!!quote} />
        </label>
        {quote
          ? <button type="button" className="btn btn-ghost btn-sm" onClick={remove}>{t("Remove")}</button>
          : <button type="button" className="btn btn-ghost btn-sm" disabled={busy || !input.trim()} onClick={() => apply(input)}>{busy ? t("Checking…") : t("Apply")}</button>}
      </div>
      {quote && <p role="status" className="small"><b>{quote.label}</b>: {t("you save {v}", { v: quote.discountText })}. {t("Total {v}", { v: quote.totalText })}</p>}
      {error && <p role="alert" className="error small">{error}</p>}
    </div>
  );
}
