import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { moneyEnabled } from '@/server/services/money';
import { approvedCharities, listCollections } from '@/server/services/marketplace';
import { listCelebrations } from '@/server/services/celebrations';
import { NewPotForm, TestModeBanner } from '@/components/money/MoneyUI';
import { currencyFor, formatMoney } from '@/lib/money';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t, tp } = await getT();
  return { title: t("Group gifts and fundraisers") };
}

export default async function Pots({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { t, tp } = await getT();
  const user = await pageUser();
  if (!moneyEnabled()) notFound();
  const sp = await searchParams;
  const pots = await listCollections(getDb(), user.id);
  const cels = (await listCelebrations(getDb(), user.id)).filter((c) => !c.cancelledAt).map((c) => ({ id: c.id, title: c.title }));
  return (
    <div className="stack-lg" style={{ maxWidth: 820 }}>
      <header><h1>{t("Group gifts and fundraisers")}</h1><p className="muted small" style={{ margin: 0 }}>{t("Share one link; friends chip in from anywhere. Group gifts are paid out to you; fundraisers go straight to a verified charity.")}</p></header>
      <TestModeBanner />
      {pots.length > 0 && (
        <ul className="list">{pots.map((p) => (
          <li key={p.id}><Link className="item" href={`/pots/${p.id}`}><span aria-hidden style={{ fontSize: 24 }}>{p.kind === 'gift' ? '🎁' : '💚'}</span><span className="grow"><b>{p.title}</b><br /><span className="muted small">{tp(p.contributors, "{raised} from {n} person", "{raised} from {n} people", { raised: formatMoney(p.raised, p.currency) })}{p.target ? t(" · target {v}", { v: formatMoney(p.target, p.currency) }) : ''}{p.closedAt ? t(" · closed") : ''}</span></span></Link></li>
        ))}</ul>
      )}
      <NewPotForm currency={currencyFor(user.country)} charities={await approvedCharities(getDb())} celebrations={cels} preset={{ kind: sp.kind, title: sp.title, wishlistItemId: sp.item, celebrationId: sp.celebration, recipientName: sp.for }} />
    </div>
  );
}
