
import { getItem, setItem } from '../services/localStorageService';

export const getNextCodigo = (storageKey: string): number => {
  const currentCodigo = getItem<number>(storageKey, 0) || 0;
  const nextCodigo = currentCodigo + 1;
  setItem(storageKey, nextCodigo);
  return nextCodigo;
};

// Basic UUID generator (for client-side only, not cryptographically secure)
export const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};