
import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Select from '../ui/Select';
import { LineupPlayer, RunnerAdvancementInfo, FielderChoiceResult } from '../../types';

interface FielderChoiceOutcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  batter: LineupPlayer;
  runnersOnBase: RunnerAdvancementInfo[];
  initialOuts: number;
  onConfirm: (result: FielderChoiceResult) => void;
}

const getBaseLabel = (baseNum: number): string => {
  if (baseNum === 0) return 'OUT';
  if (baseNum === 1) return '1B';
  if (baseNum === 2) return '2B';
  if (baseNum === 3) return '3B';
  if (baseNum === 4) return 'HOME';
  return 'N/A';
};

const FielderChoiceOutcomeModal: React.FC<FielderChoiceOutcomeModalProps> = ({
  isOpen,
  onClose,
  batter,
  runnersOnBase,
  initialOuts,
  onConfirm,
}) => {
  const [selectedPrimaryOutPlayerId, setSelectedPrimaryOutPlayerId] = useState<string | null>(null);
  const [batterAdvancement, setBatterAdvancement] = useState<number>(1); // Batter typically reaches 1B
  const [runnerAdvancements, setRunnerAdvancements] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    if (isOpen) {
      // Reset states
      setSelectedPrimaryOutPlayerId(null);
      setBatterAdvancement(1); // Batter defaults to 1B

      const initialRunnerAdvancements: { [key: string]: number } = {};
      runnersOnBase.forEach(runner => {
        // Default runners to hold or advance one base if forced by batter to 1B.
        // This is a simple prefill; complex scenarios might need manual adjustment.
        let prefilledTarget: number = runner.currentBase; // Explicitly type as number
        if (runner.currentBase === 1 && batterAdvancement === 1) { // Batter to 1B, runner on 1B forced
          prefilledTarget = 2;
        } else if (runner.currentBase === 2 && batterAdvancement === 1 && runnersOnBase.some(r => r.currentBase === 1)) { // Batter to 1B, runner on 1B, runner on 2B forced
           prefilledTarget = 3;
        } else if (runner.currentBase === 3 && batterAdvancement === 1 && runnersOnBase.some(r => r.currentBase === 1) && runnersOnBase.some(r => r.currentBase === 2)) { // Bases loaded
            prefilledTarget = 4; // Scores
        }
        initialRunnerAdvancements[runner.lineupPlayerId] = prefilledTarget; // Line 54
      });
      setRunnerAdvancements(initialRunnerAdvancements);
    }
  }, [isOpen, batter, runnersOnBase, batterAdvancement]); // Rerun if batterAdvancement changes to re-evaluate forced moves

  const handlePrimaryOutSelected = (playerId: string | null) => {
    setSelectedPrimaryOutPlayerId(playerId);
    // If a runner is selected as out, their advancement buttons might be hidden or disabled.
    // If batter is selected as out, their advancement is set to 0.
    if (playerId === batter.id) {
        setBatterAdvancement(0); // Batter is out
    } else if (playerId !== null) { // A runner is selected as out
        setRunnerAdvancements(prev => ({...prev, [playerId]: 0}));
    } else { // "Ninguno out" selected
        // Re-evaluate batter advancement if they were previously marked out
        if (batterAdvancement === 0 && selectedPrimaryOutPlayerId === batter.id) {
            setBatterAdvancement(1); // Back to 1B
        }
        // Re-evaluate runner advancements if one was previously marked out
        if (selectedPrimaryOutPlayerId && selectedPrimaryOutPlayerId !== batter.id) {
            const runnerPreviouslyOut = runnersOnBase.find(r => r.lineupPlayerId === selectedPrimaryOutPlayerId);
            if (runnerPreviouslyOut) {
                 setRunnerAdvancements(prev => ({...prev, [selectedPrimaryOutPlayerId!]: runnerPreviouslyOut.currentBase})); // Back to original base
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
    let outsCount = initialOuts;
    if (selectedPrimaryOutPlayerId) outsCount++;
    
    // Check for multiple outs from button selections
    if (batterAdvancement === 0 && selectedPrimaryOutPlayerId !== batter.id) outsCount++;
    Object.values(runnerAdvancements).forEach(adv => {
        if(adv === 0 && selectedPrimaryOutPlayerId !== Object.keys(runnerAdvancements).find(key => runnerAdvancements[key] === adv) ) outsCount++;
    });


    if (outsCount > 3) {
      alert("No se pueden registrar más de 3 outs en una entrada.");
      return;
    }

    const finalRunnerAdvancements = { ...runnerAdvancements };
    if (selectedPrimaryOutPlayerId && selectedPrimaryOutPlayerId !== batter.id) {
      finalRunnerAdvancements[selectedPrimaryOutPlayerId] = 0; // Ensure primary out runner is marked as out
    }
    
    const result: FielderChoiceResult = {
      primaryOutPlayerId: selectedPrimaryOutPlayerId,
      batterAdvancement: selectedPrimaryOutPlayerId === batter.id ? 0 : batterAdvancement,
      runnerAdvancements: finalRunnerAdvancements,
    };
    onConfirm(result);
  };
  
  const allPlayersForOutDropdown = [
    { value: 'NONE', label: 'Ningún Corredor Out (Todos Safe)' },
    { value: batter.id, label: `${batter.nombreJugador} (Bateador)`},
    ...runnersOnBase.map(runner => ({
      value: runner.lineupPlayerId,
      label: `${runner.nombreJugador} (en ${runner.currentBase}B)`,
    })),
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Resultado de Fielder's Choice para ${batter.nombreJugador}`}
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
        <div className={`p-3 border rounded-md shadow-sm ${selectedPrimaryOutPlayerId === batter.id ? 'bg-red-100 border-red-300' : 'bg-gray-50'}`}>
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
                <div key={runner.lineupPlayerId} className={`p-3 border rounded-md shadow-sm ${isRunnerThePrimaryOut ? 'bg-red-100 border-red-300' : 'bg-gray-50'}`}>
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
            Confirmar Resultado FC
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default FielderChoiceOutcomeModal;
