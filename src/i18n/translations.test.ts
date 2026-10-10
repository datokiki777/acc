import { describe, expect, it } from 'vitest';

import { AVAILABLE_LANGUAGES, DEFAULT_LANGUAGE, translate } from './translations';

describe('translate', () => {
  it('returns the key itself for the default language, no dictionary lookup involved', () => {
    expect(translate(DEFAULT_LANGUAGE, 'Home')).toBe('Home');
    expect(translate(DEFAULT_LANGUAGE, 'Some text nobody translated yet')).toBe(
      'Some text nobody translated yet',
    );
  });

  it('returns the Georgian translation for a known key', () => {
    expect(translate('ka', 'Home')).toBe('მთავარი');
    expect(translate('ka', 'Stats')).toBe('სტატისტიკა');
  });

  it('falls back to the key itself when a translation is missing for that language', () => {
    expect(translate('ka', 'A string nobody has translated yet')).toBe(
      'A string nobody has translated yet',
    );
  });

  it('falls back to the key for an unrecognized language code entirely', () => {
    expect(translate('fr', 'Home')).toBe('Home');
  });
});

describe('AVAILABLE_LANGUAGES', () => {
  it('always starts with the default language', () => {
    expect(AVAILABLE_LANGUAGES[0]).toBe(DEFAULT_LANGUAGE);
  });

  it('includes Georgian', () => {
    expect(AVAILABLE_LANGUAGES).toContain('ka');
  });
});
