
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import { IoIosBaseball } from "react-icons/io"; 
// Removed IoMdPeople import as "Prueba de Partido" button is removed.
import { PiBaseballHelmetBold } from "react-icons/pi";
import { MdDisplaySettings, MdEditDocument } from "react-icons/md";
import { AiFillSetting } from "react-icons/ai";
import { FaHistory } from "react-icons/fa";
import { getItem, setItem } from '../services/localStorageService';
import {
  AppGlobalConfig, DEFAULT_GLOBAL_CONFIG, Formato, Jugador, LineupPlayer, PartidoData, POSICIONES, Equipo
} from '../types';
import {
  APP_CONFIG_KEY, FORMATOS_STORAGE_KEY, JUGADORES_STORAGE_KEY, PARTIDO_EN_CURSO_KEY
} from '../constants';
import { generateUUID } from '../utils/idGenerator';
import { createEmptyBatterStats, createEmptyGameStatus, initialPartidoData, createEmptyTeamStats, findNextBatterInLineup, recalculateLineupOrder } from '../utils/partidoUtils';


const HomePage: React.FC = () => {
  const commonButtonColor = 'bg-blue-500 hover:bg-blue-600';
  const navigate = useNavigate();

  // Removed shuffleArray, createRandomizedLineupFromDbPlayers, and handleTestGame functions
  // as the "Prueba de Partido" button that used them has been removed.

  const menuItems = [
    { 
      path: '/partidos', 
      label: 'Partidos', 
      icon: <IoIosBaseball />, 
      color: commonButtonColor,
      description: "Anota jugadas y sigue marcadores."
    },
    { 
      path: '/jugadores', 
      label: 'Jugadores', 
      icon: <PiBaseballHelmetBold />, 
      color: commonButtonColor,
      description: "Crea jugadores y gestiona equipos."
    },
    { 
      path: '/jugadas', 
      label: 'Jugadas', 
      icon: <MdDisplaySettings />, 
      color: commonButtonColor,
      description: "Define tipos de jugadas para partidos."
    },
    { 
      path: '/formatos', 
      label: 'Formatos', 
      icon: <MdEditDocument />, 
      color: commonButtonColor,
      description: "Establece formatos de juego e innings."
    },
    { 
      path: '/historial', 
      label: 'Historial', 
      icon: <FaHistory />, 
      color: commonButtonColor,
      description: "Consulta resultados y estadísticas."
    },
    { 
      path: '/configuracion', 
      label: 'Configuración', 
      icon: <AiFillSetting />, 
      color: commonButtonColor,
      description: "Ajusta opciones generales de la app."
    },
  ];

  return (
    <div className="text-center">
      <h1 className="text-4xl font-bold mb-8 text-gray-700">Menú Principal</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {menuItems.map(item => (
          <Link key={item.path} to={item.path} className="no-underline">
            <Button
              variant="custom"
              className={`w-full h-24 text-white flex items-center rounded-lg shadow-lg transform hover:scale-105 transition-transform duration-200 p-0 ${item.color}`}
            >
              <div className="flex items-center w-full h-full">
                {/* Icon Container */}
                <div className="p-3 flex-shrink-0 flex items-center justify-center w-16">
                  <span className="text-3xl">{item.icon}</span>
                </div>
                {/* Separator */}
                <div className="border-l border-white/40 h-3/4"></div>
                {/* Text Container */}
                <div className="flex flex-col text-left pl-4 pr-3 py-2 flex-grow">
                  <span className="text-md font-semibold">{item.label}</span>
                  <span className="text-xs mt-0.5">{item.description}</span>
                </div>
              </div>
            </Button>
          </Link>
        ))}
         {/* Botón de Prueba de Partido REMOVED */}
      </div>
    </div>
  );
};

export default HomePage;
