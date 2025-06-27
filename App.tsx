
import React, { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import HomePage from './pages/HomePage';
import JugadoresPage from './pages/JugadoresPage';
import JugadasPage from './pages/JugadasPage';
import FormatoJuegoPage from './pages/FormatoJuegoPage';
import ConfiguracionPage from './pages/ConfiguracionPage';
import HistorialPage from './pages/HistorialPage';
import { PartidosPage } from './pages/PartidosPage'; // Changed to named import
import ConfigurarPartidoPage from './pages/ConfigurarPartidoPage'; // Added

import useLocalStorage from './hooks/useLocalStorage';
import { getItem, setItem } from './services/localStorageService';
import { 
  APP_CONFIG_KEY,
  FORMATOS_STORAGE_KEY,
  CODIGO_ACTUAL_FORMATOS_STORAGE_KEY,
  JUGADAS_STORAGE_KEY,
  CODIGO_ACTUAL_JUGADAS_STORAGE_KEY,
  defaultFormatos,
  defaultJugadas,
} from './constants';
import { AppGlobalConfig, Formato, Jugada, DEFAULT_GLOBAL_CONFIG, DEFAULT_APP_TITLE } from './types';
import { getNextCodigo } from './utils/idGenerator';

const App: React.FC = () => {
  const [appConfigFromHook] = useLocalStorage<AppGlobalConfig>(APP_CONFIG_KEY, DEFAULT_GLOBAL_CONFIG);
  const [theme] = useLocalStorage<'light' | 'dark' | 'system'>('theme', 'system');

  useEffect(() => {
    const isDark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  }, [theme]);

  // This effect handles the case where the user's OS theme changes while the app theme is set to 'system'.
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      if (theme === 'system') {
        document.documentElement.classList.toggle('dark', e.matches);
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  useEffect(() => {
    const seedInitialData = () => {
      const existingAppConfig = getItem<AppGlobalConfig>(APP_CONFIG_KEY);
      if (!existingAppConfig) {
        setItem<AppGlobalConfig>(APP_CONFIG_KEY, DEFAULT_GLOBAL_CONFIG);
        console.log('App.tsx: Ensured default app configuration in localStorage.');
      }

      const existingFormatos = getItem<Formato[]>(FORMATOS_STORAGE_KEY);
      if (!existingFormatos || existingFormatos.length === 0) {
        if (defaultFormatos.length > 0) {
          setItem<number>(CODIGO_ACTUAL_FORMATOS_STORAGE_KEY, 0); 
          const initialFormatos = defaultFormatos.map(f => ({
            ...f,
            codigo: getNextCodigo(CODIGO_ACTUAL_FORMATOS_STORAGE_KEY),
          }));
          setItem<Formato[]>(FORMATOS_STORAGE_KEY, initialFormatos);
          console.log('App.tsx: Seeded default formatos.');
        }
      }
      
      const existingJugadas = getItem<Jugada[]>(JUGADAS_STORAGE_KEY);
      if (!existingJugadas || existingJugadas.length === 0) {
        if (defaultJugadas.length > 0) {
          setItem<number>(CODIGO_ACTUAL_JUGADAS_STORAGE_KEY, 0);
          const initialJugadas = defaultJugadas.map(j => ({
            ...j,
            codigo: getNextCodigo(CODIGO_ACTUAL_JUGADAS_STORAGE_KEY),
          }));
          setItem<Jugada[]>(JUGADAS_STORAGE_KEY, initialJugadas);
          console.log('App.tsx: Seeded default jugadas.');
        }
      }
    };

    seedInitialData();
  }, []); 


  useEffect(() => {
    document.title = appConfigFromHook.appTitle || DEFAULT_APP_TITLE; 
  }, [appConfigFromHook]);

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<HomePage />} />
          <Route path="jugadores" element={<JugadoresPage />} />
          <Route path="jugadas" element={<JugadasPage />} />
          <Route path="formatos" element={<FormatoJuegoPage />} />
          <Route path="configuracion" element={<ConfiguracionPage />} />
          <Route path="historial" element={<HistorialPage />} />
          <Route path="configurar-partido" element={<ConfigurarPartidoPage />} /> {/* Added */}
          <Route path="partidos" element={<PartidosPage />} />
          <Route path="*" element={<HomePage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
};

export default App;