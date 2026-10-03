import type { PersistedPerson } from '../types/persistence';
import { TAG_COLORS } from './tag-colors';

export function activityTime(person: PersistedPerson): number {
  const entryTimes = person.entries.map((entry) => Date.parse(entry.date)).filter(Number.isFinite);
  return Math.max(0, ...entryTimes, person.createdAt ? Date.parse(person.createdAt) : 0);
}

function createdTime(person: PersistedPerson): number {
  return person.createdAt ? Date.parse(person.createdAt) : NaN;
}

/**
 * Sorts people by their tag color's position in the TAG_COLORS palette (so the color swatch
 * order controls the list order). People who share a color — or have no tag color at all —
 * are grouped together and ordered by most recent activity (latest entry, falling back to when
 * they were created). People with no tag color sort after every colored group.
 *
 * Duplicate names are fully supported (there's no uniqueness requirement) — when two people in
 * the same color group also share a name, they're additionally ordered by when they were
 * actually created (oldest first), so it's clear which record is which regardless of which one
 * has more recent activity.
 */
export function sortPeopleByTagAndActivity(people: PersistedPerson[]): PersistedPerson[] {
  return [...people].sort((first, second) => {
    const firstColor = TAG_COLORS.indexOf(first.tagColor as (typeof TAG_COLORS)[number]);
    const secondColor = TAG_COLORS.indexOf(second.tagColor as (typeof TAG_COLORS)[number]);
    const colorDifference =
      (firstColor < 0 ? TAG_COLORS.length : firstColor) -
      (secondColor < 0 ? TAG_COLORS.length : secondColor);
    if (colorDifference) return colorDifference;

    if (first.name.trim().toLowerCase() === second.name.trim().toLowerCase()) {
      const firstCreated = createdTime(first);
      const secondCreated = createdTime(second);
      if (Number.isFinite(firstCreated) && Number.isFinite(secondCreated)) {
        const createdDifference = firstCreated - secondCreated;
        if (createdDifference) return createdDifference;
      }
    }

    return activityTime(second) - activityTime(first);
  });
}

/**
 * The set of distinct tags currently in use, one entry per label (trimmed, case-sensitive —
 * matching the exact comparison filterByTag uses), ordered the same way the list itself groups
 * by tag: by color-palette position, then alphabetically within a color. People with no tag
 * label are not a tag and are left out. When the same label has been given more than one color
 * across different people, the first color encountered (in that same order) is the one shown —
 * tags are meant to be used consistently, so this is a display tie-break, not a merge rule.
 */
export function distinctTags(people: PersistedPerson[]): { label: string; color: string }[] {
  const byLabel = new Map<string, string>();
  for (const person of people) {
    const label = person.tagLabel?.trim();
    if (!label || byLabel.has(label)) continue;
    byLabel.set(label, person.tagColor ?? '');
  }
  return [...byLabel.entries()]
    .map(([label, color]) => ({ label, color }))
    .sort((first, second) => {
      const firstColor = TAG_COLORS.indexOf(first.color as (typeof TAG_COLORS)[number]);
      const secondColor = TAG_COLORS.indexOf(second.color as (typeof TAG_COLORS)[number]);
      const colorDifference =
        (firstColor < 0 ? TAG_COLORS.length : firstColor) -
        (secondColor < 0 ? TAG_COLORS.length : secondColor);
      return colorDifference || first.label.localeCompare(second.label);
    });
}

/**
 * Narrows a list down to people carrying exactly this tag label. An empty tagFilter ('All') is a
 * no-op — the original list comes back unchanged, archived/active filtering and all.
 */
export function filterByTag<T extends PersistedPerson>(people: T[], tagFilter: string): T[] {
  if (!tagFilter) return people;
  return people.filter((person) => person.tagLabel?.trim() === tagFilter);
}
