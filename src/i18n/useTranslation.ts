import { useAppStore } from '../store/hooks';
import { translate } from './translations';

export type TranslateFn = (key: string) => string;

export function useTranslation(): TranslateFn {
  const language = useAppStore((state) => state.language);
  return (key: string) => translate(language, key);
}
