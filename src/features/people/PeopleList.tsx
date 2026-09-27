import { useEffect, useState } from 'react';

import type { PersistedPerson } from '../../types/persistence';
import { hasOutstandingSalaryBalance } from '../../domain/salary';
import { sortPeopleByTagAndActivity } from '../../domain/people-sort';
import { useAppStore } from '../../store/hooks';
import { PersonCard, type PersonSwipeAction } from './PersonCard';

interface PeopleListProps {
  onDeletePerson: (person: PersistedPerson) => void;
  onDeleteEntry: (person: PersistedPerson, entryId: string) => void;
  onToggleArchive: (person: PersistedPerson) => void;
}

export function PeopleList({ onDeletePerson, onDeleteEntry, onToggleArchive }: PeopleListProps) {
  const [openSwipe, setOpenSwipe] = useState<{
    personId: string;
    action: PersonSwipeAction;
  } | null>(null);
  const mode = useAppStore((state) => state.mode);
  const people = useAppStore((state) => state.peopleByMode[state.mode]);
  const search = useAppStore((state) => state.search.trim().toLowerCase());
  const filter = useAppStore((state) => state.filter);
  const filtered = sortPeopleByTagAndActivity(
    people
      .filter((person) => {
        if (search) return true;
        const isArchived = Boolean(person.archived);
        if (filter === 'archived') return isArchived;
        // 'active': normal non-archived people, plus an archived ('finished working') salaried
        // person who still has an unpaid balance — they stay visible until it's actually settled
        // instead of the outstanding amount disappearing into Archived along with them.
        return !isArchived || (mode === 'work' && hasOutstandingSalaryBalance(person, new Date()));
      })
      .filter((person) => person.name.toLowerCase().includes(search)),
  );
  useEffect(() => {
    if (!openSwipe) return;
    const closeOpenSwipe = (event: PointerEvent) => {
      const target = event.target;
      const card = target instanceof Element ? target.closest('[data-swipe-card-id]') : null;
      if (card?.getAttribute('data-swipe-card-id') === openSwipe.personId) return;
      setOpenSwipe(null);
    };
    document.addEventListener('pointerdown', closeOpenSwipe, true);
    return () => document.removeEventListener('pointerdown', closeOpenSwipe, true);
  }, [openSwipe]);

  if (!filtered.length) {
    return (
      <section className="empty-card">
        <div className="empty-icon">{search ? '🔍' : filter === 'archived' ? '🗄️' : '📒'}</div>
        <h2>
          {search ? 'No matches' : filter === 'archived' ? 'No archived people' : 'No records yet'}
        </h2>
        <p>
          {search
            ? 'Try another name.'
            : filter === 'archived'
              ? 'Archived records will appear here.'
              : 'Tap the plus button to add your first person.'}
        </p>
      </section>
    );
  }

  return (
    <section aria-label={mode === 'work' ? 'Teams' : 'People'} className="people-list">
      {filtered.map((person) => (
        <PersonCard
          key={person.id}
          onDeleteEntry={(entryId) => onDeleteEntry(person, entryId)}
          onDeletePerson={() => onDeletePerson(person)}
          onSwipeOpen={(action) => setOpenSwipe(action ? { personId: person.id, action } : null)}
          onToggleArchive={() => onToggleArchive(person)}
          person={person}
          swipeOpen={openSwipe?.personId === person.id ? openSwipe.action : null}
        />
      ))}
    </section>
  );
}
