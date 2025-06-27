
import React from 'react';
import useLocalStorage from '../../hooks/useLocalStorage';
import { AppGlobalConfig, DEFAULT_APP_TITLE, DEFAULT_GLOBAL_CONFIG } from '../../types'; // Added DEFAULT_GLOBAL_CONFIG
import { APP_CONFIG_KEY } from '../../constants';

const Footer: React.FC = () => {
  const [appConfig] = useLocalStorage<AppGlobalConfig>(APP_CONFIG_KEY, DEFAULT_GLOBAL_CONFIG); // Use DEFAULT_GLOBAL_CONFIG
  const year = new Date().getFullYear();
  const appTitle = appConfig.appTitle || DEFAULT_APP_TITLE; // appConfig is now guaranteed to be AppGlobalConfig

  return (
    <footer className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-center p-4 mt-auto shadow-inner">
      <p>&copy; {year} {appTitle}. Todos los derechos reservados.</p>
    </footer>
  );
};

export default Footer;