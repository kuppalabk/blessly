'use client';
import { useState } from 'react';
import { OCCASION_GROUPS, groupOf, occasionLabel } from '@/lib/occasion-groups';
import type { OccasionId } from '@/lib/i18n-data';
import { useT } from '@/components/I18n';

/** Occasion chips, grouped so 40 occasions stay easy to scan on a phone. */
export function OccasionChips({ value, onChange }: { value: OccasionId; onChange: (id: OccasionId) => void }) {
  const { t } = useT();
  const [group, setGroup] = useState(groupOf(value));
  const g = OCCASION_GROUPS.find((x) => x.id === group) ?? OCCASION_GROUPS[0];
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="biz-tabs" role="tablist" aria-label={t("Occasion type")}>
        {OCCASION_GROUPS.map((x) => <button key={x.id} type="button" role="tab" aria-selected={x.id === group} className="biz-tab" aria-current={x.id === group ? 'page' : undefined} onClick={() => setGroup(x.id)}>{t(x.label)}</button>)}
      </div>
      <div className="row-wrap" role="group" aria-label={t("Occasion")}>
        {g.ids.map((id) => <button key={id} type="button" className="chip" aria-pressed={id === value} onClick={() => onChange(id)}>{t(occasionLabel(id))}</button>)}
      </div>
    </div>
  );
}

/** <option>s grouped with <optgroup>, for selects. */
export function OccasionOptions() {
  const { t } = useT();
  return <>{OCCASION_GROUPS.map((g) => <optgroup key={g.id} label={t(g.label)}>{g.ids.map((id) => <option key={id} value={id}>{t(occasionLabel(id))}</option>)}</optgroup>)}</>;
}
