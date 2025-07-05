
import React, { useState } from 'react';
import { usePartido } from '../../context/PartidoContext';
import LineupTable from './LineupTable';
import IconButton from '../ui/IconButton';
import { MdNavigateBefore, MdNavigateNext } from 'react-icons/md';
import Button from '../ui/Button';
import { IoPersonAdd } from 'react-icons/io5';

type ActiveLineupTab = 'visitante' | 'local';

const LineupManager: React.FC = () => {
    const { currentPartido, handleRequestAddPlayerToLineup, gamePhase } = usePartido();
    const [activeLineupTab, setActiveLineupTab] = useState<ActiveLineupTab>('visitante');
    const [inningToShowInLineups, setInningToShowInLineups] = useState(1);

    React.useEffect(() => {
        if(currentPartido) {
            setActiveLineupTab(currentPartido.gameStatus.currentHalfInning === 'Top' ? 'visitante' : 'local');
            setInningToShowInLineups(currentPartido.gameStatus.actualInningNumber);
        }
    }, [currentPartido?.gameStatus.currentHalfInning, currentPartido?.gameStatus.actualInningNumber]);


    if (!currentPartido) return null;

    const { nombreEquipoVisitante, nombreEquipoLocal, lineupVisitante, lineupLocal } = currentPartido;

    const handlePreviousInningLineup = () => {
        setInningToShowInLineups(prev => Math.max(1, prev - 1));
    };
    const handleNextInningLineup = () => {
        if (currentPartido) {
            setInningToShowInLineups(prev => Math.min(currentPartido.gameStatus.actualInningNumber, prev + 1));
        }
    };

    const lineupToDisplay = activeLineupTab === 'visitante' ? lineupVisitante : lineupLocal;

    return (
        <div className="bg-white shadow rounded-lg">
            <div className="p-4 border-b border-gray-200">
                <div className="flex justify-between items-center mb-3">
                    <div className="flex justify-center items-center space-x-4">
                        <IconButton
                            icon={<MdNavigateBefore size={24} />}
                            onClick={handlePreviousInningLineup}
                            disabled={inningToShowInLineups <= 1}
                            label="Inning Anterior en Lineup"
                            className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50"
                        />
                        <span className="text-md font-medium text-gray-700">Mostrando Actuación del Inning: {inningToShowInLineups}</span>
                        <IconButton
                            icon={<MdNavigateNext size={24} />}
                            onClick={handleNextInningLineup}
                            disabled={inningToShowInLineups >= currentPartido.gameStatus.actualInningNumber}
                            label="Siguiente Inning en Lineup"
                            className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50"
                        />
                    </div>
                    <Button 
                        onClick={() => handleRequestAddPlayerToLineup(activeLineupTab)} 
                        variant="success" 
                        size="sm"
                        disabled={gamePhase === 'ended'}
                    >
                        <IoPersonAdd className="inline mr-2 h-4 w-4" />
                        Agregar Jugador
                    </Button>
                </div>
                <nav className="-mb-px flex space-x-8 justify-center" aria-label="Tabs">
                    <button onClick={() => setActiveLineupTab('visitante')} className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${activeLineupTab === 'visitante' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                        Lineup Visitante: {nombreEquipoVisitante}
                    </button>
                    <button onClick={() => setActiveLineupTab('local')} className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${activeLineupTab === 'local' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                        Lineup Local: {nombreEquipoLocal}
                    </button>
                </nav>
            </div>
            <div className="p-0 sm:p-4 overflow-x-auto">
                <LineupTable
                    lineup={lineupToDisplay}
                    teamType={activeLineupTab}
                    inningToShow={inningToShowInLineups}
                />
            </div>
        </div>
    );
};

export default LineupManager;