import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { PARTIDO_EN_CURSO_KEY } from '../constants';
import useLocalStorage from '../hooks/useLocalStorage';
import { PartidoData, Jugada, PlayCategory, PlayerOnBase, LineupPlayer, RegistroJuego, EMPTY_POSICION_LABEL, ToastMessage } from '../types';

import { PartidoContext, usePartido } from '../context/PartidoContext';
import { usePartidoManager } from '../hooks/usePartidoManager';

import Marcador from '../components/partidos/Marcador';
import EstadoJuego from '../components/partidos/EstadoJuego';
import AccionesPartido from '../components/partidos/AccionesPartido';
import LineupManager from '../components/partidos/LineupManager';
import GameLog from '../components/partidos/GameLog';

import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import ConfirmationModal from '../components/ui/ConfirmationModal';
import AssignRbiModal from '../components/partidos/AssignRbiModal';
import ErrorAdvancementModal from '../components/partidos/ErrorAdvancementModal';
import RunnerAdvancementReasonModal from '../components/partidos/RunnerAdvancementReasonModal';
import RunnerAdvancementAfterHitModal from '../components/partidos/RunnerAdvancementAfterHitModal';
import RunnerAdvancementAfterSacrificeModal from '../components/partidos/RunnerAdvancementAfterSacrificeModal';
import RunnerOutSpecificReasonModal from '../components/partidos/RunnerOutSpecificReasonModal';
import RunnerAdvancementAfterErrorModal from '../components/partidos/RunnerAdvancementAfterErrorModal';
import { FielderChoiceOutcomeModal } from '../components/partidos/FielderChoiceOutcomeModal';
import PositionSelectionModal from '../components/partidos/PositionSelectionModal';
import Select from '../components/ui/Select';
import AddPlayerToLineupModal from '../components/partidos/AddPlayerToLineupModal';
import ToastContainer from '../components/ui/ToastContainer';
import DoublePlayOutSelectionModal from '../components/partidos/DoublePlayOutSelectionModal';
import TriplePlayOutSelectionModal from '../components/partidos/TriplePlayOutSelectionModal';

const AllTheModals: React.FC = () => {
    const manager = usePartido();
    const {
        currentPartido,
        isPlayModalOpen, setIsPlayModalOpen,
        isConfirmActionModalOpen, confirmActionModalProps, setIsConfirmActionModalOpen,
        isRunnerActionModalOpen, setIsRunnerActionModalOpen, managingRunner, handleRunnerAction,
        assignRbiModalState, setAssignRbiModalState, handleConfirmRbiAssignment,
        isBoxScoreModalOpen, setIsBoxScoreModalOpen, handleExportBoxScoreCSV,
        isErrorModalOpen, setIsErrorModalOpen, errorModalContext, handleErrorAdvancementConfirm, setErrorModalContext,
        isRunnerAdvancementReasonModalOpen, setIsRunnerAdvancementReasonModalOpen, runnerAdvancementContext, setRunnerAdvancementContext, handleRunnerAdvancementReasonConfirm,
        runnerAdvancementAfterHitModalState, setRunnerAdvancementAfterHitModalState, handleConfirmRunnerAdvancementsFromHitModal,
        runnerAdvancementAfterSacrificeModalState, setRunnerAdvancementAfterSacrificeModalState, handleConfirmRunnerAdvancementsFromSacrificeModal,
        isRunnerOutSpecificReasonModalOpen, setIsRunnerOutSpecificReasonModalOpen, handleRunnerOutSpecificReasonConfirm,
        runnerAdvancementAfterErrorModalState, setRunnerAdvancementAfterErrorModalState, handleConfirmRunnerAdvancementsFromErrorModal,
        isEditRegistroModalOpen, setIsEditRegistroModalOpen, editingRegistro, handleCloseEditRegistroModal, tempEditedPlayIdInModal, setTempEditedPlayIdInModal, handleSaveEditedRegistro,
        isPositionConflictModalOpen, setIsPositionConflictModalOpen, positionConflictDetails, handleResolvePositionConflict,
        isEditPlayerPositionModalOpen, setIsEditPlayerPositionModalOpen, editingPlayerForPosition, handleConfirmPlayerPositionChange,
        fielderChoiceModalState, setFielderChoiceModalState, handleComplexPlayConfirm,
        doublePlayModalState, setDoublePlayModalState,
        isTriplePlayModalOpen, setIsTriplePlayModalOpen,
        playersForComplexOutModal,
        handleDoublePlayConfirm, handleTriplePlayConfirm,
        getOriginalJugadaDescription,
        groupedPlays, playCategoryOrder, playCategoryColors,
        handlePlaySelected, currentPlayerForPlay, isFreeEditModeForModal,
        getBaseLabel,
        jugadasDB,
        isAddPlayerModalOpen, setIsAddPlayerModalOpen, teamToAddPlayerTo, handleConfirmAddPlayerToLineup, jugadoresDB,
        setConfirmActionModalProps
    } = manager;

    if (!currentPartido) return null;

    const BoxScoreContent = () => {
        if (!currentPartido) return null;
        
        const requestExportBoxScoreCSV = () => {
            setConfirmActionModalProps({
                title: 'Exportar Box Score (CSV)',
                message: '¿Está seguro de que desea exportar el box score de este partido como un archivo CSV?',
                onConfirm: () => {
                    handleExportBoxScoreCSV();
                    setIsConfirmActionModalOpen(false);
                },
                confirmButtonText: 'Exportar',
                confirmButtonVariant: 'success',
            });
            setIsConfirmActionModalOpen(true);
        };

        const { nombreEquipoVisitante, nombreEquipoLocal, visitanteStats, localStats, maxInnings, lineupVisitante, lineupLocal } = currentPartido;
        
        const battingHeaders = ['Jugador', 'Pos', 'AB', 'AP', 'R', 'H1', 'H2', 'H3', 'HR', 'RBI', 'BB', 'K'];

        const renderBattingTable = (teamName: string, lineup: LineupPlayer[]) => {
            const totals = lineup.reduce((acc, player) => {
                acc.atBats += player.stats.atBats;
                acc.plateAppearances += player.stats.plateAppearances;
                acc.runs += player.stats.runs;
                acc.singles += player.stats.singles;
                acc.doubles += player.stats.doubles;
                acc.triples += player.stats.triples;
                acc.homeRuns += player.stats.homeRuns;
                acc.rbi += player.stats.rbi;
                acc.walks += player.stats.walks;
                acc.strikeouts += player.stats.strikeouts;
                return acc;
            }, { atBats: 0, plateAppearances: 0, runs: 0, singles: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0, walks: 0, strikeouts: 0 });
            
            return (
                <div className="mt-4">
                    <h4 className="font-semibold text-lg mb-1">{teamName} - Bateo</h4>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-xs table-auto">
                            <thead className="bg-gray-100">
                                <tr>
                                    {battingHeaders.map(h => <th key={h} className="p-1 border">{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {lineup.map(player => (
                                    <tr key={player.id}>
                                        <td className="p-1 border text-left">{player.nombreJugador}</td>
                                        <td className="p-1 border">{player.posicion || EMPTY_POSICION_LABEL}</td>
                                        <td className="p-1 border">{player.stats.atBats}</td>
                                        <td className="p-1 border">{player.stats.plateAppearances}</td>
                                        <td className="p-1 border">{player.stats.runs}</td>
                                        <td className="p-1 border">{player.stats.singles}</td>
                                        <td className="p-1 border">{player.stats.doubles}</td>
                                        <td className="p-1 border">{player.stats.triples}</td>
                                        <td className="p-1 border">{player.stats.homeRuns}</td>
                                        <td className="p-1 border">{player.stats.rbi}</td>
                                        <td className="p-1 border">{player.stats.walks}</td>
                                        <td className="p-1 border">{player.stats.strikeouts}</td>
                                    </tr>
                                ))}
                                <tr className="font-bold bg-gray-50">
                                    <td className="p-1 border text-left" colSpan={2}>TOTALES</td>
                                    <td className="p-1 border">{totals.atBats}</td>
                                    <td className="p-1 border">{totals.plateAppearances}</td>
                                    <td className="p-1 border">{totals.runs}</td>
                                    <td className="p-1 border">{totals.singles}</td>
                                    <td className="p-1 border">{totals.doubles}</td>
                                    <td className="p-1 border">{totals.triples}</td>
                                    <td className="p-1 border">{totals.homeRuns}</td>
                                    <td className="p-1 border">{totals.rbi}</td>
                                    <td className="p-1 border">{totals.walks}</td>
                                    <td className="p-1 border">{totals.strikeouts}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        };

        return (
           <div className="text-center">
               <h3 className="text-2xl font-bold mb-3">{nombreEquipoVisitante} vs {nombreEquipoLocal}</h3>
               {/* Line Score */}
               <div className="overflow-x-auto">
                   <table className="min-w-full text-sm table-auto mb-4">
                       <thead className="bg-gray-100">
                           <tr>
                               <th className="p-2 border">Equipo</th>
                               {[...Array(maxInnings)].map((_, i) => <th key={i} className="p-2 border w-8">{i + 1}</th>)}
                               <th className="p-2 border w-10">R</th>
                               <th className="p-2 border w-10">H</th>
                               <th className="p-2 border w-10">E</th>
                           </tr>
                       </thead>
                       <tbody>
                           <tr>
                               <td className="p-2 border font-semibold text-left">{nombreEquipoVisitante}</td>
                               {[...Array(maxInnings)].map((_, i) => <td key={i} className="p-2 border">{visitanteStats.runsPerInning[i + 1] ?? 0}</td>)}
                               <td className="p-2 border font-bold">{visitanteStats.totalRuns}</td>
                               <td className="p-2 border">{visitanteStats.hits}</td>
                               <td className="p-2 border">{visitanteStats.errors}</td>
                           </tr>
                           <tr>
                               <td className="p-2 border font-semibold text-left">{nombreEquipoLocal}</td>
                               {[...Array(maxInnings)].map((_, i) => <td key={i} className="p-2 border">{localStats.runsPerInning[i + 1] ?? 0}</td>)}
                               <td className="p-2 border font-bold">{localStats.totalRuns}</td>
                               <td className="p-2 border">{localStats.hits}</td>
                               <td className="p-2 border">{localStats.errors}</td>
                           </tr>
                       </tbody>
                   </table>
               </div>
               
               {renderBattingTable(nombreEquipoVisitante, lineupVisitante)}
               {renderBattingTable(nombreEquipoLocal, lineupLocal)}
               
               <div className="mt-6 flex justify-between items-center">
                    <Button onClick={requestExportBoxScoreCSV} variant="success" size="sm">
                       Exportar Box Score (CSV)
                    </Button>
                    <Button onClick={() => setIsBoxScoreModalOpen(false)} variant="primary" size="sm">
                       Volver al Partido
                    </Button>
               </div>
           </div>
        );
    };

    return (
        <>
            {/* Box Score Modal */}
            <Modal isOpen={isBoxScoreModalOpen} onClose={() => setIsBoxScoreModalOpen(false)} title="Box Score" size="xl" contentClassName="max-h-[85vh] overflow-y-auto">
                <BoxScoreContent />
            </Modal>

            {/* Play Modal */}
            <Modal isOpen={isPlayModalOpen} onClose={() => setIsPlayModalOpen(false)} title={`Anotar Jugada para ${currentPlayerForPlay?.nombreJugador || 'Jugador'} ${isFreeEditModeForModal ? '(Modo Edición Libre)' : ''}`} size="xl">
                <div className="space-y-3 max-h-[70vh] overflow-y-auto">
                    {playCategoryOrder.map(category => (
                        groupedPlays[category] && groupedPlays[category].length > 0 && (
                            <div key={category}>
                                <h3 className="text-lg font-semibold my-2 text-gray-700 border-b pb-1">{category}</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                    {groupedPlays[category].map((jugada: Jugada) => (
                                        <Button key={jugada.jugada} variant={playCategoryColors[jugada.category] || "secondary"} onClick={() => handlePlaySelected(jugada)} className="w-full text-left p-2 h-auto text-sm leading-tight flex flex-col items-start">
                                            <span className="font-semibold">{jugada.jugada}</span>
                                            <span className="text-xs">{jugada.descripcion}</span>
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )
                    ))}
                </div>
            </Modal>
            
            {/* Confirmation Modal */}
            {isConfirmActionModalOpen && confirmActionModalProps && (
                <ConfirmationModal
                    isOpen={isConfirmActionModalOpen}
                    onClose={() => setIsConfirmActionModalOpen(false)}
                    title={confirmActionModalProps.title}
                    message={confirmActionModalProps.message}
                    onConfirm={confirmActionModalProps.onConfirm}
                    confirmButtonText={confirmActionModalProps.confirmButtonText}
                    confirmButtonVariant={confirmActionModalProps.confirmButtonVariant}
                />
            )}

            {/* Runner Action Modal */}
            {isRunnerActionModalOpen && managingRunner && currentPartido.gameStatus.bases && (() => {
                const bases = currentPartido.gameStatus.bases;
                const runnerBaseIndex = managingRunner.baseIndex; // 0=1B, 1=2B, 2=3B

                // A runner cannot jump over another runner in manual advancements.
                const showScoreButton = (runnerBaseIndex === 2) || (runnerBaseIndex === 1 && !bases[2]) || (runnerBaseIndex === 0 && !bases[1] && !bases[2]);
                const showAdvanceOneBaseButton = (runnerBaseIndex === 0 && !bases[1]) || (runnerBaseIndex === 1 && !bases[2]);
                const showAdvanceTwoBasesButton = runnerBaseIndex === 0 && !bases[1] && !bases[2];

                return (
                    <Modal isOpen={isRunnerActionModalOpen} onClose={() => setIsRunnerActionModalOpen(false)} title={`Acciones para ${managingRunner.player.nombreJugador} en ${getBaseLabel(runnerBaseIndex + 1)}`} size="sm">
                        <div className="space-y-2">
                            {showScoreButton && (
                                <Button onClick={() => handleRunnerAction('scoreWithSpecificReason')} variant="success" className="w-full">Anotar Carrera</Button>
                            )}
                            {showAdvanceOneBaseButton && (
                                <Button onClick={() => handleRunnerAction(runnerBaseIndex === 0 ? 'advanceTo2B' : 'advanceTo3BFrom2B')} variant="info" className="w-full">
                                    Avanzar a {getBaseLabel(runnerBaseIndex + 2)}
                                </Button>
                            )}
                            {showAdvanceTwoBasesButton && (
                                <Button onClick={() => handleRunnerAction('advanceTo3BFrom1B')} variant="info" className="w-full">
                                    Avanzar a 3B
                                </Button>
                            )}
                            <Button onClick={() => handleRunnerAction('outRunner')} variant="danger" className="w-full">Poner Out al Corredor</Button>
                        </div>
                    </Modal>
                );
            })()}
            
            {/* RBI Assignment Modal */}
            {assignRbiModalState.isOpen && assignRbiModalState.scoringPlayerInfo && (
                <AssignRbiModal
                    isOpen={assignRbiModalState.isOpen}
                    onClose={() => setAssignRbiModalState({ isOpen: false, scoringPlayerInfo: null, batterForRbiContext: null, previousBatterForRbiContext: null })}
                    onConfirm={handleConfirmRbiAssignment}
                    scoringPlayerInfo={assignRbiModalState.scoringPlayerInfo}
                    batterForRbiContext={assignRbiModalState.batterForRbiContext}
                    previousBatterForRbiContext={assignRbiModalState.previousBatterForRbiContext}
                />
            )}

            {/* Error Advancement Modal */}
            {errorModalContext && (
                <ErrorAdvancementModal
                    isOpen={isErrorModalOpen}
                    onClose={() => { setIsErrorModalOpen(false); setErrorModalContext(null); }}
                    onConfirm={handleErrorAdvancementConfirm}
                    batterName={errorModalContext.batterLineupPlayer.nombreJugador}
                    defensiveTeamLineup={currentPartido.gameStatus.currentHalfInning === 'Top' ? currentPartido.lineupLocal : currentPartido.lineupVisitante}
                    defensiveTeamName={currentPartido.gameStatus.currentHalfInning === 'Top' ? currentPartido.nombreEquipoLocal : currentPartido.nombreEquipoVisitante}
                />
            )}
            
            {/* Runner Advancement Modals */}
            {runnerAdvancementContext && (
                <RunnerAdvancementReasonModal
                    isOpen={isRunnerAdvancementReasonModalOpen}
                    onClose={() => { setIsRunnerAdvancementReasonModalOpen(false); setRunnerAdvancementContext(null); }}
                    onConfirm={handleRunnerAdvancementReasonConfirm}
                    runner={runnerAdvancementContext.runner}
                    defensiveTeamLineup={currentPartido.gameStatus.currentHalfInning === 'Top' ? currentPartido.lineupLocal : currentPartido.lineupVisitante}
                    defensiveTeamName={currentPartido.gameStatus.currentHalfInning === 'Top' ? currentPartido.nombreEquipoLocal : currentPartido.nombreEquipoVisitante}
                    isScoringAttempt={runnerAdvancementContext.baseIndexAdvancedTo === 3}
                />
            )}
            {isRunnerOutSpecificReasonModalOpen && managingRunner && (
                <RunnerOutSpecificReasonModal
                    isOpen={isRunnerOutSpecificReasonModalOpen}
                    onClose={() => { setIsRunnerOutSpecificReasonModalOpen(false); manager.setManagingRunner(null); }}
                    onConfirm={handleRunnerOutSpecificReasonConfirm}
                    runnerName={managingRunner.player.nombreJugador}
                    baseBeingRunFrom={getBaseLabel(managingRunner.baseIndex + 1)}
                />
            )}

            {runnerAdvancementAfterHitModalState.isOpen && runnerAdvancementAfterHitModalState.batter && (
                <RunnerAdvancementAfterHitModal
                    isOpen={runnerAdvancementAfterHitModalState.isOpen}
                    onClose={() => setRunnerAdvancementAfterHitModalState(prev => ({ ...prev, isOpen: false }))}
                    batter={runnerAdvancementAfterHitModalState.batter}
                    hitType={runnerAdvancementAfterHitModalState.hitType!}
                    batterReachedBase={runnerAdvancementAfterHitModalState.batterReachedBase}
                    runnersOnBase={runnerAdvancementAfterHitModalState.runnersOnBase}
                    initialAdvancements={runnerAdvancementAfterHitModalState.advancements}
                    onConfirm={handleConfirmRunnerAdvancementsFromHitModal}
                />
            )}

            {runnerAdvancementAfterSacrificeModalState.isOpen && runnerAdvancementAfterSacrificeModalState.batter && (
                <RunnerAdvancementAfterSacrificeModal
                    isOpen={runnerAdvancementAfterSacrificeModalState.isOpen}
                    onClose={() => setRunnerAdvancementAfterSacrificeModalState(prev => ({ ...prev, isOpen: false }))}
                    batter={runnerAdvancementAfterSacrificeModalState.batter}
                    sacrificeType={runnerAdvancementAfterSacrificeModalState.sacrificeType!}
                    runnersOnBase={runnerAdvancementAfterSacrificeModalState.runnersOnBase}
                    initialAdvancements={runnerAdvancementAfterSacrificeModalState.advancements}
                    initialOuts={runnerAdvancementAfterSacrificeModalState.initialOuts}
                    onConfirm={handleConfirmRunnerAdvancementsFromSacrificeModal}
                />
            )}
             {runnerAdvancementAfterErrorModalState.isOpen && runnerAdvancementAfterErrorModalState.batterWhoReachedOnError && (
                <RunnerAdvancementAfterErrorModal
                    isOpen={runnerAdvancementAfterErrorModalState.isOpen}
                    onClose={() => { setRunnerAdvancementAfterErrorModalState(prev => ({ ...prev, isOpen: false })) }}
                    batterWhoReachedOnError={runnerAdvancementAfterErrorModalState.batterWhoReachedOnError}
                    batterFinalDestBaseOnError={runnerAdvancementAfterErrorModalState.batterFinalDestBaseOnError}
                    runnersOnBaseAtTimeOfError={runnerAdvancementAfterErrorModalState.runnersOnBaseAtTimeOfError}
                    fielderWhoCommittedError={runnerAdvancementAfterErrorModalState.fielderWhoCommittedError}
                    onConfirm={handleConfirmRunnerAdvancementsFromErrorModal}
                />
            )}
            {fielderChoiceModalState.isOpen && fielderChoiceModalState.batter && fielderChoiceModalState.jugada && (
                <FielderChoiceOutcomeModal
                    isOpen={fielderChoiceModalState.isOpen}
                    onClose={() => setFielderChoiceModalState({ isOpen: false, batter: null, runnersOnBase: [], initialOuts: 0, jugada: null })}
                    batter={fielderChoiceModalState.batter}
                    runnersOnBase={fielderChoiceModalState.runnersOnBase}
                    initialOuts={fielderChoiceModalState.initialOuts}
                    jugada={fielderChoiceModalState.jugada}
                    onConfirm={handleComplexPlayConfirm}
                    requiredOuts={
                        fielderChoiceModalState.jugada.jugada === 'DP' ? 2 :
                        fielderChoiceModalState.jugada.jugada === 'TP' ? 3 :
                        undefined
                    }
                />
            )}

            {doublePlayModalState.isOpen && (
                <DoublePlayOutSelectionModal
                    isOpen={doublePlayModalState.isOpen}
                    onClose={() => setDoublePlayModalState(prev => ({...prev, isOpen: false}))}
                    onConfirm={handleDoublePlayConfirm}
                    playersInvolved={doublePlayModalState.playersInvolved}
                    teamName={doublePlayModalState.teamName}
                    initialOuts={doublePlayModalState.initialOuts}
                />
            )}
            {isTriplePlayModalOpen && (
                <TriplePlayOutSelectionModal
                    isOpen={isTriplePlayModalOpen}
                    onClose={() => setIsTriplePlayModalOpen(false)}
                    onConfirm={handleTriplePlayConfirm}
                    playersInvolved={playersForComplexOutModal}
                    teamName={currentPartido.gameStatus.currentHalfInning === 'Top' ? currentPartido.nombreEquipoVisitante : currentPartido.nombreEquipoLocal}
                />
            )}


            {/* Edit/Conflict Modals */}
            {isEditRegistroModalOpen && editingRegistro && (
                <Modal isOpen={isEditRegistroModalOpen} onClose={handleCloseEditRegistroModal} title={`Editar Registro de Jugada #${editingRegistro.id.substring(0, 6)}`} size="lg">
                    <p className="text-sm mb-2">Bateador: <span className="font-semibold">{editingRegistro.bateadorNombre}</span></p>
                    <p className="text-sm mb-2">Jugada Original: <span className="font-semibold">{getOriginalJugadaDescription(editingRegistro.jugadaId, editingRegistro.descripcion)} ({editingRegistro.jugadaId})</span></p>
                    <p className="text-xs text-red-500 bg-red-100 p-2 rounded mb-3">Advertencia: Cambiar la jugada aquí solo actualiza el texto del log. No recalcula estadísticas, outs, ni movimiento de bases.</p>
                    <Select
                        label="Nueva Jugada (Solo para el log):"
                        options={jugadasDB.map(j => ({ value: j.jugada, label: `${j.descripcion} (${j.jugada})` }))}
                        value={tempEditedPlayIdInModal}
                        onChange={(e) => setTempEditedPlayIdInModal(e.target.value)}
                    />
                    <div className="mt-4 flex justify-end space-x-2">
                        <Button variant="light" onClick={handleCloseEditRegistroModal}>Cancelar</Button>
                        <Button variant="success" onClick={() => {
                            const selected = jugadasDB.find(j => j.jugada === tempEditedPlayIdInModal);
                            if (selected) handleSaveEditedRegistro(selected);
                        }}>Guardar Solo Texto del Log</Button>
                    </div>
                </Modal>
            )}
            {isPositionConflictModalOpen && positionConflictDetails && (
                <Modal isOpen={isPositionConflictModalOpen} onClose={() => setIsPositionConflictModalOpen(false)} title="Conflicto de Posición">
                    <p>La posición <strong>{positionConflictDetails.targetPosition}</strong> ya está ocupada por <strong>{positionConflictDetails.existingPlayerInTargetPosition.nombreJugador}</strong>.</p>
                    <p>¿Desea asignar a <strong>{positionConflictDetails.conflictingPlayer.nombreJugador}</strong> a la posición <strong>{positionConflictDetails.targetPosition}</strong>? Esto moverá a <strong>{positionConflictDetails.existingPlayerInTargetPosition.nombreJugador}</strong> a la Banca (BE).</p>
                    <div className="flex justify-end space-x-2 pt-3">
                        <Button variant="light" onClick={() => handleResolvePositionConflict(false)}>Cancelar</Button>
                        <Button variant="warning" onClick={() => handleResolvePositionConflict(true)}>Confirmar y Mover a Banca</Button>
                    </div>
                </Modal>
            )}
            {isEditPlayerPositionModalOpen && editingPlayerForPosition && (
                <PositionSelectionModal
                    isOpen={isEditPlayerPositionModalOpen}
                    onClose={() => { setIsEditPlayerPositionModalOpen(false); manager.setEditingPlayerForPosition(null); }}
                    onConfirm={handleConfirmPlayerPositionChange}
                    currentPlayerName={editingPlayerForPosition.player.nombreJugador}
                    currentPosition={editingPlayerForPosition.player.posicion}
                    teamLineup={editingPlayerForPosition.team === 'visitante' ? currentPartido.lineupVisitante : currentPartido.lineupLocal}
                    teamName={editingPlayerForPosition.team === 'visitante' ? currentPartido.nombreEquipoVisitante : currentPartido.nombreEquipoLocal}
                />
            )}
            {isAddPlayerModalOpen && teamToAddPlayerTo && (
                <AddPlayerToLineupModal
                    isOpen={isAddPlayerModalOpen}
                    onClose={() => setIsAddPlayerModalOpen(false)}
                    onConfirm={handleConfirmAddPlayerToLineup}
                    teamName={teamToAddPlayerTo === 'visitante' ? currentPartido.nombreEquipoVisitante : currentPartido.nombreEquipoLocal}
                    allPlayersDB={jugadoresDB}
                    lineupVisitante={currentPartido.lineupVisitante}
                    lineupLocal={currentPartido.lineupLocal}
                />
            )}
        </>
    );
};


const PartidoContent: React.FC<{ initialPartidoData: PartidoData }> = ({ initialPartidoData }) => {
    const manager = usePartidoManager(initialPartidoData);
    const { currentPartido, setPartidoEnCurso, toasts, removeToast } = manager;

    useEffect(() => {
        // This effect syncs the manager's state back to localStorage
        if (currentPartido) {
            setPartidoEnCurso(currentPartido);
        }
    }, [currentPartido, setPartidoEnCurso]);

    if (!currentPartido) {
        return <div className="p-4 text-center">Cargando datos del partido...</div>;
    }

    return (
        <PartidoContext.Provider value={manager}>
            <div className="p-1 sm:p-4 space-y-6">
                <ToastContainer toasts={toasts || []} onClose={removeToast} />
                <Marcador />
                <EstadoJuego />
                <AccionesPartido />
                <LineupManager />
                <GameLog />
                <AllTheModals />
            </div>
        </PartidoContext.Provider>
    );
};

const PartidosPage: React.FC = () => {
    const [partidoEnCurso] = useLocalStorage<PartidoData | null>(PARTIDO_EN_CURSO_KEY, null);
    const navigate = useNavigate();

    useEffect(() => {
        if (!partidoEnCurso) {
            navigate('/configurar-partido');
        }
    }, [partidoEnCurso, navigate]);

    if (!partidoEnCurso) {
        return <div className="p-4 text-center">Cargando partido o redirigiendo...</div>;
    }

    return <PartidoContent initialPartidoData={partidoEnCurso} />;
};

export default PartidosPage;