import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { PlayerInfoForOutSelection } from '../../types';

interface TriplePlayOutSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (outedPlayerIds: [string, string, string]) => void;
  playersInvolved: PlayerInfoForOutSelection[]; // Batter + runners
  teamName: string;
}

const TriplePlayOutSelectionModal: React.FC<TriplePlayOutSelectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  playersInvolved,
  teamName,
}) => {
  const [selectedOutPlayerIds, setSelectedOutPlayerIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setSelectedOutPlayerIds(new Set()); // Reset on open
    }
  }, [isOpen]);

  const handleTogglePlayerSelection = (playerId: string) => {
    setSelectedOutPlayerIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(playerId)) {
        newSet.delete(playerId);
      } else {
        if (newSet.size < 3) {
          newSet.add(playerId);
        } else {
          alert("Solo puede seleccionar 3 jugadores para el triple play.");
        }
      }
      return newSet;
    });
  };

  const handleConfirmClick = () => {
    if (selectedOutPlayerIds.size === 3) {
      const outedIdsArray = Array.from(selectedOutPlayerIds) as [string, string, string];
      onConfirm(outedIdsArray);
      onClose(); // Usually parent closes, but good practice here too
    } else {
      alert("Debe seleccionar exactamente 3 jugadores que fueron out.");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Seleccionar Jugadores Out en Triple Play (${teamName})`}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Seleccione exactamente tres jugadores que fueron puestos out en la jugada de triple play.
        </p>
        <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-200 rounded-md p-2">
          {playersInvolved.map(player => (
            <label
              key={player.id}
              className={`p-2 border rounded flex items-center transition-colors
                ${selectedOutPlayerIds.has(player.id) ? 'bg-blue-100 border-blue-400' : 'hover:bg-gray-50 cursor-pointer'}`}
            >
              <input
                type="checkbox"
                checked={selectedOutPlayerIds.has(player.id)}
                onChange={() => handleTogglePlayerSelection(player.id)}
                className="mr-2 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="flex-grow">{player.name} {player.isOnBase ? `(Corredor en ${player.baseNumber}B)` : '(Bateador)'}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end space-x-3 pt-3">
          <Button onClick={onClose} variant="light">
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmClick}
            variant="primary"
            disabled={selectedOutPlayerIds.size !== 3}
          >
            Confirmar Outs ({selectedOutPlayerIds.size}/3)
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default TriplePlayOutSelectionModal;