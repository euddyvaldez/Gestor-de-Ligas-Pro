
import React, { useState, useEffect } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { APP_CONFIG_KEY, JUGADORES_STORAGE_KEY, PARTIDO_EN_CURSO_KEY } from '../../constants'; // Added PARTIDO_EN_CURSO_KEY
import useLocalStorage from '../../hooks/useLocalStorage';
import { AppGlobalConfig, DEFAULT_APP_TITLE, DEFAULT_GLOBAL_CONFIG, Jugador, PartidoData } from '../../types'; // Added PartidoData
import Button from '../ui/Button'; 
import { IoIosBaseball } from 'react-icons/io'; 
import { getItem } from '../../services/localStorageService'; 

const Navbar: React.FC = () => {
  const [appConfig] = useLocalStorage<AppGlobalConfig>(APP_CONFIG_KEY, DEFAULT_GLOBAL_CONFIG);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const [partidoEnCursoNavbar, setPartidoEnCursoNavbar] = useState<PartidoData | null>(() => {
    return getItem<PartidoData>(PARTIDO_EN_CURSO_KEY, null);
  });

  useEffect(() => {
    document.title = appConfig.appTitle || DEFAULT_APP_TITLE;
  }, [appConfig]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      // Removed JUGADORES_STORAGE_KEY handling as it's not needed for this button's text.
      // If other parts of Navbar need player count, that logic should be separate.
      if (event.key === PARTIDO_EN_CURSO_KEY) {
        setPartidoEnCursoNavbar(getItem<PartidoData>(PARTIDO_EN_CURSO_KEY, null));
      }
    };

    window.addEventListener('storage', handleStorage);
    // This now runs on mount and on every navigation, ensuring the state is fresh.
    setPartidoEnCursoNavbar(getItem<PartidoData>(PARTIDO_EN_CURSO_KEY, null));


    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, [location]); // Depend on location to re-check when URL changes.


  const navItems = [
    { path: '/', label: 'Inicio' },
    { path: '/configurar-partido', label: 'Nuevo Partido' }, 
    ...(partidoEnCursoNavbar ? [{ path: '/partidos', label: 'Partido en Curso' }] : []),
    { path: '/jugadores', label: 'Jugadores y Equipos' },
    { path: '/jugadas', label: 'Jugadas' },
    { path: '/formatos', label: 'Formatos' },
    { path: '/historial', label: 'Historial' },
    { path: '/configuracion', label: 'Configuración' },
  ];

  const handleStartMatchClick = () => {
    navigate('/partidos'); // Navigate to the match page
    setIsMenuOpen(false); 
  };

  const showStartMatchButton = 
    location.pathname !== '/' &&
    location.pathname !== '/partidos' &&
    location.pathname !== '/configurar-partido'; 

  const startMatchButtonText = partidoEnCursoNavbar ? "Volver al Partido" : "Iniciar Partido";

  return (
    <nav className="bg-white shadow-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0 flex items-center" onClick={() => setIsMenuOpen(false)}>
              <div className="ml-3 flex items-center group">
                <h1 className="text-xl font-bold text-gray-800">
                  {appConfig.appTitle || DEFAULT_APP_TITLE}
                </h1>
              </div>
            </Link>
          </div>

          <div className="flex items-center">
            {showStartMatchButton && (
              <Button
                onClick={handleStartMatchClick}
                variant="custom"
                size="sm"
                className="flex items-center bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-md mr-3"
                aria-label={startMatchButtonText}
              >
                <IoIosBaseball className="h-5 w-5 mr-1.5" />
                {startMatchButtonText}
              </Button>
            )}
            <button
              id="menu-button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              type="button"
              className="bg-gray-100 inline-flex items-center justify-center p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              aria-controls="main-menu"
              aria-expanded={isMenuOpen}
              aria-haspopup="true"
            >
              <span className="sr-only">Abrir menú principal</span>
              <div className="hamburger-icon">
                <span className={`transition-all duration-300 ease-in-out ${isMenuOpen ? 'transform rotate-45 translate-y-2' : ''}`}></span>
                <span className={`transition-all duration-300 ease-in-out ${isMenuOpen ? 'opacity-0' : ''}`}></span>
                <span className={`transition-all duration-300 ease-in-out ${isMenuOpen ? 'transform -rotate-45 -translate-y-2' : ''}`}></span>
              </div>
            </button>
          </div>

          {isMenuOpen && (
            <div
              id="main-menu"
              className="absolute top-16 right-0 mt-0 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-50"
              role="menu"
              aria-orientation="vertical"
              aria-labelledby="menu-button"
            >
              <div className="py-1" role="none">
                {navItems.map(item => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `block w-full text-left px-4 py-2 text-sm transition-colors ${
                        isActive
                          ? 'bg-blue-600 text-white nav-active'
                          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }`
                    }
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)} 
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
