
import { useState, useEffect, useCallback, useRef } from 'react'; // Added useRef
import { getItem, setItem } from '../services/localStorageService';

function useLocalStorage<T,>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    let item: T | null = null;
    try {
        item = getItem<T>(key, null); 
    } catch (e) {
        console.error(`Critical error during initial getItem in useLocalStorage for key "${key}":`, e);
    }

    if (item !== null) {
        const initialValueIsArray = Array.isArray(initialValue);
        const itemIsArray = Array.isArray(item);
        const initialValueIsObject = typeof initialValue === 'object' && initialValue !== null;
        const itemIsObject = typeof item === 'object' && item !== null;

        if (initialValueIsArray && !itemIsArray) {
            console.warn(`LocalStorage key "${key}" expected an array but found ${typeof item}. Resetting to initialValue.`);
            return initialValue;
        }
        if (initialValueIsObject && !initialValueIsArray && (!itemIsObject || itemIsArray)) {
             console.warn(`LocalStorage key "${key}" expected a non-array object but found ${itemIsArray ? 'array' : typeof item}. Resetting to initialValue.`);
            return initialValue;
        }
        return item;
    }
    return initialValue;
  });

  // Effect to save state to localStorage whenever it changes
  useEffect(() => {
    if (typeof storedValue !== 'undefined') {
        setItem(key, storedValue);
    }
  }, [key, storedValue]);

  // Store initialValue in a ref to keep it stable for the storage event listener
  const initialValueRef = useRef(initialValue);
  useEffect(() => {
    initialValueRef.current = initialValue;
  }, [initialValue]);

  // Effect to listen for storage changes from other tabs/windows or potentially same-page updates
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === key) {
        if (event.newValue === null) { // Key was removed or cleared
          setStoredValue(initialValueRef.current); // Use ref for stable initialValue
        } else {
          try {
            const newValueFromStorage = JSON.parse(event.newValue) as T;
            setStoredValue(newValueFromStorage);
          } catch (e) {
            console.warn(`Error parsing stored value from storage event for key "${key}":`, e);
            setStoredValue(initialValueRef.current); // Fallback to initialValue via ref
          }
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [key]); // Removed initialValue from dependencies, using ref instead

  return [storedValue, setStoredValue];
}

export default useLocalStorage;