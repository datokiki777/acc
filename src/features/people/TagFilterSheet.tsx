import { BottomSheet } from '../../components/BottomSheet';
import { useAppNavigation } from '../../app/useAppNavigation';
import { distinctTags } from '../../domain/people-sort';
import { useAppStore } from '../../store/hooks';

export function TagFilterSheet() {
  const { requestClose } = useAppNavigation();
  const people = useAppStore((state) => state.peopleByMode.work);
  const tagFilter = useAppStore((state) => state.tagFilter);
  const setTagFilter = useAppStore((state) => state.setTagFilter);
  const options = [
    { value: '', label: 'All', color: '' },
    ...distinctTags(people).map((tag) => ({
      value: tag.color,
      label: tag.label || 'Color tag',
      color: tag.color,
    })),
  ];

  const select = (value: string) => {
    void setTagFilter(value);
    requestClose();
  };

  return (
    <BottomSheet onClose={requestClose} title="Filter by tag">
      <div className="picker-options" role="listbox">
        {options.map((option) => (
          <button
            aria-selected={option.value === tagFilter}
            className={`picker-option ${option.value === tagFilter ? 'is-selected' : ''}`}
            key={option.value || 'all'}
            onClick={() => select(option.value)}
            role="option"
            type="button"
          >
            <span className="picker-option-text">
              <span>
                {option.color && <span className="tag-dot" style={{ background: option.color }} />}
                {option.label}
              </span>
            </span>
            {option.value === tagFilter && (
              <svg aria-hidden="true" className="picker-check" viewBox="0 0 24 24">
                <path d="m5 13 4 4L19 7" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
