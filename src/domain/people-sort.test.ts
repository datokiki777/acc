import { describe, expect, it } from 'vitest';

import type { PersistedPerson } from '../types/persistence';
import { filterByTag, sortPeopleByTagAndActivity } from './people-sort';
import { TAG_COLORS } from './tag-colors';

function makePerson(overrides: Partial<PersistedPerson> = {}): PersistedPerson {
  return {
    id: overrides.id ?? 'p',
    name: overrides.name ?? 'Person',
    currency: 'EUR',
    entries: [],
    ...overrides,
  };
}

describe('sortPeopleByTagAndActivity', () => {
  it('orders people by their tag color position in the palette', () => {
    const later = TAG_COLORS[2];
    const earlier = TAG_COLORS[0];
    const first = makePerson({ id: 'a', name: 'A', tagColor: later });
    const second = makePerson({ id: 'b', name: 'B', tagColor: earlier });

    expect(sortPeopleByTagAndActivity([first, second]).map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('breaks ties within the same color group by most recent activity', () => {
    const color = TAG_COLORS[0];
    const stale = makePerson({
      id: 'stale',
      tagColor: color,
      entries: [{ id: 'e1', amount: 10, type: 'Gave', date: '2026-01-01' }],
    });
    const fresh = makePerson({
      id: 'fresh',
      tagColor: color,
      entries: [{ id: 'e2', amount: 10, type: 'Gave', date: '2026-06-01' }],
    });

    expect(sortPeopleByTagAndActivity([stale, fresh]).map((p) => p.id)).toEqual(['fresh', 'stale']);
  });

  it('sorts people with no tag color after every colored group, tie-broken by activity', () => {
    const colored = makePerson({
      id: 'colored',
      tagColor: TAG_COLORS[TAG_COLORS.length - 1]!,
      entries: [{ id: 'e1', amount: 10, type: 'Gave', date: '2026-01-01' }],
    });
    const staleNoColor = makePerson({
      id: 'stale-none',
      entries: [{ id: 'e2', amount: 10, type: 'Gave', date: '2026-01-01' }],
    });
    const freshNoColor = makePerson({
      id: 'fresh-none',
      entries: [{ id: 'e3', amount: 10, type: 'Gave', date: '2026-07-01' }],
    });

    expect(
      sortPeopleByTagAndActivity([staleNoColor, freshNoColor, colored]).map((p) => p.id),
    ).toEqual(['colored', 'fresh-none', 'stale-none']);
  });

  it('treats an unrecognized/legacy color value the same as no color', () => {
    const unknownColor = makePerson({ id: 'unknown', tagColor: '#000000' });
    const noColor = makePerson({ id: 'none' });
    const colored = makePerson({ id: 'colored', tagColor: TAG_COLORS[0] });

    const result = sortPeopleByTagAndActivity([unknownColor, noColor, colored]);
    expect(result[0]?.id).toBe('colored');
    expect(
      result
        .slice(1)
        .map((p) => p.id)
        .sort(),
    ).toEqual(['none', 'unknown']);
  });

  it('orders same-name people in the same color group by real creation date, not recent activity', () => {
    const color = TAG_COLORS[0];
    const olderGiorgi = makePerson({
      id: 'older',
      name: 'Giorgi',
      tagColor: color,
      createdAt: '2026-01-01T00:00:00.000Z',
      // Recent activity would otherwise put this one first under the general tiebreak.
      entries: [{ id: 'e1', amount: 10, type: 'Gave', date: '2026-08-01' }],
    });
    const newerGiorgi = makePerson({
      id: 'newer',
      name: 'Giorgi',
      tagColor: color,
      createdAt: '2026-06-01T00:00:00.000Z',
      entries: [],
    });

    expect(sortPeopleByTagAndActivity([newerGiorgi, olderGiorgi]).map((p) => p.id)).toEqual([
      'older',
      'newer',
    ]);
  });
});

describe('filterByTag', () => {
  const badelix = makePerson({ id: 'b', tagLabel: 'Badelix', tagColor: TAG_COLORS[0] });
  const dBuilder = makePerson({ id: 'd', tagLabel: 'D-Builder', tagColor: TAG_COLORS[1] });
  const untagged = makePerson({ id: 'u' });

  it('returns every person unchanged when the filter is empty (All)', () => {
    expect(filterByTag([badelix, dBuilder, untagged], '')).toEqual([badelix, dBuilder, untagged]);
  });

  it('keeps only people carrying exactly this tag color, label text aside', () => {
    const badelixTypo = makePerson({ id: 'b2', tagLabel: 'badelix', tagColor: TAG_COLORS[0] });
    expect(filterByTag([badelix, badelixTypo, dBuilder, untagged], TAG_COLORS[0])).toEqual([
      badelix,
      badelixTypo,
    ]);
  });

  it('matches nothing for a color currently in use by no one', () => {
    expect(filterByTag([badelix, dBuilder], TAG_COLORS[2])).toEqual([]);
  });
});
