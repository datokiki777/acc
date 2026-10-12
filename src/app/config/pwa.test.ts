import {
  createAccPwaManifest,
  DEFAULT_BASE_PATH,
  GITHUB_BASE_PATH,
  normalizeBasePath,
} from './pwa';

describe('PWA configuration', () => {
  it('uses the custom-domain root by default', () => {
    expect(DEFAULT_BASE_PATH).toBe('/');
    expect(createAccPwaManifest(DEFAULT_BASE_PATH)).toMatchObject({
      name: 'ACC',
      short_name: 'ACC',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#081220',
      theme_color: '#081220',
    });
  });

  it('supports the optional GitHub repository path', () => {
    expect(GITHUB_BASE_PATH).toBe('/acc/');
    expect(createAccPwaManifest(GITHUB_BASE_PATH)).toMatchObject({
      start_url: '/acc/',
      scope: '/acc/',
    });
    expect(normalizeBasePath('acc')).toBe('/acc/');
  });

  it('offers an Add entry home-screen shortcut, scoped under each base path', () => {
    expect(createAccPwaManifest(DEFAULT_BASE_PATH).shortcuts).toEqual([
      expect.objectContaining({ name: 'Add entry', url: '/?shortcut=add-entry' }),
    ]);
    expect(createAccPwaManifest(GITHUB_BASE_PATH).shortcuts).toEqual([
      expect.objectContaining({ name: 'Add entry', url: '/acc/?shortcut=add-entry' }),
    ]);
  });

  it('retains regular and maskable icons', () => {
    expect(createAccPwaManifest(DEFAULT_BASE_PATH).icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: '192x192', purpose: 'any' }),
        expect.objectContaining({ sizes: '192x192', purpose: 'maskable' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'any' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
      ]),
    );
  });
});
