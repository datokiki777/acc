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
 * Narrows a list down to people carrying exactly this tag color — their tagLabel text plays no
 * part, so a typo or a never-finished rename doesn't split one tag into two. An empty tagFilter
 * ('All') is a no-op — the original list comes back unchanged, archived/active filtering and all.
 */
export function filterByTag<T extends PersistedPerson>(people: T[], tagFilter: string): T[] {
  if (!tagFilter) return people;
  return people.filter((person) => person.tagColor === tagFilter);
}
