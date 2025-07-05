

import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Select from '../ui/Select';
import { LineupPlayer, RunnerAdvancementInfo, FielderChoiceResult, Jugada } from '../../types';

interface FielderChoiceOutcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  batter: LineupPlayer;
  runnersOnBase: RunnerAdvancementInfo[];
  initialOuts: number;
  jugada: Jugada;
  onConfirm: (result: FielderChoiceResult, jugada: Jugada) => void;
  requiredOuts?: number;
}

const getBaseLabel = (baseNum: number): string => {
  if (baseNum === 0) return 'OUT';
  if (baseNum === 1) return '1B';
  if (baseNum === 2) return '2B';
  if (baseNum === 3) return '3B';
  if (baseNum === 4) return 'HOME';
  return 'N/A';
};

export const FielderChoiceOutcomeModal: React.FC<FielderChoiceOutcomeModalProps> = ({
  isOpen,
  onClose,
  batter,
  runnersOnBase,
  initialOuts,
  jugada,
  onConfirm,
  requiredOuts,
}) => {
  const [selectedPrimaryOutPlayerId, setSelectedPrimaryOutPlayerId] = useState<string | null>(null);
  const [batterAdvancement, setBatterAdvancement] = useState<number>(1); // Batter typically reaches 1B
  const [runnerAdvancements, setRunnerAdvancements] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    if (isOpen) {
      // Reset states when the modal is opened.
      // The other dependencies (batter, runnersOnBase) are intentionally omitted
      // to prevent re-initializing the modal's state on every parent re-render,
      // which would cause an infinite loop and lose user selections.
      setSelectedPrimaryOutPlayerId(null);
      setBatterAdvancement(1); // Batter defaults to 1B

      const initialRunnerAdvancements: { [key: string]: number } = {};
      const batterReachesFirst = true; // Since we are defaulting batterAdvancement to 1
      
      runnersOnBase.forEach(runner => {
        // Default runners to hold or advance one base if forced by batter to 1B.
        let prefilledTarget: number = runner.currentBase;
        
        if (runner.currentBase === 1 && batterReachesFirst) { // Batter to 1B, runner on 1B forced
          prefilledTarget = 2;
        } else if (runner.currentBase === 2 && batterReachesFirst && runnersOnBase.some(r => r.currentBase === 1)) { // Batter to 1B, runner on 1B, runner on 2B forced
           prefilledTarget = 3;
        } else if (runner.currentBase === 3 && batterReachesFirst && runnersOnBase.some(r => r.currentBase === 1) && runnersOnBase.some(r => r.currentBase === 2)) { // Bases loaded
            prefilledTarget = 4; // Scores
        }
        initialRunnerAdvancements[runner.lineupPlayerId] = prefilledTarget;
      });
      setRunnerAdvancements(initialRunnerAdvancements);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handlePrimaryOutSelected = (playerId: string | null) => {
    const previousOutPlayerId = selectedPrimaryOutPlayerId;
    setSelectedPrimaryOutPlayerId(playerId);

    // If a new player is selected as out...
    if (playerId) {
        if (playerId === batter.id) {
            setBatterAdvancement(0); // Batter is out
        } else {
            setRunnerAdvancements(prev => ({...prev, [playerId]: 0})); // Runner is out
        }
    }

    // If a player who WAS out is no longer the primary out...
    if (previousOutPlayerId && previousOutPlayerId !== playerId) {
        if (previousOutPlayerId === batter.id) {
            // Batter was out, now isn't. Reset to 1B.
            setBatterAdvancement(1);
        } else {
            // Runner was out, now isn't. Reset to their original base.
            const runnerPreviouslyOut = runnersOnBase.find(r => r.lineupPlayerId === previousOutPlayerId);
            if (runnerPreviouslyOut) {
                 setRunnerAdvancements(prev => ({...prev, [previousOutPlayerId]: runnerPreviouslyOut.currentBase}));
            }
        }
    }
  };
  
  const handleBatterAdvancementChange = (targetBase: number) => {
    setBatterAdvancement(targetBase);
    if (targetBase === 0 && selectedPrimaryOutPlayerId !== batter.id) { // Batter marked out via buttons
        setSelectedPrimaryOutPlayerId(batter.id);
    } else if (targetBase !== 0 && selectedPrimaryOutPlayerId === batter.id) { // Batter no longer out via buttons
        setSelectedPrimaryOutPlayerId(null);
    }
  };

  const handleRunnerAdvancementChange = (runnerId: string, targetBase: number) => {
    setRunnerAdvancements(prev => ({ ...prev, [runnerId]: targetBase }));
     if (targetBase === 0 && selectedPrimaryOutPlayerId !== runnerId) { // Runner marked out via buttons
        setSelectedPrimaryOutPlayerId(runnerId);
    } else if (targetBase !== 0 && selectedPrimaryOutPlayerId === runnerId) { // Runner no longer out via buttons
        setSelectedPrimaryOutPlayerId(null);
    }
  };

  const handleConfirmClick = () => {
    // Determine the final state of advancements
    const finalRunnerAdvancements = { ...runnerAdvancements };
    let finalBatterAdvancement = batterAdvancement;

    // The dropdown is the source of truth for the *primary* out.
    // If a player is selected in the dropdown, their advancement is 0.
    if (selectedPrimaryOutPlayerId) {
        if (selectedPrimaryOutPlayerId === batter.id) {
            finalBatterAdvancement = 0;
        } else {
            finalRunnerAdvancements[selectedPrimaryOutPlayerId] = 0;
        }
    }

    // Now, count the total number of unique players who are out
    const playersOut = new Set<string>();
    if (finalBatterAdvancement === 0) {
        playersOut.add(batter.id);
    }
    Object.entries(finalRunnerAdvancements).forEach(([playerId, destination]) => {
        if (destination === 0) {
            playersOut.add(playerId);
        }
    });

    const outsThisPlay = playersOut.size;

    if (requiredOuts && outsThisPlay !== requiredOuts) {
        alert(`Debe seleccionar exactamente ${requiredOuts} jugador(es) out para esta jugada.`);
        return;
    }

    const totalOutsAfterPlay = initialOuts + outsThisPlay;

    if (totalOutsAfterPlay > 3) {
      alert(`No se pueden registrar más de 3 outs en una entrada (calculado: ${totalOutsAfterPlay}).`);
      return;
    }
    
    // Check for collisions on bases
    const occupiedBases: { [key: number]: string } = {}; // Stores lineupPlayerId
    if (finalBatterAdvancement >= 1 && finalBatterAdvancement <= 3) {
        const batterInfo = runnersOnBase.find(r => r.lineupPlayerId === batter.id) || batter;
        occupiedBases[finalBatterAdvancement] = batterInfo.nombreJugador;
    }
    for (const runnerId in finalRunnerAdvancements) {
        const destBase = finalRunnerAdvancements[runnerId];
        if (destBase >= 1 && destBase <= 3) { // Bases 1B, 2B, 3B
            if (occupiedBases[destBase]) {
                const runner = runnersOnBase.find(r => r.lineupPlayerId === runnerId);
                alert(`Error: ${runner?.nombreJugador || 'Un corredor'} y ${occupiedBases[destBase]} no pueden ocupar la misma base (${getBaseLabel(destBase)}).`);
                return; 
            }
            const runner = runnersOnBase.find(r => r.lineupPlayerId === runnerId);
            occupiedBases[destBase] = runner?.nombreJugador || 'Un corredor';
        }
    }


    const result: FielderChoiceResult = {
      primaryOutPlayerId: selectedPrimaryOutPlayerId,
      batterAdvancement: finalBatterAdvancement,
      runnerAdvancements: finalRunnerAdvancements,
    };
    onConfirm(result, jugada);
  };
  
  const allPlayersForOutDropdown = [
    { value: 'NONE', label: 'Ningún Jugador Out (Todos Safe)' },
    { value: batter.id, label: `${batter.nombreJugador} (Bateador)`},
    ...runnersOnBase.map(runner => ({
      value: runner.lineupPlayerId,
      label: `${runner.nombreJugador} (en ${runner.currentBase}B)`,
    })),
  ];

  const modalTitle = `Resultado de ${jugada.descripcion} para ${batter.nombreJugador}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      size="lg"
      contentClassName="max-h-[80vh] overflow-y-auto"
    >
      <div className="space-y-4 p-1">
        <Select
          label="¿Quién fue puesto OUT principalmente?"
          options={allPlayersForOutDropdown.map(opt => ({...opt, value: opt.value || 'NONE'}))}
          value={selectedPrimaryOutPlayerId || 'NONE'}
          onChange={(e) => handlePrimaryOutSelected(e.target.value === 'NONE' ? null : e.target.value)}
        />
        <hr className="my-3"/>

        {/* Batter Advancement */}
        <div className={`p-3 border rounded-md shadow-sm ${selectedPrimaryOutPlayerId === batter.id || batterAdvancement === 0 ? 'bg-red-100 border-red-300' : 'bg-gray-50'}`}>
          <p className="font-medium text-gray-800">Bateador: {batter.nombreJugador}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {[1, 2, 3, 4, 0].map(baseNum => (
              <Button
                key={`batter-${baseNum}`}
                onClick={() => handleBatterAdvancementChange(baseNum)}
                variant={batterAdvancement === baseNum ? (baseNum === 0 ? 'danger' : 'primary') : 'light'}
                size="sm"
                className="flex-grow min-w-[60px]"
                disabled={selectedPrimaryOutPlayerId === batter.id && baseNum !== 0} // If selected as out in dropdown, only OUT button active here
              >
                {getBaseLabel(baseNum)}
              </Button>
            ))}
          </div>
        </div>

        {/* Runner Advancements */}
        {runnersOnBase.map(runner => {
            const isRunnerThePrimaryOut = selectedPrimaryOutPlayerId === runner.lineupPlayerId;
            const currentRunnerDest = runnerAdvancements[runner.lineupPlayerId];
            return (
                <div key={runner.lineupPlayerId} className={`p-3 border rounded-md shadow-sm ${isRunnerThePrimaryOut || currentRunnerDest === 0 ? 'bg-red-100 border-red-300' : 'bg-gray-50'}`}>
                <p className="font-medium text-gray-800">
                    Corredor: {runner.nombreJugador} (en ${runner.currentBase}B originalmente)
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                    {[1, 2, 3, 4, 0].map(baseNum => (
                    <Button
                        key={`${runner.lineupPlayerId}-${baseNum}`}
                        onClick={() => handleRunnerAdvancementChange(runner.lineupPlayerId, baseNum)}
                        variant={currentRunnerDest === baseNum ? (baseNum === 0 ? 'danger' : 'primary') : 'light'}
                        size="sm"
                        className="flex-grow min-w-[60px]"
                        disabled={isRunnerThePrimaryOut && baseNum !== 0} // If selected as out in dropdown, only OUT button active here
                    >
                        {getBaseLabel(baseNum)}
                    </Button>
                    ))}
                </div>
                </div>
            );
        })}
        
        <div className="flex justify-end space-x-3 pt-3 sticky bottom-0 bg-white py-3 border-t border-gray-200 -mx-1 px-1">
          <Button onClick={onClose} variant="light">
            Cancelar
          </Button>
          <Button onClick={handleConfirmClick} variant="primary">
            Confirmar Resultado
          </Button>
        </div>
      </div>
    </Modal>
  );
};