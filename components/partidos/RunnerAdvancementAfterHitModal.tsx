import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { LineupPlayer, RunnerAdvancementInfo } from '../../types';

interface RunnerAdvancementAfterHitModalProps {
  isOpen: boolean;
  onClose: () => void;
  batter: LineupPlayer;
  hitType: 'H1' | 'H2' | 'H3' | 'HR';
  batterReachedBase: 1 | 2 | 3 | 4; // 1: 1B, 2: 2B, 3: 3B, 4: HOME
  runnersOnBase: RunnerAdvancementInfo[];
  initialAdvancements: { [lineupPlayerId: string]: number }; 
  onConfirm: (
    advancements: { [lineupPlayerId: string]: number },
    batter: LineupPlayer,
    hitType: 'H1' | 'H2' | 'H3' | 'HR',
    batterFinalDestBase: 1 | 2 | 3 | 4
  ) => void;
}

const RunnerAdvancementAfterHitModal: React.FC<RunnerAdvancementAfterHitModalProps> = ({
  isOpen,
  onClose,
  batter,
  hitType,
  batterReachedBase,
  runnersOnBase,
  initialAdvancements,
  onConfirm,
}) => {
  const [advancements, setAdvancements] = useState<{ [key: string]: number }>({});
  const [currentlyDecidingRunnerIndex, setCurrentlyDecidingRunnerIndex] = useState(0);

  const sortedRunners = useMemo(() => {
    return [...runnersOnBase].sort((a, b) => b.currentBase - a.currentBase); // 3B first, then 2B, then 1B
  }, [runnersOnBase]);

  useEffect(() => {
    if (isOpen) {
      const newAdvancementsState = { ...initialAdvancements };
       // Prefill logic based on sorted runners for better forced advance handling
      const tempOccupiedBasesByPrefill: (string | null)[] = [null, null, null, null]; // 1B, 2B, 3B, HOME for prefill phase
      if (batterReachedBase >= 1 && batterReachedBase <= 3) {
          tempOccupiedBasesByPrefill[batterReachedBase - 1] = batter.id; // Batter occupies this base
      }


      sortedRunners.forEach(runner => {
        if (newAdvancementsState[runner.lineupPlayerId] === undefined) {
          if (hitType === 'HR') {
            newAdvancementsState[runner.lineupPlayerId] = 4; // HOME
          } else {
            // Here, hitType is 'H1', 'H2', or 'H3'.
            // So, batterReachedBase (the prop) should be 1, 2, or 3.
            let actualHitDestination: 1 | 2 | 3; // This variable represents the base the BATTER reached on the hit (H1, H2, H3)
            if (batterReachedBase === 1 || batterReachedBase === 2 || batterReachedBase === 3) {
              actualHitDestination = batterReachedBase;
            } else {
              // This case should not be reached if PartidosPage calls this modal correctly.
              console.error(`Logical error: For hitType ${hitType}, batterReachedBase was ${batterReachedBase}. Defaulting to 1B.`);
              actualHitDestination = 1; // Fallback to satisfy type, signals an issue.
            }
            
            let minBaseRunnerMustOccupy: 1 | 2 | 3 | 4 = runner.currentBase; // This should be the runner's *new* minimum base
            
            if (runner.currentBase < actualHitDestination) { // Runner is behind where the batter landed
              minBaseRunnerMustOccupy = actualHitDestination; // Runner must at least get to where batter landed.
              // If batter is on that base, the runner must go one further.
              if (tempOccupiedBasesByPrefill[actualHitDestination - 1] === batter.id) { // Check if batter is occupying the actualHitDestination
                  minBaseRunnerMustOccupy = Math.min(4, actualHitDestination + 1) as 1 | 2 | 3 | 4; // Runner pushed further
              }
            } else if (runner.currentBase === actualHitDestination) { // Runner is on the same base the batter landed on
              minBaseRunnerMustOccupy = Math.min(4, runner.currentBase + 1) as 1 | 2 | 3 | 4; // Runner must advance at least one base
            }

            // `advancedByHitValue` is a potential target, often used as a simple rule (runner advances same # of bases as hit type)
            const advancedByHitValue = runner.currentBase + actualHitDestination;
            // The proposed target base should be at least the minimum forced advancement, and potentially more due to the hit value.
            let proposedTargetBase = Math.min(4, Math.max(minBaseRunnerMustOccupy, advancedByHitValue));
            
            // Check for collisions with other runners *already prefilled*
            // This is a simplified check; complex multi-runner forced advances can be tricky
            for (let i = proposedTargetBase -1; i >= runner.currentBase; i--) { // Iterate downwards from proposed target base
                // If a base is occupied by another runner (not the batter, not self)
                if (i < 3 && tempOccupiedBasesByPrefill[i] && tempOccupiedBasesByPrefill[i] !== batter.id && tempOccupiedBasesByPrefill[i] !== runner.lineupPlayerId) {
                    proposedTargetBase = i + 2; // Try to advance past the occupied base. i+1 is the occupied base, so i+2 is the next one.
                    break;
                }
            }
            newAdvancementsState[runner.lineupPlayerId] = Math.min(4, proposedTargetBase);
          }
        }
        // Update tempOccupiedBases for next runner's prefill
        const prefilledDest = newAdvancementsState[runner.lineupPlayerId];
        if (prefilledDest >=1 && prefilledDest <=3) { // Only mark 1B, 2B, 3B as occupied, not HOME
            tempOccupiedBasesByPrefill[prefilledDest-1] = runner.lineupPlayerId;
        }
      });
      setAdvancements(newAdvancementsState);
      setCurrentlyDecidingRunnerIndex(0);
    }
  }, [isOpen, sortedRunners, batterReachedBase, hitType, initialAdvancements, batter.id]);

  const handleAdvancementChange = (runnerId: string, targetBase: number) => {
    setAdvancements(prev => ({ ...prev, [runnerId]: targetBase }));
    if (currentlyDecidingRunnerIndex < sortedRunners.length -1 ) {
        setCurrentlyDecidingRunnerIndex(prevIdx => prevIdx + 1);
    }
  };

  const handleConfirmClick = () => {
    const occupiedBases: { [key: number]: string } = {}; // Stores lineupPlayerId
    for (const runner of sortedRunners) {
      const destBase = advancements[runner.lineupPlayerId];
      if (destBase >= 1 && destBase <= 3) { // Bases 1B, 2B, 3B
        if (occupiedBases[destBase]) {
            let otherPlayerName = 'otro corredor';
            const otherPlayerId = occupiedBases[destBase];
            if (batter.id === otherPlayerId) { // Check if the occupier is the current batter
                otherPlayerName = batter.nombreJugador;
            } else { // Check if the occupier is one of the other runners
                const otherRunner = sortedRunners.find(r => r.lineupPlayerId === otherPlayerId);
                if (otherRunner) {
                    otherPlayerName = otherRunner.nombreJugador;
                }
            }
            alert(`Error: ${runner.nombreJugador} y ${otherPlayerName} no pueden ocupar la misma base (${getBaseLabel(destBase)}).`);
            return; 
        }
        occupiedBases[destBase] = runner.lineupPlayerId;
      }
    }
    onConfirm(advancements, batter, hitType, batterReachedBase);
    onClose();
  };

  const getBaseLabel = (baseNum: number): string => {
    if (baseNum === 0) return 'OUT';
    if (baseNum === 1) return '1B';
    if (baseNum === 2) return '2B';
    if (baseNum === 3) return '3B';
    if (baseNum === 4) return 'HOME';
    return '';
  };
  
  const allDecisionsMade = sortedRunners.every(runner => advancements[runner.lineupPlayerId] !== undefined) || sortedRunners.length === 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Avance de Corredores tras ${hitType} de ${batter.nombreJugador}`}
      size="lg"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          El bateador ({batter.nombreJugador}) llegó a {getBaseLabel(batterReachedBase)}. 
          Seleccione la base a la que avanza cada corredor, comenzando por el más adelantado.
        </p>
        {sortedRunners.map((runner, index) => {
          const currentRunnerAdvancement = advancements[runner.lineupPlayerId];
          const isActiveForDecision = index === currentlyDecidingRunnerIndex;
          
          const occupiedByOtherDecidedRunners: Set<number> = new Set();
          sortedRunners.forEach((r, i) => {
            if (i < index && advancements[r.lineupPlayerId] !== undefined && advancements[r.lineupPlayerId] >= 1 && advancements[r.lineupPlayerId] <= 3) {
              occupiedByOtherDecidedRunners.add(advancements[r.lineupPlayerId]);
            }
          });

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
                {[1, 2, 3, 4, 0].map(baseNum => { // Include OUT (0) in the map
                  let isEnabled = isActiveForDecision;
                  let title = isEnabled ? `Mover a ${getBaseLabel(baseNum)}` : `Esperando decisión para corredor anterior`;
                  
                  if (isEnabled) { // Only apply detailed validation if it's the active runner
                    if (baseNum !== 0 && baseNum < runner.currentBase) { // Cannot retreat to a lower base (unless OUT)
                      isEnabled = false;
                      title = `No se puede retroceder a ${getBaseLabel(baseNum)}.`;
                    }
                    if (baseNum >= 1 && baseNum <= 3 && occupiedByOtherDecidedRunners.has(baseNum)) { // Check collision with *already decided* runners
                        isEnabled = false;
                        title = `${getBaseLabel(baseNum)} ya está ocupada por otro corredor.`;
                    }

                    if (hitType !== 'HR') { // Rules for non-HRs
                        const actualBatterReachedBaseNum = batterReachedBase as 1 | 2 | 3; // batterReachedBase is 1,2,3 for H1/H2/H3
                        if (runner.currentBase < actualBatterReachedBaseNum && baseNum !== 0 && baseNum < actualBatterReachedBaseNum) {
                           isEnabled = false; title = `Debe avanzar al menos hasta ${getBaseLabel(actualBatterReachedBaseNum)}.`;
                        }
                        if (runner.currentBase === actualBatterReachedBaseNum && baseNum !== 0 && baseNum <= actualBatterReachedBaseNum) {
                           isEnabled = false; title = `Debe avanzar más allá de ${getBaseLabel(actualBatterReachedBaseNum)}.`;
                        }
                         // Check if this base is where the batter landed
                        if (baseNum !== 0 && baseNum === actualBatterReachedBaseNum) {
                            isEnabled = false; title = `${getBaseLabel(actualBatterReachedBaseNum)} está ocupada por el bateador.`;
                        }
                    } else { // HR specific logic
                        if (baseNum !== 4 && baseNum !== 0) { // On HR, runners can only go HOME or be OUT
                            isEnabled = false; title = `Con Home Run, el corredor solo puede anotar o ser OUT.`;
                        }
                    }
                  }

                  return (
                    <Button
                      key={baseNum}
                      onClick={() => handleAdvancementChange(runner.lineupPlayerId, baseNum)}
                      variant={currentRunnerAdvancement === baseNum ? (baseNum === 0 ? 'danger' : 'primary') : 'light'}
                      size="sm"
                      className={`flex-1 ${!isEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={!isEnabled}
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

export default RunnerAdvancementAfterHitModal;

// Helper to find player by ID, replace with actual import if available
// const jugadoresDB = { find: (cb) => ({ nombre: 'Jugador X' }) }; // Removed problematic mock