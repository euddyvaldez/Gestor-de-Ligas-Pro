
import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Select from '../ui/Select';
import { LineupPlayer, EMPTY_POSICION_PLACEHOLDER, POSICIONES } from '../../types';

interface ErrorAdvancementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (baseReached: 0 | 1 | 2 | 3, errorPlayerId: number | null) => void;
  batterName: string;
  defensiveTeamLineup: LineupPlayer[];
  defensiveTeamName: string;
}

const ErrorAdvancementModal: React.FC<ErrorAdvancementModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  batterName,
  defensiveTeamLineup,
  defensiveTeamName,
}) => {
  const [baseReached, setBaseReached] = useState<0 | 1 | 2 | 3>(0); // 0 for 1B, 1 for 2B, etc. Home = 3
  const [errorPlayerId, setErrorPlayerId] = useState<string | null>(null); // Store as string for select, convert to number or null on confirm

  useEffect(() => {
    if (isOpen) {
      setBaseReached(0); // Default to 1B
      setErrorPlayerId(null);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    const errorPlayerNumericId = errorPlayerId === 'TEAM_ERROR' || errorPlayerId === null ? null : parseInt(errorPlayerId, 10);
    onConfirm(baseReached, errorPlayerNumericId);
    onClose(); // Close modal after confirm
  };

  const defensivePlayerOptions = [
    { value: 'TEAM_ERROR', label: `Error del Equipo (${defensiveTeamName}) (No especificado)` },
    ...defensiveTeamLineup
      .filter(p => p.posicion !== 'BE' && p.posicion !== EMPTY_POSICION_PLACEHOLDER) // Only active fielders
      .map(p => ({
        value: String(p.jugadorId), // Use Jugador.codigo (from jugadorId on LineupPlayer)
        label: `${p.nombreJugador} (${p.posicion})`,
      })),
  ];

  const baseOptions = [
    { value: '0', label: '1ª Base' },
    { value: '1', label: '2ª Base' },
    { value: '2', label: '3ª Base' },
    { value: '3', label: 'Home (Carrera)' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Error Defensivo - Avance de ${batterName}`}
      size="md"
      hideCloseButton={true} // Use custom confirm/cancel
    >
      <div className="space-y-4">
        <Select
          label="Bateador avanza a:"
          options={baseOptions}
          value={String(baseReached)}
          onChange={(e) => setBaseReached(parseInt(e.target.value, 10) as 0 | 1 | 2 | 3)}
        />
        <Select
          label="Error cometido por:"
          options={defensivePlayerOptions}
          value={errorPlayerId === null ? 'TEAM_ERROR' : errorPlayerId}
          onChange={(e) => setErrorPlayerId(e.target.value)}
          placeholder="-- Seleccionar Jugador Defensivo o Error de Equipo --"
        />
        <div className="flex justify-end space-x-3 pt-4">
          <Button onClick={onClose} variant="light">
            Cancelar
          </Button>
          <Button onClick={handleConfirm} variant="primary">
            Confirmar Avance por Error
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ErrorAdvancementModal;
