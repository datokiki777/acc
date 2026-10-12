import type { ManifestOptions } from 'vite-plugin-pwa';

export const DEFAULT_BASE_PATH = '/';
export const GITHUB_BASE_PATH = '/acc/';

export function normalizeBasePath(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '/') return DEFAULT_BASE_PATH;

  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`;
}

export function createAccPwaManifest(basePath: string): Partial<ManifestOptions> {
  const normalizedBase = normalizeBasePath(basePath);

  return {
    name: 'ACC',
    short_name: 'ACC',
    description: 'ACC - personal and work money tracking app',
    start_url: normalizedBase,
    scope: normalizedBase,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#081220',
    theme_color: '#081220',
    lang: 'en',
    dir: 'ltr',
    categories: ['finance', 'business', 'productivity'],
    shortcuts: [
      {
        name: 'Add entry',
        short_name: 'Add entry',
        url: `${normalizedBase}?shortcut=add-entry`,
        icons: [{ src: 'icons/icon-192x192.png', sizes: '192x192', type: 'image/png' }],
      },
    ],
    icons: [
      { src: 'icons/icon-167x167.png', sizes: '167x167', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-180x180.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      {
        src: 'icons/icon-192x192-maskable.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      { src: 'icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: 'icons/icon-512x512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: 'icons/icon-1024x1024.png',
        sizes: '1024x1024',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
