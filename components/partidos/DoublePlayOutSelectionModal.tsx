import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { PlayerInfoForOutSelection, DoublePlayResult } from '../../types';

const getBaseLabel = (baseNum: number): string => {
    if (baseNum === 0) return 'OUT';
    if (baseNum === 1) return '1B';
    if (baseNum === 2) return '2B';
    if (baseNum === 3) return '3B';
    if (baseNum === 4) return 'HOME';
    return 'N/A';
};

interface DoublePlayOutSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (result: DoublePlayResult) => void;
  playersInvolved: PlayerInfoForOutSelection[];
  teamName: string;
  initialOuts: number;
}

const DoublePlayOutSelectionModal: React.FC<DoublePlayOutSelectionModalProps> = ({
  isOpen, onClose, onConfirm, playersInvolved, teamName, initialOuts
}) => {
  const [selectedOutPlayerIds, setSelectedOutPlayerIds] = useState<Set<string>>(new Set());
  const [advancements, setAdvancements] = useState<{ [key: string]: number }>({});
  
  const batter = useMemo(() => playersInvolved.find(p => !p.isOnBase), [playersInvolved]);
  const runners = useMemo(() => playersInvolved.filter(p => p.isOnBase), [playersInvolved]);
  const nonOutPlayers = useMemo(() => playersInvolved.filter(p => !selectedOutPlayerIds.has(p.id)), [playersInvolved, selectedOutPlayerIds]);

  const showAdvancements = initialOuts < 1;

  useEffect(() => {
    if (isOpen) {
      setSelectedOutPlayerIds(new Set());
      setAdvancements({});
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedOutPlayerIds.size === 2 && batter) {
      const newAdvancements: { [key: string]: number } = {};
      const batterIsOut = selectedOutPlayerIds.has(batter.id);
      
      newAdvancements[batter.id] = batterIsOut ? 0 : 1;

      const nonOutRunners = runners.filter(r => !selectedOutPlayerIds.has(r.id));
      const occupiedByNonOuts: { [key: number]: boolean } = {};
      if (!batterIsOut) occupiedByNonOuts[1] = true;

      runners.forEach(runner => {
        if (selectedOutPlayerIds.has(runner.id)) {
          newAdvancements[runner.id] = 0;
        } else {
          let targetBase: number = runner.baseNumber!;
          if (!batterIsOut) {
              if (runner.baseNumber === 1) targetBase = 2; // Forced from 1st
              if (runner.baseNumber === 2 && nonOutRunners.some(r => r.baseNumber === 1)) targetBase = 3; // Forced from 2nd
              if (runner.baseNumber === 3 && nonOutRunners.some(r => r.baseNumber === 1) && nonOutRunners.some(r=> r.baseNumber === 2)) targetBase = 4; // Forced from 3rd
          }
          newAdvancements[runner.id] = targetBase;
        }
      });
      setAdvancements(newAdvancements);
    } else {
      setAdvancements({});
    }
  }, [selectedOutPlayerIds, playersInvolved, batter, runners]);

  const handleTogglePlayerSelection = (playerId: string) => {
    setSelectedOutPlayerIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(playerId)) {
        newSet.delete(playerId);
      } else {
        if (newSet.size < 2) {
          newSet.add(playerId);
        } else {
          alert("Solo puede seleccionar 2 jugadores para el doble play.");
        }
      }
      return newSet;
    });
  };

  const handleAdvancementChange = (playerId: string, targetBase: number) => {
    setAdvancements(prev => ({ ...prev, [playerId]: targetBase }));
  };

  const handleConfirmClick = () => {
    if (selectedOutPlayerIds.size !== 2) {
      alert("Debe seleccionar exactamente 2 jugadores out.");
      return;
    }
    
    if (showAdvancements) {
        const occupiedBasesCheck: { [key: number]: string } = {};
        for (const player of nonOutPlayers) {
          const destBase = advancements[player.id];
          if (destBase >= 1 && destBase <= 3) {
            if (occupiedBasesCheck[destBase]) {
                alert(`Error: ${player.name} y ${occupiedBasesCheck[destBase]} no pueden ocupar la misma base (${getBaseLabel(destBase)}).`);
                return; 
            }
            occupiedBasesCheck[destBase] = player.name;
          }
        }
    }


    const batterAdvancement = batter ? advancements[batter.id] : 0;

    const result: DoublePlayResult = {
      outedPlayerIds: Array.from(selectedOutPlayerIds) as [string, string],
      batterAdvancement: batterAdvancement,
      runnerAdvancements: runners.reduce((acc, r) => {
        acc[r.id] = advancements[r.id];
        return acc;
      }, {} as { [key: string]: number; })
    };
    onConfirm(result);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Resultado del Doble Play (${teamName})`}
      size="lg"
      contentClassName="max-h-[80vh] overflow-y-auto"
    >
      <div className="space-y-4">
        <div>
            <h3 className="text-md font-semibold text-gray-800 mb-2">Paso 1: Seleccionar Jugadores Out ({selectedOutPlayerIds.size}/2)</h3>
            <div className="space-y-2 border border-gray-200 rounded-md p-2">
            {playersInvolved.map(player => (
                <label key={player.id} className={`p-2 border rounded flex items-center transition-colors ${selectedOutPlayerIds.has(player.id) ? 'bg-red-100 border-red-400' : 'hover:bg-gray-50 cursor-pointer'}`}>
                    <input type="checkbox" checked={selectedOutPlayerIds.has(player.id)} onChange={() => handleTogglePlayerSelection(player.id)} className="mr-2 h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500"/>
                    <span className="flex-grow">{player.name} {player.isOnBase ? `(Corredor en ${player.baseNumber}B)` : '(Bateador)'}</span>
                </label>
            ))}
            </div>
        </div>

        {selectedOutPlayerIds.size === 2 && nonOutPlayers.length > 0 && showAdvancements && (
          <div className="pt-2">
            <h3 className="text-md font-semibold text-gray-800 mb-2">Paso 2: Definir Avances de Jugadores a Salvo</h3>
            <div className="space-y-3">
              {nonOutPlayers.map(player => (
                <div key={player.id} className="p-3 border rounded-md shadow-sm bg-green-50">
                  <p className="font-medium text-green-800">
                    {player.name} {player.isOnBase ? `(Originalmente en ${player.baseNumber}B)` : '(Bateador)'}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                     {[1, 2, 3, 4].map(baseNum => ( // solo opciones de avance
                        <Button
                            key={baseNum}
                            onClick={() => handleAdvancementChange(player.id, baseNum)}
                            variant={advancements[player.id] === baseNum ? 'primary' : 'light'}
                            size="sm"
                            className="flex-grow min-w-[60px]"
                        >
                            {getBaseLabel(baseNum)}
                        </Button>
                     ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-3 pt-3">
          <Button onClick={onClose} variant="light">Cancelar</Button>
          <Button onClick={handleConfirmClick} variant="primary" disabled={selectedOutPlayerIds.size !== 2}>
            Confirmar Doble Play
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default DoublePlayOutSelectionModal;