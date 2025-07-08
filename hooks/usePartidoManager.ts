
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import { useNavigate } from 'react-router-dom';
import {
  PartidoData, JuegoGuardado, Formato, Jugador, Jugada, LineupPlayer, PlayInInningCell, GameStatus, RegistroJuego, AppGlobalConfig, PlayCategory, Equipo, DEFAULT_GLOBAL_CONFIG, PlayerOnBase, LastPlayContext, PlayerInfoForOutSelection, RunnerAdvancementReason, AssignRbiModalState, RunnerAdvancementAfterHitModalState, RunnerAdvancementInfo, RunnerAdvancementAfterSacrificeModalState, RunnerAdvancementAfterErrorModalState, ErrorModalContext, FielderChoiceModalState, FielderChoiceResult, EMPTY_POSICION_PLACEHOLDER, EMPTY_POSICION_LABEL, RunnerOutReason, ToastMessage, ToastType, DoublePlayResult, DoublePlayModalState
} from '../types';
import {
  PARTIDO_EN_CURSO_KEY, HISTORIAL_JUEGOS_KEY, FORMATOS_STORAGE_KEY, JUGADORES_STORAGE_KEY, JUGADAS_STORAGE_KEY, APP_CONFIG_KEY, EQUIPOS_STORAGE_KEY, defaultJugadas
} from '../constants';
import useLocalStorage from './useLocalStorage';
import { generateUUID } from '../utils/idGenerator';
import { findNextBatterInLineup, recalculateLineupOrder, createEmptyBatterStats, createEmptyTeamStats, updateBattingOrderFromArrayOrder } from '../utils/partidoUtils';

const MAX_UNDO_HISTORY_SIZE = 10;

// Define the return type of the hook
export type PartidoManager = ReturnType<typeof usePartidoManager>;

const playsToHideFromBatterModal = new Set([
    'CS', 'PK', 'SB', 'WP', 'PB', 'ID', 'AE', 'OB', 'BK',
    'R', 'RBI', 'ED', 'OUT_RUNNER_BASE', 'ADV_OTRO'
]);


export const usePartidoManager = (initialPartidoData: PartidoData | null) => {
    const navigate = useNavigate();

    // --- DB DATA HOOKS ---
    const [appConfig] = useLocalStorage<AppGlobalConfig>(APP_CONFIG_KEY, DEFAULT_GLOBAL_CONFIG);
    const [historial, setHistorial] = useLocalStorage<JuegoGuardado[]>(HISTORIAL_JUEGOS_KEY, []);
    const [formatos] = useLocalStorage<Formato[]>(FORMATOS_STORAGE_KEY, []);
    const [jugadoresDB] = useLocalStorage<Jugador[]>(JUGADORES_STORAGE_KEY, []);
    const [jugadasDBFromStorage] = useLocalStorage<Jugada[]>(JUGADAS_STORAGE_KEY, []);
    const [, setPartidoEnCurso] = useLocalStorage<PartidoData | null>(PARTIDO_EN_CURSO_KEY, null);

    // --- STATE HOOKS ---
    const [currentPartido, setCurrentPartido] = useState<PartidoData | null>(initialPartidoData);
    const [partidoHistoryStack, setPartidoHistoryStack] = useState<PartidoData[]>([]);
    const [gamePhase, setGamePhase] = useState<'scoring' | 'ended'>('scoring');
    
    const lastUndoActionId = useRef<string | null>(null);
    
    // Modal States
    const [isPlayModalOpen, setIsPlayModalOpen] = useState(false);
    const [currentPlayerForPlay, setCurrentPlayerForPlay] = useState<LineupPlayer | null>(null);
    const [isFreeEditModeForModal, setIsFreeEditModeForModal] = useState(false);
    const [isPositionConflictModalOpen, setIsPositionConflictModalOpen] = useState(false);
    const [positionConflictDetails, setPositionConflictDetails] = useState<any | null>(null);
    const [isEditRegistroModalOpen, setIsEditRegistroModalOpen] = useState(false);
    const [editingRegistro, setEditingRegistro] = useState<RegistroJuego | null>(null);
    const [tempEditedPlayIdInModal, setTempEditedPlayIdInModal] = useState<string>('');
    const [isConfirmActionModalOpen, setIsConfirmActionModalOpen] = useState(false);
    const [confirmActionModalProps, setConfirmActionModalProps] = useState<any | null>(null);
    const [isRunnerActionModalOpen, setIsRunnerActionModalOpen] = useState(false);
    const [managingRunner, setManagingRunner] = useState<{ player: PlayerOnBase, baseIndex: 0 | 1 | 2 } | null>(null);
    const [assignRbiModalState, setAssignRbiModalState] = useState<AssignRbiModalState>({ isOpen: false, scoringPlayerInfo: null, batterForRbiContext: null, previousBatterForRbiContext: null });
    const [isBoxScoreModalOpen, setIsBoxScoreModalOpen] = useState(false);
    const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
    const [errorModalContext, setErrorModalContext] = useState<ErrorModalContext | null>(null);
    const [isRunnerAdvancementReasonModalOpen, setIsRunnerAdvancementReasonModalOpen] = useState(false);
    const [runnerAdvancementContext, setRunnerAdvancementContext] = useState<any | null>(null);
    const [runnerAdvancementAfterHitModalState, setRunnerAdvancementAfterHitModalState] = useState<RunnerAdvancementAfterHitModalState>({ isOpen: false, batter: null, hitType: null, batterReachedBase: 1, runnersOnBase: [], advancements: {} });
    const [runnerAdvancementAfterSacrificeModalState, setRunnerAdvancementAfterSacrificeModalState] = useState<RunnerAdvancementAfterSacrificeModalState>({ isOpen: false, batter: null, sacrificeType: null, runnersOnBase: [], advancements: {}, initialOuts: 0 });
    const [runnerAdvancementAfterErrorModalState, setRunnerAdvancementAfterErrorModalState] = useState<RunnerAdvancementAfterErrorModalState>({ isOpen: false, batterWhoReachedOnError: null, batterFinalDestBaseOnError: 0, runnersOnBaseAtTimeOfError: [], fielderWhoCommittedError: null, advancements: {} });
    const [isRunnerOutSpecificReasonModalOpen, setIsRunnerOutSpecificReasonModalOpen] = useState(false);
    const [isEditPlayerPositionModalOpen, setIsEditPlayerPositionModalOpen] = useState(false);
    const [editingPlayerForPosition, setEditingPlayerForPosition] = useState<{player: LineupPlayer, team: 'visitante' | 'local'} | null>(null);
    const [fielderChoiceModalState, setFielderChoiceModalState] = useState<FielderChoiceModalState>({ isOpen: false, batter: null, runnersOnBase: [], initialOuts: 0, jugada: null });
    const [isAddPlayerModalOpen, setIsAddPlayerModalOpen] = useState(false);
    const [teamToAddPlayerTo, setTeamToAddPlayerTo] = useState<'visitante' | 'local' | null>(null);
    const [doublePlayModalState, setDoublePlayModalState] = useState<DoublePlayModalState>({ isOpen: false, playersInvolved: [], initialOuts: 0, teamName: '' });
    const [isTriplePlayModalOpen, setIsTriplePlayModalOpen] = useState(false);
    const [playersForComplexOutModal, setPlayersForComplexOutModal] = useState<PlayerInfoForOutSelection[]>([]);


    // UI State
    const [isGameLogExpanded, setIsGameLogExpanded] = useState(false);

    // Toast State
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const addToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = generateUUID();
        setToasts(prevToasts => {
            const newToasts = [...prevToasts, { id, message, type }];
            return newToasts.slice(-5); // Keep max 5 toasts
        });
    }, []);

    const removeToast = useCallback((id: string) => {
      setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
    }, []);

    // --- DERIVED DATA & CONSTANTS ---
    const jugadasDB = useMemo(() => {
        if (jugadasDBFromStorage && jugadasDBFromStorage.length > 0) return jugadasDBFromStorage;
        return defaultJugadas.map((j, index) => ({ ...j, codigo: index + 1000, isDefault: true, isActive: true }));
    }, [jugadasDBFromStorage]);

    const getBaseLabel = (baseNum: number): string => {
        if (baseNum === 0) return 'OUT';
        if (baseNum === 1) return '1B';
        if (baseNum === 2) return '2B';
        if (baseNum === 3) return '3B';
        if (baseNum === 4) return 'HOME';
        return 'N/A';
    };
    
    const playCategoryOrder: PlayCategory[] = [PlayCategory.HIT, PlayCategory.ON_BASE, PlayCategory.OUT, PlayCategory.ADVANCEMENT, PlayCategory.SPECIAL];
    const playCategoryColors: { [key in PlayCategory]: 'success' | 'info' | 'danger' | 'warning' | 'secondary' } = {
        [PlayCategory.HIT]: 'success',
        [PlayCategory.ON_BASE]: 'info',
        [PlayCategory.OUT]: 'danger',
        [PlayCategory.ADVANCEMENT]: 'warning',
        [PlayCategory.SPECIAL]: 'secondary',
        [PlayCategory.PITCH_OUTCOME]: 'secondary',
    };

    const groupedPlays = useMemo(() => {
        const playsForBatterModal = jugadasDB.filter(jugada => !playsToHideFromBatterModal.has(jugada.jugada));
        
        return playsForBatterModal.reduce((acc, jugada) => {
            if (!jugada.isActive) return acc;
            if (!acc[jugada.category]) {
                acc[jugada.category] = [];
            }
            acc[jugada.category].push(jugada);
            return acc;
        }, {} as { [key in PlayCategory]: Jugada[] });
    }, [jugadasDB]);

    const currentBatterDisplay = useMemo(() => {
        if (!currentPartido || !currentPartido.gameStatus.currentBatterLineupPlayerId) return null;
        const lineup = currentPartido.gameStatus.currentHalfInning === 'Top' ? currentPartido.lineupVisitante : currentPartido.lineupLocal;
        return lineup.find(p => p.id === currentPartido.gameStatus.currentBatterLineupPlayerId) || null;
    }, [currentPartido]);
    
    const getOriginalJugadaDescription = useCallback((jugadaId: string, fallbackDesc: string): string => {
        const jugada = jugadasDB.find(j => j.jugada === jugadaId);
        return jugada ? jugada.descripcion : fallbackDesc;
    }, [jugadasDB]);

    const updateCurrentPartidoAndHistory = useCallback((updater: (prevState: PartidoData) => PartidoData, actionId?: string) => {
        setCurrentPartido(prevPartido => {
            if (!prevPartido) return null;
    
            if (!actionId || (actionId && actionId !== lastUndoActionId.current)) {
                setPartidoHistoryStack(prevStack => {
                    const newStack = [prevPartido, ...prevStack];
                    return newStack.slice(0, MAX_UNDO_HISTORY_SIZE);
                });
            }
            if (actionId) {
                lastUndoActionId.current = actionId;
            }
    
            const updated = updater(prevPartido);
            return updated;
        });
    }, []);

    const _getJugadaById = useCallback((jugadaId: string): Jugada | undefined => {
        return jugadasDB.find(j => j.jugada === jugadaId);
    }, [jugadasDB]);
    
    const _createPlayInInningCell = (jugada: Jugada, rbiCount: number, playInstanceId: string): PlayInInningCell => {
        let playDisplayValue = jugada.jugada;
        // RBI count display logic
        if (rbiCount > 0 && ['H1', 'H2', 'H3', 'HR', 'DP'].includes(jugada.jugada)) {
            playDisplayValue += `+${rbiCount}RBI`;
        }
        return {
            playInstanceId,
            jugadaId: jugada.jugada,
            descripcion: jugada.descripcion,
            playDisplayValue,
        };
    };

    const _addPlayToLineupCell = (
        lineup: LineupPlayer[],
        batterId: string,
        inning: number,
        playCell: PlayInInningCell
    ) => {
        const batterIndex = lineup.findIndex(p => p.id === batterId);
        if (batterIndex > -1) {
            if (!lineup[batterIndex].innings[inning]) {
                lineup[batterIndex].innings[inning] = [];
            }
            lineup[batterIndex].innings[inning].push(playCell);
        }
    };
    
    const _addRunMarkerToLineup = (
        lineup: LineupPlayer[],
        runnerId: string,
        inning: number,
        batterPlayInstanceId: string
    ) => {
        const runnerIndex = lineup.findIndex(p => p.id === runnerId);
        if (runnerIndex > -1) {
            const runMarkerCell: PlayInInningCell = {
                playInstanceId: `${batterPlayInstanceId}-${runnerId}`, // Make instance ID unique per runner
                jugadaId: 'R',
                descripcion: 'Carrera Anotada',
                playDisplayValue: 'R'
            };
            if (!lineup[runnerIndex].innings[inning]) {
                lineup[runnerIndex].innings[inning] = [];
            }
            // Allow multiple 'R' markers per inning if a player bats around and scores multiple times.
            lineup[runnerIndex].innings[inning].push(runMarkerCell);
        }
    };
    
    const _addAdvancementMarkerToLineup = (
        lineup: LineupPlayer[],
        runnerId: string,
        inning: number,
        playInstanceId: string,
        jugada: Jugada
    ) => {
        const runnerIndex = lineup.findIndex(p => p.id === runnerId);
        if (runnerIndex > -1) {
            const advancementCell: PlayInInningCell = {
                playInstanceId: playInstanceId,
                jugadaId: jugada.jugada,
                descripcion: jugada.descripcion,
                playDisplayValue: jugada.jugada,
            };
            if (!lineup[runnerIndex].innings[inning]) {
                lineup[runnerIndex].innings[inning] = [];
            }
            lineup[runnerIndex].innings[inning].push(advancementCell);
        }
    };

    const _recordPlayInLog = (partidoState: PartidoData, jugada: Jugada, playerInvolved: LineupPlayer | PlayerOnBase, runsScoredThisPlay: number, rbiCreditedThisPlay: number, customDesc: string | undefined, basesBefore: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null], outsBefore: number, playInstanceId: string, inningOfPlay: number, halfInningOfPlay: 'Top' | 'Bottom') => {
        const pitcher = (partidoState.gameStatus.currentHalfInning === 'Top' ? partidoState.lineupLocal : partidoState.lineupVisitante).find(p => p.posicion === 'P');
        const formatoDesc = formatos.find(f => f.codigo === partidoState.formatoJuegoId)?.descripcion || 'N/A';
        const currentLineup = halfInningOfPlay === 'Top' ? partidoState.lineupVisitante : partidoState.lineupLocal;
    
        const isLineupPlayer = 'ordenBate' in playerInvolved;
        const lineupPlayerId = isLineupPlayer ? playerInvolved.id : playerInvolved.lineupPlayerId;
        
        // Find the full LineupPlayer object to get consistent data
        const fullPlayerInfo = currentLineup.find(p => p.id === lineupPlayerId);
    
        const bateadorIdForLog = lineupPlayerId;
        const bateadorNombreForLog = fullPlayerInfo ? fullPlayerInfo.nombreJugador : playerInvolved.nombreJugador;
        const bateadorPosicionForLog = fullPlayerInfo ? fullPlayerInfo.posicion : (isLineupPlayer ? playerInvolved.posicion : 'N/A');
        const bateadorOrdenForLog = fullPlayerInfo ? fullPlayerInfo.ordenBate : (isLineupPlayer ? playerInvolved.ordenBate : 0);
    
        const newRegistro: RegistroJuego = {
            id: playInstanceId,
            timestamp: Date.now(),
            inning: inningOfPlay,
            halfInning: halfInningOfPlay,
            bateadorId: bateadorIdForLog,
            bateadorNombre: bateadorNombreForLog,
            bateadorPosicion: bateadorPosicionForLog,
            pitcherResponsableId: pitcher ? String(pitcher.jugadorId) : null,
            pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
            equipoBateadorNombre: halfInningOfPlay === 'Top' ? partidoState.nombreEquipoVisitante : partidoState.nombreEquipoLocal,
            jugadaId: jugada.jugada,
            descripcion: jugada.descripcion, // Always use official description from jugadasDB
            categoria: jugada.category,
            outsPrev: outsBefore,
            outsAfter: partidoState.gameStatus.outs,
            basesPrevState: basesBefore.map(p => p?.lineupPlayerId ?? 'null').join('-'),
            basesAfterState: partidoState.gameStatus.bases.map(p => p?.lineupPlayerId ?? 'null').join('-'),
            runScored: runsScoredThisPlay,
            rbi: rbiCreditedThisPlay,
            advancementReason: '',
            fechaDelPartido: partidoState.fecha,
            formatoDelPartidoDesc: formatoDesc,
            numeroDelPartido: partidoState.numeroJuego,
            ordenDelBateador: bateadorOrdenForLog,
        };
        partidoState.registrosJuego.push(newRegistro);
    };

    const _logDefensiveError = (partidoState: PartidoData, fielderJugadorId: number, inningOfPlay: number, halfInningOfPlay: 'Top' | 'Bottom', originalPlayInstanceId: string) => {
        const edJugada = _getJugadaById('ED');
        if (!edJugada) {
            console.warn("Could not log defensive error: 'ED' jugada not found.");
            return;
        }
    
        const defensiveLineupKey = halfInningOfPlay === 'Top' ? 'lineupLocal' : 'lineupVisitante';
        const defensiveLineup = partidoState[defensiveLineupKey];
        const defensiveTeamName = halfInningOfPlay === 'Top' ? partidoState.nombreEquipoLocal : partidoState.nombreEquipoVisitante;
        
        const pitcher = defensiveLineup.find(p => p.posicion === 'P');
    
        const fielder = defensiveLineup.find(p => p.jugadorId === fielderJugadorId);
        if (!fielder) {
            console.warn(`Could not log defensive error: Fielder with Jugador.codigo ${fielderJugadorId} not found in defensive lineup.`);
            return;
        }
    
        const logInstanceId = originalPlayInstanceId + '-ED';
    
        const newRegistro: RegistroJuego = {
            id: logInstanceId,
            timestamp: Date.now(),
            inning: inningOfPlay,
            halfInning: halfInningOfPlay,
            // Re-purposing batter fields for the fielder.
            bateadorId: fielder.id, // lineupPlayer ID
            bateadorNombre: fielder.nombreJugador,
            bateadorPosicion: fielder.posicion,
            ordenDelBateador: fielder.ordenBate,
            pitcherResponsableId: pitcher ? String(pitcher.jugadorId) : null,
            pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
            equipoBateadorNombre: defensiveTeamName, // This is the defensive team's name
            jugadaId: edJugada.jugada,
            descripcion: edJugada.descripcion,
            categoria: edJugada.category,
            // State does not change from this log entry. It's a record of an event that's part of another play.
            outsPrev: partidoState.gameStatus.outs,
            outsAfter: partidoState.gameStatus.outs,
            basesPrevState: partidoState.gameStatus.bases.map(p => p?.lineupPlayerId ?? 'null').join('-'),
            basesAfterState: partidoState.gameStatus.bases.map(p => p?.lineupPlayerId ?? 'null').join('-'),
            runScored: 0,
            rbi: 0,
            advancementReason: '', // Not an advancement itself
            fechaDelPartido: partidoState.fecha,
            formatoDelPartidoDesc: formatos.find(f => f.codigo === partidoState.formatoJuegoId)?.descripcion || 'N/A',
            numeroDelPartido: partidoState.numeroJuego,
        };
        partidoState.registrosJuego.push(newRegistro);
    
        // Add visual marker to fielder's inning cell
        _addPlayToLineupCell(defensiveLineup, fielder.id, inningOfPlay, _createPlayInInningCell(edJugada, 0, logInstanceId));
    };

    const _logRunAndRbi = (partidoState: PartidoData, scoringPlayer: PlayerOnBase | LineupPlayer, rbiPlayerId: string | null, originalPlayId: string, inningOfPlay: number, halfInningOfPlay: 'Top' | 'Bottom') => {
        const runJugada = _getJugadaById('R');
        const rbiJugada = _getJugadaById('RBI');
        const lineupKey = halfInningOfPlay === 'Top' ? 'lineupVisitante' : 'lineupLocal';
        const lineup = partidoState[lineupKey];
    
        const currentOuts = partidoState.gameStatus.outs;
        const currentBases = partidoState.gameStatus.bases;

        const scoringPlayerLineupId = 'lineupPlayerId' in scoringPlayer ? scoringPlayer.lineupPlayerId : scoringPlayer.id;
    
        if (runJugada) {
            _recordPlayInLog(partidoState, runJugada, scoringPlayer, 1, 0, undefined, currentBases, currentOuts, `${originalPlayId}-R-${scoringPlayerLineupId}`, inningOfPlay, halfInningOfPlay);
        }
    
        if (rbiPlayerId && rbiJugada) {
            const rbiPlayer = lineup.find(p => p.id === rbiPlayerId);
            if (rbiPlayer) {
                _recordPlayInLog(partidoState, rbiJugada, rbiPlayer, 0, 1, undefined, currentBases, currentOuts, `${originalPlayId}-RBI-${scoringPlayerLineupId}`, inningOfPlay, halfInningOfPlay);
            }
        }
    };
    
    const _applySingleRunScoringLogic = (partidoDataToUpdate: PartidoData, scoringPlayer: PlayerOnBase | LineupPlayer, rbiCreditedToPlayerId: string | null, batterPlayInstanceId: string, inningOfPlay: number, halfInningOfPlay: 'Top' | 'Bottom'): void => {
        const teamAtBat = halfInningOfPlay === 'Top' ? 'visitante' : 'local';
        const scoringPlayerLineupId = 'lineupPlayerId' in scoringPlayer ? scoringPlayer.lineupPlayerId : scoringPlayer.id;
        const currentInningForStats = inningOfPlay;
      
        if (teamAtBat === 'visitante') {
          partidoDataToUpdate.visitanteStats.totalRuns += 1;
          partidoDataToUpdate.visitanteStats.runsPerInning[currentInningForStats] = (partidoDataToUpdate.visitanteStats.runsPerInning[currentInningForStats] || 0) + 1;
        } else {
          partidoDataToUpdate.localStats.totalRuns += 1;
          partidoDataToUpdate.localStats.runsPerInning[currentInningForStats] = (partidoDataToUpdate.localStats.runsPerInning[currentInningForStats] || 0) + 1;
        }
      
        const lineupToUpdateKey = teamAtBat === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
        const lineupToUpdate = partidoDataToUpdate[lineupToUpdateKey];
        
        const scorerIndex = lineupToUpdate.findIndex(p => p.id === scoringPlayerLineupId);
        if (scorerIndex !== -1) {
          lineupToUpdate[scorerIndex].stats.runs += 1;
        }
    
        if (rbiCreditedToPlayerId) {
            const rbiPlayerIndex = lineupToUpdate.findIndex(p => p.id === rbiCreditedToPlayerId);
            if (rbiPlayerIndex !== -1) {
                lineupToUpdate[rbiPlayerIndex].stats.rbi += 1;
            }
        }

        _addRunMarkerToLineup(lineupToUpdate, scoringPlayerLineupId, inningOfPlay, batterPlayInstanceId);
        _logRunAndRbi(partidoDataToUpdate, scoringPlayer, rbiCreditedToPlayerId, batterPlayInstanceId, inningOfPlay, halfInningOfPlay);
    };

    const handleSaveGame = useCallback(() => {
        if (!currentPartido) return;
        const gameToSave: JuegoGuardado = {
          ...currentPartido,
          idJuego: currentPartido.idJuego || generateUUID(),
          timestampGuardado: Date.now(),
        };
        setHistorial(prevHistorial => {
          const existingIndex = prevHistorial.findIndex(g => g.idJuego === gameToSave.idJuego);
          if (existingIndex > -1) {
            const updatedHistorial = [...prevHistorial];
            updatedHistorial[existingIndex] = gameToSave;
            return updatedHistorial;
          }
          return [...prevHistorial, gameToSave];
        });
        addToast('Juego guardado en el historial.', 'success');
    }, [currentPartido, setHistorial, addToast]);

    const handleExportGameLogCSV = useCallback(() => {
        if (!currentPartido) {
            addToast("No hay datos de partido para exportar.", 'warning');
            return;
        }

        const {
            idJuego, fecha, formatoJuegoId, numeroJuego, nombreEquipoVisitante,
            nombreEquipoLocal, selectedEquipoVisitanteId, selectedEquipoLocalId,
            maxInnings, lineupVisitante, lineupLocal, registrosJuego,
            visitanteStats, localStats
        } = currentPartido;

        const csvContent: string[] = [];

        const metadata = [
            { KEY: 'idJuego', VALUE: idJuego || '' },
            { KEY: 'fecha', VALUE: fecha },
            { KEY: 'formatoJuegoId', VALUE: formatoJuegoId },
            { KEY: 'numeroJuego', VALUE: numeroJuego },
            { KEY: 'nombreEquipoVisitante', VALUE: `"${nombreEquipoVisitante}"` },
            { KEY: 'nombreEquipoLocal', VALUE: `"${nombreEquipoLocal}"` },
            { KEY: 'selectedEquipoVisitanteId', VALUE: selectedEquipoVisitanteId || '' },
            { KEY: 'selectedEquipoLocalId', VALUE: selectedEquipoLocalId || '' },
            { KEY: 'maxInnings', VALUE: maxInnings },
            { KEY: 'finalScoreVisitante', VALUE: visitanteStats.totalRuns },
            { KEY: 'finalScoreLocal', VALUE: localStats.totalRuns }
        ];
        csvContent.push(Papa.unparse(metadata, { delimiter: ';', header: false, quotes: false }));

        const formatNameForCsv = (name: string) => `"${name.replace(/"/g, '""')}"`;

        // Visitor Lineup
        csvContent.push('\n#LINEUP_VISITANTE_START');
        const visitorLineupData = lineupVisitante.map(p => ({
            id: p.id,
            ordenBate: p.ordenBate,
            jugadorId: p.jugadorId,
            nombreJugador: formatNameForCsv(p.nombreJugador),
            posicion: p.posicion
        }));
        csvContent.push(Papa.unparse(visitorLineupData, { delimiter: ';', header: true, quotes: false }));

        // Local Lineup
        csvContent.push('\n#LINEUP_LOCAL_START');
        const localLineupData = lineupLocal.map(p => ({
            id: p.id,
            ordenBate: p.ordenBate,
            jugadorId: p.jugadorId,
            nombreJugador: formatNameForCsv(p.nombreJugador),
            posicion: p.posicion
        }));
        csvContent.push(Papa.unparse(localLineupData, { delimiter: ';', header: true, quotes: false }));

        // Game Log
        csvContent.push('\n#REGISTROS_JUEGO_START');
        const logData = registrosJuego.map(r => ({
            ...r,
            bateadorNombre: formatNameForCsv(r.bateadorNombre),
            pitcherResponsableNombre: r.pitcherResponsableNombre ? formatNameForCsv(r.pitcherResponsableNombre) : '',
            equipoBateadorNombre: formatNameForCsv(r.equipoBateadorNombre),
            descripcion: formatNameForCsv(r.descripcion),
        }));
        const logHeaders = ['id', 'timestamp', 'inning', 'halfInning', 'bateadorId', 'bateadorNombre', 'bateadorPosicion', 'pitcherResponsableId', 'pitcherResponsableNombre', 'equipoBateadorNombre', 'jugadaId', 'descripcion', 'categoria', 'outsPrev', 'outsAfter', 'basesPrevState', 'basesAfterState', 'runScored', 'rbi', 'advancementReason', 'fechaDelPartido', 'formatoDelPartidoDesc', 'numeroDelPartido', 'ordenDelBateador'];
        csvContent.push(Papa.unparse(logData, { delimiter: ';', header: true, columns: logHeaders, quotes: false }));
        
        const csvString = csvContent.join('\n');

        const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        const fileName = `Partido ${nombreEquipoVisitante} vs ${nombreEquipoLocal} ${fecha} ${numeroJuego || ''}.csv`.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ');
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [currentPartido, addToast]);

    const handleExportBoxScoreCSV = useCallback(() => {
        if (!currentPartido) {
            addToast("No hay datos de partido para exportar.", 'warning');
            return;
        }

        const {
            nombreEquipoVisitante,
            nombreEquipoLocal,
            visitanteStats,
            localStats,
            lineupVisitante,
            lineupLocal,
            maxInnings,
            fecha,
            numeroJuego
        } = currentPartido;

        let csvString = '';

        // --- Section 1: Line Score ---
        const lineScoreHeaders = ['Equipo', ...Array.from({ length: maxInnings }, (_, i) => String(i + 1)), 'R', 'H', 'E'];
        const lineScoreData = [
            {
                Equipo: nombreEquipoVisitante,
                ...Object.fromEntries(Array.from({ length: maxInnings }, (_, i) => [String(i + 1), visitanteStats.runsPerInning[i + 1] ?? 0])),
                R: visitanteStats.totalRuns,
                H: visitanteStats.hits,
                E: visitanteStats.errors,
            },
            {
                Equipo: nombreEquipoLocal,
                ...Object.fromEntries(Array.from({ length: maxInnings }, (_, i) => [String(i + 1), localStats.runsPerInning[i + 1] ?? 0])),
                R: localStats.totalRuns,
                H: localStats.hits,
                E: localStats.errors,
            },
        ];
        csvString += 'Marcador por Entradas\n';
        csvString += Papa.unparse({ fields: lineScoreHeaders, data: lineScoreData });
        csvString += '\n\n';

        // --- Section 2 & 3: Batting Stats ---
        const battingHeaders = ['Jugador', 'Pos', 'AB', 'AP', 'R', 'H1', 'H2', 'H3', 'HR', 'RBI', 'BB', 'K'];
        
        const generateBattingCsv = (teamName: string, lineup: LineupPlayer[]) => {
            const totals = { AB: 0, AP: 0, R: 0, H1: 0, H2: 0, H3: 0, HR: 0, RBI: 0, BB: 0, K: 0 };

            const battingData = lineup.map(player => {
                const { stats, nombreJugador, posicion } = player;
                totals.AB += stats.atBats;
                totals.AP += stats.plateAppearances;
                totals.R += stats.runs;
                totals.H1 += stats.singles;
                totals.H2 += stats.doubles;
                totals.H3 += stats.triples;
                totals.HR += stats.homeRuns;
                totals.RBI += stats.rbi;
                totals.BB += stats.walks;
                totals.K += stats.strikeouts;

                return {
                    Jugador: nombreJugador,
                    Pos: posicion || EMPTY_POSICION_LABEL,
                    AB: stats.atBats, AP: stats.plateAppearances, R: stats.runs,
                    H1: stats.singles, H2: stats.doubles, H3: stats.triples, HR: stats.homeRuns,
                    RBI: stats.rbi, BB: stats.walks, K: stats.strikeouts,
                };
            });

            // Add totals row
            battingData.push({ Jugador: 'TOTALES', Pos: '', ...totals });

            let teamCsv = `${teamName} - Bateo\n`;
            teamCsv += Papa.unparse({ fields: battingHeaders, data: battingData });
            return teamCsv;
        };
        
        csvString += generateBattingCsv(nombreEquipoVisitante, lineupVisitante);
        csvString += '\n\n';
        csvString += generateBattingCsv(nombreEquipoLocal, lineupLocal);

        // --- Download ---
        const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        const fileName = `Box Score ${nombreEquipoVisitante} vs ${nombreEquipoLocal} ${fecha} ${numeroJuego || ''}.csv`.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ');
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [currentPartido, addToast]);

    const handleUndoLastAnnotation = useCallback(() => {
        if (partidoHistoryStack.length > 0) {
            const previousState = partidoHistoryStack[0];
            const actionId = generateUUID(); 
            updateCurrentPartidoAndHistory(() => previousState, actionId);
            addToast('Última anotación deshecha.', 'info');
        } else {
            addToast('No hay más acciones para deshacer.', 'warning');
        }
    }, [partidoHistoryStack, updateCurrentPartidoAndHistory, addToast]);

    const openPlayModal = useCallback((player: LineupPlayer, isFreeEdit: boolean = false) => {
        if (gamePhase === 'ended') {
            addToast("El partido ha terminado. No se pueden anotar más jugadas.", 'warning');
            return;
        }
        setCurrentPlayerForPlay(player);
        setIsFreeEditModeForModal(isFreeEdit);
        setIsPlayModalOpen(true);
    }, [gamePhase, addToast]);

    const handleBaseClick = useCallback((baseIndex: 0 | 1 | 2) => {
        if (gamePhase === 'ended' || !currentPartido) return;
        const playerOnBase = currentPartido.gameStatus.bases[baseIndex];
        if (playerOnBase) {
            setManagingRunner({ player: playerOnBase, baseIndex });
            setIsRunnerActionModalOpen(true);
        }
    }, [gamePhase, currentPartido]);

    const _advanceInning = (currentState: PartidoData): void => {
        const { currentHalfInning, actualInningNumber, nextVisitorBatterLineupPlayerId, nextLocalBatterLineupPlayerId } = currentState.gameStatus;
        
        currentState.gameStatus.outs = 0;
        currentState.gameStatus.bases = [null, null, null];
    
        if (currentHalfInning === 'Top') {
            currentState.gameStatus.currentHalfInning = 'Bottom';
            currentState.gameStatus.currentBatterLineupPlayerId = nextLocalBatterLineupPlayerId;
        } else {
            currentState.gameStatus.currentHalfInning = 'Top';
            currentState.gameStatus.actualInningNumber += 1;
            currentState.gameStatus.currentBatterLineupPlayerId = nextVisitorBatterLineupPlayerId;
        }
    
        // Check for game end condition
        if (currentState.gameStatus.actualInningNumber > currentState.maxInnings && currentState.gameStatus.currentHalfInning === 'Top') {
            if (currentState.localStats.totalRuns > currentState.visitanteStats.totalRuns) {
                setGamePhase('ended');
                addToast("Fin del juego. El equipo Local gana.", 'info');
            }
        }
    };

    const _calculateOutsUpdate = (currentState: PartidoData, outsToAdd: number, jugada: Jugada, batter?: LineupPlayer | null): void => {
        const initialOuts = currentState.gameStatus.outs;
        const newOuts = initialOuts + outsToAdd;
    
        // Update batter stats only if the batter is involved and the play results in an at-bat.
        const batterOutPlaysWithAtBat = ['K', 'GO', 'FO', 'LO']; // DP/TP are handled in their own functions
        const batterOutPlaysWithoutAtBat = ['SF', 'SH'];
    
        if (batter) {
            const lineupKey = currentState.gameStatus.currentHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
            const batterIndex = currentState[lineupKey].findIndex(p => p.id === batter.id);
            
            if (batterIndex !== -1) {
                const batterStats = currentState[lineupKey][batterIndex].stats;
    
                if (batterOutPlaysWithAtBat.includes(jugada.jugada)) {
                    batterStats.atBats += 1;
                    batterStats.plateAppearances += 1;
                    if (jugada.jugada === 'K') {
                        batterStats.strikeouts += 1;
                    }
                } else if (batterOutPlaysWithoutAtBat.includes(jugada.jugada)) {
                    // Sacrifices are a plate appearance but not an at-bat.
                    batterStats.plateAppearances += 1;
                }
            }
        }
    
        if (newOuts >= 3) {
            currentState.gameStatus.outs = 3;
            const battingTeamKey = currentState.gameStatus.currentHalfInning === 'Top' ? 'visitanteStats' : 'localStats';
            const runnersLeft = currentState.gameStatus.bases.filter(b => b !== null).length;
            currentState[battingTeamKey].leftOnBase += runnersLeft;

            const lastPlayTeam = currentState.registrosJuego.length > 0 ? currentState.registrosJuego[currentState.registrosJuego.length - 1].equipoBateadorNombre : "";
            const currentBattingTeam = currentState.gameStatus.currentHalfInning === 'Top' ? currentState.nombreEquipoVisitante : currentState.nombreEquipoLocal;

            // Fix for last out team attribution
            if (lastPlayTeam && lastPlayTeam !== currentBattingTeam) {
                 const lastRegistro = currentState.registrosJuego[currentState.registrosJuego.length - 1];
                 lastRegistro.equipoBateadorNombre = currentBattingTeam;
            }

            _advanceInning(currentState);
        } else {
            currentState.gameStatus.outs = newOuts;
        }
    };
    
    const handlePlaySelected = useCallback((jugada: Jugada) => {
        setIsPlayModalOpen(false);
        if (!currentPartido || !currentPlayerForPlay) return;

        updateCurrentPartidoAndHistory(prev => {
            const newState: PartidoData = JSON.parse(JSON.stringify(prev));
            const originalHalfInning = prev.gameStatus.currentHalfInning;
            const originalInningNumber = prev.gameStatus.actualInningNumber;

            const inningOfPlay = prev.gameStatus.actualInningNumber;
            const halfInningOfPlay = prev.gameStatus.currentHalfInning;
            const outsBeforePlay = prev.gameStatus.outs;
            const currentLineupKey = newState.gameStatus.currentHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
            const batter = newState[currentLineupKey].find((p: LineupPlayer) => p.id === currentPlayerForPlay.id);
            
            if (!batter) return prev;

            const nextBatterId = findNextBatterInLineup(newState[currentLineupKey], batter.id);
            const nextBatterIdForTeamKey = newState.gameStatus.currentHalfInning === 'Top' ? 'nextVisitorBatterLineupPlayerId' : 'nextLocalBatterLineupPlayerId';
            newState.gameStatus[nextBatterIdForTeamKey] = nextBatterId;
            
            const basesBeforePlay: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = JSON.parse(JSON.stringify(prev.gameStatus.bases));
            const playInstanceId = generateUUID();
            
            const handleSimpleOut = (outJugada: Jugada) => {
                _calculateOutsUpdate(newState, 1, outJugada, batter);
                const playCell = _createPlayInInningCell(outJugada, 0, playInstanceId);
                _addPlayToLineupCell(newState[currentLineupKey], batter.id, inningOfPlay, playCell);
                _recordPlayInLog(newState, outJugada, batter, 0, 0, undefined, basesBeforePlay, outsBeforePlay, playInstanceId, inningOfPlay, halfInningOfPlay);
            };

            const runnersOnBaseCount = basesBeforePlay.filter(p => p !== null).length;

            switch (jugada.category) {
                case PlayCategory.OUT:
                    if (['K', 'GO', 'FO', 'LO'].includes(jugada.jugada)) {
                        handleSimpleOut(jugada);
                    } else if (jugada.jugada === 'DP' || jugada.jugada === 'TP') {
                        const teamName = newState.gameStatus.currentHalfInning === 'Top' ? newState.nombreEquipoVisitante : newState.nombreEquipoLocal;
                        if (jugada.jugada === 'DP') {
                            if (outsBeforePlay >= 2) {
                                addToast("Doble Play no es posible con 2 outs.", 'warning');
                                return prev;
                            }
                            if (runnersOnBaseCount < 1) {
                                addToast("Doble Play requiere al menos un corredor en base.", 'warning');
                                return prev;
                            }
                            const playersInvolved = [
                                { id: batter.id, name: batter.nombreJugador, isOnBase: false },
                                ...basesBeforePlay.map((p, i) => p ? { id: p.lineupPlayerId, name: p.nombreJugador, isOnBase: true, baseNumber: i + 1 as 1|2|3 } : null).filter(Boolean) as PlayerInfoForOutSelection[]
                            ];
                            setDoublePlayModalState({ isOpen: true, playersInvolved, initialOuts: outsBeforePlay, teamName });
                            return prev;
                        }

                        if (jugada.jugada === 'TP') {
                            if (outsBeforePlay > 0) {
                                addToast("Triple Play solo es posible sin outs.", 'warning');
                                return prev;
                            }
                            if (runnersOnBaseCount < 2) {
                                addToast("Triple Play requiere al menos dos corredores en base.", 'warning');
                                return prev;
                            }
                            const playersInvolved = [
                                { id: batter.id, name: batter.nombreJugador, isOnBase: false },
                                ...basesBeforePlay.map((p, i) => p ? { id: p.lineupPlayerId, name: p.nombreJugador, isOnBase: true, baseNumber: i + 1 as 1|2|3 } : null).filter(Boolean) as PlayerInfoForOutSelection[]
                            ];
                            setPlayersForComplexOutModal(playersInvolved);
                            setIsTriplePlayModalOpen(true);
                            return prev;
                        }
                    } else if (jugada.jugada === 'SF' || jugada.jugada === 'SH') {
                        if (jugada.jugada === 'SF') {
                            if (outsBeforePlay >= 2) {
                                addToast("Fly de Sacrificio no es posible con 2 outs.", 'warning');
                                return prev;
                            }
                            if (!basesBeforePlay[2]) { // No runner on 3rd
                                addToast("Fly de Sacrificio requiere un corredor en 3ra base.", 'warning');
                                return prev;
                            }
                        }
                        const runnersOnBase = basesBeforePlay.map((p, i) => p ? { ...p, currentBase: i + 1 as 1 | 2 | 3 } : null).filter(Boolean) as RunnerAdvancementInfo[];
                        setRunnerAdvancementAfterSacrificeModalState({ isOpen: true, batter, sacrificeType: jugada.jugada, runnersOnBase, advancements: {}, initialOuts: prev.gameStatus.outs });
                        return prev;
                    }
                    break;
                
                case PlayCategory.ON_BASE:
                    if (jugada.jugada === 'BB' || jugada.jugada === 'IBB' || jugada.jugada === 'HBP') {
                         const batterIndex = newState[currentLineupKey].findIndex((p: LineupPlayer) => p.id === batter.id);
                         if (batterIndex !== -1) {
                            const stats = newState[currentLineupKey][batterIndex].stats;
                            stats.walks += 1;
                            stats.plateAppearances += 1;
                         }
                        
                         const newBases = [...basesBeforePlay] as [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null];
                         const newBatterOnBase: PlayerOnBase = { lineupPlayerId: batter.id, jugadorId: batter.jugadorId, nombreJugador: batter.nombreJugador, reachedOnJugadaId: jugada.jugada, reachedOnPlayInstanceId: playInstanceId };
                         let runnerPushedFrom3B: PlayerOnBase | null = null;
                         
                         if (newBases[0] && newBases[1] && newBases[2]) {
                            runnerPushedFrom3B = newBases[2]; newBases[2] = newBases[1]; newBases[1] = newBases[0]; newBases[0] = newBatterOnBase;
                         } else if (newBases[0] && newBases[1]) {
                            newBases[2] = newBases[1]; newBases[1] = newBases[0]; newBases[0] = newBatterOnBase;
                         } else if (newBases[0]) {
                            newBases[1] = newBases[0]; newBases[0] = newBatterOnBase;
                         } else {
                            newBases[0] = newBatterOnBase;
                         }
                         newState.gameStatus.bases = newBases;

                         _recordPlayInLog(newState, jugada, batter, 0, 0, undefined, basesBeforePlay, outsBeforePlay, playInstanceId, inningOfPlay, halfInningOfPlay);
                         let rbiForDisplay = 0;
                         if (runnerPushedFrom3B) {
                            rbiForDisplay = 1;
                            _applySingleRunScoringLogic(newState, runnerPushedFrom3B, batter.id, playInstanceId, inningOfPlay, halfInningOfPlay);
                         }
                         const playCell = _createPlayInInningCell(jugada, rbiForDisplay, playInstanceId);
                         _addPlayToLineupCell(newState[currentLineupKey], batter.id, inningOfPlay, playCell);
                         

                    } else if (jugada.jugada === 'E') {
                        setErrorModalContext({ batterLineupPlayer: batter, initialBasesBeforePlay: basesBeforePlay });
                        setIsErrorModalOpen(true);
                        return prev;
                    } else if (jugada.jugada === 'FC') {
                        if (outsBeforePlay >= 2) {
                            addToast("Fielder's Choice no es posible con 2 outs.", 'warning');
                            return prev;
                        }
                        if (runnersOnBaseCount < 1) {
                            addToast("Fielder's Choice requiere al menos un corredor en base.", 'warning');
                            return prev;
                        }
                        const runnersOnBaseInfo = basesBeforePlay.map((p, i) => p ? { ...p, currentBase: i + 1 as 1 | 2 | 3 } : null).filter(Boolean) as RunnerAdvancementInfo[];
                        setFielderChoiceModalState({
                            isOpen: true,
                            batter,
                            runnersOnBase: runnersOnBaseInfo,
                            initialOuts: prev.gameStatus.outs,
                            jugada: jugada
                        });
                        return prev; // Stop processing, wait for modal
                    }
                    break;

                case PlayCategory.HIT:
                    if (['H1', 'H2', 'H3', 'HR'].includes(jugada.jugada)) {
                        const hitType = jugada.jugada as 'H1' | 'H2' | 'H3' | 'HR';
                        
                        if (hitType === 'HR') {
                            const runnersOnBase = basesBeforePlay.filter(Boolean) as PlayerOnBase[];
                            const totalRunsFromPlay = runnersOnBase.length + 1;
                            
                            _recordPlayInLog(newState, jugada, batter, 0, 0, undefined, basesBeforePlay, outsBeforePlay, playInstanceId, inningOfPlay, halfInningOfPlay);

                            // Apply scoring logic for each runner on base
                            runnersOnBase.forEach(runner => {
                                _applySingleRunScoringLogic(newState, runner, batter.id, playInstanceId, inningOfPlay, halfInningOfPlay);
                            });

                            // Apply scoring logic for the batter
                            _applySingleRunScoringLogic(newState, batter, batter.id, playInstanceId, inningOfPlay, halfInningOfPlay);
                            
                            // Update batter's specific stats (AB, H, HR etc.)
                            const batterIndex = newState[currentLineupKey].findIndex((p: LineupPlayer) => p.id === batter.id);
                            if (batterIndex !== -1) {
                                const stats = newState[currentLineupKey][batterIndex].stats;
                                stats.atBats += 1;
                                stats.plateAppearances += 1;
                                stats.hits += 1;
                                stats.homeRuns += 1;
                            }

                            newState.gameStatus.bases = [null, null, null];

                            const teamStatsKey = newState.gameStatus.currentHalfInning === 'Top' ? 'visitanteStats' : 'localStats';
                            newState[teamStatsKey].hits += 1;
                            newState[teamStatsKey].homeRuns += 1;

                            const playCell = _createPlayInInningCell(jugada, totalRunsFromPlay, playInstanceId);
                            _addPlayToLineupCell(newState[currentLineupKey], batter.id, inningOfPlay, playCell);

                        } else { // Handle H1, H2, H3
                            const batterReachedBase = hitType === 'H1' ? 1 : hitType === 'H2' ? 2 : 3;
                            const runnersOnBaseInfo = basesBeforePlay.map((p, i) => p ? { ...p, currentBase: i + 1 as 1 | 2 | 3 } : null).filter(Boolean) as RunnerAdvancementInfo[];
        
                            if (runnersOnBaseInfo.length === 0) {
                                // Logic for H1, H2, H3 with bases empty
                                const newBases: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [null, null, null];
                                newBases[batterReachedBase - 1] = { lineupPlayerId: batter.id, jugadorId: batter.jugadorId, nombreJugador: batter.nombreJugador, reachedOnJugadaId: hitType, reachedOnPlayInstanceId: playInstanceId };
                                newState.gameStatus.bases = newBases;
        
                                const batterIndex = newState[currentLineupKey].findIndex((p: LineupPlayer) => p.id === batter.id);
                                if(batterIndex !== -1) {
                                    const stats = newState[currentLineupKey][batterIndex].stats;
                                    stats.atBats += 1; stats.plateAppearances += 1; stats.hits += 1;
                                    if (hitType === 'H1') stats.singles += 1;
                                    else if (hitType === 'H2') stats.doubles += 1;
                                    else if (hitType === 'H3') stats.triples += 1;
                                }
        
                                const teamStatsKey = newState.gameStatus.currentHalfInning === 'Top' ? 'visitanteStats' : 'localStats';
                                newState[teamStatsKey].hits += 1;
        
                                const playCell = _createPlayInInningCell(jugada, 0, playInstanceId);
                                _addPlayToLineupCell(newState[currentLineupKey], batter.id, inningOfPlay, playCell);
                                _recordPlayInLog(newState, jugada, batter, 0, 0, undefined, basesBeforePlay, outsBeforePlay, playInstanceId, inningOfPlay, halfInningOfPlay);
                            } else {
                                // Runners are on base, open the modal for H1, H2, H3
                                setRunnerAdvancementAfterHitModalState({ isOpen: true, batter: batter, hitType: hitType, batterReachedBase: batterReachedBase, runnersOnBase: runnersOnBaseInfo, advancements: {} });
                                return prev;
                            }
                        }
                    }
                    break;
                default: break;
            }

            if (newState.gameStatus.currentHalfInning === originalHalfInning && newState.gameStatus.actualInningNumber === originalInningNumber) {
                newState.gameStatus.currentBatterLineupPlayerId = nextBatterId;
            }

            return newState;
        });
    }, [currentPartido, currentPlayerForPlay, updateCurrentPartidoAndHistory, _getJugadaById, addToast]);

    const handleConfirmRunnerAdvancementsFromHitModal = useCallback((advancements: { [lineupPlayerId: string]: number }, batter: LineupPlayer, hitType: 'H1' | 'H2' | 'H3', batterFinalDestBase: 1 | 2 | 3 | 4) => {
        updateCurrentPartidoAndHistory(prev => {
            const newState: PartidoData = JSON.parse(JSON.stringify(prev));
            const originalHalfInning = prev.gameStatus.currentHalfInning;
            const originalInningNumber = prev.gameStatus.actualInningNumber;
            const currentLineupKey = originalHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
            
            const inningOfPlay = prev.gameStatus.actualInningNumber;
            const halfInningOfPlay = prev.gameStatus.currentHalfInning;
            const outsBeforePlay = prev.gameStatus.outs;
            const basesBeforePlay = prev.gameStatus.bases;
            const jugada = _getJugadaById(hitType)!;
            const playInstanceId = generateUUID();
            let rbiForDisplay = 0;
    
            // --- 1. Calculate all outs from this play first ---
            const runnersOut = Object.entries(advancements).filter(([_, dest]) => dest === 0);
            if (runnersOut.length > 0) {
                const outRunnerBaseJugada = _getJugadaById('OUT_RUNNER_BASE')!;
                _calculateOutsUpdate(newState, runnersOut.length, outRunnerBaseJugada, null);
                
                // Log each runner out individually
                runnersOut.forEach(([runnerId], index) => {
                    const runnerInfo = newState[currentLineupKey].find((p: LineupPlayer) => p.id === runnerId);
                    if (runnerInfo) {
                        _recordPlayInLog(newState, outRunnerBaseJugada, runnerInfo, 0, 0, undefined, basesBeforePlay, outsBeforePlay, playInstanceId + `-RO${index}`, inningOfPlay, halfInningOfPlay);
                    }
                });
            }
    
            const inningDidAdvance = newState.gameStatus.currentHalfInning !== originalHalfInning || newState.gameStatus.actualInningNumber !== originalInningNumber;
    
            // --- 2. Log the primary Hit play ---
            _recordPlayInLog(newState, jugada, batter, 0, 0, undefined, basesBeforePlay, outsBeforePlay, playInstanceId, inningOfPlay, halfInningOfPlay);
    
            // --- 3. Process advancements, scoring, and stats (only if inning is not over) ---
            if (!inningDidAdvance) {
                const newBases: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [null, null, null];
                
                // Handle runners
                Object.keys(advancements).forEach(runnerId => {
                    const runner = (basesBeforePlay as (PlayerOnBase|null)[]).flat().find((p: PlayerOnBase|null) => p && p.lineupPlayerId === runnerId);
                    const targetBase = advancements[runnerId];
                    if (!runner || targetBase === 0) return; // Skip runners put out
        
                    if (targetBase === 4) { // Scored
                        rbiForDisplay++; 
                        _applySingleRunScoringLogic(newState, runner, batter.id, playInstanceId, inningOfPlay, halfInningOfPlay);
                    } else if (targetBase >= 1 && targetBase <= 3) {
                        newBases[targetBase - 1] = runner;
                    }
                });
        
                // Handle batter
                if (batterFinalDestBase >= 1 && batterFinalDestBase <= 3) {
                    newBases[batterFinalDestBase - 1] = { lineupPlayerId: batter.id, jugadorId: batter.jugadorId, nombreJugador: batter.nombreJugador, reachedOnJugadaId: hitType, reachedOnPlayInstanceId: playInstanceId };
                }
        
                newState.gameStatus.bases = newBases;
            }
            
            // Update batter's stats for the hit (happens regardless of inning ending)
            const batterIndex = newState[currentLineupKey].findIndex((p: LineupPlayer) => p.id === batter.id);
            if(batterIndex !== -1) {
                const stats = newState[currentLineupKey][batterIndex].stats;
                stats.atBats += 1; stats.plateAppearances += 1; stats.hits += 1;
                if (hitType === 'H1') stats.singles += 1;
                else if (hitType === 'H2') stats.doubles += 1;
                else if (hitType === 'H3') stats.triples += 1;
            }
            
            // Update team's stats for the hit (happens regardless of inning ending)
            const teamStatsKey = halfInningOfPlay === 'Top' ? 'visitanteStats' : 'localStats';
            newState[teamStatsKey].hits += 1;
    
            // --- 4. Finalize UI elements and next batter ---
            const playCell = _createPlayInInningCell(jugada, rbiForDisplay, playInstanceId);
            _addPlayToLineupCell(newState[currentLineupKey], batter.id, inningOfPlay, playCell);
            
            if (!inningDidAdvance) {
                const nextBatterId = findNextBatterInLineup(newState[currentLineupKey], batter.id);
                const nextBatterIdForTeamKey = originalHalfInning === 'Top' ? 'nextVisitorBatterLineupPlayerId' : 'nextLocalBatterLineupPlayerId';
                newState.gameStatus[nextBatterIdForTeamKey] = nextBatterId;
                newState.gameStatus.currentBatterLineupPlayerId = nextBatterId;
            }
    
            return newState;
        });
        setRunnerAdvancementAfterHitModalState({ isOpen: false, batter: null, hitType: null, batterReachedBase: 1, runnersOnBase: [], advancements: {} });
    }, [_getJugadaById, updateCurrentPartidoAndHistory]);
    
    const handleConfirmRunnerAdvancementsFromSacrificeModal = useCallback((advancements: { [lineupPlayerId: string]: number }, batter: LineupPlayer, sacrificeType: 'SF' | 'SH', initialOuts: number) => {
        updateCurrentPartidoAndHistory(prev => {
            const newState: PartidoData = JSON.parse(JSON.stringify(prev));
            const originalHalfInning = prev.gameStatus.currentHalfInning;
            const originalInningNumber = prev.gameStatus.actualInningNumber;
            const currentLineupKey = originalHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
            
            const nextBatterId = findNextBatterInLineup(newState[currentLineupKey], batter.id);
            const nextBatterIdForTeamKey = originalHalfInning === 'Top' ? 'nextVisitorBatterLineupPlayerId' : 'nextLocalBatterLineupPlayerId';
            newState.gameStatus[nextBatterIdForTeamKey] = nextBatterId;
            
            const inningOfPlay = prev.gameStatus.actualInningNumber;
            const halfInningOfPlay = prev.gameStatus.currentHalfInning;
            const basesBeforePlay = prev.gameStatus.bases;
            const jugada = _getJugadaById(sacrificeType)!;
            const playInstanceId = generateUUID();
            let rbiForDisplay = 0;
    
            // --- 1. Calculate ALL outs first ---
            // The batter is out
            _calculateOutsUpdate(newState, 1, jugada, batter);
            // Any runners put out
            const runnersOut = Object.entries(advancements).filter(([_, dest]) => dest === 0);
            if (runnersOut.length > 0) {
                const outRunnerBaseJugada = _getJugadaById('OUT_RUNNER_BASE')!;
                _calculateOutsUpdate(newState, runnersOut.length, outRunnerBaseJugada, null);
                // Log each runner out individually
                runnersOut.forEach(([runnerId], index) => {
                    const runnerInfo = newState[currentLineupKey].find((p: LineupPlayer) => p.id === runnerId);
                    if (runnerInfo) {
                        _recordPlayInLog(newState, outRunnerBaseJugada, runnerInfo, 0, 0, undefined, basesBeforePlay, initialOuts, playInstanceId + `-RO${index}`, inningOfPlay, halfInningOfPlay);
                    }
                });
            }
    
            // --- 2. Log the primary sacrifice play ---
            _recordPlayInLog(newState, jugada, batter, 0, 0, undefined, basesBeforePlay, initialOuts, playInstanceId, inningOfPlay, halfInningOfPlay);
    
            // --- 3. Process advancements and scoring ---
            const newBases: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [null, null, null];
            Object.keys(advancements).forEach(runnerId => {
                const runner = (basesBeforePlay as (PlayerOnBase | null)[]).flat().find(p => p && p.lineupPlayerId === runnerId);
                const targetBase = advancements[runnerId];
                if (!runner || targetBase === 0) return;
    
                if (targetBase === 4) { // Scored
                    rbiForDisplay++;
                    _applySingleRunScoringLogic(newState, runner, batter.id, playInstanceId, inningOfPlay, halfInningOfPlay);
                } else if (targetBase >= 1 && targetBase <= 3) {
                    newBases[targetBase - 1] = runner;
                }
            });
    
            newState.gameStatus.bases = newBases;
    
            // --- 4. Finalize UI elements and next batter ---
            const playCell = _createPlayInInningCell(jugada, rbiForDisplay, playInstanceId);
            _addPlayToLineupCell(newState[currentLineupKey], batter.id, inningOfPlay, playCell);
    
            if (newState.gameStatus.currentHalfInning === originalHalfInning && newState.gameStatus.actualInningNumber === originalInningNumber) {
                newState.gameStatus.currentBatterLineupPlayerId = nextBatterId;
            }
                
            return newState;
        });
        setRunnerAdvancementAfterSacrificeModalState({ isOpen: false, batter: null, sacrificeType: null, runnersOnBase: [], advancements: {}, initialOuts: 0 });
    }, [_getJugadaById, updateCurrentPartidoAndHistory]);

    const handleConfirmRbiAssignment = useCallback((rbiCreditedToPlayerId: string | null) => {
        if (!assignRbiModalState.scoringPlayerInfo) return;
        const scoringPlayer = assignRbiModalState.scoringPlayerInfo;
        const playInstanceId = scoringPlayer.reachedOnPlayInstanceId || generateUUID();

        updateCurrentPartidoAndHistory(prev => {
            const newState = JSON.parse(JSON.stringify(prev));
            const inningOfPlay = prev.gameStatus.actualInningNumber;
            const halfInningOfPlay = prev.gameStatus.currentHalfInning;
            _applySingleRunScoringLogic(newState, scoringPlayer, rbiCreditedToPlayerId, playInstanceId, inningOfPlay, halfInningOfPlay);
            return newState;
        });
        setAssignRbiModalState({ isOpen: false, scoringPlayerInfo: null, batterForRbiContext: null, previousBatterForRbiContext: null });
    }, [assignRbiModalState.scoringPlayerInfo, updateCurrentPartidoAndHistory]);

    const handleErrorAdvancementConfirm = useCallback((baseReached: 0 | 1 | 2 | 3, errorPlayerId: number | null) => {
        if (!errorModalContext) return;
        const { batterLineupPlayer, initialBasesBeforePlay } = errorModalContext;
        const errorJugada = _getJugadaById('E')!;
    
        // If there are runners on base, open the dedicated advancement modal.
        if (initialBasesBeforePlay.some(p => p !== null)) {
            const runnersOnBaseInfo = initialBasesBeforePlay
                .map((p, i) => p ? { ...p, currentBase: i + 1 as 1 | 2 | 3 } : null)
                .filter(Boolean) as RunnerAdvancementInfo[];
            
            setRunnerAdvancementAfterErrorModalState({
                isOpen: true,
                batterWhoReachedOnError: batterLineupPlayer,
                batterFinalDestBaseOnError: baseReached,
                runnersOnBaseAtTimeOfError: runnersOnBaseInfo,
                fielderWhoCommittedError: errorPlayerId,
                advancements: {}
            });
        } else {
             // If no runners on base, handle it directly.
             updateCurrentPartidoAndHistory(prev => {
                const newState: PartidoData = JSON.parse(JSON.stringify(prev));
                const originalHalfInning = prev.gameStatus.currentHalfInning;
                const originalInningNumber = prev.gameStatus.actualInningNumber;
                const currentLineupKey = originalHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';

                const nextBatterId = findNextBatterInLineup(newState[currentLineupKey], batterLineupPlayer.id);
                const nextBatterIdKey = originalHalfInning === 'Top' ? 'nextVisitorBatterLineupPlayerId' : 'nextLocalBatterLineupPlayerId';
                newState.gameStatus[nextBatterIdKey] = nextBatterId;

                const inningOfPlay = prev.gameStatus.actualInningNumber;
                const halfInningOfPlay = prev.gameStatus.currentHalfInning;
                const outsBeforePlay = prev.gameStatus.outs;
                const playInstanceId = generateUUID();
                const teamStatsKey = newState.gameStatus.currentHalfInning === 'Top' ? 'localStats' : 'visitanteStats';

                const batterIndex = newState[currentLineupKey].findIndex(p => p.id === batterLineupPlayer.id);
                if (batterIndex !== -1) {
                    newState[currentLineupKey][batterIndex].stats.atBats += 1;
                    newState[currentLineupKey][batterIndex].stats.plateAppearances += 1;
                }
                
                newState[teamStatsKey].errors += 1;

                _recordPlayInLog(newState, errorJugada, batterLineupPlayer, 0, 0, undefined, initialBasesBeforePlay, outsBeforePlay, playInstanceId, inningOfPlay, halfInningOfPlay);
                if (errorPlayerId !== null) {
                    _logDefensiveError(newState, errorPlayerId, inningOfPlay, halfInningOfPlay, playInstanceId);
                }

                const newBases: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [null, null, null];
                if (baseReached === 3) {
                    _applySingleRunScoringLogic(newState, batterLineupPlayer, null, playInstanceId, inningOfPlay, halfInningOfPlay);
                } else { // 0, 1, 2 map to bases 1, 2, 3
                    newBases[baseReached] = { lineupPlayerId: batterLineupPlayer.id, jugadorId: batterLineupPlayer.jugadorId, nombreJugador: batterLineupPlayer.nombreJugador, reachedOnPlayInstanceId: playInstanceId, reachedOnJugadaId: 'E' };
                }
                newState.gameStatus.bases = newBases;

                const playCell = _createPlayInInningCell(errorJugada, 0, playInstanceId);
                _addPlayToLineupCell(newState[currentLineupKey], batterLineupPlayer.id, inningOfPlay, playCell);
                
                if (newState.gameStatus.currentHalfInning === originalHalfInning && newState.gameStatus.actualInningNumber === originalInningNumber) {
                    newState.gameStatus.currentBatterLineupPlayerId = nextBatterId;
                }

                return newState;
             });
        }
        setIsErrorModalOpen(false);
        setErrorModalContext(null);
    }, [errorModalContext, updateCurrentPartidoAndHistory, _getJugadaById]);
    
    // Function to handle the result from RunnerAdvancementAfterErrorModal
    const handleConfirmRunnerAdvancementsFromErrorModal = useCallback((advancements: { [lineupPlayerId: string]: number }, originalFielderErrorId: number | null, batterAtPlay: LineupPlayer, batterDestBase: 0 | 1 | 2 | 3) => {
        updateCurrentPartidoAndHistory(prev => {
            const newState: PartidoData = JSON.parse(JSON.stringify(prev));
            const originalHalfInning = prev.gameStatus.currentHalfInning;
            const originalInningNumber = prev.gameStatus.actualInningNumber;
            const currentLineupKey = originalHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
            
            const nextBatterId = findNextBatterInLineup(newState[currentLineupKey], batterAtPlay.id);
            const nextBatterIdKey = originalHalfInning === 'Top' ? 'nextVisitorBatterLineupPlayerId' : 'nextLocalBatterLineupPlayerId';
            newState.gameStatus[nextBatterIdKey] = nextBatterId;

            const inningOfPlay = prev.gameStatus.actualInningNumber;
            const halfInningOfPlay = prev.gameStatus.currentHalfInning;
            const outsBeforePlay = prev.gameStatus.outs;
            const basesBeforePlay = prev.gameStatus.bases;
            const errorJugada = _getJugadaById('E')!;
            const outRunnerBaseJugada = _getJugadaById('OUT_RUNNER_BASE')!;
            const playInstanceId = generateUUID();
            const defensiveTeamStatsKey = newState.gameStatus.currentHalfInning === 'Top' ? 'localStats' : 'visitanteStats';

            // 1. Calculate and apply outs
            const runnersOut = Object.entries(advancements).filter(([_, dest]) => dest === 0);
            if (runnersOut.length > 0) {
                _calculateOutsUpdate(newState, runnersOut.length, outRunnerBaseJugada, null);
                // Log each runner out individually
                runnersOut.forEach(([runnerId], index) => {
                    const runnerInfo = newState[currentLineupKey].find((p: LineupPlayer) => p.id === runnerId);
                    if (runnerInfo) {
                        _recordPlayInLog(newState, outRunnerBaseJugada, runnerInfo, 0, 0, undefined, basesBeforePlay, outsBeforePlay, playInstanceId + `-RO${index}`, inningOfPlay, halfInningOfPlay);
                    }
                });
            }

            // 2. Log primary error event
            newState[defensiveTeamStatsKey].errors += 1;
            const batterIndex = newState[currentLineupKey].findIndex(p => p.id === batterAtPlay.id);
            if (batterIndex !== -1) {
                newState[currentLineupKey][batterIndex].stats.atBats += 1;
                newState[currentLineupKey][batterIndex].stats.plateAppearances += 1;
            }
            _recordPlayInLog(newState, errorJugada, batterAtPlay, 0, 0, undefined, basesBeforePlay, outsBeforePlay, playInstanceId, inningOfPlay, halfInningOfPlay);
            if (originalFielderErrorId !== null) {
                _logDefensiveError(newState, originalFielderErrorId, inningOfPlay, halfInningOfPlay, playInstanceId);
            }
            const playCell = _createPlayInInningCell(errorJugada, 0, playInstanceId);
            _addPlayToLineupCell(newState[currentLineupKey], batterAtPlay.id, inningOfPlay, playCell);

            // 3. Process advancements and scoring
            const newBases: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [null, null, null];
            
            // Runners
            Object.entries(advancements).forEach(([runnerId, destBase]) => {
                const runner = basesBeforePlay.flat().find(p => p?.lineupPlayerId === runnerId);
                if (!runner || destBase === 0) return;
                
                if (destBase === 4) { // Score
                    _applySingleRunScoringLogic(newState, runner, null, playInstanceId, inningOfPlay, halfInningOfPlay);
                } else if (destBase >= 1 && destBase <= 3) {
                    newBases[destBase - 1] = runner;
                }
            });

            // Batter
            if (batterDestBase === 3) { // Batter scored on the error
                _applySingleRunScoringLogic(newState, batterAtPlay, null, playInstanceId, inningOfPlay, halfInningOfPlay);
            } else if (batterDestBase >= 0 && batterDestBase <= 2) { // Batter reached base 1, 2, or 3
                newBases[batterDestBase] = { lineupPlayerId: batterAtPlay.id, jugadorId: batterAtPlay.jugadorId, nombreJugador: batterAtPlay.nombreJugador, reachedOnPlayInstanceId: playInstanceId, reachedOnJugadaId: 'E' };
            }

            newState.gameStatus.bases = newBases;

            // 4. Set next batter
            if (newState.gameStatus.currentHalfInning === originalHalfInning && newState.gameStatus.actualInningNumber === originalInningNumber) {
                newState.gameStatus.currentBatterLineupPlayerId = nextBatterId;
            }

            return newState;
        });
        setRunnerAdvancementAfterErrorModalState({ isOpen: false, batterWhoReachedOnError: null, batterFinalDestBaseOnError: 0, runnersOnBaseAtTimeOfError: [], fielderWhoCommittedError: null, advancements: {} });
    }, [updateCurrentPartidoAndHistory, _getJugadaById]);
    
    // This is for manual runner actions from the diamond
    const handleRunnerAction = useCallback((action: 'scoreWithSpecificReason' | 'advanceTo2B' | 'advanceTo3BFrom2B' | 'advanceTo3BFrom1B' | 'outRunner') => {
        setIsRunnerActionModalOpen(false);
        if (!managingRunner) return;
    
        const { player, baseIndex } = managingRunner;
    
        if (action === 'outRunner') {
            setIsRunnerOutSpecificReasonModalOpen(true);
            return;
        }
    
        let baseAdvancedTo = 0;
        if (action === 'scoreWithSpecificReason') baseAdvancedTo = 3;
        if (action === 'advanceTo2B') baseAdvancedTo = 1; // 1B -> 2B (0-indexed)
        if (action === 'advanceTo3BFrom2B') baseAdvancedTo = 2; // 2B -> 3B
        if (action === 'advanceTo3BFrom1B') baseAdvancedTo = 2; // 1B -> 3B

        const isScoring = baseAdvancedTo === 3;
        setRunnerAdvancementContext({
            runner: player,
            baseIndexAdvancedTo: baseAdvancedTo,
            isScoringAttempt: isScoring,
        });
        setIsRunnerAdvancementReasonModalOpen(true);
    }, [managingRunner]);

    const handleRunnerAdvancementReasonConfirm = useCallback((reason: RunnerAdvancementReason | string, errorPlayerId?: number | null) => {
        setIsRunnerAdvancementReasonModalOpen(false);
        if (!runnerAdvancementContext) return;
        const { runner, baseIndexAdvancedTo } = runnerAdvancementContext;

        const jugadaIdToFind = reason === RunnerAdvancementReason.OTHER ? 'ADV_OTRO' : String(reason);
        const advJugada = _getJugadaById(jugadaIdToFind);
        if (!advJugada) {
            console.error(`Jugada for reason ${reason} (mapped to ${jugadaIdToFind}) not found.`);
            return;
        }

        updateCurrentPartidoAndHistory(prev => {
            const newState = JSON.parse(JSON.stringify(prev));
            const inningOfPlay = prev.gameStatus.actualInningNumber;
            const halfInningOfPlay = prev.gameStatus.currentHalfInning;
            const baseIndexFrom = (prev.gameStatus.bases as (PlayerOnBase|null)[]).findIndex(p => p && p.lineupPlayerId === runner.lineupPlayerId);
            if (baseIndexFrom === -1) return prev; // Runner not found

            const outsBeforePlay = prev.gameStatus.outs;
            const basesBeforePlay = prev.gameStatus.bases;
            const playInstanceId = generateUUID();
            const currentLineupKey = newState.gameStatus.currentHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
            
            _recordPlayInLog(newState, advJugada, runner, 0, 0, undefined, basesBeforePlay, outsBeforePlay, playInstanceId, inningOfPlay, halfInningOfPlay);
            
            if (reason === RunnerAdvancementReason.ERROR_ADVANCE) {
                const defensiveTeamStatsKey = newState.gameStatus.currentHalfInning === 'Top' ? 'localStats' : 'visitanteStats';
                newState[defensiveTeamStatsKey].errors += 1;
                if (errorPlayerId !== null) {
                    _logDefensiveError(newState, errorPlayerId, inningOfPlay, halfInningOfPlay, playInstanceId);
                }
            }

            newState.gameStatus.bases[baseIndexFrom] = null; // Vacate previous base

            if (baseIndexAdvancedTo < 3) { // Advanced to 1B, 2B, or 3B
                newState.gameStatus.bases[baseIndexAdvancedTo] = runner;
            } else { // Scored
                 _applySingleRunScoringLogic(newState, runner, null, playInstanceId, inningOfPlay, halfInningOfPlay);
            }
            
            _addAdvancementMarkerToLineup(newState[currentLineupKey], runner.lineupPlayerId, inningOfPlay, playInstanceId, advJugada);
            return newState;
        });
        setRunnerAdvancementContext(null);

    }, [runnerAdvancementContext, updateCurrentPartidoAndHistory, _getJugadaById]);
    
    const handleRunnerOutSpecificReasonConfirm = useCallback((outReason: RunnerOutReason) => {
        if (!managingRunner) return;
        
        const jugadaId = outReason === 'CS' ? 'CS' : (outReason === 'PK' ? 'PK' : 'OUT_RUNNER_BASE');
        const jugada = _getJugadaById(jugadaId)!;
        const { player: runnerInfo, baseIndex } = managingRunner;

        updateCurrentPartidoAndHistory(prev => {
            const newState = JSON.parse(JSON.stringify(prev));
            const inningOfPlay = prev.gameStatus.actualInningNumber;
            const halfInningOfPlay = prev.gameStatus.currentHalfInning;
            const outsBeforePlay = prev.gameStatus.outs;
            const basesBeforePlay = prev.gameStatus.bases;
            const playInstanceId = generateUUID();
            const currentLineupKey = newState.gameStatus.currentHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';

            _calculateOutsUpdate(newState, 1, jugada, null);
            _recordPlayInLog(newState, jugada, runnerInfo, 0, 0, undefined, basesBeforePlay, outsBeforePlay, playInstanceId, inningOfPlay, halfInningOfPlay);
            
            newState.gameStatus.bases[baseIndex] = null;

            _addPlayToLineupCell(newState[currentLineupKey], runnerInfo.lineupPlayerId, inningOfPlay, _createPlayInInningCell(jugada, 0, playInstanceId));
            
            return newState;
        });
        setManagingRunner(null);
        setIsRunnerOutSpecificReasonModalOpen(false);
    }, [managingRunner, updateCurrentPartidoAndHistory, _getJugadaById]);
    
    const requestDeleteRegistro = useCallback((registro: RegistroJuego) => {
        setConfirmActionModalProps({
            title: 'Eliminar Registro',
            message: `¿Está seguro de que desea eliminar permanentemente la jugada "${registro.descripcion}" de ${registro.bateadorNombre}? Esta acción es solo para corregir el log y no afectará las estadísticas ni el estado del juego.`,
            onConfirm: () => {
                updateCurrentPartidoAndHistory(prev => ({
                    ...prev,
                    registrosJuego: prev.registrosJuego.filter(r => r.id !== registro.id),
                }));
                addToast('Registro eliminado del log.', 'success');
                setIsConfirmActionModalOpen(false);
            },
            confirmButtonVariant: 'danger',
            confirmButtonText: 'Eliminar del Log'
        });
        setIsConfirmActionModalOpen(true);
    }, [updateCurrentPartidoAndHistory, addToast]);

    const handleOpenEditRegistroModal = useCallback((registro: RegistroJuego) => {
        setEditingRegistro(registro);
        setTempEditedPlayIdInModal(registro.jugadaId);
        setIsEditRegistroModalOpen(true);
    }, []);
    
    const handleCloseEditRegistroModal = useCallback(() => {
        setIsEditRegistroModalOpen(false);
        setEditingRegistro(null);
        setTempEditedPlayIdInModal('');
    }, []);

    const handleSaveEditedRegistro = useCallback((newJugadaForLog: Jugada) => {
        if (!editingRegistro) return;
        updateCurrentPartidoAndHistory(prev => ({
            ...prev,
            registrosJuego: prev.registrosJuego.map(r => 
                r.id === editingRegistro.id 
                ? { ...r, jugadaId: newJugadaForLog.jugada, descripcion: newJugadaForLog.descripcion, categoria: newJugadaForLog.category } 
                : r
            ),
        }));
        handleCloseEditRegistroModal();
        addToast('Texto del registro actualizado.', 'success');
    }, [editingRegistro, handleCloseEditRegistroModal, updateCurrentPartidoAndHistory, addToast]);
    
    const handleConfirmPlayerPositionChange = useCallback((newPosition: string) => {
        if (!editingPlayerForPosition || !currentPartido) return;
        const { player, team } = editingPlayerForPosition;
    
        const isNewPlayer = player.id.startsWith('transient-');
    
        if (newPosition !== 'BE' && newPosition !== EMPTY_POSICION_PLACEHOLDER && newPosition !== 'DH') {
            const lineupKey = team === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
            const currentLineup = currentPartido[lineupKey];
            const existingPlayerInPos = currentLineup.find(p => p.posicion === newPosition && p.id !== player.id);
            if (existingPlayerInPos) {
                setPositionConflictDetails({
                    conflictingPlayer: player,
                    existingPlayerInTargetPosition: existingPlayerInPos,
                    targetPosition: newPosition,
                    team: team,
                });
                setIsEditPlayerPositionModalOpen(false);
                setIsPositionConflictModalOpen(true);
                return;
            }
        }
    
        updateCurrentPartidoAndHistory(prev => {
            const newState = JSON.parse(JSON.stringify(prev));
            const lineupKey = team === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
            const lineupToUpdate = newState[lineupKey];
            const nextBatterKey = team === 'visitante' ? 'nextVisitorBatterLineupPlayerId' : 'nextLocalBatterLineupPlayerId';
    
            if (isNewPlayer) {
                const newPlayerEntry: LineupPlayer = {
                    ...player,
                    id: generateUUID(), // Assign real ID
                    posicion: newPosition,
                };
                lineupToUpdate.push(newPlayerEntry);
                addToast(`${player.nombreJugador} agregado al lineup en la posición ${newPosition}.`, 'success');
            } else {
                const playerIndex = lineupToUpdate.findIndex((p: LineupPlayer) => p.id === player.id);
                if (playerIndex !== -1) {
                    lineupToUpdate[playerIndex].posicion = newPosition;
                }
            }
            
            const { updatedLineup, newNextBatterForThisTeamId } = recalculateLineupOrder(lineupToUpdate, prev.gameStatus[nextBatterKey]);
            newState[lineupKey] = updatedLineup;
            newState.gameStatus[nextBatterKey] = newNextBatterForThisTeamId;
    
            return newState;
        });
    
        setIsEditPlayerPositionModalOpen(false);
        setEditingPlayerForPosition(null);
    }, [editingPlayerForPosition, currentPartido, updateCurrentPartidoAndHistory, addToast]);
    
    const handleResolvePositionConflict = useCallback((confirm: boolean) => {
        if (!positionConflictDetails) return;
        const { conflictingPlayer, existingPlayerInTargetPosition, targetPosition, team } = positionConflictDetails;
    
        if (confirm) {
            updateCurrentPartidoAndHistory(prev => {
                const newState = JSON.parse(JSON.stringify(prev));
                const lineupKey = team === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
                const lineupToUpdate = newState[lineupKey];
    
                const isNewPlayer = conflictingPlayer.id.startsWith('transient-');
    
                const existingPlayerIndex = lineupToUpdate.findIndex((p: LineupPlayer) => p.id === existingPlayerInTargetPosition.id);
    
                if (existingPlayerIndex > -1) {
                    const originalBattingOrder = lineupToUpdate[existingPlayerIndex].ordenBate;
                    lineupToUpdate[existingPlayerIndex].posicion = 'BE';
                    
                    if (isNewPlayer) {
                        const newPlayerEntry: LineupPlayer = {
                            ...conflictingPlayer,
                            id: generateUUID(),
                            posicion: targetPosition,
                            ordenBate: originalBattingOrder, // Inherit batting order
                        };
                        lineupToUpdate.push(newPlayerEntry);
                        addToast(`${conflictingPlayer.nombreJugador} agregado, ${existingPlayerInTargetPosition.nombreJugador} movido a la banca.`, 'success');
                    } else {
                        const conflictingPlayerIndex = lineupToUpdate.findIndex((p: LineupPlayer) => p.id === conflictingPlayer.id);
                        if (conflictingPlayerIndex > -1) {
                             lineupToUpdate[conflictingPlayerIndex].posicion = targetPosition;
                             lineupToUpdate[conflictingPlayerIndex].ordenBate = originalBattingOrder; // Inherit batting order
                        }
                    }
    
                    const nextBatterKey = team === 'visitante' ? 'nextVisitorBatterLineupPlayerId' : 'nextLocalBatterLineupPlayerId';
                    const { updatedLineup, newNextBatterForThisTeamId } = recalculateLineupOrder(lineupToUpdate, prev.gameStatus[nextBatterKey], existingPlayerInTargetPosition.id, conflictingPlayer.id);
                    
                    const currentBatter = prev.gameStatus.currentBatterLineupPlayerId;
                    if (currentBatter === existingPlayerInTargetPosition.id) {
                       newState.gameStatus.currentBatterLineupPlayerId = newNextBatterForThisTeamId;
                    }

                    newState[lineupKey] = updatedLineup;
                    newState.gameStatus[nextBatterKey] = newNextBatterForThisTeamId;
                }
                return newState;
            });
        }
    
        setIsPositionConflictModalOpen(false);
        setPositionConflictDetails(null);
        setEditingPlayerForPosition(null);
    }, [positionConflictDetails, updateCurrentPartidoAndHistory, addToast]);
    

    const handleRequestAddPlayerToLineup = useCallback((team: 'visitante' | 'local') => {
        setTeamToAddPlayerTo(team);
        setIsAddPlayerModalOpen(true);
    }, []);

    const handleConfirmAddPlayerToLineup = useCallback((jugadorId: number) => {
        if (!teamToAddPlayerTo) return;
        
        const playerDbData = jugadoresDB.find(p => p.codigo === jugadorId);
        if (!playerDbData) return;
    
        // Create a transient player object that is not yet in the main state's lineup
        const transientPlayer: LineupPlayer = {
            id: `transient-${generateUUID()}`, // Temporary ID to identify as new
            jugadorId: playerDbData.codigo,
            nombreJugador: playerDbData.nombre,
            posicion: EMPTY_POSICION_PLACEHOLDER, // Position will be chosen next
            ordenBate: 99, // Will be recalculated
            innings: {},
            stats: createEmptyBatterStats(),
        };
        
        // Close the AddPlayer modal and open the PositionSelection modal
        setIsAddPlayerModalOpen(false);
        setEditingPlayerForPosition({ player: transientPlayer, team: teamToAddPlayerTo });
        setIsEditPlayerPositionModalOpen(true);

    }, [teamToAddPlayerTo, jugadoresDB]);
    
    const handleRequestRemovePlayerFromLineup = useCallback((player: LineupPlayer, team: 'visitante' | 'local') => {
        if (gamePhase === 'ended') {
            addToast('No se pueden quitar jugadores de un partido finalizado.', 'warning');
            return;
        }

        setConfirmActionModalProps({
            title: 'Quitar Jugador del Lineup',
            message: `¿Está seguro que desea quitar a ${player.nombreJugador} del lineup? Esto es permanente para este partido.`,
            onConfirm: () => {
                updateCurrentPartidoAndHistory(prev => {
                    const newState = JSON.parse(JSON.stringify(prev));
                    const lineupKey = team === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
                    const lineupToUpdate = newState[lineupKey].filter((p: LineupPlayer) => p.id !== player.id);
                    
                    const nextBatterKey = team === 'visitante' ? 'nextVisitorBatterLineupPlayerId' : 'nextLocalBatterLineupPlayerId';
                    const { updatedLineup, newNextBatterForThisTeamId } = recalculateLineupOrder(lineupToUpdate, prev.gameStatus[nextBatterKey], player.id, null);
                    newState[lineupKey] = updatedLineup;
                    newState.gameStatus[nextBatterKey] = newNextBatterForThisTeamId;

                    // If the removed player was the current batter, advance to the new next batter
                    if (prev.gameStatus.currentBatterLineupPlayerId === player.id) {
                        newState.gameStatus.currentBatterLineupPlayerId = newNextBatterForThisTeamId;
                    }

                    return newState;
                });
                addToast(`${player.nombreJugador} quitado del lineup.`, 'success');
                setIsConfirmActionModalOpen(false);
            },
            confirmButtonVariant: 'danger',
            confirmButtonText: 'Quitar Jugador'
        });
        setIsConfirmActionModalOpen(true);
    }, [gamePhase, addToast, updateCurrentPartidoAndHistory]);
    
    const handleComplexPlayConfirm = useCallback((result: FielderChoiceResult, jugada: Jugada) => {
        const batterFromState = fielderChoiceModalState.batter;
        if (!batterFromState) {
            console.error("Complex play confirmed without a batter in state.");
            return;
        }

        updateCurrentPartidoAndHistory(prev => {
            const newState: PartidoData = JSON.parse(JSON.stringify(prev));
            const originalHalfInning = prev.gameStatus.currentHalfInning;
            const originalInningNumber = prev.gameStatus.actualInningNumber;
            const currentLineupKey = originalHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';

            const batter = batterFromState;
            const inningOfPlay = prev.gameStatus.actualInningNumber;
            const halfInningOfPlay = prev.gameStatus.currentHalfInning;
            const outsBeforePlay = prev.gameStatus.outs;
            const basesBeforePlay = prev.gameStatus.bases;
            const playInstanceId = generateUUID();

            const playersOut = new Set<string>();
            if (result.batterAdvancement === 0) playersOut.add(batter.id);
            Object.entries(result.runnerAdvancements).forEach(([id, dest]) => { if (dest === 0) playersOut.add(id); });
            const outsOnPlay = playersOut.size;
            const isBatterOut = result.batterAdvancement === 0;

            _calculateOutsUpdate(newState, outsOnPlay, jugada, isBatterOut ? batter : null);
            const inningDidAdvance = newState.gameStatus.currentHalfInning !== originalHalfInning || newState.gameStatus.actualInningNumber !== originalInningNumber;
            
            _recordPlayInLog(newState, jugada, batter, 0, 0, undefined, basesBeforePlay, outsBeforePlay, playInstanceId, inningOfPlay, halfInningOfPlay);
            
            const outRunnerBaseJugada = _getJugadaById('OUT_RUNNER_BASE');
            if (outRunnerBaseJugada) {
                Object.entries(result.runnerAdvancements).forEach(([runnerId, destBase], index) => {
                    if (destBase === 0) {
                        const runnerInfo = newState[currentLineupKey].find((p: LineupPlayer) => p.id === runnerId);
                        if (runnerInfo) {
                            _recordPlayInLog(newState, outRunnerBaseJugada, runnerInfo, 0, 0, undefined, basesBeforePlay, outsBeforePlay, playInstanceId + `-RO${index}`, inningOfPlay, halfInningOfPlay);
                        }
                    }
                });
            }
            
            const batterIndex = newState[currentLineupKey].findIndex((p: LineupPlayer) => p.id === batter.id);
            if (batterIndex > -1) {
                newState[currentLineupKey][batterIndex].stats.atBats += 1;
                newState[currentLineupKey][batterIndex].stats.plateAppearances += 1;
            }
            
            const playCell = _createPlayInInningCell(jugada, 0, playInstanceId);
            _addPlayToLineupCell(newState[currentLineupKey], batter.id, inningOfPlay, playCell);
            
            if (!inningDidAdvance) {
                const newBases: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [null, null, null];
                
                Object.entries(result.runnerAdvancements).forEach(([runnerId, destBase]) => {
                    const runner = basesBeforePlay.flat().find(p => p?.lineupPlayerId === runnerId);
                    if (!runner || destBase === 0) return;
                    
                    if (destBase === 4) {
                        const outOnPlay = result.primaryOutPlayerId ? result.primaryOutPlayerId !== runnerId : true;
                        const rbiPlayerId = outsOnPlay < 2 && outOnPlay ? batter.id : null;
                        _applySingleRunScoringLogic(newState, runner, rbiPlayerId, playInstanceId, inningOfPlay, halfInningOfPlay);
                    } else if (destBase >= 1 && destBase <= 3) {
                        newBases[destBase - 1] = runner;
                    }
                });
                
                if (result.batterAdvancement >= 1 && result.batterAdvancement <= 3) {
                    newBases[result.batterAdvancement-1] = { lineupPlayerId: batter.id, jugadorId: batter.jugadorId, nombreJugador: batter.nombreJugador, reachedOnPlayInstanceId: playInstanceId, reachedOnJugadaId: jugada.jugada };
                }

                newState.gameStatus.bases = newBases;

                const nextBatterId = findNextBatterInLineup(newState[currentLineupKey], batter.id);
                const nextBatterIdKey = originalHalfInning === 'Top' ? 'nextVisitorBatterLineupPlayerId' : 'nextLocalBatterLineupPlayerId';
                newState.gameStatus[nextBatterIdKey] = nextBatterId;
                newState.gameStatus.currentBatterLineupPlayerId = nextBatterId;
            }

            return newState;
        });
        setFielderChoiceModalState({ isOpen: false, batter: null, runnersOnBase: [], initialOuts: 0, jugada: null });
    }, [updateCurrentPartidoAndHistory, _getJugadaById, fielderChoiceModalState]);

    const handleDoublePlayConfirm = useCallback((result: DoublePlayResult) => {
        setDoublePlayModalState(prev => ({ ...prev, isOpen: false }));
        if (!currentPartido || !currentPlayerForPlay) return;

        updateCurrentPartidoAndHistory(prev => {
            const newState: PartidoData = JSON.parse(JSON.stringify(prev));
            const originalHalfInning = prev.gameStatus.currentHalfInning;
            const originalInningNumber = prev.gameStatus.actualInningNumber;
            const currentLineupKey = originalHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
            
            const batter = currentPlayerForPlay;

            const nextBatterId = findNextBatterInLineup(newState[currentLineupKey], batter.id);
            const nextBatterIdKey = originalHalfInning === 'Top' ? 'nextVisitorBatterLineupPlayerId' : 'nextLocalBatterLineupPlayerId';
            newState.gameStatus[nextBatterIdKey] = nextBatterId;

            const dpJugada = _getJugadaById('DP')!;
            const outRunnerJugada = _getJugadaById('OUT_RUNNER_BASE')!;
            const inningOfPlay = prev.gameStatus.actualInningNumber;
            const halfInningOfPlay = prev.gameStatus.currentHalfInning;
            const outsBeforePlay = prev.gameStatus.outs;
            const basesBeforePlay = prev.gameStatus.bases;
            const playInstanceId = generateUUID();
            let totalRbis = 0;

            // 1. Update outs. Batter is only passed if they made an out for stat purposes.
            _calculateOutsUpdate(newState, 2, dpJugada, result.batterAdvancement === 0 ? batter : null);
            
            // 2. Log main DP play for the batter.
            _recordPlayInLog(newState, dpJugada, batter, 0, 0, undefined, basesBeforePlay, outsBeforePlay, playInstanceId, inningOfPlay, halfInningOfPlay);
            
            // Update batter stats for At Bat
            const batterIndex = newState[currentLineupKey].findIndex((p: LineupPlayer) => p.id === batter.id);
            if (batterIndex > -1) {
                newState[currentLineupKey][batterIndex].stats.atBats += 1;
                newState[currentLineupKey][batterIndex].stats.plateAppearances += 1;
            }

            // 3. Log individual outs for outed players
            result.outedPlayerIds.forEach((outId, index) => {
                const playerInfo = doublePlayModalState.playersInvolved.find(p => p.id === outId);
                const fullPlayerInfo = newState[currentLineupKey].find((p:LineupPlayer) => p.id === outId);
                if (playerInfo && fullPlayerInfo) {
                     if (outId !== batter.id) { // Only log separate outs for runners
                        _recordPlayInLog(newState, outRunnerJugada, fullPlayerInfo, 0, 0, undefined, basesBeforePlay, outsBeforePlay, playInstanceId + `-RO${index}`, inningOfPlay, halfInningOfPlay);
                        _addPlayToLineupCell(newState[currentLineupKey], outId, inningOfPlay, _createPlayInInningCell(outRunnerJugada, 0, playInstanceId + `-RO${index}`));
                     }
                }
            });
            
            // 4. Update bases and handle advancements/scoring for non-outed players, ONLY if inning is not over.
            if (outsBeforePlay < 1) {
                const newBases: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [null, null, null];
                
                if (result.batterAdvancement > 0 && result.batterAdvancement <= 3) {
                     newBases[result.batterAdvancement-1] = { lineupPlayerId: batter.id, jugadorId: batter.jugadorId, nombreJugador: batter.nombreJugador, reachedOnPlayInstanceId: playInstanceId, reachedOnJugadaId: dpJugada.jugada };
                }
                
                Object.entries(result.runnerAdvancements).forEach(([runnerId, destBase]) => {
                    const isOut = result.outedPlayerIds.includes(runnerId);
                    if (isOut) return;

                    const runner = basesBeforePlay.flat().find(p => p?.lineupPlayerId === runnerId);
                    if (!runner) return;

                    if (destBase === 4) { // Scored
                        const rbiGoesToBatter = outsBeforePlay < 2; // RBI if DP doesn't end inning
                        _applySingleRunScoringLogic(newState, runner, rbiGoesToBatter ? batter.id : null, playInstanceId, inningOfPlay, halfInningOfPlay);
                        if (rbiGoesToBatter) totalRbis++;
                    } else if (destBase >= 1 && destBase <= 3) {
                        newBases[destBase - 1] = runner;
                    }
                });

                newState.gameStatus.bases = newBases;
            }

            // Add batter's play to lineup cell NOW, with correct RBI count
            _addPlayToLineupCell(newState[currentLineupKey], batter.id, inningOfPlay, _createPlayInInningCell(dpJugada, totalRbis, playInstanceId));

            // 5. Set next batter
            if (newState.gameStatus.currentHalfInning === originalHalfInning && newState.gameStatus.actualInningNumber === originalInningNumber) {
                newState.gameStatus.currentBatterLineupPlayerId = nextBatterId;
            }
            
            return newState;
        });
    }, [currentPartido, currentPlayerForPlay, doublePlayModalState.playersInvolved, updateCurrentPartidoAndHistory, _getJugadaById]);
    
    const handleTriplePlayConfirm = useCallback((outedPlayerIds: [string, string, string]) => {
        setIsTriplePlayModalOpen(false);
        if (!currentPartido || !currentPlayerForPlay) return;

        updateCurrentPartidoAndHistory(prev => {
            const newState: PartidoData = JSON.parse(JSON.stringify(prev));
            const originalHalfInning = prev.gameStatus.currentHalfInning;
            const currentLineupKey = originalHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
            const batter = currentPlayerForPlay;

            const nextBatterId = findNextBatterInLineup(newState[currentLineupKey], batter.id);
            const nextBatterIdKey = originalHalfInning === 'Top' ? 'nextVisitorBatterLineupPlayerId' : 'nextLocalBatterLineupPlayerId';
            newState.gameStatus[nextBatterIdKey] = nextBatterId;
            
            const tpJugada = _getJugadaById('TP')!;
            const outRunnerJugada = _getJugadaById('OUT_RUNNER_BASE')!;
            const inningOfPlay = prev.gameStatus.actualInningNumber;
            const halfInningOfPlay = prev.gameStatus.currentHalfInning;
            const outsBeforePlay = prev.gameStatus.outs;
            const basesBeforePlay = prev.gameStatus.bases;
            const playInstanceId = generateUUID();
            const batterIsOut = outedPlayerIds.includes(batter.id);

            // 1. Update outs and batter stats.
             _calculateOutsUpdate(newState, 3, tpJugada, batterIsOut ? batter : null);
             
            // 2. Log main TP play
            _recordPlayInLog(newState, tpJugada, batter, 0, 0, undefined, basesBeforePlay, outsBeforePlay, playInstanceId, inningOfPlay, halfInningOfPlay);
            _addPlayToLineupCell(newState[currentLineupKey], batter.id, inningOfPlay, _createPlayInInningCell(tpJugada, 0, playInstanceId));

            // Update batter stats for At Bat
            const batterIndex = newState[currentLineupKey].findIndex((p: LineupPlayer) => p.id === batter.id);
            if (batterIndex > -1) {
                newState[currentLineupKey][batterIndex].stats.atBats += 1;
                newState[currentLineupKey][batterIndex].stats.plateAppearances += 1;
            }

            // 3. Log individual outs
            outedPlayerIds.forEach((outId, index) => {
                const playerInfo = playersForComplexOutModal.find(p => p.id === outId);
                const fullPlayerInfo = newState[currentLineupKey].find((p:LineupPlayer) => p.id === outId);
                if (playerInfo && fullPlayerInfo) {
                    if (outId !== batter.id) { // Log runners separately
                       _recordPlayInLog(newState, outRunnerJugada, fullPlayerInfo, 0, 0, undefined, basesBeforePlay, outsBeforePlay, playInstanceId + `-RO${index}`, inningOfPlay, halfInningOfPlay);
                       _addPlayToLineupCell(newState[currentLineupKey], outId, inningOfPlay, _createPlayInInningCell(outRunnerJugada, 0, playInstanceId + `-RO${index}`));
                    }
                }
            });

            // No need to set bases, _calculateOutsUpdate with 3 outs will advance inning and clear them.
            return newState;
        });
    }, [currentPartido, currentPlayerForPlay, playersForComplexOutModal, updateCurrentPartidoAndHistory, _getJugadaById]);

    const handleResetGame = useCallback(() => {
        updateCurrentPartidoAndHistory(prev => {
            if (!prev) return prev;
    
            const newState: PartidoData = JSON.parse(JSON.stringify(prev));
    
            // Reset team stats
            newState.visitanteStats = createEmptyTeamStats();
            newState.localStats = createEmptyTeamStats();
    
            // Reset lineups stats and inning performances
            newState.lineupVisitante.forEach((player: LineupPlayer) => {
                player.stats = createEmptyBatterStats();
                player.innings = {};
            });
            newState.lineupLocal.forEach((player: LineupPlayer) => {
                player.stats = createEmptyBatterStats();
                player.innings = {};
            });
    
            // Clear game log
            newState.registrosJuego = [];
    
            // Reset game status
            const firstVisitorBatterId = findNextBatterInLineup(newState.lineupVisitante, null);
            const firstLocalBatterId = findNextBatterInLineup(newState.lineupLocal, null);
    
            newState.gameStatus = {
                currentHalfInning: 'Top',
                actualInningNumber: 1,
                outs: 0,
                bases: [null, null, null],
                currentBatterLineupPlayerId: firstVisitorBatterId,
                nextVisitorBatterLineupPlayerId: firstVisitorBatterId,
                nextLocalBatterLineupPlayerId: firstLocalBatterId,
                lastPlayContext: null,
            };
            
            // Reset current inning visualized
            newState.currentInningVisualized = 1;
            
            setGamePhase('scoring');
            addToast('Partido reiniciado.', 'success');
            
            return newState;
        });
    }, [updateCurrentPartidoAndHistory, setGamePhase, addToast]);

    const handleMovePlayerInLineup = useCallback((sourceId: string, targetId: string, team: 'visitante' | 'local') => {
        updateCurrentPartidoAndHistory(prev => {
            if (!prev) return prev;
            const lineupKey = team === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
            const lineup = prev[lineupKey] ? [...prev[lineupKey]!] : [];
            if (lineup.length === 0 || sourceId === targetId) return prev;
    
        const sourceIndex = lineup.findIndex(p => p.id === sourceId);
        const targetIndex = lineup.findIndex(p => p.id === targetId);
        if (sourceIndex === -1 || targetIndex === -1) return prev;

        const items = Array.from(lineup);
        const [reorderedItem] = items.splice(sourceIndex, 1);
        items.splice(targetIndex, 0, reorderedItem);
        
        const updatedLineup = updateBattingOrderFromArrayOrder(items);

        const nextBatterKey = team === 'visitante' ? 'nextVisitorBatterLineupPlayerId' : 'nextLocalBatterLineupPlayerId';
        const updatedNextBatterId = findNextBatterInLineup(updatedLineup, prev.gameStatus[nextBatterKey]);

        const newState = { ...prev, [lineupKey]: updatedLineup };
        newState.gameStatus[nextBatterKey] = updatedNextBatterId;
        
        return newState;
        });
    }, [updateCurrentPartidoAndHistory]);

    const handleMovePlayerInBattingOrder = useCallback((playerId: string, direction: 'up' | 'down', team: 'visitante' | 'local') => {
        updateCurrentPartidoAndHistory(prev => {
            if (!prev) return prev;
            const lineupKey = team === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
            let lineup = prev[lineupKey] ? [...prev[lineupKey]!] : [];
            if (lineup.length <= 1) return prev;
    
            const activePlayers = lineup.filter(p => p.posicion !== 'BE' && p.posicion !== EMPTY_POSICION_PLACEHOLDER);
            const benchPlayers = lineup.filter(p => p.posicion === 'BE' || p.posicion === EMPTY_POSICION_PLACEHOLDER);
    
            const activePlayerIndex = activePlayers.findIndex(p => p.id === playerId);
            if (activePlayerIndex === -1) return prev;
    
            let newIndex = activePlayerIndex;
            if (direction === 'up' && activePlayerIndex > 0) {
                newIndex = activePlayerIndex - 1;
            } else if (direction === 'down' && activePlayerIndex < activePlayers.length - 1) {
                newIndex = activePlayerIndex + 1;
            }
    
            if (newIndex !== activePlayerIndex) {
                const [playerToMove] = activePlayers.splice(activePlayerIndex, 1);
                activePlayers.splice(newIndex, 0, playerToMove);
                
                const newFullLineup = [...activePlayers, ...benchPlayers];
                const updatedLineupWithNewOrderNumbers = updateBattingOrderFromArrayOrder(newFullLineup);
    
                const nextBatterKey = team === 'visitante' ? 'nextVisitorBatterLineupPlayerId' : 'nextLocalBatterLineupPlayerId';
                const updatedNextBatterId = findNextBatterInLineup(updatedLineupWithNewOrderNumbers, prev.gameStatus[nextBatterKey]);
    
                const newState = { ...prev, [lineupKey]: updatedLineupWithNewOrderNumbers };
                newState.gameStatus[nextBatterKey] = updatedNextBatterId;
                
                return newState;
            }
            return prev;
        });
    }, [updateCurrentPartidoAndHistory]);


    return {
        currentPartido,
        setCurrentPartido,
        setPartidoEnCurso,
        historial,
        setHistorial,
        formatos,
        jugadoresDB,
        jugadasDB,
        appConfig,
        partidoHistoryStack,
        gamePhase,
        setGamePhase,
        handleSaveGame,
        handleExportGameLogCSV,
        handleExportBoxScoreCSV,
        handleUndoLastAnnotation,
        openPlayModal,
        handleBaseClick,
        isPlayModalOpen, setIsPlayModalOpen,
        currentPlayerForPlay, setCurrentPlayerForPlay,
        isFreeEditModeForModal,
        groupedPlays, playCategoryOrder, playCategoryColors,
        handlePlaySelected,
        currentBatterDisplay,
        getOriginalJugadaDescription,
        getBaseLabel,
        isGameLogExpanded, setIsGameLogExpanded,
        requestDeleteRegistro,
        isEditRegistroModalOpen, setIsEditRegistroModalOpen,
        editingRegistro, setEditingRegistro,
        handleOpenEditRegistroModal,
        handleCloseEditRegistroModal,
        handleSaveEditedRegistro,
        tempEditedPlayIdInModal, setTempEditedPlayIdInModal,
        isConfirmActionModalOpen, setIsConfirmActionModalOpen,
        confirmActionModalProps, setConfirmActionModalProps,
        isRunnerActionModalOpen, setIsRunnerActionModalOpen,
        managingRunner, setManagingRunner,
        handleRunnerAction,
        assignRbiModalState, setAssignRbiModalState,
        handleConfirmRbiAssignment,
        isBoxScoreModalOpen, setIsBoxScoreModalOpen,
        isErrorModalOpen, setIsErrorModalOpen,
        errorModalContext, setErrorModalContext,
        handleErrorAdvancementConfirm,
        isRunnerAdvancementReasonModalOpen, setIsRunnerAdvancementReasonModalOpen,
        runnerAdvancementContext, setRunnerAdvancementContext,
        handleRunnerAdvancementReasonConfirm,
        runnerAdvancementAfterHitModalState, setRunnerAdvancementAfterHitModalState,
        handleConfirmRunnerAdvancementsFromHitModal,
        runnerAdvancementAfterSacrificeModalState, setRunnerAdvancementAfterSacrificeModalState,
        handleConfirmRunnerAdvancementsFromSacrificeModal,
        isRunnerOutSpecificReasonModalOpen, setIsRunnerOutSpecificReasonModalOpen,
        handleRunnerOutSpecificReasonConfirm,
        isPositionConflictModalOpen, setIsPositionConflictModalOpen,
        positionConflictDetails, setPositionConflictDetails,
        isEditPlayerPositionModalOpen, setIsEditPlayerPositionModalOpen,
        editingPlayerForPosition, setEditingPlayerForPosition,
        handleConfirmPlayerPositionChange,
        handleResolvePositionConflict,
        runnerAdvancementAfterErrorModalState, setRunnerAdvancementAfterErrorModalState,
        handleConfirmRunnerAdvancementsFromErrorModal,
        fielderChoiceModalState, setFielderChoiceModalState,
        handleComplexPlayConfirm,
        doublePlayModalState, setDoublePlayModalState,
        isTriplePlayModalOpen, setIsTriplePlayModalOpen,
        playersForComplexOutModal,
        handleDoublePlayConfirm, handleTriplePlayConfirm,
        handleRequestAddPlayerToLineup,
        isAddPlayerModalOpen, setIsAddPlayerModalOpen,
        teamToAddPlayerTo,
        handleConfirmAddPlayerToLineup,
        handleRequestRemovePlayerFromLineup,
        toasts,
        addToast,
        removeToast,
        navigate, // pass navigate through context if needed
        handleResetGame,
        handleMovePlayerInBattingOrder,
        handleMovePlayerInLineup,
    };
};
