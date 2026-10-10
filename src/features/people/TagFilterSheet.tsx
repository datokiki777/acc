import { BottomSheet } from '../../components/BottomSheet';
import { useAppNavigation } from '../../app/useAppNavigation';
import { TAG_COLORS } from '../../domain/tag-colors';
import { useAppStore } from '../../store/hooks';

export function TagFilterSheet() {
  const { requestClose } = useAppNavigation();
  const tagFilter = useAppStore((state) => state.tagFilter);
  const setTagFilter = useAppStore((state) => state.setTagFilter);

  const select = (value: string) => {
    void setTagFilter(value);
    requestClose();
  };

  return (
    <BottomSheet onClose={requestClose} title="Filter by tag">
      <div className="picker-options" role="listbox">
        <button
          aria-selected={tagFilter === ''}
          className={`picker-option ${tagFilter === '' ? 'is-selected' : ''}`}
          onClick={() => select('')}
          role="option"
          type="button"
        >
          <span className="picker-option-text">
            <span>All</span>
          </span>
          {tagFilter === '' && (
            <svg aria-hidden="true" className="picker-check" viewBox="0 0 24 24">
              <path d="m5 13 4 4L19 7" />
            </svg>
          )}
        </button>
        <div className="color-picker tag-filter-swatches" role="group" aria-label="Tag color">
          {TAG_COLORS.map((color) => (
            <button
              aria-label={`Tag color ${color}`}
              aria-selected={color === tagFilter}
              className={color === tagFilter ? 'color-swatch is-selected' : 'color-swatch'}
              key={color}
              onClick={() => select(color)}
              role="option"
              style={{ background: color }}
              type="button"
            />
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}
