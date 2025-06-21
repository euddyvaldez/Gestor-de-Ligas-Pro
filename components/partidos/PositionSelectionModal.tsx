import React from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { LineupPlayer, POSICIONES, EMPTY_POSICION_PLACEHOLDER, EMPTY_POSICION_LABEL } from '../../types';

interface PositionSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedPosition: string) => void;
  currentPlayerName: string;
  currentPosition: string; // The player's current position before opening modal
  teamLineup: LineupPlayer[];
  teamName: string;
}

const PositionSelectionModal: React.FC<PositionSelectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  currentPlayerName,
  currentPosition,
  teamLineup,
  teamName,
}) => {
  const uniqueFieldPositions = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];

  const getOccupiedByPlayerName = (position: string): string | null => {
    if (!uniqueFieldPositions.includes(position)) return null;
    // Find player in this position, EXCLUDING the current player being edited
    const otherOccupier = teamLineup.find(p => p.posicion === position && p.nombreJugador !== currentPlayerName);
    return otherOccupier ? otherOccupier.nombreJugador : null;
  };


  const allDisplayPositions = [
    { value: EMPTY_POSICION_PLACEHOLDER, label: EMPTY_POSICION_LABEL },
    ...POSICIONES.map(p => ({ value: p, label: p }))
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Asignar Posición para ${currentPlayerName} (${teamName})`}
      size="md"
    >
      <div className="space-y-2">
        <p className="text-sm text-gray-600 mb-3">
          Seleccione una posición. Las posiciones de campo únicas (P, C, 1B, etc.) ocupadas por otros jugadores se indicarán.
          Si está moviendo un jugador desde la Banca (BE), puede seleccionar una posición ocupada para intercambiar.
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto p-1">
          {allDisplayPositions.map(pos => {
            const occupierName = getOccupiedByPlayerName(pos.value);
            const isPlayerBeingEditedBE = currentPosition === 'BE';
            const isThisPosUniqueAndOccupiedByOther = uniqueFieldPositions.includes(pos.value) && !!occupierName;
            
            // Disable button if:
            // 1. The position is a unique field position, AND
            // 2. It's occupied by another player, AND
            // 3. The player currently being edited is NOT from the Bench ('BE').
            // (BE players can select occupied unique field positions to initiate a swap)
            const isDisabled = isThisPosUniqueAndOccupiedByOther && !isPlayerBeingEditedBE;
            
            return (
              <Button
                key={pos.value}
                onClick={() => onConfirm(pos.value)}
                variant={currentPosition === pos.value ? 'primary' : (isDisabled ? 'custom' : 'light')}
                className={`w-full text-sm py-2 ${isDisabled ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : (isThisPosUniqueAndOccupiedByOther && isPlayerBeingEditedBE ? 'bg-yellow-200 hover:bg-yellow-300' : '')}`}
                disabled={isDisabled}
                title={isDisabled ? `Ocupada por ${occupierName}` : (isThisPosUniqueAndOccupiedByOther && isPlayerBeingEditedBE ? `Mover a ${pos.label} (intercambia con ${occupierName})` :`Asignar ${pos.label}`)}
              >
                {pos.label}
                {isThisPosUniqueAndOccupiedByOther && <span className="block text-xs truncate">({occupierName})</span>}
              </Button>
            );
          })}
        </div>
        <div className="flex justify-end pt-4">
          <Button onClick={onClose} variant="secondary">
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default PositionSelectionModal;
