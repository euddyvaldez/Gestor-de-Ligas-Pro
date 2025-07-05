
import React, { useState, useMemo } from 'react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { Jugador, LineupPlayer } from '../../types';

interface AddPlayerToLineupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (jugadorId: number) => void;
  teamName: string;
  allPlayersDB: Jugador[];
  lineupVisitante: LineupPlayer[];
  lineupLocal: LineupPlayer[];
}

const AddPlayerToLineupModal: React.FC<AddPlayerToLineupModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  teamName,
  allPlayersDB,
  lineupVisitante,
  lineupLocal
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const availablePlayers = useMemo(() => {
    const allLineupPlayerIds = new Set([
        ...lineupVisitante.map(p => p.jugadorId),
        ...lineupLocal.map(p => p.jugadorId)
    ]);

    let players = allPlayersDB.filter(p => !allLineupPlayerIds.has(p.codigo));

    if (searchTerm.trim()) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      players = players.filter(player =>
        player.nombre.toLowerCase().includes(lowerSearchTerm) ||
        (player.alias && player.alias.toLowerCase().includes(lowerSearchTerm))
      );
    }
    
    return players.sort((a,b) => a.nombre.localeCompare(b.nombre));

  }, [allPlayersDB, lineupVisitante, lineupLocal, searchTerm]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Agregar Jugador a ${teamName}`}
      size="lg"
      contentClassName="p-0 flex flex-col h-[70vh]"
    >
      <div className="p-4 border-b border-gray-200 flex-shrink-0">
        <Input
          type="text"
          placeholder="Buscar jugador disponible..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full"
        />
      </div>

      <div className="flex-grow overflow-y-auto p-4 space-y-2">
        {availablePlayers.length > 0 ? (
          availablePlayers.map(player => (
            <div key={player.codigo} className="flex items-center justify-between p-2 border rounded-md bg-white hover:bg-gray-50">
              <div>
                <span className="font-medium text-gray-800">{player.nombre}</span>
                <span className="text-xs text-gray-500 block">
                    #{player.numero || 'S/N'} - {player.posicionPreferida || 'N/P'}
                    {player.alias && ` (${player.alias})`}
                </span>
              </div>
              <Button onClick={() => onConfirm(player.codigo)} variant="success" size="sm">
                Agregar
              </Button>
            </div>
          ))
        ) : (
          <p className="text-gray-500 text-center py-4">
            No hay más jugadores disponibles en la base de datos.
          </p>
        )}
      </div>

      <div className="p-4 border-t border-gray-200 flex-shrink-0 flex justify-end">
        <Button onClick={onClose} variant="light">
          Cerrar
        </Button>
      </div>
    </Modal>
  );
};

export default AddPlayerToLineupModal;
