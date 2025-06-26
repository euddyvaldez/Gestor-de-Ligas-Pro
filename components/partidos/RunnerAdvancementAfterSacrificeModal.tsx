
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
  initialAdvancements, 
  initialOuts,
  onConfirm,
}) => {
  const [advancements, setAdvancements] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    if (isOpen) {
      const newAdvancementsState: { [key: string]: number } = {};
      runnersOnBase.forEach(runner => {
        // For SF, the runner from 3B (if conditions met) is assumed to score and might not even be in `runnersOnBase` prop here.
        // This modal should primarily handle runners on 1B/2B for SF, or all runners for SH.
        // Default prefill: advance one base if possible, or hold. User can override.
        // More sophisticated prefill might consider forced advances on SH.
        newAdvancementsState[runner.lineupPlayerId] = Math.min(4, runner.currentBase + 1); 
      });
      setAdvancements(newAdvancementsState);
    }
  }, [isOpen, runnersOnBase, sacrificeType, initialOuts]);

  const handleAdvancementChange = (runnerId: string, targetBase: number) => {
    setAdvancements(prev => ({ ...prev, [runnerId]: targetBase }));
  };

  const handleConfirmClick = () => {
    // Check if all runners have a decision if there are runners to decide for.
    if (runnersOnBase.length > 0 && !runnersOnBase.every(runner => advancements[runner.lineupPlayerId] !== undefined)) {
        alert(`Por favor, seleccione una opción para cada corredor.`);
        return;
    }
    onConfirm(advancements, batter, sacrificeType, initialOuts);
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
          {sacrificeType === 'SF' && runnersOnBase.some(r => r.currentBase === 3) && initialOuts < 2 ? 
            ' El corredor de 3B anota automáticamente. ' : ''}
          Seleccione la base a la que avanza cada corredor adicional o si fue puesto OUT.
        </p>
        {runnersOnBase.length === 0 && <p className="text-sm text-gray-500 text-center py-2">No había otros corredores en base para avanzar.</p>}
        
        {runnersOnBase.map(runner => {
          // Runner from 3B on SF scores automatically, should not be interactive here.
          if (sacrificeType === 'SF' && runner.currentBase === 3 && initialOuts < 2) {
            return (
              <div key={runner.lineupPlayerId} className="p-3 border rounded-md shadow-sm bg-green-50">
                <p className="font-medium text-green-700">
                  {runner.nombreJugador} (en 3B originalmente) - Anota automáticamente por Fly de Sacrificio.
                </p>
              </div>
            );
          }

          const currentRunnerAdvancement = advancements[runner.lineupPlayerId];
          
          return (
            <div key={runner.lineupPlayerId} className="p-3 border rounded-md shadow-sm bg-gray-50">
              <p className="font-medium text-gray-800">
                {runner.nombreJugador} (en {getBaseLabel(runner.currentBase)} originalmente)
              </p>
              <div className="flex space-x-2 mt-2">
                {[1, 2, 3, 4, 0].map(baseNum => { // 0 for OUT
                  let isEnabled = true;
                  let title = `Mover a ${getBaseLabel(baseNum)}`;

                  if (baseNum !== 0 && baseNum < runner.currentBase) { // Cannot retreat unless OUT
                    isEnabled = false;
                    title = `No se puede retroceder a ${getBaseLabel(baseNum)}.`;
                  }
                  // Add any other specific disabling logic if needed (e.g., cannot skip bases without reason)

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
          <Button onClick={handleConfirmClick} variant="success">
            Confirmar Avances y Sacrificio
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default RunnerAdvancementAfterSacrificeModal;
