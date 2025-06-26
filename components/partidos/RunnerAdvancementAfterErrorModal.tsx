
import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { LineupPlayer, RunnerAdvancementInfo } from '../../types';

interface RunnerAdvancementAfterErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  batterWhoReachedOnError: LineupPlayer;
  batterFinalDestBaseOnError: 0 | 1 | 2 | 3; // 0=1B, 1=2B, 2=3B, 3=HOME
  runnersOnBaseAtTimeOfError: RunnerAdvancementInfo[];
  fielderWhoCommittedError: number | null; // Jugador.codigo
  onConfirm: (
    advancements: { [lineupPlayerId: string]: number }, // runner.id -> targetBase (0=OUT, 1-4)
    originalFielderErrorId: number | null,
    batterAtPlay: LineupPlayer,
    batterDestBase: 0 | 1 | 2 | 3
  ) => void;
}

const RunnerAdvancementAfterErrorModal: React.FC<RunnerAdvancementAfterErrorModalProps> = ({
  isOpen,
  onClose,
  batterWhoReachedOnError,
  batterFinalDestBaseOnError,
  runnersOnBaseAtTimeOfError,
  fielderWhoCommittedError,
  onConfirm,
}) => {
  const [advancements, setAdvancements] = useState<{ [key: string]: number }>({});
  const [currentlyDecidingRunnerIndex, setCurrentlyDecidingRunnerIndex] = useState(0);

  const sortedRunners = useMemo(() => {
    return [...runnersOnBaseAtTimeOfError].sort((a, b) => b.currentBase - a.currentBase); // 3B first, then 2B, then 1B
  }, [runnersOnBaseAtTimeOfError]);

  useEffect(() => {
    if (isOpen) {
      setAdvancements({}); // Start with empty advancements, user will decide sequentially
      setCurrentlyDecidingRunnerIndex(0); // Start with the most advanced runner
    }
  }, [isOpen]);

  const handleAdvancementChange = (runnerId: string, targetBase: number) => {
    setAdvancements(prev => ({ ...prev, [runnerId]: targetBase }));
    const currentIndex = sortedRunners.findIndex(r => r.lineupPlayerId === runnerId);
    if (currentIndex === currentlyDecidingRunnerIndex && currentlyDecidingRunnerIndex < sortedRunners.length - 1) {
      setCurrentlyDecidingRunnerIndex(prevIdx => prevIdx + 1);
    }
  };

  const handleConfirmClick = () => {
    // Final validation before confirming
    const occupiedBasesCheck: { [key: number]: string } = {};
    // Batter occupies a base (1-3)
    const batterDestBaseNum = batterFinalDestBaseOnError + 1;
    if (batterDestBaseNum >= 1 && batterDestBaseNum <= 3) {
        occupiedBasesCheck[batterDestBaseNum] = batterWhoReachedOnError.id;
    }

    for (const runner of sortedRunners) {
      const destBase = advancements[runner.lineupPlayerId];
      if (destBase === undefined) {
        alert(`Por favor, seleccione una opción para ${runner.nombreJugador}.`);
        return;
      }
      if (destBase >= 1 && destBase <= 3) { // Bases 1B, 2B, 3B
        if (occupiedBasesCheck[destBase]) {
            const occupierIsBatter = occupiedBasesCheck[destBase] === batterWhoReachedOnError.id;
            const otherPlayerName = occupierIsBatter ? batterWhoReachedOnError.nombreJugador : sortedRunners.find(r=>r.lineupPlayerId === occupiedBasesCheck[destBase])?.nombreJugador || 'otro jugador';
            alert(`Error: ${runner.nombreJugador} y ${otherPlayerName} no pueden ocupar la misma base (${getBaseLabel(destBase)}).`);
            return; 
        }
        occupiedBasesCheck[destBase] = runner.lineupPlayerId;
      }
    }
    onConfirm(advancements, fielderWhoCommittedError, batterWhoReachedOnError, batterFinalDestBaseOnError);
    // onClose will be called by parent component after onConfirm logic completes
  };

  const getBaseLabel = (baseNum: number): string => {
    if (baseNum === 0) return 'OUT';
    if (baseNum === 1) return '1B';
    if (baseNum === 2) return '2B';
    if (baseNum === 3) return '3B';
    if (baseNum === 4) return 'HOME';
    return '';
  };
  
  const batterReachedBaseDisplay = batterFinalDestBaseOnError === 3 ? 'HOME' : `${getBaseLabel(batterFinalDestBaseOnError + 1)}`;
  const batterDestinationBaseNumber = batterFinalDestBaseOnError + 1; 

  const allDecisionsMade = sortedRunners.every(runner => advancements[runner.lineupPlayerId] !== undefined) || sortedRunners.length === 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Avance de Corredores tras Error en Jugada de ${batterWhoReachedOnError.nombreJugador}`}
      size="lg"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          El bateador ({batterWhoReachedOnError.nombreJugador}) llegó a {batterReachedBaseDisplay} por error.
          Seleccione la base a la que avanza cada corredor o si fue puesto OUT, comenzando por el más adelantado.
        </p>
        {runnersOnBaseAtTimeOfError.length === 0 && <p className="text-gray-600 text-center py-2">No había corredores en base al momento del error.</p>}
        
        {sortedRunners.map((runner, index) => {
          const currentRunnerAdvancement = advancements[runner.lineupPlayerId];
          const isActiveForDecision = index === currentlyDecidingRunnerIndex;

          const occupiedByOtherDecidedRunners: Set<number> = new Set();
          if (isActiveForDecision) {
              sortedRunners.forEach((r, i) => {
                  if (i < index && advancements[r.lineupPlayerId] !== undefined && advancements[r.lineupPlayerId] >= 1 && advancements[r.lineupPlayerId] <= 3) {
                      occupiedByOtherDecidedRunners.add(advancements[r.lineupPlayerId]);
                  }
              });
          }
          
          return (
            <div 
              key={runner.lineupPlayerId} 
              className={`p-3 border rounded-md shadow-sm transition-all duration-300
                ${isActiveForDecision ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200' : 'bg-gray-100 opacity-60'}`}
            >
              <p className={`font-medium ${isActiveForDecision ? 'text-blue-700' : 'text-gray-700'}`}>
                {runner.nombreJugador} (en {getBaseLabel(runner.currentBase)} originalmente)
                {!isActiveForDecision && currentRunnerAdvancement !== undefined && 
                  <span className="text-sm font-normal text-gray-500"> - Destino: {getBaseLabel(currentRunnerAdvancement)}</span>
                }
              </p>
              <div className="flex space-x-2 mt-2">
                {[1, 2, 3, 4, 0].map(baseNum => { // targetBaseNum: 1-4 for bases, 0 for OUT
                  let buttonIsDisabled = !isActiveForDecision;
                  let title = buttonIsDisabled ? `Esperando decisión para corredor anterior` : `Mover a ${getBaseLabel(baseNum)}`;

                  if (isActiveForDecision) {
                    if (baseNum !== 0 && baseNum < runner.currentBase) {
                      buttonIsDisabled = true;
                      title = `No se puede retroceder a ${getBaseLabel(baseNum)}.`;
                    }
                    if (baseNum >= 1 && baseNum <= 3 && occupiedByOtherDecidedRunners.has(baseNum)) {
                        buttonIsDisabled = true;
                        title = `${getBaseLabel(baseNum)} ya está ocupada por otro corredor decidido.`;
                    }
                    
                    // Forced advance due to batter
                    if (runner.currentBase < batterDestinationBaseNumber) { // Runner was BEHIND where batter landed
                        if (baseNum !== 0 && baseNum <= batterDestinationBaseNumber) { // Must advance BEYOND where batter is
                            buttonIsDisabled = true;
                            title = `Debe avanzar más allá de ${getBaseLabel(batterDestinationBaseNumber)} (ocupada por bateador).`;
                        }
                    } else if (runner.currentBase === batterDestinationBaseNumber) { // Runner was ON THE SAME BASE as batter
                         if (baseNum !== 0 && baseNum <= batterDestinationBaseNumber) { // Must advance BEYOND this base
                            buttonIsDisabled = true;
                            title = `Debe avanzar más allá de ${getBaseLabel(batterDestinationBaseNumber)} (ocupada por bateador).`;
                        }
                    } else { // Runner was AHEAD of where batter landed
                        // Check direct occupation by batter only if target is where batter landed
                        if (baseNum !== 0 && baseNum === batterDestinationBaseNumber) {
                           buttonIsDisabled = true;
                           title = `${getBaseLabel(batterDestinationBaseNumber)} está ocupada por el bateador.`;
                        }
                    }
                  }
                  
                  return (
                    <Button
                      key={baseNum}
                      onClick={() => handleAdvancementChange(runner.lineupPlayerId, baseNum)}
                      variant={currentRunnerAdvancement === baseNum ? (baseNum === 0 ? 'danger' : 'primary') : 'light'}
                      size="sm"
                      className={`flex-1 ${buttonIsDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={buttonIsDisabled}
                      title={title}
                    >
                      {getBaseLabel(baseNum)}
                    </Button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="flex justify-end space-x-3 pt-4">
          <Button onClick={onClose} variant="light">
            Cancelar
          </Button>
          <Button onClick={handleConfirmClick} variant="success" disabled={!allDecisionsMade}>
            Confirmar Avances
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default RunnerAdvancementAfterErrorModal;
