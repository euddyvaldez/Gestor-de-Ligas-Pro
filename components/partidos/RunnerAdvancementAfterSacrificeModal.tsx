
import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { LineupPlayer, RunnerAdvancementInfo } from '../../types';

interface RunnerAdvancementAfterSacrificeModalProps {
  isOpen: boolean;
  onClose: () => void;
  batter: LineupPlayer;
  sacrificeType: 'SF' | 'SH';
  runnersOnBase: RunnerAdvancementInfo[];
  initialAdvancements: { [lineupPlayerId: string]: number };
  initialOuts: number; // Outs before this sacrifice play began
  onConfirm: (
    advancements: { [lineupPlayerId: string]: number },
    batter: LineupPlayer,
    sacrificeType: 'SF' | 'SH',
    initialOuts: number
  ) => void;
}

const RunnerAdvancementAfterSacrificeModal: React.FC<RunnerAdvancementAfterSacrificeModalProps> = ({
  isOpen,
  onClose,
  batter,
  sacrificeType,
  runnersOnBase,
  initialAdvancements, // May not be needed if we always calculate from scratch
  initialOuts,
  onConfirm,
}) => {
  const [advancements, setAdvancements] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    if (isOpen) {
      const newAdvancementsState: { [key: string]: number } = {};
      runnersOnBase.forEach(runner => {
        // Prefill logic for sacrifice
        if (sacrificeType === 'SF' && runner.currentBase === 3 && initialOuts < 2) {
          newAdvancementsState[runner.lineupPlayerId] = 4; // HOME
        } else {
          // Default: advance one base if possible, otherwise hold. User can override.
          // Consider forced advances for SH (e.g., runner on 1B, SH means they must go to 2B if not out)
          // For now, simple prefill:
          newAdvancementsState[runner.lineupPlayerId] = Math.min(4, runner.currentBase + 1);
        }
      });
      setAdvancements(newAdvancementsState);
    }
  }, [isOpen, runnersOnBase, sacrificeType, initialOuts]);

  const handleAdvancementChange = (runnerId: string, targetBase: number) => {
    setAdvancements(prev => ({ ...prev, [runnerId]: targetBase }));
  };

  const handleConfirmClick = () => {
    for (const runner of runnersOnBase) {
      if (advancements[runner.lineupPlayerId] === undefined && runnersOnBase.length > 0) {
        alert(`Por favor, seleccione una opción para ${runner.nombreJugador}.`);
        return;
      }
    }
    onConfirm(advancements, batter, sacrificeType, initialOuts);
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
      title={`Avance de Corredores tras ${sacrificeType} de ${batter.nombreJugador}`}
      size="lg"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          El bateador ({batter.nombreJugador}) es OUT por {sacrificeType}.
          Seleccione la base a la que avanza cada corredor o si fue puesto OUT.
        </p>
        {runnersOnBase.length === 0 && <p className="text-sm text-gray-500 text-center py-2">No había corredores en base.</p>}
        {runnersOnBase.map(runner => {
          const currentRunnerAdvancement = advancements[runner.lineupPlayerId];
          // Determine valid options: can advance any number of bases or be out.
          // For SF, if runner on 3B scores, it's an RBI.
          // For SH, usually advances one base.
          const validOptions: number[] = [0, 1, 2, 3, 4]; // 0=OUT, 1-4 for bases

          return (
            <div key={runner.lineupPlayerId} className="p-3 border rounded-md shadow-sm bg-gray-50">
              <p className="font-medium text-gray-800">
                {runner.nombreJugador} (en {getBaseLabel(runner.currentBase)} originalmente)
              </p>
              <div className="flex space-x-2 mt-2">
                {[1, 2, 3, 4].map(baseNum => {
                  const isEnabled = validOptions.includes(baseNum);
                  // Runner cannot advance to a base lower than their current base, unless out.
                  const canAdvanceToBase = baseNum >= runner.currentBase;

                  return (
                    <Button
                      key={baseNum}
                      onClick={() => handleAdvancementChange(runner.lineupPlayerId, baseNum)}
                      variant={currentRunnerAdvancement === baseNum ? 'primary' : 'light'}
                      size="sm"
                      className={`flex-1 ${(!isEnabled || !canAdvanceToBase) ? 'opacity-50 cursor-not-allowed' : ''}`}
                      disabled={!isEnabled || !canAdvanceToBase}
                      title={!isEnabled || !canAdvanceToBase ? `Avance a ${getBaseLabel(baseNum)} no permitido.` : `Mover a ${getBaseLabel(baseNum)}`}
                    >
                      {getBaseLabel(baseNum)}
                    </Button>
                  );
                })}
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
            Confirmar Avances y Sacrificio
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default RunnerAdvancementAfterSacrificeModal;
