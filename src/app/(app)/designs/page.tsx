import { getDb } from '@/server/db';
import { pageUser } from '@/server/http';
import { listDesigns } from '@/server/services/designs';
import { fileIdsIn } from '@/lib/card-doc';
import { fileUrl } from '@/server/providers/storage';
import { DesignList } from '@/components/editor/DesignList';
import { getT } from '@/server/i18n';

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t("My cards") };
}

export default async function DesignsPage() {
  const user = await pageUser();
  const designs = (await listDesigns(getDb(), user.id)).map((d) => {
    const urls: Record<string, string> = {};
    for (const id of fileIdsIn(d.doc)) urls[id] = fileUrl(id);
    return { id: d.id, title: d.title, occasion: d.occasion, favourite: d.favourite, updatedAt: d.updatedAt.toISOString(), page: d.doc.pages[0], language: d.doc.language, urls };
  });
  return <DesignList designs={designs} name={user.name.split(' ')[0]} language={user.language} />;
}
