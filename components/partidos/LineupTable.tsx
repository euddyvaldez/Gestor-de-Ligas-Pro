import React, { DragEvent, TouchEvent, RefObject } from 'react';
import { usePartido } from '../../context/PartidoContext';
import { LineupPlayer, EMPTY_POSICION_PLACEHOLDER, EMPTY_POSICION_LABEL } from '../../types';
import Button from '../ui/Button';
import IconButton, { EditIcon, DeleteIcon, DragHandleIcon } from '../ui/IconButton';

interface LineupTableProps {
    lineup: LineupPlayer[];
    teamType: 'visitante' | 'local';
    inningToShow: number;
    draggingPlayerId: string | null;
    dragOverPlayerId: string | null;
    handleDragStart: (e: DragEvent<HTMLTableRowElement>, playerId: string) => void;
    handleDragOver: (e: DragEvent<HTMLTableRowElement>) => void;
    handleDragLeave: () => void;
    handleDrop: (e: DragEvent<HTMLTableRowElement>, team: 'visitante' | 'local') => void;
    handleTouchStart: (e: TouchEvent<HTMLTableRowElement>, playerId: string) => void;
    handleTouchEnd: (team: 'visitante' | 'local') => void;
    lineupTableBodyRef: RefObject<HTMLTableSectionElement>;
}

const LineupTable: React.FC<LineupTableProps> = ({ 
    lineup, 
    teamType, 
    inningToShow,
    draggingPlayerId,
    dragOverPlayerId,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleTouchStart,
    handleTouchEnd,
    lineupTableBodyRef
}) => {
    const { 
        currentPartido, 
        gamePhase, 
        openPlayModal, 
        setEditingPlayerForPosition, 
        setIsEditPlayerPositionModalOpen, 
        handleRequestRemovePlayerFromLineup,
    } = usePartido();
    
    if (!currentPartido) return null;
    const { gameStatus } = currentPartido;

    const handleOpenEditPlayerPositionModal = (player: LineupPlayer, team: 'visitante'|'local') => {
        if (gamePhase === 'ended') return;
        setEditingPlayerForPosition({ player, team });
        setIsEditPlayerPositionModalOpen(true);
    };

    return (
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
                <tr>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">#</th>
                    <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">Mover</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jugador</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Pos.</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actuación Inning {inningToShow}</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
            </thead>
            <tbody ref={lineupTableBodyRef} className="bg-white divide-y divide-gray-200">
                {lineup.map((player) => {
                    const isPlayerTeamAtBat = (gameStatus.currentHalfInning === 'Top' && teamType === 'visitante') || (gameStatus.currentHalfInning === 'Bottom' && teamType === 'local');
                    const canAnotar = (isPlayerTeamAtBat && player.posicion !== 'BE' && player.posicion !== EMPTY_POSICION_PLACEHOLDER);
                    const playsInSelectedInning = player.innings[inningToShow] || [];
                    const isCurrentBatter = currentPartido.gameStatus.currentBatterLineupPlayerId === player.id && player.posicion !== 'BE' && player.posicion !== EMPTY_POSICION_PLACEHOLDER;
                    const isDraggable = player.posicion !== 'BE' && player.posicion !== EMPTY_POSICION_PLACEHOLDER;

                    return (
                        <tr 
                            key={player.id} 
                            data-player-id={player.id}
                            draggable={isDraggable && gamePhase !== 'ended'}
                            onDragStart={(e) => isDraggable && gamePhase !== 'ended' && handleDragStart(e, player.id)}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => isDraggable && gamePhase !== 'ended' && handleDrop(e, teamType)}
                            onTouchStart={(e) => isDraggable && gamePhase !== 'ended' && handleTouchStart(e, player.id)}
                            onTouchEnd={() => isDraggable && gamePhase !== 'ended' && handleTouchEnd(teamType)}
                            className={`
                                ${!isDraggable ? 'bg-gray-100 opacity-70' : ''}
                                ${isCurrentBatter ? 'border-l-4 border-blue-500 bg-blue-50' : ''}
                                ${draggingPlayerId === player.id ? 'opacity-30 bg-blue-100' : ''}
                                ${dragOverPlayerId === player.id && draggingPlayerId !== player.id ? 'border-2 border-blue-500' : ''}
                            `}
                            aria-grabbed={draggingPlayerId === player.id}
                        >
                            <td className="px-2 py-2 whitespace-nowrap text-sm">{player.ordenBate}</td>
                            <td className="px-2 py-2 whitespace-nowrap text-center">
                                {isDraggable && gamePhase !== 'ended' && (
                                    <div className="cursor-grab text-gray-400 hover:text-gray-600 w-full flex justify-center">
                                        <DragHandleIcon />
                                    </div>
                                )}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{player.nombreJugador}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-sm">
                                <div className="flex items-center">
                                    <span>{player.posicion || EMPTY_POSICION_LABEL}</span>
                                    <IconButton
                                        icon={<EditIcon className="w-4 h-4" />}
                                        onClick={() => handleOpenEditPlayerPositionModal(player, teamType)}
                                        disabled={gamePhase === 'ended'}
                                        className="ml-2 p-1 text-xs text-blue-600 hover:text-blue-800"
                                        label={`Cambiar posición de ${player.nombreJugador}`}
                                    />
                                </div>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">
                                {playsInSelectedInning.length > 0
                                    ? playsInSelectedInning.map(p => p.playDisplayValue).join(', ')
                                    : '-'}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-sm space-x-1 flex items-center">
                                <Button size="sm" variant="light" onClick={() => openPlayModal(player, false)} disabled={gamePhase === 'ended' || !canAnotar} className="py-1 px-2 text-xs">Anotar</Button>
                                <IconButton
                                    icon={<DeleteIcon className="w-4 h-4" />}
                                    onClick={() => handleRequestRemovePlayerFromLineup(player, teamType)}
                                    label={`Quitar a ${player.nombreJugador} del lineup`}
                                    className="text-red-500 hover:text-red-700 p-1"
                                    disabled={gamePhase === 'ended'}
                                />
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};

export default LineupTable;