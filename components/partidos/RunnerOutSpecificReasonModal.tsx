
import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

export type RunnerOutReason = 'CS' | 'PK' | 'OTHER_OUT';

interface RunnerOutSpecificReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (outReason: RunnerOutReason) => void;
  runnerName: string;
  baseBeingRunFrom?: string; // e.g., "3B", "Home" (if stealing home)
}

const RunnerOutSpecificReasonModal: React.FC<RunnerOutSpecificReasonModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  runnerName,
  baseBeingRunFrom,
}) => {
  const [selectedReason, setSelectedReason] = useState<RunnerOutReason | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedReason(null); // Reset on open
    }
  }, [isOpen]);

  const handleConfirmClick = () => {
    if (selectedReason) {
      onConfirm(selectedReason);
      onClose();
    } else {
      alert("Por favor, seleccione un motivo para el out.");
    }
  };

  const baseText = baseBeingRunFrom ? ` (desde ${baseBeingRunFrom})` : '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Motivo del Out para ${runnerName}${baseText}`}
      size="sm"
    >
      <div className="space-y-3">
        <Button 
          onClick={() => setSelectedReason('CS')}
          variant={selectedReason === 'CS' ? 'primary' : 'light'}
          className="w-full"
        >
          Cogido Robando (CS)
        </Button>
        <Button 
          onClick={() => setSelectedReason('PK')}
          variant={selectedReason === 'PK' ? 'primary' : 'light'}
          className="w-full"
        >
          Pickoff (PK)
        </Button>
        <Button 
          onClick={() => setSelectedReason('OTHER_OUT')}
          variant={selectedReason === 'OTHER_OUT' ? 'primary' : 'light'}
          className="w-full"
        >
          Otro Out en Base/Home
        </Button>
        
        <div className="flex justify-end space-x-3 pt-4">
          <Button onClick={onClose} variant="light">
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirmClick} 
            variant="danger"
            disabled={!selectedReason}
          >
            Confirmar Out
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default RunnerOutSpecificReasonModal;
