import React from 'react';
import { usePartido } from '../../context/PartidoContext';
import { BaseballDiamondSVG } from '../ui/BaseballDiamondSVG';
import Button from '../ui/Button';
import { SaveIcon } from '../ui/IconButton';
import { EMPTY_POSICION_PLACEHOLDER } from '../../types';

const EstadoJuego: React.FC = () => {
    const { currentPartido, gamePhase, currentBatterDisplay, openPlayModal, handleBaseClick } = usePartido();

    if (!currentPartido) return null;

    const { gameStatus } = currentPartido;
    const disabled = gamePhase === 'ended';

    return (
        <div className="bg-white p-4 shadow rounded-lg">
            <h2 className="text-xl font-semibold mb-2 text-center">Estado del Juego</h2>
            <div className="grid grid-cols-2 gap-4 text-center items-center mb-2">
                <div>
                    <p className="text-sm text-gray-500">Inning</p>
                    <p className="text-2xl font-bold">{gameStatus.actualInningNumber} ({gameStatus.currentHalfInning === 'Top' ? '⬆️' : '⬇️'})</p>
                </div>
                <div>
                    <p className="text-sm text-gray-500">Outs</p>
                    <p className="text-2xl font-bold">{gameStatus.outs}</p>
                </div>
            </div>
            <div className="flex flex-col items-center justify-center my-1">
                <BaseballDiamondSVG
                    bases={gameStatus.bases}
                    className="w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96"
                    onBaseClick={handleBaseClick}
                    disabled={disabled}
                />
            </div>
            <div className="my-2 space-y-1">
                {currentBatterDisplay ? (
                    <div className="flex items-center justify-center gap-x-2 p-2">
                        {gamePhase !== 'ended' && (
                            <Button onClick={() => openPlayModal(currentBatterDisplay, false)} variant="success" size="md" className="flex items-center flex-shrink-0 px-3 py-2" disabled={!currentBatterDisplay || currentBatterDisplay.posicion === 'BE' || currentBatterDisplay.posicion === EMPTY_POSICION_PLACEHOLDER}>
                                <SaveIcon className="h-4 w-4 mr-1" /> Anotar Jugada para {currentBatterDisplay.nombreJugador}
                            </Button>
                        )}
                    </div>
                ) : (
                    <p className="text-center text-gray-600 font-semibold p-2">Seleccione un bateador de la lista para anotar o cambie de entrada.</p>
                )}
            </div>
        </div>
    );
};

export default EstadoJuego;
