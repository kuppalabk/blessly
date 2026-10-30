import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { listWishlists } from '@/server/services/wishlists';
import { CelebrationForm } from '@/components/celebrations/CelebrationForm';
import { emptyCelebration } from '@/lib/celebration-form';
import { isOccasion } from '@/lib/cards';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("Plan a celebration") };
}

export default async function NewCelebration({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { t } = await getT();
  const user = await pageUser();
  const sp = await searchParams;
  const wishlists = (await listWishlists(getDb(), user.id)).map((w) => ({ id: w.id, title: w.title }));
  const init = emptyCelebration(user.timezone, sp.occasion && isOccasion(sp.occasion) ? sp.occasion : 'birthday');
  return (
    <div className="stack-lg" style={{ maxWidth: 760 }}>
      <h1>{t("Plan a celebration")}</h1>
      <CelebrationForm initial={init} wishlists={wishlists} />
    </div>
  );
}
