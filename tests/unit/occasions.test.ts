import { describe, expect, it } from 'vitest';
import { OCCASIONS } from '@/lib/i18n-data';
import { OCCASION_GROUPS } from '@/lib/occasion-groups';
import { cardDesign } from '@/lib/cards';
import fs from 'node:fs';

describe('occasion catalogue', () => {
  it('puts every occasion in exactly one picker group', () => {
    const grouped = OCCASION_GROUPS.flatMap((g) => g.ids);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(grouped.sort()).toEqual(OCCASIONS.map((o) => o.id).sort());
    expect(OCCASIONS.length).toBe(40);
  });

  it('has both artworks for every occasion', () => {
    for (const o of OCCASIONS) for (const i of [0, 25]) expect(fs.existsSync(`public${cardDesign(o.id, i).art.src}`), `${o.id} ${i}`).toBe(true);
  });
});
