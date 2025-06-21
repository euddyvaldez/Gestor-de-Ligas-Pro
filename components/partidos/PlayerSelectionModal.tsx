
import React, { useState, useMemo, useEffect } from 'react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { Jugador } from '../../types';

interface PlayerSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedIds: Set<number>) => void;
  teamName: string;
  allPlayersDB: Jugador[];
  initialSelectedIds: Set<number>;
  opposingTeamSelectedIds: Set<number>;
  opposingTeamName: string;
}

const PlayerSelectionModal: React.FC<PlayerSelectionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  teamName,
  allPlayersDB,
  initialSelectedIds,
  opposingTeamSelectedIds,
  opposingTeamName
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentSelectedPlayerIds, setCurrentSelectedPlayerIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setCurrentSelectedPlayerIds(new Set(initialSelectedIds));
      setSearchTerm(''); 
    }
  }, [isOpen, initialSelectedIds]);

  const sortedAndFilteredPlayers = useMemo(() => {
    let players = [...allPlayersDB];

    if (searchTerm.trim()) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      players = players.filter(player =>
        player.nombre.toLowerCase().includes(lowerSearchTerm) ||
        player.numero.toLowerCase().includes(lowerSearchTerm) ||
        (player.alias && player.alias.toLowerCase().includes(lowerSearchTerm))
      );
    }

    const selectedForThisTeam = players.filter(p => currentSelectedPlayerIds.has(p.codigo));
    const opponentSelected = players.filter(p => opposingTeamSelectedIds.has(p.codigo) && !currentSelectedPlayerIds.has(p.codigo));
    const available = players.filter(p => !currentSelectedPlayerIds.has(p.codigo) && !opposingTeamSelectedIds.has(p.codigo));

    const sortFn = (a: Jugador, b: Jugador) => a.nombre.localeCompare(b.nombre);

    return [
      ...selectedForThisTeam.sort(sortFn),
      ...available.sort(sortFn),
      ...opponentSelected.sort(sortFn) 
    ];
  }, [allPlayersDB, searchTerm, currentSelectedPlayerIds, opposingTeamSelectedIds]);

  const handleTogglePlayer = (playerId: number) => {
    setCurrentSelectedPlayerIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(playerId)) {
        newSet.delete(playerId);
      } else {
        if (opposingTeamSelectedIds.has(playerId)) {
          // This should ideally not be reachable if checkbox is disabled
          alert(`El jugador ya está seleccionado para ${opposingTeamName}.`);
          return prev;
        }
        newSet.add(playerId);
      }
      return newSet;
    });
  };

  const handleConfirmClick = () => {
    onConfirm(currentSelectedPlayerIds);
    // onClose(); // Modal is usually closed by the parent component after onConfirm
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Seleccionar Jugadores para ${teamName}`}
      size="xl" 
      contentClassName="p-0 flex flex-col h-[85vh]" // Use p-0 to manage padding internally for fixed elements
    >
      {/* Header section - Search Input */}
      <div className="p-4 border-b border-gray-200 flex-shrink-0">
        <Input
          type="text"
          placeholder="Buscar jugador por nombre, número o alias..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full"
        />
      </div>

      {/* Body section - Player List (Scrollable) */}
      <div className="flex-grow overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {sortedAndFilteredPlayers.length > 0 ? (
          sortedAndFilteredPlayers.map(player => {
            const isSelectedByOpponent = opposingTeamSelectedIds.has(player.codigo);
            const isChecked = currentSelectedPlayerIds.has(player.codigo);
            // Player is disabled if selected by opponent AND not already selected by current team
            const isDisabled = isSelectedByOpponent && !isChecked;


            return (
              <label
                key={player.codigo}
                className={`p-3 border rounded-md flex items-center transition-colors
                  ${isDisabled ? 'bg-gray-200 opacity-60 cursor-not-allowed' 
                              : isChecked ? 'bg-blue-100 border-blue-400 shadow-sm' 
                                          : 'bg-white hover:bg-gray-50 cursor-pointer'}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => handleTogglePlayer(player.codigo)}
                  disabled={isDisabled}
                  className="mr-3 h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div className="flex-grow">
                  <span className="font-medium text-gray-800">{player.nombre}</span>
                  <span className="text-xs text-gray-500 block">
                    #{player.numero || 'S/N'} - {player.posicionPreferida || 'N/P'}
                    {player.alias && ` (${player.alias})`}
                  </span>
                  {isSelectedByOpponent && !isChecked && ( // Only show if not selected by current team
                    <span className="text-xs text-red-500 block">(En {opposingTeamName})</span>
                  )}
                </div>
              </label>
            );
          })
        ) : (
          <p className="text-gray-500 col-span-full text-center py-4">
            {allPlayersDB.length === 0 ? "No hay jugadores registrados en el sistema." : "No se encontraron jugadores con ese criterio."}
          </p>
        )}
      </div>

      {/* Footer section - Selected Count and Actions (Fixed) */}
      <div className="p-4 border-t border-gray-200 flex-shrink-0 flex justify-between items-center">
        <span className="text-sm text-gray-700">Seleccionados: {currentSelectedPlayerIds.size}</span>
        <div className="space-x-3">
          <Button onClick={onClose} variant="light">
            Cancelar
          </Button>
          <Button onClick={handleConfirmClick} variant="primary">
            Confirmar Selección
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default PlayerSelectionModal;
