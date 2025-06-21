
import React, { useState, useEffect } from 'react';
import { AppGlobalConfig, DEFAULT_GLOBAL_CONFIG, DEFAULT_APP_TITLE } from '../types'; // Import DEFAULT_GLOBAL_CONFIG and DEFAULT_APP_TITLE
import { APP_CONFIG_KEY } from '../constants';
import useLocalStorage from '../hooks/useLocalStorage';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import ConfirmationModal from '../components/ui/ConfirmationModal'; // Import ConfirmationModal

// Use DEFAULT_GLOBAL_CONFIG from types.ts

const ConfiguracionPage: React.FC = () => {
  const [config, setConfig] = useLocalStorage<AppGlobalConfig>(APP_CONFIG_KEY, DEFAULT_GLOBAL_CONFIG);
  const [currentConfig, setCurrentConfig] = useState<AppGlobalConfig>(config);

  // State for Confirmation Modal
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  useEffect(() => {
    setCurrentConfig(config);
  }, [config]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setCurrentConfig(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? parseInt(value, 10) : value)
    }));
  };

  const handleSave = () => {
    setConfig(currentConfig);
    if (document.title !== (currentConfig.appTitle || DEFAULT_APP_TITLE) ) { // Ensure fallback for empty title
        document.title = currentConfig.appTitle || DEFAULT_APP_TITLE;
    }
    alert('Configuración guardada!');
  };

  const requestRestoreDefaults = () => {
    setIsConfirmModalOpen(true);
  };

  const confirmRestoreDefaults = () => {
    setCurrentConfig(DEFAULT_GLOBAL_CONFIG);
    setConfig(DEFAULT_GLOBAL_CONFIG);
    if (document.title !== DEFAULT_GLOBAL_CONFIG.appTitle) {
        document.title = DEFAULT_GLOBAL_CONFIG.appTitle;
    }
    alert('Configuración restaurada a los valores predeterminados.');
    setIsConfirmModalOpen(false);
  };

  return (
    <div className="p-6 bg-white shadow-lg rounded-lg max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Configuración General</h1>
      <div className="space-y-6">
        <Input 
          label="Título de la Aplicación"
          name="appTitle"
          value={currentConfig.appTitle}
          onChange={handleInputChange}
        />
        <Input 
          label="Nombre Equipo Visitante por Defecto"
          name="defaultVisitanteTeamName"
          value={currentConfig.defaultVisitanteTeamName}
          onChange={handleInputChange}
        />
        <Input 
          label="Nombre Equipo Local por Defecto"
          name="defaultLocalTeamName"
          value={currentConfig.defaultLocalTeamName}
          onChange={handleInputChange}
        />
        <Input 
          label="Innings por Defecto (si no se selecciona formato)"
          name="defaultMaxInnings"
          type="number"
          min="1"
          max="25"
          value={currentConfig.defaultMaxInnings}
          onChange={handleInputChange}
        />
        <Input 
          label="Máximo de Jugadores por Defecto en Lineup"
          name="defaultCantidadPlayerMax"
          type="number"
          min="1"
          max="30"
          value={currentConfig.defaultCantidadPlayerMax}
          onChange={handleInputChange}
        />
        <div className="flex items-center">
          <input
            id="showAdditionalDetailsDefault"
            name="showAdditionalDetailsDefault"
            type="checkbox"
            checked={currentConfig.showAdditionalDetailsDefault}
            onChange={handleInputChange}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="showAdditionalDetailsDefault" className="ml-2 block text-sm text-gray-900">
            Mostrar "Detalles Adicionales del Juego" por defecto
          </label>
        </div>
        
        <div className="flex justify-end space-x-4 pt-4">
          <Button onClick={requestRestoreDefaults} variant="warning">
            Restaurar Predeterminados
          </Button>
          <Button onClick={handleSave} variant="primary">
            Guardar Configuración
          </Button>
        </div>
      </div>
      <ConfirmationModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={confirmRestoreDefaults}
        title="Restaurar Predeterminados"
        message="¿Está seguro de que desea restaurar todas las configuraciones a sus valores predeterminados? Los cambios actuales no guardados se perderán."
        confirmButtonText="Restaurar"
        confirmButtonVariant="warning"
      />
    </div>
  );
};

export default ConfiguracionPage;