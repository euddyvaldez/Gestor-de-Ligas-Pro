
import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Select from '../ui/Select';
import { PlayerOnBase, LineupPlayer } from '../../types';

interface AssignRbiModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (rbiCreditedToPlayerId: string | null) => void;
  scoringPlayerInfo: PlayerOnBase;
  batterForRbiContext: LineupPlayer | null; // Current batter
  previousBatterForRbiContext: LineupPlayer | null; // Batter of previous play if different
}

const AssignRbiModal: React.FC<AssignRbiModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  scoringPlayerInfo,
  batterForRbiContext,
  previousBatterForRbiContext,
}) => {
  const [selectedRbiPlayerId, setSelectedRbiPlayerId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Default to current batter if available, otherwise null (No RBI)
      setSelectedRbiPlayerId(batterForRbiContext ? batterForRbiContext.id : null);
    }
  }, [isOpen, batterForRbiContext]);

  const handleConfirmClick = () => {
    onConfirm(selectedRbiPlayerId);
  };

  const options = [{ value: 'NO_RBI', label: 'Sin RBI (Error, WP, PB, Robo sin asistencia, etc.)' }];
  if (batterForRbiContext) {
    options.push({ value: batterForRbiContext.id, label: `Bateador Actual: ${batterForRbiContext.nombreJugador}` });
  }
  if (previousBatterForRbiContext && previousBatterForRbiContext.id !== batterForRbiContext?.id) {
    options.push({ value: previousBatterForRbiContext.id, label: `Bateador Anterior: ${previousBatterForRbiContext.nombreJugador}` });
  }
  // Ensure unique values for options if batterForRbiContext and previousBatterForRbiContext are the same (though logic above should prevent this)
  const uniqueOptions = options.filter((option, index, self) =>
    index === self.findIndex((o) => o.value === option.value)
  );


  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${scoringPlayerInfo.nombreJugador} anotó. ¿Acreditar RBI?`}
      size="md"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          Seleccione a quién se le debe acreditar la carrera impulsada (RBI) por la anotación de {scoringPlayerInfo.nombreJugador}.
        </p>
        <Select
          label="Acreditar RBI a:"
          options={uniqueOptions.map(opt => ({...opt, value: opt.value || 'NO_RBI'}))} // Ensure value is never null/undefined for Select
          value={selectedRbiPlayerId || 'NO_RBI'} // Handle null for 'NO_RBI'
          onChange={(e) => setSelectedRbiPlayerId(e.target.value === 'NO_RBI' ? null : e.target.value)}
        />
        <div className="flex justify-end space-x-3 pt-3">
          <Button onClick={onClose} variant="light">
            Cancelar
          </Button>
          <Button onClick={handleConfirmClick} variant="primary">
            Confirmar RBI
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default AssignRbiModal;
