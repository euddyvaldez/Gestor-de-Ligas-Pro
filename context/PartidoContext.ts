import { createContext, useContext } from 'react';
import { PartidoManager } from '../hooks/usePartidoManager';

export const PartidoContext = createContext<PartidoManager | null>(null);

export const usePartido = (): PartidoManager => {
  const context = useContext(PartidoContext);
  if (!context) {
    throw new Error('usePartido must be used within a PartidoContext.Provider');
  }
  return context;
};