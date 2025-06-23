
import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Select from '../ui/Select';
import { RunnerAdvancementReason, PlayerOnBase, LineupPlayer, Jugada } from '../../types'; // Added Jugada
import { defaultJugadas } from '../../constants'; // Added defaultJugadas

interface RunnerAdvancementReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: RunnerAdvancementReason | string, errorPlayerId?: number | null) => void;
  runner: PlayerOnBase;
  defensiveTeamLineup: LineupPlayer[];
  defensiveTeamName: string;
  isScoringAttempt?: boolean; // Optional: To tailor text if scoring from 3rd
}

const RunnerAdvancementReasonModal: React.FC<RunnerAdvancementReasonModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  runner,
  defensiveTeamLineup,
  defensiveTeamName,
  isScoringAttempt = false,
}) => {
  const [reason, setReason] = useState<RunnerAdvancementReason | string>(RunnerAdvancementReason.STOLEN_BASE);
  const [errorPlayerId, setErrorPlayerId] = useState<string | null>(null); // For 'EA'

  useEffect(() => {
    if (isOpen) {
      setReason(RunnerAdvancementReason.STOLEN_BASE); // Reset on open
      setErrorPlayerId(null);
    }
  }, [isOpen]);

  const handleConfirmClick = () => {
    let finalErrorPlayerId: number | null = null;
    if (reason === RunnerAdvancementReason.ERROR_ADVANCE) {
      finalErrorPlayerId = errorPlayerId === 'TEAM_ERROR' || errorPlayerId === null ? null : parseInt(errorPlayerId, 10);
    }
    onConfirm(reason, finalErrorPlayerId);
    onClose();
  };

  const reasonOptions = [
    { value: RunnerAdvancementReason.STOLEN_BASE, label: `Base Robada ${isScoringAttempt ? ' (Robo de Home)' : ''} (SB)` },
    { value: RunnerAdvancementReason.WILD_PITCH, label: 'Wild Pitch (WP)' },
    { value: RunnerAdvancementReason.PASSED_BALL, label: 'Passed Ball (PB)' },
    { value: RunnerAdvancementReason.DEFENSIVE_INDIFFERENCE, label: 'Indiferencia Defensiva (DI)' },
    { value: RunnerAdvancementReason.ERROR_ADVANCE, label: `Avance por Error Defensivo (AE)${isScoringAttempt ? ' que permite anotar' : ''}` },
    // Add OB and BK from constants if available
    ...(defaultJugadas.find(j => j.jugada === 'OB') ? [{ value: 'OB', label: 'Obstrucción (OB)' }] : []),
    ...(defaultJugadas.find(j => j.jugada === 'BK') ? [{ value: 'BK', label: 'Balk (BK)' }] : []),
    { value: RunnerAdvancementReason.OTHER, label: 'Otro Motivo' },
  ];

  const defensivePlayerOptions = [
    { value: 'TEAM_ERROR', label: `Error del Equipo (${defensiveTeamName})` },
    ...defensiveTeamLineup
      .filter(p => p.posicion !== 'BE' && p.posicion !== '') // Active fielders
      .map(p => ({
        value: String(p.jugadorId),
        label: `${p.nombreJugador} (${p.posicion})`,
      })),
  ];

  const modalTitle = isScoringAttempt 
    ? `Causa de Anotación para ${runner.nombreJugador}`
    : `Motivo del Avance para ${runner.nombreJugador}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      size="md"
    >
      <div className="space-y-4">
        <Select
          label={`Seleccionar Causa de ${isScoringAttempt ? 'Anotación:' : 'Avance:'}`}
          options={reasonOptions}
          value={reason}
          onChange={(e) => setReason(e.target.value as RunnerAdvancementReason | string)}
        />
        {reason === RunnerAdvancementReason.ERROR_ADVANCE && (
          <Select
            label="Error cometido por:"
            options={defensivePlayerOptions}
            value={errorPlayerId === null ? 'TEAM_ERROR' : errorPlayerId}
            onChange={(e) => setErrorPlayerId(e.target.value)}
            placeholder="-- Seleccionar Jugador o Error de Equipo --"
          />
        )}
        <div className="flex justify-end space-x-3 pt-3">
          <Button onClick={onClose} variant="light">
            Cancelar
          </Button>
          <Button onClick={handleConfirmClick} variant="primary">
            Confirmar Motivo
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default RunnerAdvancementReasonModal;
