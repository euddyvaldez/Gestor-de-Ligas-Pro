import React, { useState, useEffect } from 'react';
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
  initialAdvancements: { [lineupPlayerId: string]: number }; // lineupPlayerId is string
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

  useEffect(() => {
    if (isOpen) {
      const newAdvancementsState = { ...initialAdvancements };
      runnersOnBase.forEach(runner => {
        // Only prefill if not already set by initialAdvancements or previous interactions
        if (newAdvancementsState[runner.lineupPlayerId] === undefined) {
          if (hitType === 'HR') {
            newAdvancementsState[runner.lineupPlayerId] = 4; // HOME
          } else {
            // batterReachedBase for H1, H2, H3 is 1, 2, or 3. This is the hit's base value.
            const actualBatterReachedBase = batterReachedBase as 1 | 2 | 3; // Type cast for non-HR
            
            // Determine the minimum base the runner must occupy due to the batter's advance
            const minBaseRunnerMustOccupy = runner.currentBase < actualBatterReachedBase 
                                            ? actualBatterReachedBase 
                                            : runner.currentBase === actualBatterReachedBase 
                                                ? Math.min(4, runner.currentBase + 1) // Forced to advance at least one base
                                                : runner.currentBase; // If ahead, current base is their "min" spot unless hit advances further

            // Tentative advancement: current base + value of hit (e.g., on 1B + H2 -> 1+2 = 3rd base)
            const advancedByHitValue = runner.currentBase + actualBatterReachedBase;

            // Final prefill: MAX of (what they're forced to, what hit value takes them to), capped at HOME
            newAdvancementsState[runner.lineupPlayerId] = Math.min(4, Math.max(minBaseRunnerMustOccupy, advancedByHitValue));
          }
        }
      });
      setAdvancements(newAdvancementsState);
    }
  }, [isOpen, runnersOnBase, batterReachedBase, hitType, initialAdvancements]);

  const handleAdvancementChange = (runnerId: string, targetBase: number) => {
    setAdvancements(prev => ({ ...prev, [runnerId]: targetBase }));
  };

  const handleConfirmClick = () => {
    for (const runner of runnersOnBase) {
      if (advancements[runner.lineupPlayerId] === undefined) {
        alert(`Por favor, seleccione una base para ${runner.nombreJugador}.`);
        return;
      }
    }
    onConfirm(advancements, batter, hitType, batterReachedBase);
    onClose();
  };

  const getBaseLabel = (baseNum: number): string => {
    if (baseNum === 1) return '1B';
    if (baseNum === 2) return '2B';
    if (baseNum === 3) return '3B';
    if (baseNum === 4) return 'HOME';
    return '';
  };

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
          Seleccione la base a la que avanza cada corredor.
        </p>
        {runnersOnBase.map(runner => {
          const currentRunnerAdvancement = advancements[runner.lineupPlayerId];
          const validOptions: number[] = [];

          if (hitType === 'HR') {
            validOptions.push(4); // Only HOME is an option for runners on base with a HR
          } else {
            // For non-HR hits (batterReachedBase is 1, 2, or 3)
            const actualBatterReachedBase = batterReachedBase as 1 | 2 | 3;
            let minBaseForRunnerOptions: number;

            if (runner.currentBase < actualBatterReachedBase) {
              // Runner is BEHIND where batter landed, so runner must advance TO AT LEAST where batter landed.
              minBaseForRunnerOptions = actualBatterReachedBase;
            } else if (runner.currentBase === actualBatterReachedBase) {
              // Runner is ON THE SAME base where batter landed, so runner must advance PAST current base.
              minBaseForRunnerOptions = Math.min(4, runner.currentBase + 1);
            } else { // runner.currentBase > actualBatterReachedBase
              // Runner is AHEAD of where batter landed. They are not directly forced by the batter's new position.
              // Options start from their current base.
              minBaseForRunnerOptions = runner.currentBase;
            }

            // Generate options from minBaseForRunnerOptions up to HOME
            // And each option must also be >= the runner's current base (already handled by minBaseForRunnerOptions logic)
            for (let b = minBaseForRunnerOptions; b <= 4; b++) {
              validOptions.push(b);
            }
          }

          return (
            <div key={runner.lineupPlayerId} className="p-3 border rounded-md shadow-sm bg-gray-50">
              <p className="font-medium text-gray-800">
                {runner.nombreJugador} (en {getBaseLabel(runner.currentBase)} originalmente)
              </p>
              <div className="flex space-x-2 mt-2">
                {[1, 2, 3, 4].map(baseNum => {
                  const isEnabled = validOptions.includes(baseNum);
                  return (
                    <Button
                      key={baseNum}
                      onClick={() => handleAdvancementChange(runner.lineupPlayerId, baseNum)}
                      variant={currentRunnerAdvancement === baseNum ? 'primary' : 'light'}
                      size="sm"
                      className={`flex-1 ${!isEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={!isEnabled}
                      title={!isEnabled ? `Avance a ${getBaseLabel(baseNum)} no permitido según las reglas.` : `Mover a ${getBaseLabel(baseNum)}`}
                    >
                      {getBaseLabel(baseNum)}
                    </Button>
                  );
                })}
                {/* Separate OUT button */}
                <Button
                  onClick={() => handleAdvancementChange(runner.lineupPlayerId, 0)} // 0 for OUT
                  variant={currentRunnerAdvancement === 0 ? 'danger' : 'light'}
                  size="sm"
                  className="flex-1"
                  title="Marcar Corredor como OUT"
                >
                  OUT
                </Button>
              </div>
            </div>
          );
        })}
        <div className="flex justify-end space-x-3 pt-4">
          <Button onClick={onClose} variant="light">
            Cancelar
          </Button>
          <Button onClick={handleConfirmClick} variant="success">
            Confirmar Avances
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default RunnerAdvancementAfterHitModal;