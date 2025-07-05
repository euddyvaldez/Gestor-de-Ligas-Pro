import React from 'react';
import { usePartido } from '../../context/PartidoContext';
import Button from '../ui/Button';
import { MdOutlineLeaderboard, MdUndo, MdOutlineFileDownload } from 'react-icons/md';

const AccionesPartido: React.FC = () => {
    const { 
        currentPartido,
        partidoHistoryStack,
        gamePhase,
        handleSaveGame,
        handleUndoLastAnnotation,
        setIsBoxScoreModalOpen,
        setConfirmActionModalProps,
        setIsConfirmActionModalOpen,
        navigate,
        setPartidoEnCurso,
        handleExportGameLogCSV,
        handleResetGame
    } = usePartido();

    const requestEndGame = () => {
        setConfirmActionModalProps({
            title: 'Terminar Partido',
            message: '¿Está seguro de que desea terminar el partido? El juego se guardará en el historial.',
            onConfirm: () => {
                handleSaveGame();
                setPartidoEnCurso(null);
                navigate('/configurar-partido');
                setIsConfirmActionModalOpen(false);
            },
            confirmButtonVariant: 'danger',
            confirmButtonText: 'Terminar Partido'
        });
        setIsConfirmActionModalOpen(true);
    };

    const requestResetPartido = () => {
        setConfirmActionModalProps({
            title: 'Reiniciar Partido',
            message: '¿Está seguro de que desea reiniciar el partido? Se borrarán todas las jugadas y estadísticas, pero se mantendrá la configuración y los lineups.',
            onConfirm: () => {
                handleResetGame();
                setIsConfirmActionModalOpen(false);
            },
            confirmButtonVariant: 'warning',
            confirmButtonText: 'Reiniciar'
        });
        setIsConfirmActionModalOpen(true);
    };

    const requestExportGameLogCSV = () => {
        setConfirmActionModalProps({
            title: 'Exportar Partido (CSV)',
            message: '¿Está seguro de que desea exportar el registro completo de este partido como un archivo CSV?',
            onConfirm: () => {
                handleExportGameLogCSV();
                setIsConfirmActionModalOpen(false);
            },
            confirmButtonVariant: 'primary',
            confirmButtonText: 'Exportar'
        });
        setIsConfirmActionModalOpen(true);
    };

    return (
        <>
            <div className="bg-white p-4 shadow rounded-lg flex flex-wrap gap-2 justify-center">
                <Button onClick={() => setIsBoxScoreModalOpen(true)} variant="secondary" size="sm" className="px-3 py-1 flex items-center" disabled={!currentPartido}>
                    <MdOutlineLeaderboard className="mr-1 h-4 w-4" /> Box Score
                </Button>
                <Button onClick={handleUndoLastAnnotation} variant="warning" size="sm" className="px-3 py-1 flex items-center" disabled={partidoHistoryStack.length === 0 || gamePhase === 'ended'}>
                    <MdUndo className="mr-1 h-4 w-4" /> Retroceder Anotación
                </Button>
            </div>
             <div className="bg-white p-4 shadow rounded-lg mt-6 flex flex-wrap gap-2 justify-center">
                <Button onClick={handleSaveGame} variant="primary">Guardar Progreso</Button>
                <Button onClick={requestExportGameLogCSV} variant="secondary" disabled={!currentPartido || !currentPartido.registrosJuego || currentPartido.registrosJuego.length === 0}>Exportar Partido CSV</Button>
                <Button onClick={requestResetPartido} variant="warning" disabled={gamePhase === 'ended'}>Reiniciar Partido</Button>
                <Button onClick={requestEndGame} variant="danger">Terminar Partido</Button>
                <Button onClick={() => navigate('/historial')} variant="secondary">Ver Historial</Button>
            </div>
        </>
    );
};

export default AccionesPartido;