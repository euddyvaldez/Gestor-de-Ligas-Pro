
import React, { useState, useEffect, useCallback, ChangeEvent, useRef, useMemo, DragEvent } from 'react';
import Papa from 'papaparse';
import { useNavigate } from 'react-router-dom';
import {
  PartidoData, JuegoGuardado, Formato, Jugador, Jugada, LineupPlayer, PlayInInningCell, BatterStats, GameStatus, TeamStats, RegistroJuego, AppGlobalConfig, PlayCategory, Equipo, DEFAULT_GLOBAL_CONFIG, POSICIONES_FOR_SELECT, EMPTY_POSICION_PLACEHOLDER, POSICIONES, PlayerOnBase, LastPlayContext, PlayerInfoForOutSelection, RunnerAdvancementReason, EMPTY_POSICION_LABEL, AssignRbiModalState, RunnerAdvancementAfterHitModalState, RunnerAdvancementInfo, RunnerAdvancementAfterSacrificeModalState
} from '../types';
import {
  PARTIDO_EN_CURSO_KEY, HISTORIAL_JUEGOS_KEY, FORMATOS_STORAGE_KEY, JUGADORES_STORAGE_KEY, JUGADAS_STORAGE_KEY, APP_CONFIG_KEY, EQUIPOS_STORAGE_KEY
} from '../constants';
import useLocalStorage from '../hooks/useLocalStorage';
import { generateUUID } from '../utils/idGenerator';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import { BaseballDiamondSVG } from '../components/ui/BaseballDiamondSVG'; // Updated import
import IconButton, { EditIcon, SettingsIcon, SaveIcon } from '../components/ui/IconButton';
import { MdDeleteForever, MdOutlineLeaderboard, MdUndo, MdNavigateBefore, MdNavigateNext } from 'react-icons/md'; // Added MdUndo, MdNavigateBefore, MdNavigateNext
import Table, { TableColumn } from '../components/ui/Table';
import ConfirmationModal from '../components/ui/ConfirmationModal';
import ErrorAdvancementModal from '../components/partidos/ErrorAdvancementModal';
import DoublePlayOutSelectionModal from '../components/partidos/DoublePlayOutSelectionModal'; // Added
import RunnerAdvancementReasonModal from '../components/partidos/RunnerAdvancementReasonModal'; // Added
import AssignRbiModal from '../components/partidos/AssignRbiModal'; // Added
import RunnerAdvancementAfterHitModal from '../components/partidos/RunnerAdvancementAfterHitModal'; // Added
import RunnerAdvancementAfterSacrificeModal from '../components/partidos/RunnerAdvancementAfterSacrificeModal'; // Added
import { findNextBatterInLineup, recalculateLineupOrder, createEmptyBatterStats, createEmptyGameStatus, initialPartidoData, createEmptyTeamStats } from '../utils/partidoUtils';
import PositionSelectionModal from '../components/partidos/PositionSelectionModal';


type GamePhase = 'scoring' | 'ended';
type ActiveLineupTab = 'visitante' | 'local';

interface PositionConflictDetails {
    conflictingPlayer: LineupPlayer;
    targetPlayerOriginalPosition: string;
    existingPlayerInTargetPosition: LineupPlayer;
    targetPosition: string;
    team: ActiveLineupTab;
}

interface ConfirmModalActionProps {
  title: string;
  message: React.ReactNode;
  onConfirm: () => void;
  confirmButtonText?: string;
  confirmButtonVariant?: 'primary' | 'danger' | 'warning';
}

type RunnerActionType =
  | 'advanceTo2B'
  | 'advanceTo3BFrom1B'
  | 'advanceTo3BFrom2B'
  | 'scoreManually'
  | 'outRunner';

interface ErrorModalContext {
    batterLineupPlayer: LineupPlayer;
}

const MAX_UNDO_HISTORY_SIZE = 5;

interface EditingPlayerForPositionState {
  player: LineupPlayer;
  team: ActiveLineupTab;
}


export const PartidosPage: React.FC = () => {
  const [appConfig] = useLocalStorage<AppGlobalConfig>(APP_CONFIG_KEY, DEFAULT_GLOBAL_CONFIG);
  const [partidoEnCurso, setPartidoEnCurso] = useLocalStorage<PartidoData | null>(PARTIDO_EN_CURSO_KEY, null);
  const [historial, setHistorial] = useLocalStorage<JuegoGuardado[]>(HISTORIAL_JUEGOS_KEY, []);

  const [formatos] = useLocalStorage<Formato[]>(FORMATOS_STORAGE_KEY, []);
  const [jugadoresDB] = useLocalStorage<Jugador[]>(JUGADORES_STORAGE_KEY, []);
  const [jugadasDB] = useLocalStorage<Jugada[]>(JUGADAS_STORAGE_KEY, []);

  const [gamePhase, setGamePhase] = useState<GamePhase>('scoring');
  const [currentPartido, setCurrentPartido] = useState<PartidoData | null>(null);
  const [partidoHistoryStack, setPartidoHistoryStack] = useState<PartidoData[]>([]);

  const [isPlayModalOpen, setIsPlayModalOpen] = useState(false);
  const [currentPlayerForPlay, setCurrentPlayerForPlay] = useState<LineupPlayer | null>(null);
  const [isFreeEditModeForModal, setIsFreeEditModeForModal] = useState(false);
  const [activeLineupTab, setActiveLineupTab] = useState<ActiveLineupTab>('visitante');
  const [inningToShowInLineups, setInningToShowInLineups] = useState(1);


  const [isPositionConflictModalOpen, setIsPositionConflictModalOpen] = useState(false);
  const [positionConflictDetails, setPositionConflictDetails] = useState<PositionConflictDetails | null>(null);

  const [isEditRegistroModalOpen, setIsEditRegistroModalOpen] = useState(false);
  const [editingRegistro, setEditingRegistro] = useState<RegistroJuego | null>(null);
  const [tempEditedPlayIdInModal, setTempEditedPlayIdInModal] = useState<string>('');

  const [isGameLogExpanded, setIsGameLogExpanded] = useState(false);

  const [isConfirmActionModalOpen, setIsConfirmActionModalOpen] = useState(false);
  const [confirmActionModalProps, setConfirmActionModalProps] = useState<ConfirmModalActionProps | null>(null);

  const [isRunnerActionModalOpen, setIsRunnerActionModalOpen] = useState(false);
  const [managingRunner, setManagingRunner] = useState<{ player: PlayerOnBase, baseIndex: 0 | 1 | 2 } | null>(null);

  const [assignRbiModalState, setAssignRbiModalState] = useState<AssignRbiModalState>({ isOpen: false, scoringPlayerInfo: null, batterForRbiContext: null, previousBatterForRbiContext: null });

  const [isBoxScoreModalOpen, setIsBoxScoreModalOpen] = useState(false);

  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [errorModalContext, setErrorModalContext] = useState<ErrorModalContext | null>(null);

  const [isDoublePlayModalOpen, setIsDoublePlayModalOpen] = useState(false);
  const [doublePlayContext, setDoublePlayContext] = useState<{ batter: PlayerInfoForOutSelection, runners: PlayerInfoForOutSelection[], onConfirm: (outedPlayerIds: [string,string]) => void } | null>(null);

  const [isRunnerAdvancementReasonModalOpen, setIsRunnerAdvancementReasonModalOpen] = useState(false);
  const [runnerAdvancementContext, setRunnerAdvancementContext] = useState<{ runner: PlayerOnBase, baseIndexAdvancedTo: 0 | 1 | 2, onConfirm: (reason: RunnerAdvancementReason | string, errorPlayerId?: number | null) => void} | null>(null);
  
  const [runnerAdvancementAfterHitModalState, setRunnerAdvancementAfterHitModalState] = useState<RunnerAdvancementAfterHitModalState>({
    isOpen: false, batter: null, hitType: null, batterReachedBase: 1, runnersOnBase: [], advancements: {},
  });

  const [runnerAdvancementAfterSacrificeModalState, setRunnerAdvancementAfterSacrificeModalState] = useState<RunnerAdvancementAfterSacrificeModalState>({
    isOpen: false, batter: null, sacrificeType: null, runnersOnBase: [], advancements: {}, initialOuts: 0,
  });


  const [isEditPlayerPositionModalOpen, setIsEditPlayerPositionModalOpen] = useState(false);
  const [editingPlayerForPosition, setEditingPlayerForPosition] = useState<EditingPlayerForPositionState | null>(null);


  const navigate = useNavigate();

  const getCurrentOpposingPitcher = (partidoState: PartidoData): LineupPlayer | null => {
    const defensiveTeamLineup = partidoState.gameStatus.currentHalfInning === 'Top'
        ? partidoState.lineupLocal
        : partidoState.lineupVisitante;
    return defensiveTeamLineup.find(p => p.posicion === 'P') || null;
  };

  const saveToHistory = useCallback((partidoState: PartidoData) => {
    setPartidoHistoryStack(prevStack => {
        const newStack = [partidoState, ...prevStack];
        return newStack.slice(0, MAX_UNDO_HISTORY_SIZE);
    });
  }, []);

  const updateCurrentPartidoAndHistory = useCallback((updater: (prevState: PartidoData) => PartidoData) => {
    setCurrentPartido(prevPartido => {
        if (!prevPartido) return null;
        const updated = updater(prevPartido);
        return updated;
    });
  }, []);


  useEffect(() => {
    if (partidoEnCurso) {
      setCurrentPartido(partidoEnCurso);
      const isGameEffectivelyOver =
        (partidoEnCurso.gameStatus.actualInningNumber > partidoEnCurso.maxInnings && partidoEnCurso.gameStatus.currentHalfInning === 'Top') ||
        (partidoEnCurso.gameStatus.actualInningNumber >= partidoEnCurso.maxInnings && partidoEnCurso.gameStatus.currentHalfInning === 'Bottom' && partidoEnCurso.gameStatus.outs === 3 && (partidoEnCurso.localStats.totalRuns > partidoEnCurso.visitanteStats.totalRuns || partidoEnCurso.gameStatus.actualInningNumber > partidoEnCurso.maxInnings));
      setGamePhase(isGameEffectivelyOver ? 'ended' : 'scoring');
      setInningToShowInLineups(partidoEnCurso.gameStatus.actualInningNumber); // Set initial lineup inning view
    } else {
        navigate('/configurar-partido');
    }
  }, [partidoEnCurso, navigate]);

  useEffect(() => {
    if (currentPartido) {
      setPartidoEnCurso(currentPartido);
    }
  }, [currentPartido, gamePhase, setPartidoEnCurso]);

  const prevHalfInningRef = useRef<string | null>(null);
  const isInitialMountOrSetupRef = useRef(true);

  useEffect(() => {
    if (currentPartido) {
      const currentActualHalfInning = currentPartido.gameStatus.currentHalfInning;
      if (isInitialMountOrSetupRef.current || (prevHalfInningRef.current !== null && prevHalfInningRef.current !== currentActualHalfInning)) {
        setActiveLineupTab(currentActualHalfInning === 'Top' ? 'visitante' : 'local');
        setInningToShowInLineups(currentPartido.gameStatus.actualInningNumber); // Update on inning change
        isInitialMountOrSetupRef.current = false;
      }
      prevHalfInningRef.current = currentActualHalfInning;
    }
  }, [currentPartido]);

  const _applySingleRunScoringLogic = (
    partidoDataToUpdate: PartidoData,
    scoringPlayer: PlayerOnBase | LineupPlayer, // Can be a player object from lineup or PlayerOnBase
    rbiCreditedToPlayerId: string | null
  ): void => {
    const teamAtBat = partidoDataToUpdate.gameStatus.currentHalfInning === 'Top' ? 'visitante' : 'local';
    const scoringPlayerLineupId = 'lineupPlayerId' in scoringPlayer ? scoringPlayer.lineupPlayerId : scoringPlayer.id;
    const currentInning = partidoDataToUpdate.gameStatus.actualInningNumber;
  
    if (teamAtBat === 'visitante') {
      partidoDataToUpdate.visitanteStats.totalRuns += 1;
      partidoDataToUpdate.visitanteStats.runsPerInning[currentInning] = (partidoDataToUpdate.visitanteStats.runsPerInning[currentInning] || 0) + 1;
    } else {
      partidoDataToUpdate.localStats.totalRuns += 1;
      partidoDataToUpdate.localStats.runsPerInning[currentInning] = (partidoDataToUpdate.localStats.runsPerInning[currentInning] || 0) + 1;
    }
  
    const lineupToUpdateForScorer = teamAtBat === 'visitante' ? partidoDataToUpdate.lineupVisitante : partidoDataToUpdate.lineupLocal;
    const scorerIndex = lineupToUpdateForScorer.findIndex(p => p.id === scoringPlayerLineupId);
    if (scorerIndex !== -1) {
      lineupToUpdateForScorer[scorerIndex].stats.runs += 1;
    } else {
      console.warn(`Scoring player with ID ${scoringPlayerLineupId} not found in active lineup for run stat.`);
    }
  
    if (rbiCreditedToPlayerId) {
      const lineupForRbiPlayer = teamAtBat === 'visitante' ? partidoDataToUpdate.lineupVisitante : partidoDataToUpdate.lineupLocal;
      const rbiPlayerIndex = lineupForRbiPlayer.findIndex(p => p.id === rbiCreditedToPlayerId);
      if (rbiPlayerIndex !== -1) {
        lineupForRbiPlayer[rbiPlayerIndex].stats.rbi += 1;
      } else {
        console.warn(`RBI player with ID ${rbiCreditedToPlayerId} not found in active lineup for RBI stat.`);
      }
    }
  };

  const _calculateOutsUpdate = (
    currentGameStatus: GameStatus,
    outsToAdd: number,
    maxInnings: number,
    lineupVisitante: LineupPlayer[],
    lineupLocal: LineupPlayer[],
    visitanteTotalRuns: number,
    localTotalRuns: number
  ): { updatedGameStatus: GameStatus; gameShouldEnd: boolean } => {
    let newOuts = currentGameStatus.outs + outsToAdd;
    let updatedStatus = { ...currentGameStatus };
    let gameShouldEnd = false;

    if (newOuts >= 3) {
      updatedStatus.outs = 0;
      updatedStatus.bases = [null, null, null];
      // updatedStatus.currentBatterLineupPlayerId = null; // This will be set by the calling function based on next batter in new half

      const teamMakingOutsHalf = currentGameStatus.currentHalfInning;
      const lineupMakingOuts = teamMakingOutsHalf === 'Top' ? lineupVisitante : lineupLocal;
      const batterMakingFinalOutId = currentGameStatus.currentBatterLineupPlayerId;

      const savedNextBatterForTeamMakingOuts = findNextBatterInLineup(lineupMakingOuts, batterMakingFinalOutId);

      if (teamMakingOutsHalf === 'Top') {
        updatedStatus.nextVisitorBatterLineupPlayerId = savedNextBatterForTeamMakingOuts;
        updatedStatus.currentHalfInning = 'Bottom';
        updatedStatus.currentBatterLineupPlayerId = updatedStatus.nextLocalBatterLineupPlayerId; // Set next batter for local
      } else {
        updatedStatus.nextLocalBatterLineupPlayerId = savedNextBatterForTeamMakingOuts;
        updatedStatus.currentHalfInning = 'Top';
        updatedStatus.actualInningNumber += 1;
        updatedStatus.currentBatterLineupPlayerId = updatedStatus.nextVisitorBatterLineupPlayerId; // Set next batter for visitor
      }
      updatedStatus.lastPlayContext = null;
      setInningToShowInLineups(updatedStatus.actualInningNumber); // Sync lineup inning view
    } else {
      updatedStatus.outs = newOuts;
       // Batter remains the same or advances based on play
       const currentLineupForNext = updatedStatus.currentHalfInning === 'Top' ? lineupVisitante : lineupLocal;
       updatedStatus.currentBatterLineupPlayerId = findNextBatterInLineup(currentLineupForNext, currentGameStatus.currentBatterLineupPlayerId);
    }

    if (
      (updatedStatus.actualInningNumber > maxInnings && updatedStatus.currentHalfInning === 'Top') ||
      (
        updatedStatus.actualInningNumber >= maxInnings &&
        updatedStatus.currentHalfInning === 'Bottom' &&
        updatedStatus.outs === 0 && 
        (currentGameStatus.outs + outsToAdd >= 3) && 
        (localTotalRuns > visitanteTotalRuns || updatedStatus.actualInningNumber > maxInnings)
      )
    ) {
      gameShouldEnd = true;
    }

    return { updatedGameStatus: updatedStatus, gameShouldEnd };
  };

  const handleConfirmPlayerPositionChange = (newPosition: string) => {
    if (!editingPlayerForPosition || !currentPartido) {
      setIsEditPlayerPositionModalOpen(false);
      setEditingPlayerForPosition(null);
      return;
    }

    const { player: playerToEdit, team } = editingPlayerForPosition;
    const originalPosition = playerToEdit.posicion;

    saveToHistory(currentPartido);
    updateCurrentPartidoAndHistory(prev => {
      if (!prev) return prev;
      let updatedPartido = { ...prev };
      const lineupKey = team === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
      let lineup = [...updatedPartido[lineupKey]];
      const playerToEditId = playerToEdit.id;

      if (originalPosition === 'BE' && newPosition !== 'BE' && newPosition !== EMPTY_POSICION_PLACEHOLDER) {
        const playerCurrentlyInTargetPosition = lineup.find(p => p.posicion === newPosition && p.id !== playerToEditId);

        if (playerCurrentlyInTargetPosition) {
          const newPlayerInFieldOrder = playerCurrentlyInTargetPosition.ordenBate;
          lineup = lineup.map(p => {
            if (p.id === playerToEditId) { 
              return { ...p, posicion: newPosition, ordenBate: newPlayerInFieldOrder };
            }
            if (p.id === playerCurrentlyInTargetPosition.id) { 
              return { ...p, posicion: 'BE' };
            }
            return p;
          });

          if (updatedPartido.gameStatus.currentBatterLineupPlayerId === playerCurrentlyInTargetPosition.id) {
            const currentTeamAtBat = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'visitante' : 'local';
            if (team === currentTeamAtBat) {
                 updatedPartido.gameStatus.currentBatterLineupPlayerId = playerToEditId;
            }
          }
        } else {
          lineup = lineup.map(p => p.id === playerToEditId ? { ...p, posicion: newPosition } : p);
        }
      } else if (originalPosition !== 'BE' && newPosition !== EMPTY_POSICION_PLACEHOLDER && newPosition !== 'DH' && newPosition !== 'BE') {
          const existingPlayerInTargetPosition = lineup.find(p => p.id !== playerToEditId && p.posicion === newPosition);
          if (existingPlayerInTargetPosition) {
             // This scenario should be handled by position conflict modal if it's a unique field position
             // For now, allow direct swap for simplicity in this context (PartidosPage)
             // or assume it's a non-unique position or DH
             lineup = lineup.map(p => {
                if(p.id === playerToEditId) return { ...p, posicion: newPosition };
                if(p.id === existingPlayerInTargetPosition.id) return { ...p, posicion: originalPosition }; // Swap back
                return p;
             });
          } else {
             lineup = lineup.map(p => p.id === playerToEditId ? { ...p, posicion: newPosition } : p);
          }
      } else { // Moving to BE or to EMPTY
         lineup = lineup.map(p => p.id === playerToEditId ? { ...p, posicion: newPosition } : p);
      }

      const originalNextBatterIdForThisTeam = team === 'visitante' ? prev.gameStatus.nextVisitorBatterLineupPlayerId : prev.gameStatus.nextLocalBatterLineupPlayerId;
      const { updatedLineup, newNextBatterForThisTeamId } = recalculateLineupOrder(lineup, originalNextBatterIdForThisTeam, null, null);

      updatedPartido[lineupKey] = updatedLineup;

      let newGameStatus = { ...updatedPartido.gameStatus };
      if (team === 'visitante') {
        newGameStatus.nextVisitorBatterLineupPlayerId = newNextBatterForThisTeamId;
      } else {
        newGameStatus.nextLocalBatterLineupPlayerId = newNextBatterForThisTeamId;
      }

      const finalStateOfPlayer = updatedPartido[lineupKey].find(p => p.id === playerToEditId);
      if (finalStateOfPlayer && finalStateOfPlayer.posicion === 'BE' &&
          newGameStatus.currentBatterLineupPlayerId === playerToEditId) {
          const currentTeamAtBat = newGameStatus.currentHalfInning === 'Top' ? 'visitante' : 'local';
          if (team === currentTeamAtBat) { // Only change batter if it's their turn
              newGameStatus.currentBatterLineupPlayerId = findNextBatterInLineup(updatedLineup, playerToEditId); 
          }
      }
      updatedPartido.gameStatus = newGameStatus;
      return updatedPartido;
    });

    setIsEditPlayerPositionModalOpen(false);
    setEditingPlayerForPosition(null);
  };


  const handleClosePositionConflictModal = () => setIsPositionConflictModalOpen(false);

  const handleResolvePositionConflict = (confirmMove: boolean) => {
    if (!positionConflictDetails || !currentPartido) return;

    if (confirmMove) {
        saveToHistory(currentPartido);
        updateCurrentPartidoAndHistory(prev => {
            if (!prev || !positionConflictDetails) return prev;
            let updatedPartido = { ...prev };
            const { conflictingPlayer, existingPlayerInTargetPosition, targetPosition, team } = positionConflictDetails;
            const lineupKey = team === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
            let lineup = [...updatedPartido[lineupKey]];

            lineup = lineup.map(p => {
                if (p.id === conflictingPlayer.id) return { ...p, posicion: targetPosition };
                if (p.id === existingPlayerInTargetPosition.id) return { ...p, posicion: 'BE' };
                return p;
            });

            const originalNextBatterIdForThisTeam = team === 'visitante' ? prev.gameStatus.nextVisitorBatterLineupPlayerId : prev.gameStatus.nextLocalBatterLineupPlayerId;
            const { updatedLineup, newNextBatterForThisTeamId } = recalculateLineupOrder(lineup, originalNextBatterIdForThisTeam, existingPlayerInTargetPosition.id, conflictingPlayer.id);

            updatedPartido[lineupKey] = updatedLineup;

            let newGameStatus = { ...updatedPartido.gameStatus };
            if (team === 'visitante') {
                newGameStatus.nextVisitorBatterLineupPlayerId = newNextBatterForThisTeamId;
            } else {
                newGameStatus.nextLocalBatterLineupPlayerId = newNextBatterForThisTeamId;
            }
            if (existingPlayerInTargetPosition.id === newGameStatus.currentBatterLineupPlayerId) {
                  const currentTeamAtBat = newGameStatus.currentHalfInning === 'Top' ? 'visitante' : 'local';
                  if (team === currentTeamAtBat) { 
                    newGameStatus.currentBatterLineupPlayerId = findNextBatterInLineup(updatedLineup, existingPlayerInTargetPosition.id);
                  }
            }
            updatedPartido.gameStatus = newGameStatus;
            return updatedPartido;
        });
    }
    handleClosePositionConflictModal();
    setPositionConflictDetails(null);
  };


  const handleBaseClick = (baseIndex: 0 | 1 | 2) => {
    if (!currentPartido || gamePhase === 'ended') return;

    const runnerOnThisBase = currentPartido.gameStatus.bases[baseIndex];

    if (runnerOnThisBase) {
        setManagingRunner({ player: runnerOnThisBase, baseIndex });
        setIsRunnerActionModalOpen(true);
    } else {
        const currentLineup = currentPartido.gameStatus.currentHalfInning === 'Top' ? currentPartido.lineupVisitante : currentPartido.lineupLocal;
        const batterForPlay = currentLineup.find(p => p.id === currentPartido.gameStatus.currentBatterLineupPlayerId);
        if (batterForPlay && batterForPlay.posicion !== 'BE' && batterForPlay.posicion !== EMPTY_POSICION_PLACEHOLDER) {
            openPlayModal(batterForPlay, false);
        } else {
            alert("Seleccione un bateador activo de la lista antes de hacer clic en una base vacía.");
        }
    }
  };

  const openPlayModal = (player: LineupPlayer, isFreeEditFromModalFlag: boolean) => {
    if (gamePhase === 'ended' && !isFreeEditFromModalFlag) return;

    if (player.posicion === 'BE' && !isFreeEditFromModalFlag) {
        alert(`${player.nombreJugador} está en la banca (BE) y no puede tener una jugada anotada.`);
        return;
    }
    if (player.posicion === EMPTY_POSICION_PLACEHOLDER && !isFreeEditFromModalFlag) {
        alert(`Asigne una posición a ${player.nombreJugador} antes de anotar una jugada.`);
        return;
    }

    if (currentPartido) {
        const teamAtBatIsVisitante = currentPartido.gameStatus.currentHalfInning === 'Top';
        const playerIsVisitor = currentPartido.lineupVisitante.some(p => p.id === player.id);
        const playerIsLocal = currentPartido.lineupLocal.some(p => p.id === player.id);

        if (!((teamAtBatIsVisitante && playerIsVisitor) || (!teamAtBatIsVisitante && playerIsLocal))) {
            alert(`Solo se puede anotar para el equipo que está actualmente al bate (${teamAtBatIsVisitante ? currentPartido.nombreEquipoVisitante : currentPartido.nombreEquipoLocal}).`);
            return;
        }

        if (!isFreeEditFromModalFlag) {
            setCurrentPartido(prev => {
                if (!prev) return null;
                // If the player clicked is already the current batter, no change.
                // Otherwise, set them as current batter.
                if (prev.gameStatus.currentBatterLineupPlayerId !== player.id) {
                    return {
                        ...prev,
                        gameStatus: {
                            ...prev.gameStatus,
                            currentBatterLineupPlayerId: player.id
                        }
                    };
                }
                return prev;
            });
        }
    }

    setCurrentPlayerForPlay(player);
    setIsFreeEditModeForModal(isFreeEditFromModalFlag);
    setIsPlayModalOpen(true);
  };

  const handlePlaySelected = (jugadaDef: Jugada) => {
    if (!currentPartido || !currentPlayerForPlay) {
         alert("Error: No hay jugador o partido actual para la jugada.");
         setIsPlayModalOpen(false); setCurrentPlayerForPlay(null);
        return;
    }

    saveToHistory(currentPartido);

    if ((jugadaDef.jugada === 'ED' || jugadaDef.jugada === 'E') && !isFreeEditModeForModal) { 
      setErrorModalContext({ batterLineupPlayer: currentPlayerForPlay });
      setIsErrorModalOpen(true);
      setIsPlayModalOpen(false);
      return;
    }

    if (jugadaDef.jugada === 'DP' && !isFreeEditModeForModal) {
        const batterAsPlayerInfo: PlayerInfoForOutSelection = { id: currentPlayerForPlay.id, name: currentPlayerForPlay.nombreJugador, isOnBase: false };
        const runnersOnBaseAsPlayerInfo: PlayerInfoForOutSelection[] = currentPartido.gameStatus.bases
            .map((runner, idx) => runner ? ({ id: runner.lineupPlayerId, name: runner.nombreJugador, isOnBase: true, baseNumber: (idx + 1) as 1 | 2 | 3 }) : null)
            .filter(r => r !== null) as PlayerInfoForOutSelection[];

        if (currentPartido.gameStatus.outs >= 2) { // Not enough outs left for DP if already 2 outs.
            alert("No se puede registrar Doble Play con 2 outs ya existentes. Anote un out sencillo.");
            setIsPlayModalOpen(false);
            return;
        }
        if (runnersOnBaseAsPlayerInfo.length === 0 && currentPartido.gameStatus.outs > 0) {
             alert("No hay corredores en base para un Doble Play típico si ya hay outs. Considere un out sencillo para el bateador.");
             setIsPlayModalOpen(false);
             return;
        }


        if (runnersOnBaseAsPlayerInfo.length === 1) { // Batter + 1 runner = 2 outs
            const outedPlayerIds: [string, string] = [batterAsPlayerInfo.id, runnersOnBaseAsPlayerInfo[0].id];
            confirmDoublePlayOuts(outedPlayerIds, jugadaDef);
        } else if (runnersOnBaseAsPlayerInfo.length > 1) { // Batter + choose 1 of multiple runners
            setDoublePlayContext({
                batter: batterAsPlayerInfo,
                runners: runnersOnBaseAsPlayerInfo,
                onConfirm: (outedIds) => confirmDoublePlayOuts(outedIds, jugadaDef)
            });
            setIsDoublePlayModalOpen(true);
        } else { // Only batter involved (e.g. Lined into DP at first unassisted)
             // This case usually implies the batter hit into a DP where they and another runner (who isn't on base at start of play) are out,
             // or it's a special DP. For simplicity, we'll assume it's batter out + a conceptual "ghost" out or requires manual correction.
             // We will make the batter out twice for statistical purposes of recording 2 outs.
             confirmDoublePlayOuts([batterAsPlayerInfo.id, batterAsPlayerInfo.id] , jugadaDef, true );
        }
        setIsPlayModalOpen(false);
        return;
    }

    if ((jugadaDef.jugada === 'SF' || jugadaDef.jugada === 'SH') && !isFreeEditModeForModal) {
      const runnersOnBaseAtTimeOfSacrifice = currentPartido.gameStatus.bases
        .map((runner, index) => (runner ? { ...runner, currentBase: (index + 1) as 1 | 2 | 3 } : null))
        .filter(r => r !== null) as RunnerAdvancementInfo[];

      setRunnerAdvancementAfterSacrificeModalState({
        isOpen: true,
        batter: currentPlayerForPlay,
        sacrificeType: jugadaDef.jugada as 'SF' | 'SH',
        runnersOnBase: runnersOnBaseAtTimeOfSacrifice,
        advancements: {}, // To be filled by user in modal
        initialOuts: currentPartido.gameStatus.outs,
      });
      setIsPlayModalOpen(false);
      return;
    }


    // --- HIT LOGIC ---
    if (jugadaDef.category === PlayCategory.HIT && !isFreeEditModeForModal) {
        if (jugadaDef.jugada === 'HR') {
            // Process Home Run directly
            updateCurrentPartidoAndHistory(prevPartido => {
                if (!prevPartido || !currentPlayerForPlay) return prevPartido;
                let updatedPartido = { ...prevPartido };
                const batterLineupPlayer = currentPlayerForPlay;
                const initialBasesStateForLog = [...updatedPartido.gameStatus.bases];
                
                let totalRunsOnHR = 0;
                let totalRBIsForBatterOnHR = 0;

                // Update batter's direct HR stats (AB, H, HR)
                const batterLineupKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
                updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
                    if (p.id === batterLineupPlayer.id) {
                        const newStats = { ...p.stats };
                        newStats.atBats += 1;
                        newStats.hits += 1;
                        newStats.homeRuns += 1;
                        return { ...p, stats: newStats };
                    }
                    return p;
                });

                // Update team stats for HR
                const teamStatsKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'visitanteStats' : 'localStats';
                updatedPartido[teamStatsKey].hits += 1;
                updatedPartido[teamStatsKey].homeRuns += 1;

                const runJugadaDef = jugadasDB.find(j => j.jugada === 'R');
                const rbiJugadaDef = jugadasDB.find(j => j.jugada === 'RBI');
                const pitcher = getCurrentOpposingPitcher(updatedPartido);
                const formatoDesc = formatos.find(f => f.codigo === updatedPartido.formatoJuegoId)?.descripcion || 'N/A';
                const teamAtBatNombre = updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal;

                // Process runners on base
                initialBasesStateForLog.forEach(runnerOnBase => {
                    if (runnerOnBase) {
                        _applySingleRunScoringLogic(updatedPartido, runnerOnBase, batterLineupPlayer.id);
                        totalRunsOnHR++;
                        totalRBIsForBatterOnHR++;
                         // Log 'R' for runner
                        if (runJugadaDef) {
                            updatedPartido.registrosJuego.push({
                                id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                                halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: runnerOnBase.lineupPlayerId,
                                bateadorNombre: runnerOnBase.nombreJugador, bateadorPosicion: (updatedPartido[batterLineupKey]).find(p=>p.id===runnerOnBase.lineupPlayerId)?.posicion || '',
                                pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                                equipoBateadorNombre: teamAtBatNombre, jugadaId: 'R', descripcion: runJugadaDef.descripcion, 
                                outsPrev: prevPartido.gameStatus.outs, outsAfter: prevPartido.gameStatus.outs, 
                                basesPrevState: initialBasesStateForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                                basesAfterState: [null,null,null].map(p => p ? p.lineupPlayerId : 'null').join('-'), // HR clears bases
                                runScored: 1, rbi: 0,
                                fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: (updatedPartido[batterLineupKey]).find(p=>p.id===runnerOnBase.lineupPlayerId)?.ordenBate || 0,
                            });
                        }
                        // Log 'RBI' for batter (due to this runner)
                        if (rbiJugadaDef) {
                             updatedPartido.registrosJuego.push({
                                id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                                halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batterLineupPlayer.id,
                                bateadorNombre: batterLineupPlayer.nombreJugador, bateadorPosicion: batterLineupPlayer.posicion,
                                pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                                equipoBateadorNombre: teamAtBatNombre, jugadaId: 'RBI', descripcion: rbiJugadaDef.descripcion,
                                outsPrev: prevPartido.gameStatus.outs, outsAfter: prevPartido.gameStatus.outs,
                                basesPrevState: initialBasesStateForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                                basesAfterState: [null,null,null].map(p => p ? p.lineupPlayerId : 'null').join('-'),
                                runScored: 0, rbi: 1,
                                fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: batterLineupPlayer.ordenBate,
                            });
                        }
                    }
                });

                // Process batter scoring their own run on HR
                _applySingleRunScoringLogic(updatedPartido, batterLineupPlayer, batterLineupPlayer.id);
                totalRunsOnHR++;
                totalRBIsForBatterOnHR++;
                 // Log 'R' for batter
                if (runJugadaDef) {
                     updatedPartido.registrosJuego.push({
                        id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                        halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batterLineupPlayer.id,
                        bateadorNombre: batterLineupPlayer.nombreJugador, bateadorPosicion: batterLineupPlayer.posicion,
                        pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                        equipoBateadorNombre: teamAtBatNombre, jugadaId: 'R', descripcion: runJugadaDef.descripcion,
                        outsPrev: prevPartido.gameStatus.outs, outsAfter: prevPartido.gameStatus.outs,
                        basesPrevState: initialBasesStateForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                        basesAfterState: [null,null,null].map(p => p ? p.lineupPlayerId : 'null').join('-'),
                        runScored: 1, rbi: 0,
                        fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: batterLineupPlayer.ordenBate,
                    });
                }
                // Log 'RBI' for batter (for their own run)
                if (rbiJugadaDef) {
                     updatedPartido.registrosJuego.push({
                        id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                        halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batterLineupPlayer.id,
                        bateadorNombre: batterLineupPlayer.nombreJugador, bateadorPosicion: batterLineupPlayer.posicion,
                        pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                        equipoBateadorNombre: teamAtBatNombre, jugadaId: 'RBI', descripcion: rbiJugadaDef.descripcion,
                        outsPrev: prevPartido.gameStatus.outs, outsAfter: prevPartido.gameStatus.outs,
                        basesPrevState: initialBasesStateForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                        basesAfterState: [null,null,null].map(p => p ? p.lineupPlayerId : 'null').join('-'),
                        runScored: 0, rbi: 1,
                        fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: batterLineupPlayer.ordenBate,
                    });
                }

                // Create main HR log entry
                const hrJugadaDef = jugadasDB.find(j => j.jugada === 'HR')!;
                const mainHRLogEntry: RegistroJuego = {
                    id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                    halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batterLineupPlayer.id,
                    bateadorNombre: batterLineupPlayer.nombreJugador, bateadorPosicion: batterLineupPlayer.posicion,
                    pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                    equipoBateadorNombre: teamAtBatNombre, jugadaId: 'HR', descripcion: hrJugadaDef.descripcion,
                    outsPrev: prevPartido.gameStatus.outs, outsAfter: prevPartido.gameStatus.outs,
                    basesPrevState: initialBasesStateForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                    basesAfterState: [null,null,null].map(p => p ? p.lineupPlayerId : 'null').join('-'), // Bases cleared
                    runScored: totalRunsOnHR, rbi: totalRBIsForBatterOnHR,
                    fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: batterLineupPlayer.ordenBate,
                };
                updatedPartido.registrosJuego.push(mainHRLogEntry);

                // Add HR to batter's innings cell display
                const playInInningCellToAdd: PlayInInningCell = {
                    playInstanceId: mainHRLogEntry.id, jugadaId: mainHRLogEntry.jugadaId, descripcion: mainHRLogEntry.descripcion,
                    playDisplayValue: `${mainHRLogEntry.jugadaId}${mainHRLogEntry.rbi > 0 ? ` (${mainHRLogEntry.rbi} RBI)` : ''}`
                };
                updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
                    if (p.id === batterLineupPlayer.id) {
                        const updatedInnings = { ...p.innings };
                        if (!updatedInnings[mainHRLogEntry.inning]) updatedInnings[mainHRLogEntry.inning] = [];
                        updatedInnings[mainHRLogEntry.inning].push(playInInningCellToAdd);
                        // Batter stats for AB, H, HR already updated. R, RBI handled by _applySingleRunScoringLogic
                        return { ...p, innings: updatedInnings };
                    }
                    return p;
                });
                
                // Update game status
                updatedPartido.gameStatus = {
                    ...updatedPartido.gameStatus,
                    bases: [null, null, null], // Clear bases
                    lastPlayContext: { batterLineupPlayerId: batterLineupPlayer.id, jugada: hrJugadaDef, timestamp: Date.now(), previousBatterLineupPlayerId: prevPartido.gameStatus.lastPlayContext?.batterLineupPlayerId !== batterLineupPlayer.id ? prevPartido.gameStatus.lastPlayContext?.batterLineupPlayerId : prevPartido.gameStatus.lastPlayContext?.previousBatterLineupPlayerId },
                    currentBatterLineupPlayerId: findNextBatterInLineup(updatedPartido[batterLineupKey], batterLineupPlayer.id)
                };
                return updatedPartido;
            });
            setIsPlayModalOpen(false);
            setCurrentPlayerForPlay(null);
            return; // HR processed, exit early
        }

        // For H1, H2, H3:
        const runnersOnBaseAtTimeOfHit = currentPartido.gameStatus.bases
            .map((runner, index) => (runner ? { ...runner, currentBase: (index + 1) as 1 | 2 | 3 } : null))
            .filter(r => r !== null) as RunnerAdvancementInfo[];

        const batterReachedBaseNumeric: 1 | 2 | 3 | 4 = // batterReachedBase is 1,2,3 for H1,H2,H3
            jugadaDef.jugada === 'H1' ? 1 :
            jugadaDef.jugada === 'H2' ? 2 :
            jugadaDef.jugada === 'H3' ? 3 : 1; // Default for safety, should be H1/2/3

        if (runnersOnBaseAtTimeOfHit.length > 0) {
            setRunnerAdvancementAfterHitModalState({
                isOpen: true,
                batter: currentPlayerForPlay,
                hitType: jugadaDef.jugada as 'H1' | 'H2' | 'H3', // HR case handled above
                batterReachedBase: batterReachedBaseNumeric,
                runnersOnBase: runnersOnBaseAtTimeOfHit,
                advancements: runnersOnBaseAtTimeOfHit.reduce((acc, runner) => {
                    const actualBatterReachedBase = batterReachedBaseNumeric as 1 | 2 | 3;
                    const minBaseRunnerMustOccupy = runner.currentBase < actualBatterReachedBase 
                                                    ? actualBatterReachedBase 
                                                    : runner.currentBase === actualBatterReachedBase 
                                                        ? Math.min(4, runner.currentBase + 1) 
                                                        : runner.currentBase; 
                    const advancedByHitValue = runner.currentBase + actualBatterReachedBase;
                    acc[runner.lineupPlayerId] = Math.min(4, Math.max(minBaseRunnerMustOccupy, advancedByHitValue));
                    return acc;
                }, {} as { [key: string]: number }),
            });
            setIsPlayModalOpen(false);
            return; // Modal will handle it for H1, H2, H3 with runners
        } else { // Hit (H1,H2,H3) with no runners on base
            updateCurrentPartidoAndHistory(prevPartido => {
                if (!prevPartido || !currentPlayerForPlay) return prevPartido;
                let updatedPartido = { ...prevPartido };
                const batterLineupPlayer = currentPlayerForPlay;
                const initialBasesState = [...updatedPartido.gameStatus.bases]; // Should be empty

                let tempBatterStats = { ...batterLineupPlayer.stats };
                tempBatterStats.atBats += 1;
                tempBatterStats.hits += 1;
                if (jugadaDef.jugada === 'H1') tempBatterStats.singles += 1;
                else if (jugadaDef.jugada === 'H2') tempBatterStats.doubles += 1;
                else if (jugadaDef.jugada === 'H3') tempBatterStats.triples += 1;
                
                let newBasesState: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [null, null, null];
                const batterAsPlayerOnBase: PlayerOnBase = {
                    lineupPlayerId: batterLineupPlayer.id,
                    jugadorId: batterLineupPlayer.jugadorId,
                    nombreJugador: batterLineupPlayer.nombreJugador,
                    reachedOnJugadaId: jugadaDef.jugada
                };
                newBasesState[batterReachedBaseNumeric - 1] = batterAsPlayerOnBase;

                const teamStatsKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'visitanteStats' : 'localStats';
                updatedPartido[teamStatsKey].hits += 1;

                const pitcher = getCurrentOpposingPitcher(updatedPartido);
                const formatoDesc = formatos.find(f => f.codigo === updatedPartido.formatoJuegoId)?.descripcion || 'N/A';
                const newRegistro: RegistroJuego = {
                    id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                    halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batterLineupPlayer.id,
                    bateadorNombre: batterLineupPlayer.nombreJugador, bateadorPosicion: batterLineupPlayer.posicion,
                    pitcherResponsableId: pitcher ? pitcher.id : null,
                    pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                    equipoBateadorNombre: updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                    jugadaId: jugadaDef.jugada, descripcion: jugadaDef.descripcion, outsPrev: updatedPartido.gameStatus.outs,
                    outsAfter: updatedPartido.gameStatus.outs, 
                    basesPrevState: initialBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                    basesAfterState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                    runScored: 0, rbi: 0, // No runs/RBIs on simple H1/H2/H3 with no runners
                    fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: batterLineupPlayer.ordenBate,
                };
                const playInInningCellToAdd: PlayInInningCell = {
                    playInstanceId: newRegistro.id, jugadaId: newRegistro.jugadaId, descripcion: newRegistro.descripcion,
                    playDisplayValue: `${newRegistro.jugadaId}`
                };
                const batterLineupKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
                updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
                    if (p.id === batterLineupPlayer.id) {
                        const updatedInnings = { ...p.innings };
                        if (!updatedInnings[newRegistro.inning]) updatedInnings[newRegistro.inning] = [];
                        updatedInnings[newRegistro.inning].push(playInInningCellToAdd);
                        return {...p, stats: tempBatterStats, innings: updatedInnings };
                    }
                    return p;
                });
                updatedPartido.registrosJuego = [...updatedPartido.registrosJuego, newRegistro];
                updatedPartido.gameStatus = {
                    ...updatedPartido.gameStatus,
                    bases: newBasesState,
                    lastPlayContext: { batterLineupPlayerId: batterLineupPlayer.id, jugada: jugadaDef, timestamp: Date.now(), previousBatterLineupPlayerId: prevPartido.gameStatus.lastPlayContext?.batterLineupPlayerId !== batterLineupPlayer.id ? prevPartido.gameStatus.lastPlayContext?.batterLineupPlayerId : prevPartido.gameStatus.lastPlayContext?.previousBatterLineupPlayerId },
                    currentBatterLineupPlayerId: findNextBatterInLineup(updatedPartido[batterLineupKey], batterLineupPlayer.id)
                };
                return updatedPartido;
            });
            setIsPlayModalOpen(false);
            setCurrentPlayerForPlay(null);
            return; 
        }
    }
    // --- END HIT LOGIC ---


    updateCurrentPartidoAndHistory(prevPartido => {
        if (!prevPartido || !currentPlayerForPlay) return prevPartido;

        let updatedPartido = { ...prevPartido };
        const batterLineupPlayer = currentPlayerForPlay;
        const initialBases: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] =
            [...(updatedPartido.gameStatus.bases)];

        const batterAtStartOfPlayId = batterLineupPlayer.id; 
        const newLastPlayContext: LastPlayContext = {
            batterLineupPlayerId: batterLineupPlayer.id,
            jugada: jugadaDef,
            timestamp: Date.now(),
            previousBatterLineupPlayerId: updatedPartido.gameStatus.lastPlayContext?.batterLineupPlayerId !== batterLineupPlayer.id ? updatedPartido.gameStatus.lastPlayContext?.batterLineupPlayerId : updatedPartido.gameStatus.lastPlayContext?.previousBatterLineupPlayerId
        };

        let newBasesState: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [...initialBases];
        let runsScoredThisPlay = 0;
        let rbisForBatterThisPlay = 0;
        let outsFromPlay = 0;

        let tempBatterStats = { ...batterLineupPlayer.stats };
        // let tempTeamHitsThisPlay = 0; // Handled by HIT specific logic now
        // let tempTeamHRThisPlay = 0; // Handled by HIT specific logic now

        const batterAsPlayerOnBase: PlayerOnBase = {
            lineupPlayerId: batterLineupPlayer.id,
            jugadorId: batterLineupPlayer.jugadorId,
            nombreJugador: batterLineupPlayer.nombreJugador,
            reachedOnJugadaId: jugadaDef.jugada
        };

        if (isFreeEditModeForModal) {
            // Free edit mode only logs the play
        } else {
             // AT BAT LOGIC (EXCLUDING HITS as they are handled above or by modal)
            if (jugadaDef.category !== PlayCategory.HIT && (jugadaDef.jugada === 'FC' || (jugadaDef.category === PlayCategory.OUT && jugadaDef.jugada !== 'SF' && jugadaDef.jugada !== 'SH'))) {
                tempBatterStats.atBats += 1;
            }

            if (jugadaDef.category === PlayCategory.ON_BASE) {
                if (jugadaDef.jugada === 'BB' || jugadaDef.jugada === 'IBB') tempBatterStats.walks += 1;

                if (jugadaDef.jugada === 'BB' || jugadaDef.jugada === 'IBB' || jugadaDef.jugada === 'HBP') { // Bases loaded walk/HBP forces runs
                    if (newBasesState[0]) { // Runner on 1st
                        if (newBasesState[1]) { // Runner on 2nd
                            if (newBasesState[2]) { // Runner on 3rd (bases loaded)
                                const runnerFrom3B = newBasesState[2]!;
                                _applySingleRunScoringLogic(updatedPartido, runnerFrom3B, batterLineupPlayer.id);
                                runsScoredThisPlay++; rbisForBatterThisPlay++;
                                newBasesState[2] = newBasesState[1]; // 2nd to 3rd
                                newBasesState[1] = newBasesState[0]; // 1st to 2nd
                                newBasesState[0] = batterAsPlayerOnBase; // Batter to 1st
                            } else { // Runners on 1st and 2nd
                                newBasesState[2] = newBasesState[1]; // 2nd to 3rd
                                newBasesState[1] = newBasesState[0]; // 1st to 2nd
                                newBasesState[0] = batterAsPlayerOnBase; // Batter to 1st
                            }
                        } else { // Runner on 1st only
                            newBasesState[1] = newBasesState[0]; // 1st to 2nd
                            newBasesState[0] = batterAsPlayerOnBase; // Batter to 1st
                        }
                    } else { // No one on 1st
                        newBasesState[0] = batterAsPlayerOnBase; // Batter to 1st
                    }
                } else {  // Other ON_BASE plays like FC, E (batter to 1st, runners hold unless forced by modal logic later if FC leads to choosing runner out)
                     // For FC, if a runner is out, that's handled separately. Here, batter reaches.
                     // For E, batter reaches (handled by ErrorAdvancementModal if jugadaDef.jugada === 'E').
                     // Simple placement on 1B for now. Complex runner interactions on FC/E are not detailed here.
                     if (jugadaDef.jugada !== 'E') { // E is handled by its modal
                        newBasesState[0] = batterAsPlayerOnBase;
                     }
                }
            } else if (jugadaDef.category === PlayCategory.OUT) {
                if (jugadaDef.jugada === 'K') tempBatterStats.strikeouts += 1;

                if (jugadaDef.jugada === 'SF') { // Sacrifice Fly
                    if (updatedPartido.gameStatus.outs < 2 && newBasesState[2]) { // Runner on 3B, < 2 outs
                        const runnerFrom3B = newBasesState[2]!;
                        _applySingleRunScoringLogic(updatedPartido, runnerFrom3B, batterLineupPlayer.id);
                        runsScoredThisPlay++; rbisForBatterThisPlay++;
                        newBasesState[2] = null; // Runner from 3B scores
                    }
                }
                // SH (Sac Bunt) might advance runners, but batter is out. No RBI unless error allows score.
                // CS (Caught Stealing) is a runner out, not batter. Handled by runner actions.
                // DP, TP are handled by their specific functions.

                if (jugadaDef.jugada !== 'DP' && jugadaDef.jugada !== 'TP' && jugadaDef.jugada !== 'SF' && jugadaDef.jugada !== 'SH') { // DP/TP/SF/SH outs handled in their own functions/modals
                   outsFromPlay = 1;
                }
            }
        }
        tempBatterStats.rbi += rbisForBatterThisPlay;

        const baseStateToString = (basesTuple: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null]): string => {
            return basesTuple.map(p => p ? p.lineupPlayerId : 'null').join('-');
        };

        const pitcher = getCurrentOpposingPitcher(updatedPartido);
        const formatoDesc = formatos.find(f => f.codigo === updatedPartido.formatoJuegoId)?.descripcion || 'N/A';

        const newRegistro: RegistroJuego = {
            id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
            halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batterLineupPlayer.id,
            bateadorNombre: batterLineupPlayer.nombreJugador, bateadorPosicion: batterLineupPlayer.posicion,
            pitcherResponsableId: pitcher ? pitcher.id : null,
            pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
            equipoBateadorNombre: updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
            jugadaId: jugadaDef.jugada, descripcion: jugadaDef.descripcion, outsPrev: updatedPartido.gameStatus.outs,
            outsAfter: isFreeEditModeForModal ? updatedPartido.gameStatus.outs : Math.min(3, updatedPartido.gameStatus.outs + outsFromPlay),
            basesPrevState: baseStateToString(initialBases),
            basesAfterState: isFreeEditModeForModal ? baseStateToString(initialBases) : baseStateToString(newBasesState),
            runScored: runsScoredThisPlay, rbi: rbisForBatterThisPlay,
            fechaDelPartido: updatedPartido.fecha,
            formatoDelPartidoDesc: formatoDesc,
            numeroDelPartido: updatedPartido.numeroJuego,
            ordenDelBateador: batterLineupPlayer.ordenBate,
        };
        
        const playInInningCellToAdd: PlayInInningCell = {
            playInstanceId: newRegistro.id,
            jugadaId: newRegistro.jugadaId,
            descripcion: newRegistro.descripcion,
            playDisplayValue: `${newRegistro.jugadaId}${newRegistro.rbi > 0 ? ` (${newRegistro.rbi} RBI)` : ''}`
        };

        const batterLineupKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
        updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
            if (p.id === batterLineupPlayer.id) {
                const updatedInnings = { ...p.innings };
                if (!updatedInnings[newRegistro.inning]) {
                    updatedInnings[newRegistro.inning] = [];
                }
                updatedInnings[newRegistro.inning].push(playInInningCellToAdd);
                return {...p, stats: tempBatterStats, innings: updatedInnings };
            }
            return p;
        });

        // Team stats for HITS and HRs are handled in their specific blocks or modal confirmation
        // Here we just update general game status based on non-hit plays

        if (!isFreeEditModeForModal) {
            updatedPartido.gameStatus = {
                ...updatedPartido.gameStatus,
                bases: newBasesState,
                lastPlayContext: newLastPlayContext,
            };
        }
        updatedPartido.registrosJuego = [...updatedPartido.registrosJuego, newRegistro];

        if (!isFreeEditModeForModal && outsFromPlay > 0) {
            const { updatedGameStatus: statusAfterOuts, gameShouldEnd } = _calculateOutsUpdate(
                updatedPartido.gameStatus,
                outsFromPlay,
                updatedPartido.maxInnings,
                updatedPartido.lineupVisitante,
                updatedPartido.lineupLocal,
                updatedPartido.visitanteStats.totalRuns,
                updatedPartido.localStats.totalRuns
            );
            updatedPartido.gameStatus = statusAfterOuts; 
            if (gameShouldEnd && gamePhase === 'scoring') {
                setGamePhase('ended');
            }
        } else if (!isFreeEditModeForModal && jugadaDef.category !== PlayCategory.OUT && jugadaDef.category !== PlayCategory.HIT && jugadaDef.jugada !== 'E' && jugadaDef.jugada !== 'SF' && jugadaDef.jugada !== 'SH') { // For BB, HBP, FC - advance batter. 'E' advancement handled by its modal
            const currentBatterLineup = updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal;
            updatedPartido.gameStatus.currentBatterLineupPlayerId = findNextBatterInLineup(currentBatterLineup, batterLineupPlayer.id);
        }
        return updatedPartido;
    });

    setIsPlayModalOpen(false);
    setCurrentPlayerForPlay(null);
    setIsFreeEditModeForModal(false);
  };

  const confirmDoublePlayOuts = (outedPlayerIds: [string, string], jugadaDef: Jugada, treatAsBatterOutTwice: boolean = false) => {
    if (!currentPartido || !currentPlayerForPlay) return;
    saveToHistory(currentPartido);

    updateCurrentPartidoAndHistory(prev => {
        if (!prev || !currentPlayerForPlay) return prev;
        let updatedPartido = { ...prev };
        const batterLineupPlayer = currentPlayerForPlay;
        const initialBases: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [...updatedPartido.gameStatus.bases];
        let newBasesState: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [...updatedPartido.gameStatus.bases];

        let tempBatterStats = { ...batterLineupPlayer.stats };
        tempBatterStats.atBats += 1;

        let outsFromPlay = 2;

        if (treatAsBatterOutTwice) {
            // Bases remain as they were, batter is effectively out twice
        } else {
            outedPlayerIds.forEach(outedId => {
                 // If the outed player is the batter, they don't end up on base.
                // If it's a runner, remove them.
                if (outedId !== batterLineupPlayer.id) {
                    newBasesState = newBasesState.map(runnerOnBase =>
                        runnerOnBase && runnerOnBase.lineupPlayerId === outedId ? null : runnerOnBase
                    ) as [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null];
                }
            });
        }

        const newLastPlayContext: LastPlayContext = {
            batterLineupPlayerId: batterLineupPlayer.id, // Batter is still context of play
            jugada: jugadaDef,
            timestamp: Date.now(),
            previousBatterLineupPlayerId: updatedPartido.gameStatus.lastPlayContext?.batterLineupPlayerId !== batterLineupPlayer.id ? updatedPartido.gameStatus.lastPlayContext?.batterLineupPlayerId : updatedPartido.gameStatus.lastPlayContext?.previousBatterLineupPlayerId
        };

        const baseStateToString = (basesTuple: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null]): string => {
            return basesTuple.map(p => p ? p.lineupPlayerId : 'null').join('-');
        };

        const pitcher = getCurrentOpposingPitcher(updatedPartido);
        const formatoDesc = formatos.find(f => f.codigo === updatedPartido.formatoJuegoId)?.descripcion || 'N/A';

        const newRegistro: RegistroJuego = {
            id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
            halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batterLineupPlayer.id,
            bateadorNombre: batterLineupPlayer.nombreJugador, bateadorPosicion: batterLineupPlayer.posicion,
            pitcherResponsableId: pitcher ? pitcher.id : null,
            pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
            equipoBateadorNombre: updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
            jugadaId: jugadaDef.jugada, descripcion: `${jugadaDef.descripcion} (${outedPlayerIds.map(id => {
                const p = updatedPartido.lineupVisitante.find(pl => pl.id === id) || updatedPartido.lineupLocal.find(pl => pl.id === id);
                return p?.nombreJugador || 'Jugador';
            }).join(' y ')})`,
            outsPrev: updatedPartido.gameStatus.outs,
            outsAfter: Math.min(3, updatedPartido.gameStatus.outs + outsFromPlay),
            basesPrevState: baseStateToString(initialBases),
            basesAfterState: baseStateToString(newBasesState),
            runScored: 0, rbi: 0,
            fechaDelPartido: updatedPartido.fecha,
            formatoDelPartidoDesc: formatoDesc,
            numeroDelPartido: updatedPartido.numeroJuego,
            ordenDelBateador: batterLineupPlayer.ordenBate,
        };
        
        const playInInningCellToAdd: PlayInInningCell = {
            playInstanceId: newRegistro.id,
            jugadaId: newRegistro.jugadaId,
            descripcion: newRegistro.descripcion,
            playDisplayValue: `${newRegistro.jugadaId}`
        };

        const batterLineupKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
        updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
            if (p.id === batterLineupPlayer.id) {
                const updatedInnings = { ...p.innings };
                if (!updatedInnings[newRegistro.inning]) {
                    updatedInnings[newRegistro.inning] = [];
                }
                updatedInnings[newRegistro.inning].push(playInInningCellToAdd);
                return {...p, stats: tempBatterStats, innings: updatedInnings };
            }
            return p;
        });

        updatedPartido.gameStatus = { // Must set bases before calculating outs
            ...updatedPartido.gameStatus,
            bases: newBasesState, 
            lastPlayContext: newLastPlayContext,
        };
        updatedPartido.registrosJuego = [...updatedPartido.registrosJuego, newRegistro];

        const { updatedGameStatus: statusAfterOuts, gameShouldEnd } = _calculateOutsUpdate(
            updatedPartido.gameStatus, // Pass status with already updated bases
            outsFromPlay,
            updatedPartido.maxInnings,
            updatedPartido.lineupVisitante,
            updatedPartido.lineupLocal,
            updatedPartido.visitanteStats.totalRuns,
            updatedPartido.localStats.totalRuns
        );
        updatedPartido.gameStatus = statusAfterOuts; 
        if (gameShouldEnd && gamePhase === 'scoring') {
            setGamePhase('ended');
        }
        return updatedPartido;
    });
    setIsDoublePlayModalOpen(false);
    setDoublePlayContext(null);
    setCurrentPlayerForPlay(null);
  };


  const handleErrorAdvancementConfirm = (baseReached: 0 | 1 | 2 | 3, errorPlayerId: number | null) => {
    if (!currentPartido || !errorModalContext) return;
    saveToHistory(currentPartido);

    updateCurrentPartidoAndHistory(prev => {
        if (!prev || !errorModalContext) return prev;
        let updatedPartido = { ...prev };
        const { batterLineupPlayer } = errorModalContext;
        const initialBases: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] =
            [...(updatedPartido.gameStatus.bases)];

        let newBasesState: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [...initialBases];
        let runsScoredThisPlay = 0;
        // Batter does NOT get an At-Bat for reaching on error.

        const batterAsPlayerOnBase: PlayerOnBase = {
            lineupPlayerId: batterLineupPlayer.id,
            jugadorId: batterLineupPlayer.jugadorId,
            nombreJugador: batterLineupPlayer.nombreJugador,
            reachedOnJugadaId: 'E' 
        };

        if (baseReached === 3) { // Home
            _applySingleRunScoringLogic(updatedPartido, batterAsPlayerOnBase, null); 
            runsScoredThisPlay++;
        } else if (baseReached >=0 && baseReached < 3) { // 1B, 2B, 3B
            newBasesState[baseReached] = batterAsPlayerOnBase;
        }


        const defensiveTeamKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'localStats' : 'visitanteStats';
        updatedPartido[defensiveTeamKey].errors += 1;

        const baseStateToString = (basesTuple: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null]): string => {
            return basesTuple.map(p => p ? p.lineupPlayerId : 'null').join('-');
        };

        const pitcher = getCurrentOpposingPitcher(updatedPartido); 
        const formatoDesc = formatos.find(f => f.codigo === updatedPartido.formatoJuegoId)?.descripcion || 'N/A';

        // Log "E" for the batter
        const batterErrorLog: RegistroJuego = {
            id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
            halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batterLineupPlayer.id,
            bateadorNombre: batterLineupPlayer.nombreJugador, bateadorPosicion: batterLineupPlayer.posicion,
            pitcherResponsableId: pitcher ? pitcher.id : null,
            pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
            equipoBateadorNombre: updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
            jugadaId: 'E', 
            descripcion: "Error (permite embasarse)", 
            outsPrev: updatedPartido.gameStatus.outs,
            outsAfter: updatedPartido.gameStatus.outs, 
            basesPrevState: baseStateToString(initialBases),
            basesAfterState: baseStateToString(newBasesState),
            runScored: runsScoredThisPlay, rbi: 0,
            fechaDelPartido: updatedPartido.fecha,
            formatoDelPartidoDesc: formatoDesc,
            numeroDelPartido: updatedPartido.numeroJuego,
            ordenDelBateador: batterLineupPlayer.ordenBate,
        };
        updatedPartido.registrosJuego.push(batterErrorLog);

        // If specific fielder, log "ED" for them and update their lineup cell
        if (errorPlayerId) {
            const errorPlayerInfo = jugadoresDB.find(j => j.codigo === errorPlayerId);
            if (errorPlayerInfo) {
                const defensiveLineupKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'lineupLocal' : 'lineupVisitante';
                const fielderLineupPlayerIndex = updatedPartido[defensiveLineupKey].findIndex(p => p.jugadorId === errorPlayerInfo.codigo);

                const fielderErrorLog: RegistroJuego = {
                    id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                    halfInning: updatedPartido.gameStatus.currentHalfInning, 
                    bateadorId: fielderLineupPlayerIndex !== -1 ? updatedPartido[defensiveLineupKey][fielderLineupPlayerIndex].id : String(errorPlayerInfo.codigo),
                    bateadorNombre: errorPlayerInfo.nombre,
                    bateadorPosicion: fielderLineupPlayerIndex !== -1 ? updatedPartido[defensiveLineupKey][fielderLineupPlayerIndex].posicion : errorPlayerInfo.posicionPreferida,
                    pitcherResponsableId: pitcher ? pitcher.id : null, 
                    pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                    equipoBateadorNombre: updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.nombreEquipoLocal : updatedPartido.nombreEquipoVisitante, 
                    jugadaId: 'ED',
                    descripcion: "Error Defensivo", 
                    outsPrev: updatedPartido.gameStatus.outs, 
                    outsAfter: updatedPartido.gameStatus.outs,
                    basesPrevState: baseStateToString(newBasesState), 
                    basesAfterState: baseStateToString(newBasesState),
                    runScored: 0, rbi: 0,
                    fechaDelPartido: updatedPartido.fecha,
                    formatoDelPartidoDesc: formatoDesc,
                    numeroDelPartido: updatedPartido.numeroJuego,
                    ordenDelBateador: fielderLineupPlayerIndex !== -1 ? updatedPartido[defensiveLineupKey][fielderLineupPlayerIndex].ordenBate : 0,
                };
                updatedPartido.registrosJuego.push(fielderErrorLog);

                // Add "ED" to fielder's lineup cell
                if (fielderLineupPlayerIndex !== -1) {
                    const playInInningCellForFielder: PlayInInningCell = {
                        playInstanceId: fielderErrorLog.id,
                        jugadaId: 'ED',
                        descripcion: fielderErrorLog.descripcion,
                        playDisplayValue: 'ED'
                    };
                    const fielderToUpdate = updatedPartido[defensiveLineupKey][fielderLineupPlayerIndex];
                    const updatedFielderInnings = { ...fielderToUpdate.innings };
                    if (!updatedFielderInnings[fielderErrorLog.inning]) {
                        updatedFielderInnings[fielderErrorLog.inning] = [];
                    }
                    updatedFielderInnings[fielderErrorLog.inning].push(playInInningCellForFielder);
                    updatedPartido[defensiveLineupKey][fielderLineupPlayerIndex] = { ...fielderToUpdate, innings: updatedFielderInnings };
                }
            }
        }
        
        const playInInningCellToAdd: PlayInInningCell = {
            playInstanceId: batterErrorLog.id, 
            jugadaId: 'E',
            descripcion: batterErrorLog.descripcion,
            playDisplayValue: `E${runsScoredThisPlay > 0 ? ` (Anota)` : ''}`
        };

        const batterLineupKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
        updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
            if (p.id === batterLineupPlayer.id) {
                const updatedInnings = { ...p.innings };
                if (!updatedInnings[batterErrorLog.inning]) {
                    updatedInnings[batterErrorLog.inning] = [];
                }
                updatedInnings[batterErrorLog.inning].push(playInInningCellToAdd);
                return {...p, innings: updatedInnings }; 
            }
            return p;
        });

        updatedPartido.gameStatus = {
            ...updatedPartido.gameStatus,
            bases: newBasesState,
            lastPlayContext: { batterLineupPlayerId: batterLineupPlayer.id, jugada: jugadasDB.find(j => j.jugada === 'E') || null, timestamp: Date.now(), previousBatterLineupPlayerId: updatedPartido.gameStatus.lastPlayContext?.batterLineupPlayerId !== batterLineupPlayer.id ? updatedPartido.gameStatus.lastPlayContext?.batterLineupPlayerId : updatedPartido.gameStatus.lastPlayContext?.previousBatterLineupPlayerId},
            currentBatterLineupPlayerId: findNextBatterInLineup(updatedPartido[batterLineupKey], batterLineupPlayer.id),
        };

        return updatedPartido;
    });
    setIsErrorModalOpen(false);
    setErrorModalContext(null);
  };

  const handleConfirmRbiAssignment = (rbiCreditedToPlayerId: string | null) => {
    if (!currentPartido || !assignRbiModalState.scoringPlayerInfo) return;
    const { scoringPlayerInfo, baseIndexOfScorer } = assignRbiModalState;
    if (typeof baseIndexOfScorer === 'undefined') {
        console.error("Base index of scorer is undefined in RBI assignment.");
        setAssignRbiModalState({ isOpen: false, scoringPlayerInfo: null, batterForRbiContext: null, previousBatterForRbiContext: null });
        return;
    }

    saveToHistory(currentPartido);
    updateCurrentPartidoAndHistory(prev => {
        if (!prev || !scoringPlayerInfo) return prev;
        let updatedPartido = { ...prev };
        
        let newBases = [...updatedPartido.gameStatus.bases];
        if (newBases[baseIndexOfScorer]?.lineupPlayerId === scoringPlayerInfo.lineupPlayerId) {
            newBases[baseIndexOfScorer] = null;
        }
        updatedPartido.gameStatus.bases = newBases as [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null];


        _applySingleRunScoringLogic(updatedPartido, scoringPlayerInfo, rbiCreditedToPlayerId);

        const pitcher = getCurrentOpposingPitcher(updatedPartido);
        const formatoDesc = formatos.find(f => f.codigo === updatedPartido.formatoJuegoId)?.descripcion || 'N/A';
        const scoringPlayerLineupDetails = (updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal).find(p => p.id === scoringPlayerInfo.lineupPlayerId);
        
        let rbiPlayerName = 'Nadie';
        if (rbiCreditedToPlayerId) {
            const rbiPlayerDetails = updatedPartido.lineupVisitante.find(p => p.id === rbiCreditedToPlayerId) || updatedPartido.lineupLocal.find(p => p.id === rbiCreditedToPlayerId);
            if (rbiPlayerDetails) rbiPlayerName = rbiPlayerDetails.nombreJugador;
        }

        const scoringLog: RegistroJuego = {
            id: generateUUID(),
            timestamp: Date.now(),
            inning: updatedPartido.gameStatus.actualInningNumber,
            halfInning: updatedPartido.gameStatus.currentHalfInning,
            bateadorId: rbiCreditedToPlayerId || updatedPartido.gameStatus.currentBatterLineupPlayerId || 'N/A_MANUAL_SCORE',
            bateadorNombre: scoringPlayerInfo.nombreJugador, 
            bateadorPosicion: scoringPlayerLineupDetails?.posicion || '',
            pitcherResponsableId: pitcher ? pitcher.id : null,
            pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
            equipoBateadorNombre: updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
            jugadaId: 'R_MANUAL',
            descripcion: `${scoringPlayerInfo.nombreJugador} anotó. ${rbiCreditedToPlayerId ? `RBI para ${rbiPlayerName}.` : 'Sin RBI.'}`,
            outsPrev: prev.gameStatus.outs, 
            outsAfter: updatedPartido.gameStatus.outs, // Manual score doesn't add outs
            basesPrevState: [...prev.gameStatus.bases].map(p => p ? p.lineupPlayerId : 'null').join('-'), 
            basesAfterState: newBases.map(p => p ? p.lineupPlayerId : 'null').join('-'), 
            runScored: 1,
            rbi: rbiCreditedToPlayerId ? 1 : 0,
            fechaDelPartido: updatedPartido.fecha,
            formatoDelPartidoDesc: formatoDesc,
            numeroDelPartido: updatedPartido.numeroJuego,
            ordenDelBateador: scoringPlayerLineupDetails ? scoringPlayerLineupDetails.ordenBate : 0,
        };
        updatedPartido.registrosJuego = [...updatedPartido.registrosJuego, scoringLog];
        updatedPartido.gameStatus.lastPlayContext = null; 
        
        if (rbiCreditedToPlayerId) {
            const batterLineupKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
            const rbiBatter = updatedPartido[batterLineupKey].find(p => p.id === rbiCreditedToPlayerId);
            if(rbiBatter) {
                 const playInInningCellForRbi: PlayInInningCell = {
                    playInstanceId: scoringLog.id,
                    jugadaId: "RBI_MANUAL", 
                    descripcion: scoringLog.descripcion,
                    playDisplayValue: "RBI (M)"
                };
                updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
                    if (p.id === rbiCreditedToPlayerId) {
                        const updatedInnings = { ...p.innings };
                        if (!updatedInnings[scoringLog.inning]) {
                            updatedInnings[scoringLog.inning] = [];
                        }
                        updatedInnings[scoringLog.inning].push(playInInningCellForRbi);
                        return {...p, innings: updatedInnings };
                    }
                    return p;
                });
            }
        }
        // No change to currentBatterLineupPlayerId from manual score
        return updatedPartido;
    });
    setAssignRbiModalState({ isOpen: false, scoringPlayerInfo: null, batterForRbiContext: null, previousBatterForRbiContext: null, baseIndexOfScorer: undefined });
  };


  const handleRunnerAction = (action: RunnerActionType) => {
    if (!currentPartido || !managingRunner || gamePhase === 'ended') return;
    const { player: runnerInfo, baseIndex: originalRunnerBaseIndex } = managingRunner;


    if (action === 'advanceTo2B' || action === 'advanceTo3BFrom1B' || action === 'advanceTo3BFrom2B') {
        const targetBaseIndex = action === 'advanceTo2B' ? 1 : (action === 'advanceTo3BFrom1B' || action === 'advanceTo3BFrom2B' ? 2 : 0);
        setRunnerAdvancementContext({
            runner: runnerInfo,
            baseIndexAdvancedTo: targetBaseIndex as 0 | 1 | 2,
            onConfirm: (reason, errorPlayerId) => {
                saveToHistory(currentPartido!);
                updateCurrentPartidoAndHistory(prevPartidoForModal => {
                    if (!prevPartidoForModal) return prevPartidoForModal;
                    let updatedPartidoFromModal = { ...prevPartidoForModal };
                    let newBasesFromModal: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [...updatedPartidoFromModal.gameStatus.bases];

                    newBasesFromModal[originalRunnerBaseIndex] = null;
                    newBasesFromModal[targetBaseIndex] = runnerInfo;

                    updatedPartidoFromModal.gameStatus.bases = newBasesFromModal;
                    updatedPartidoFromModal.gameStatus.lastPlayContext = null;

                    if (reason === RunnerAdvancementReason.ERROR_ADVANCE) {
                        const defensiveTeamKey = updatedPartidoFromModal.gameStatus.currentHalfInning === 'Top' ? 'localStats' : 'visitanteStats';
                        updatedPartidoFromModal[defensiveTeamKey].errors += 1;
                    }

                    const pitcher = getCurrentOpposingPitcher(updatedPartidoFromModal);
                    const formatoDesc = formatos.find(f => f.codigo === updatedPartidoFromModal.formatoJuegoId)?.descripcion || 'N/A';
                    const runnerLineupPlayer = (updatedPartidoFromModal.gameStatus.currentHalfInning === 'Top' ? updatedPartidoFromModal.lineupVisitante : updatedPartidoFromModal.lineupLocal).find(p => p.id === runnerInfo.lineupPlayerId);


                    const newRegistro: RegistroJuego = {
                        id: generateUUID(), timestamp: Date.now(), inning: updatedPartidoFromModal.gameStatus.actualInningNumber,
                        halfInning: updatedPartidoFromModal.gameStatus.currentHalfInning,
                        bateadorId: updatedPartidoFromModal.gameStatus.currentBatterLineupPlayerId || 'N/A_RUNNER_ACTION',
                        bateadorNombre: runnerInfo.nombreJugador,
                        bateadorPosicion: runnerLineupPlayer?.posicion || '',
                        pitcherResponsableId: pitcher ? pitcher.id : null,
                        pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                        equipoBateadorNombre: updatedPartidoFromModal.gameStatus.currentHalfInning === 'Top' ? updatedPartidoFromModal.nombreEquipoVisitante : updatedPartidoFromModal.nombreEquipoLocal,
                        jugadaId: String(reason),
                        descripcion: `Avance Manual: ${runnerInfo.nombreJugador} a ${targetBaseIndex + 1}B. Motivo: ${reason}. ${errorPlayerId ? `Error de #${jugadoresDB.find(j => j.codigo === errorPlayerId)?.numero || errorPlayerId}`: ''}`,
                        outsPrev: updatedPartidoFromModal.gameStatus.outs,
                        outsAfter: updatedPartidoFromModal.gameStatus.outs, // Advancement itself doesn't cause outs
                        basesPrevState: [...prevPartidoForModal.gameStatus.bases].map(p => p ? p.lineupPlayerId : 'null').join('-'),
                        basesAfterState: newBasesFromModal.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                        runScored: 0, rbi: 0,
                        advancementReason: reason,
                        fechaDelPartido: updatedPartidoFromModal.fecha,
                        formatoDelPartidoDesc: formatoDesc,
                        numeroDelPartido: updatedPartidoFromModal.numeroJuego,
                        ordenDelBateador: runnerLineupPlayer ? runnerLineupPlayer.ordenBate : 0,
                    };
                    updatedPartidoFromModal.registrosJuego = [...updatedPartidoFromModal.registrosJuego, newRegistro];
                    // No change to currentBatterLineupPlayerId from simple runner advancement
                    return updatedPartidoFromModal;
                });
                setIsRunnerAdvancementReasonModalOpen(false);
                setRunnerAdvancementContext(null);
            }
        });
        setIsRunnerAdvancementReasonModalOpen(true);
        setIsRunnerActionModalOpen(false);
        setManagingRunner(null);
        return;
    }

    if (action === 'scoreManually') {
        const currentLineupForContext = currentPartido.gameStatus.currentHalfInning === 'Top' ? currentPartido.lineupVisitante : currentPartido.lineupLocal;
        const batterForContext = currentLineupForContext.find(p => p.id === currentPartido.gameStatus.currentBatterLineupPlayerId);
        
        let previousBatterForContext: LineupPlayer | null = null;
        if(currentPartido.gameStatus.lastPlayContext?.previousBatterLineupPlayerId) {
             previousBatterForContext = currentLineupForContext.find(p => p.id === currentPartido.gameStatus.lastPlayContext!.previousBatterLineupPlayerId);
        } else if (currentPartido.gameStatus.lastPlayContext?.batterLineupPlayerId && currentPartido.gameStatus.lastPlayContext?.batterLineupPlayerId !== batterForContext?.id) {
             previousBatterForContext = currentLineupForContext.find(p => p.id === currentPartido.gameStatus.lastPlayContext!.batterLineupPlayerId);
        }


        setAssignRbiModalState({
            isOpen: true,
            scoringPlayerInfo: runnerInfo,
            batterForRbiContext: batterForContext || null,
            previousBatterForRbiContext: previousBatterForContext,
            baseIndexOfScorer: originalRunnerBaseIndex
        });
        setIsRunnerActionModalOpen(false);
        setManagingRunner(null);
        return; 
    }
    
    // Default action: 'outRunner'
    saveToHistory(currentPartido!);
    updateCurrentPartidoAndHistory(prev => {
        if (!prev || !managingRunner) return prev;
        let updatedPartido = { ...prev };
        let newBases: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [...updatedPartido.gameStatus.bases];
        const pitcher = getCurrentOpposingPitcher(updatedPartido);
        const formatoDesc = formatos.find(f => f.codigo === updatedPartido.formatoJuegoId)?.descripcion || 'N/A';
        const runnerLineupPlayer = (updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal).find(p => p.id === runnerInfo.lineupPlayerId);

        const outsPrevForLog = updatedPartido.gameStatus.outs;
        newBases[originalRunnerBaseIndex] = null;
        
        // Save the current batter before updating outs, as _calculateOutsUpdate might change it
        const batterBeforeOut = updatedPartido.gameStatus.currentBatterLineupPlayerId;

        updatedPartido.gameStatus.bases = newBases; // Update bases before calling _calculateOutsUpdate

        const { updatedGameStatus: statusAfterOut, gameShouldEnd } = _calculateOutsUpdate(
            updatedPartido.gameStatus, 1, updatedPartido.maxInnings,
            updatedPartido.lineupVisitante, updatedPartido.lineupLocal,
            updatedPartido.visitanteStats.totalRuns,
            updatedPartido.localStats.totalRuns
        );
        updatedPartido.gameStatus = statusAfterOut; 
        
        // If half inning didn't change (still outs to make), ensure current batter logic is correct.
        // _calculateOutsUpdate will set next batter if inning changes, or advance if same inning.
        // If it was the 3rd out, the currentBatterLineupPlayerId for the *next* half is set by _calculateOutsUpdate.
        // If not the 3rd out, the currentBatterLineupPlayerId should remain who was batting, or advance.
        // The _calculateOutsUpdate should handle setting the correct next batter.

        if (gameShouldEnd && gamePhase === 'scoring') {
            setGamePhase('ended');
        }
        const outLog: RegistroJuego = {
            id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
            halfInning: prev.gameStatus.currentHalfInning, // Log with half inning before potential change
            bateadorId: batterBeforeOut || 'N/A_RUNNER_OUT', // Log who was batting when runner was out
            bateadorNombre: runnerInfo.nombreJugador, // This log is ABOUT the runner
            bateadorPosicion: runnerLineupPlayer?.posicion || '',
            pitcherResponsableId: pitcher ? pitcher.id : null,
            pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
            equipoBateadorNombre: updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
            jugadaId: 'OUT_RUNNER',
            descripcion: `Out al Corredor: ${runnerInfo.nombreJugador} en ${originalRunnerBaseIndex+1}B.`,
            outsPrev: outsPrevForLog,
            outsAfter: updatedPartido.gameStatus.outs, // Outs after applying the current out
            basesPrevState: [...prev.gameStatus.bases].map(p => p ? p.lineupPlayerId : 'null').join('-'),
            basesAfterState: newBases.map(p => p ? p.lineupPlayerId : 'null').join('-'),
            runScored: 0, rbi: 0,
            fechaDelPartido: updatedPartido.fecha,
            formatoDelPartidoDesc: formatoDesc,
            numeroDelPartido: updatedPartido.numeroJuego,
            ordenDelBateador: runnerLineupPlayer ? runnerLineupPlayer.ordenBate : 0,
        };
        updatedPartido.registrosJuego = [...updatedPartido.registrosJuego, outLog];
        updatedPartido.gameStatus.lastPlayContext = null;
        return updatedPartido;
    });
    setIsRunnerActionModalOpen(false);
    setManagingRunner(null);
  };

  const handleConfirmRunnerAdvancementsFromHitModal = (
    advancements: { [key: string]: number }, // { runnerLineupId: targetBase (0=OUT, 1-4) }
    batter: LineupPlayer,
    hitType: 'H1' | 'H2' | 'H3' | 'HR', // HR should not reach here if direct processing is done
    batterFinalDestBase: 1 | 2 | 3 | 4 
  ) => {
    saveToHistory(currentPartido!);
    updateCurrentPartidoAndHistory(prev => {
        if (!prev) return prev;
        let updatedPartido = { ...prev };
        let newBasesState: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [null, null, null];
        let runsScoredThisPlay = 0; 
        let rbisForBatterThisPlay = 0;
        let outsThisPlay = 0;

        let tempBatterStats = { ...batter.stats }; // For AB, H, specific hit type
        tempBatterStats.atBats +=1;
        tempBatterStats.hits +=1;
        if (hitType === 'H1') tempBatterStats.singles +=1;
        else if (hitType === 'H2') tempBatterStats.doubles +=1;
        else if (hitType === 'H3') tempBatterStats.triples +=1;
        // HR case should not call this modal path, but if it did:
        else if (hitType === 'HR') tempBatterStats.homeRuns +=1; 
        
        const teamAtBat = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'visitante' : 'local';
        const teamStatsKey = teamAtBat === 'visitante' ? 'visitanteStats' : 'localStats';
        updatedPartido[teamStatsKey].hits += 1;
        if (hitType === 'HR') updatedPartido[teamStatsKey].homeRuns +=1;

        const batterAsPlayerOnBase: PlayerOnBase = {
            lineupPlayerId: batter.id,
            jugadorId: batter.jugadorId,
            nombreJugador: batter.nombreJugador,
            reachedOnJugadaId: hitType
        };

        const runJugadaDef = jugadasDB.find(j => j.jugada === 'R');
        const rbiJugadaDef = jugadasDB.find(j => j.jugada === 'RBI');
        const outRunnerOnHitJugadaDef = { jugada: 'OUT_ROH', descripcion: 'Out Corredor en Hit', category: PlayCategory.OUT, isDefault: false, isActive: true};
        const pitcher = getCurrentOpposingPitcher(updatedPartido);
        const formatoDesc = formatos.find(f => f.codigo === updatedPartido.formatoJuegoId)?.descripcion || 'N/A';
        const initialBasesForLog = [...prev.gameStatus.bases];
        const outsBeforePlayForLog = prev.gameStatus.outs;


        // Process existing runners first
        const runnersToPlaceOnBases: { player: PlayerOnBase, targetBase: number }[] = [];
        runnerAdvancementAfterHitModalState.runnersOnBase.forEach(runnerInfo => {
            const targetBase = advancements[runnerInfo.lineupPlayerId]; 
            if (targetBase === 0) { // Runner is OUT
                outsThisPlay++;
                // Log 'OUT_ROH' for runner
                const outLog: RegistroJuego = {
                    id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                    halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: runnerInfo.lineupPlayerId, // Log is about the runner
                    bateadorNombre: runnerInfo.nombreJugador, bateadorPosicion: (teamAtBat === 'visitante' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal).find(p=>p.id===runnerInfo.lineupPlayerId)?.posicion || '',
                    pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                    equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                    jugadaId: outRunnerOnHitJugadaDef.jugada, descripcion: `${runnerInfo.nombreJugador} out en base durante hit de ${batter.nombreJugador}.`,
                    outsPrev: outsBeforePlayForLog + outsThisPlay -1, // Outs before THIS specific out event
                    outsAfter: outsBeforePlayForLog + outsThisPlay,   // Outs after THIS specific out event
                    basesPrevState: initialBasesForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'), 
                    basesAfterState: initialBasesForLog.map(p => p && p.lineupPlayerId !== runnerInfo.lineupPlayerId ? p.lineupPlayerId : 'null').join('-'), // Tentative, final state later
                    runScored: 0, rbi: 0,
                    fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: (teamAtBat === 'visitante' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal).find(p=>p.id===runnerInfo.lineupPlayerId)?.ordenBate || 0,
                };
                updatedPartido.registrosJuego.push(outLog);
            } else if (targetBase === 4) { // Runner Scored HOME
                _applySingleRunScoringLogic(updatedPartido, runnerInfo, batter.id); // Updates player stats (R for runner, RBI for batter)
                runsScoredThisPlay++;
                rbisForBatterThisPlay++;

                if (runJugadaDef) { 
                    updatedPartido.registrosJuego.push({
                        id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                        halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: runnerInfo.lineupPlayerId,
                        bateadorNombre: runnerInfo.nombreJugador, bateadorPosicion: (teamAtBat === 'visitante' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal).find(p=>p.id===runnerInfo.lineupPlayerId)?.posicion || '',
                        pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                        equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                        jugadaId: 'R', descripcion: runJugadaDef.descripcion, outsPrev: outsBeforePlayForLog + outsThisPlay,
                        outsAfter: outsBeforePlayForLog + outsThisPlay, basesPrevState: initialBasesForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                        basesAfterState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'), 
                        runScored: 1, rbi: 0,
                        fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: (teamAtBat === 'visitante' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal).find(p=>p.id===runnerInfo.lineupPlayerId)?.ordenBate || 0,
                    });
                }
                if (rbiJugadaDef) { 
                     updatedPartido.registrosJuego.push({
                        id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                        halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batter.id,
                        bateadorNombre: batter.nombreJugador, bateadorPosicion: batter.posicion,
                        pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                        equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                        jugadaId: 'RBI', descripcion: rbiJugadaDef.descripcion, outsPrev: outsBeforePlayForLog + outsThisPlay,
                        outsAfter: outsBeforePlayForLog + outsThisPlay, basesPrevState: initialBasesForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                        basesAfterState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'), 
                        runScored: 0, rbi: 1,
                        fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: batter.ordenBate,
                    });
                }
            } else if (targetBase >= 1 && targetBase <= 3) {
                runnersToPlaceOnBases.push({ player: runnerInfo, targetBase });
            }
        });
        
        // Process batter's own advancement
        if (batterFinalDestBase === 4) { // Batter scored (HR - though this path should be rare now)
            _applySingleRunScoringLogic(updatedPartido, batter, batter.id); // Updates player stats
            runsScoredThisPlay++;
            rbisForBatterThisPlay++;
            if (runJugadaDef) { 
                 updatedPartido.registrosJuego.push({
                    id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                    halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batter.id,
                    bateadorNombre: batter.nombreJugador, bateadorPosicion: batter.posicion,
                    pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                    equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                    jugadaId: 'R', descripcion: runJugadaDef.descripcion, outsPrev: outsBeforePlayForLog + outsThisPlay,
                    outsAfter: outsBeforePlayForLog + outsThisPlay, basesPrevState: initialBasesForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                    basesAfterState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'), 
                    runScored: 1, rbi: 0,
                    fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: batter.ordenBate,
                });
            }
            if (rbiJugadaDef) { 
                updatedPartido.registrosJuego.push({
                    id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                    halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batter.id,
                    bateadorNombre: batter.nombreJugador, bateadorPosicion: batter.posicion,
                    pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                    equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                    jugadaId: 'RBI', descripcion: rbiJugadaDef.descripcion, outsPrev: outsBeforePlayForLog + outsThisPlay,
                    outsAfter: outsBeforePlayForLog + outsThisPlay, basesPrevState: initialBasesForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                    basesAfterState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'), 
                    runScored: 0, rbi: 1,
                    fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: batter.ordenBate,
                });
            }
        } else if (batterFinalDestBase >=1 && batterFinalDestBase <=3) {
             runnersToPlaceOnBases.push({ player: batterAsPlayerOnBase, targetBase: batterFinalDestBase });
        }
        
        // Place players on bases, highest base first to avoid overwriting
        runnersToPlaceOnBases.sort((a, b) => b.targetBase - a.targetBase);
        runnersToPlaceOnBases.forEach(item => {
            if (newBasesState[item.targetBase - 1] === null) {
                newBasesState[item.targetBase - 1] = item.player;
            } else {
                // This shouldn't happen if logic is correct (e.g., two runners ending on same base)
                console.warn(`Collision on base ${item.targetBase} while placing ${item.player.nombreJugador}. Previous: ${newBasesState[item.targetBase-1]?.nombreJugador}`);
            }
        });
        
        // Batter's total RBIs from this play are added to their stats. _applySingleRunScoringLogic handles this.
        // Update the batter's primary hit stats (AB, H, H1/2/3)
        const batterLineupKey = teamAtBat === 'visitante' ? 'lineupVisitante' : 'lineupLocal'; // Corrected lineupLocal
        updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
            if (p.id === batter.id) {
                // tempBatterStats already has AB, H, H1/2/3. RBIs/Runs are handled by _applySingleRunScoringLogic
                return {...p, stats: { ...p.stats, ...tempBatterStats, rbi: p.stats.rbi + rbisForBatterThisPlay } };
            }
            return p;
        });

        // Main log entry for the HIT
        const hitJugadaDef = jugadasDB.find(j => j.jugada === hitType)!;
        const mainHitRegistro: RegistroJuego = {
            id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
            halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batter.id,
            bateadorNombre: batter.nombreJugador, bateadorPosicion: batter.posicion,
            pitcherResponsableId: pitcher ? pitcher.id : null,
            pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
            equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
            jugadaId: hitType, descripcion: hitJugadaDef.descripcion, 
            outsPrev: outsBeforePlayForLog,
            outsAfter: outsBeforePlayForLog + outsThisPlay, 
            basesPrevState: initialBasesForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
            basesAfterState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'), 
            runScored: runsScoredThisPlay, rbi: rbisForBatterThisPlay, 
            fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: batter.ordenBate,
        };
        const playInInningCellToAdd: PlayInInningCell = {
            playInstanceId: mainHitRegistro.id, jugadaId: mainHitRegistro.jugadaId, descripcion: mainHitRegistro.descripcion,
            playDisplayValue: `${mainHitRegistro.jugadaId}${mainHitRegistro.rbi > 0 ? ` (${mainHitRegistro.rbi} RBI)` : ''}`
        };
        updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
            if (p.id === batter.id) {
                const updatedInnings = { ...p.innings };
                if (!updatedInnings[mainHitRegistro.inning]) updatedInnings[mainHitRegistro.inning] = [];
                updatedInnings[mainHitRegistro.inning].push(playInInningCellToAdd);
                return {...p, innings: updatedInnings };
            }
            return p;
        });
        updatedPartido.registrosJuego.push(mainHitRegistro); 

        // Update game status (outs, next batter etc.)
        updatedPartido.gameStatus = {
            ...updatedPartido.gameStatus,
            bases: newBasesState,
            lastPlayContext: { batterLineupPlayerId: batter.id, jugada: hitJugadaDef, timestamp: Date.now(), previousBatterLineupPlayerId: prev.gameStatus.lastPlayContext?.batterLineupPlayerId !== batter.id ? prev.gameStatus.lastPlayContext?.batterLineupPlayerId : prev.gameStatus.lastPlayContext?.previousBatterLineupPlayerId },
        };
        
        if (outsThisPlay > 0) {
            const { updatedGameStatus: statusAfterOuts, gameShouldEnd } = _calculateOutsUpdate(
                updatedPartido.gameStatus, 
                outsThisPlay, 
                updatedPartido.maxInnings,
                updatedPartido.lineupVisitante, 
                updatedPartido.lineupLocal,
                updatedPartido.visitanteStats.totalRuns, 
                updatedPartido.localStats.totalRuns
            );
            updatedPartido.gameStatus = statusAfterOuts;
            if (gameShouldEnd && gamePhase === 'scoring') {
                setGamePhase('ended');
            }
        } else { // No outs from runners, just advance batter
             updatedPartido.gameStatus.currentBatterLineupPlayerId = findNextBatterInLineup(updatedPartido[batterLineupKey], batter.id);
        }
        
        return updatedPartido;
    });
    setRunnerAdvancementAfterHitModalState({ isOpen: false, batter: null, hitType: null, batterReachedBase: 1, runnersOnBase: [], advancements: {} });
  };


  const handleConfirmRunnerAdvancementsFromSacrificeModal = (
    advancements: { [key: string]: number }, 
    batter: LineupPlayer,
    sacrificeType: 'SF' | 'SH',
    initialOuts: number 
  ) => {
    saveToHistory(currentPartido!);
    updateCurrentPartidoAndHistory(prev => {
      if (!prev) return prev;
      let updatedPartido = { ...prev };
      let newBasesState: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [null, null, null];
      let runsScoredThisPlay = 0;
      let rbisForBatterThisPlay = 0;
      let outsGeneratedThisPlay = 1; // Batter is out on sacrifice

      let tempBatterStats = { ...batter.stats };
      // Sacrifice plays (SF, SH) do NOT count as an At-Bat (AB).
      // They are outs, but not ABs. RBIs are credited if a run scores.
      
      const teamAtBat = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'visitante' : 'local';
      const runJugadaDef = jugadasDB.find(j => j.jugada === 'R');
      const rbiJugadaDef = jugadasDB.find(j => j.jugada === 'RBI');
      const outRunnerOnSacJugadaDef = { jugada: 'OUT_ROS', descripcion: 'Out Corredor en Sacrificio', category: PlayCategory.OUT, isDefault: false, isActive: true };
      const pitcher = getCurrentOpposingPitcher(updatedPartido);
      const formatoDesc = formatos.find(f => f.codigo === updatedPartido.formatoJuegoId)?.descripcion || 'N/A';
      const initialBasesForLog = [...prev.gameStatus.bases];

      const runnersToPlaceOnBases: { player: PlayerOnBase, targetBase: number }[] = [];
      runnerAdvancementAfterSacrificeModalState.runnersOnBase.forEach(runnerInfo => {
        const targetBase = advancements[runnerInfo.lineupPlayerId];
        const runnerLineupPlayer = (teamAtBat === 'visitante' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal).find(p => p.id === runnerInfo.lineupPlayerId);

        if (targetBase === 0) { // Runner is OUT
          outsGeneratedThisPlay++;
          if (outRunnerOnSacJugadaDef) {
            updatedPartido.registrosJuego.push({
              id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
              halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: runnerInfo.lineupPlayerId,
              bateadorNombre: runnerInfo.nombreJugador, bateadorPosicion: runnerLineupPlayer?.posicion || '',
              pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
              equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
              jugadaId: outRunnerOnSacJugadaDef.jugada, descripcion: `${runnerInfo.nombreJugador} out en base durante sacrificio de ${batter.nombreJugador}.`,
              outsPrev: initialOuts + outsGeneratedThisPlay - 1, outsAfter: initialOuts + outsGeneratedThisPlay,
              basesPrevState: initialBasesForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
              basesAfterState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'), 
              runScored: 0, rbi: 0,
              fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: runnerLineupPlayer?.ordenBate || 0,
            });
          }
        } else if (targetBase === 4) { // Runner Scored HOME
          _applySingleRunScoringLogic(updatedPartido, runnerInfo, batter.id);
          runsScoredThisPlay++;
          rbisForBatterThisPlay++; // For the main sacrifice log
          // Log 'R' for the scoring runner
          if (runJugadaDef) {
            updatedPartido.registrosJuego.push({
              id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
              halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: runnerInfo.lineupPlayerId,
              bateadorNombre: runnerInfo.nombreJugador, bateadorPosicion: runnerLineupPlayer?.posicion || '',
              pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
              equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
              jugadaId: 'R', descripcion: runJugadaDef.descripcion,
              outsPrev: initialOuts + outsGeneratedThisPlay, 
              outsAfter: initialOuts + outsGeneratedThisPlay,
              basesPrevState: initialBasesForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'), 
              basesAfterState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'), 
              runScored: 1, rbi: 0,
              fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: runnerLineupPlayer?.ordenBate || 0,
            });
          }
          // Log 'RBI' for the batter
          if (rbiJugadaDef) {
             updatedPartido.registrosJuego.push({
                id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batter.id, 
                bateadorNombre: batter.nombreJugador, bateadorPosicion: batter.posicion,
                pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                jugadaId: 'RBI', descripcion: rbiJugadaDef.descripcion,
                outsPrev: initialOuts + outsGeneratedThisPlay,
                outsAfter: initialOuts + outsGeneratedThisPlay,
                basesPrevState: initialBasesForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                basesAfterState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                runScored: 0, rbi: 1, 
                fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: batter.ordenBate,
            });
          }
        } else if (targetBase >= 1 && targetBase <= 3) {
          runnersToPlaceOnBases.push({ player: runnerInfo, targetBase });
        }
      });

      runnersToPlaceOnBases.sort((a, b) => b.targetBase - a.targetBase);
      runnersToPlaceOnBases.forEach(item => {
        if (newBasesState[item.targetBase - 1] === null) {
          newBasesState[item.targetBase - 1] = item.player;
        }
      });

      // Batter's RBI for sacrifice play are already handled by _applySingleRunScoringLogic
      // (it updates batter's RBI count directly if rbiCreditedToPlayerId is provided)
      // tempBatterStats.rbi += rbisForBatterThisPlay; // This was redundant

      const batterLineupKey = teamAtBat === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
      updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
        if (p.id === batter.id) return { ...p, stats: tempBatterStats }; // tempBatterStats used to hold non-AB, RBI update by _applySingleRun...
        return p;
      });

      const sacrificeJugadaDef = jugadasDB.find(j => j.jugada === sacrificeType)!;
      const mainSacrificeLog: RegistroJuego = {
        id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
        halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batter.id,
        bateadorNombre: batter.nombreJugador, bateadorPosicion: batter.posicion,
        pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
        equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
        jugadaId: sacrificeType, descripcion: sacrificeJugadaDef.descripcion,
        outsPrev: initialOuts, outsAfter: initialOuts + outsGeneratedThisPlay,
        basesPrevState: initialBasesForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
        basesAfterState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'),
        runScored: runsScoredThisPlay, rbi: rbisForBatterThisPlay,
        fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: batter.ordenBate,
      };
      updatedPartido.registrosJuego.push(mainSacrificeLog);

      const playInInningCellToAdd: PlayInInningCell = {
        playInstanceId: mainSacrificeLog.id, jugadaId: mainSacrificeLog.jugadaId, descripcion: mainSacrificeLog.descripcion,
        playDisplayValue: `${mainSacrificeLog.jugadaId}${mainSacrificeLog.rbi > 0 ? ` (${mainSacrificeLog.rbi} RBI)` : ''}`
      };
      updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
        if (p.id === batter.id) {
          const updatedInnings = { ...p.innings };
          if (!updatedInnings[mainSacrificeLog.inning]) updatedInnings[mainSacrificeLog.inning] = [];
          updatedInnings[mainSacrificeLog.inning].push(playInInningCellToAdd);
          return { ...p, innings: updatedInnings };
        }
        return p;
      });

      const { updatedGameStatus, gameShouldEnd } = _calculateOutsUpdate(
        { ...updatedPartido.gameStatus, bases: newBasesState, outs: initialOuts }, 
        outsGeneratedThisPlay, updatedPartido.maxInnings,
        updatedPartido.lineupVisitante, updatedPartido.lineupLocal,
        updatedPartido.visitanteStats.totalRuns, updatedPartido.localStats.totalRuns
      );
      updatedPartido.gameStatus = updatedGameStatus;
      if (gameShouldEnd && gamePhase === 'scoring') {
        setGamePhase('ended');
      }

      return updatedPartido;
    });
    setRunnerAdvancementAfterSacrificeModalState({ isOpen: false, batter: null, sacrificeType: null, runnersOnBase: [], advancements: {}, initialOuts: 0 });
  };


  const requestDeleteRegistro = (registroToDelete: RegistroJuego) => {
    setConfirmActionModalProps({
        title: 'Confirmar Eliminación de Registro',
        message: `¿Está seguro de que desea eliminar la jugada "${registroToDelete.descripcion}" del log? Esta acción no recalculará estadísticas. Use 'Retroceder Anotación' para un undo completo.`,
        onConfirm: () => {
            if (!currentPartido) return;
            updateCurrentPartidoAndHistory(prev => {
              if(!prev) return prev;
              const updatedRegistros = prev.registrosJuego.filter(r => r.id !== registroToDelete.id);
              
              let playerLineupToUpdateKey: 'lineupVisitante' | 'lineupLocal' | null = null;
              if (prev.lineupVisitante.some(p => p.id === registroToDelete.bateadorId)) {
                playerLineupToUpdateKey = 'lineupVisitante';
              } else if (prev.lineupLocal.some(p => p.id === registroToDelete.bateadorId)) {
                playerLineupToUpdateKey = 'lineupLocal';
              }

              let updatedLineupForPlayer: LineupPlayer[] | undefined = playerLineupToUpdateKey ? [...prev[playerLineupToUpdateKey]] : undefined;

              if (playerLineupToUpdateKey && updatedLineupForPlayer) {
                  updatedLineupForPlayer = updatedLineupForPlayer.map(p => {
                      if (p.id === registroToDelete.bateadorId) {
                          const updatedPlayerInnings = { ...p.innings };
                          if (updatedPlayerInnings[registroToDelete.inning]) {
                              updatedPlayerInnings[registroToDelete.inning] = updatedPlayerInnings[registroToDelete.inning].filter(
                                  cell => cell.playInstanceId !== registroToDelete.id
                              );
                              if (updatedPlayerInnings[registroToDelete.inning].length === 0) {
                                  delete updatedPlayerInnings[registroToDelete.inning];
                              }
                          }
                          return { ...p, innings: updatedPlayerInnings };
                      }
                      return p;
                  });
              }
              
              const updateObject: Partial<PartidoData> = { registrosJuego: updatedRegistros };
              if (playerLineupToUpdateKey && updatedLineupForPlayer) {
                updateObject[playerLineupToUpdateKey] = updatedLineupForPlayer;
              }

              return ({ ...prev, ...updateObject });
            });
            setIsConfirmActionModalOpen(false);
        },
        confirmButtonVariant: 'danger',
        confirmButtonText: "Eliminar Registro"
    });
    setIsConfirmActionModalOpen(true);
  };

  const handleOpenEditRegistroModal = (registro: RegistroJuego) => {
    setEditingRegistro(registro);
    setTempEditedPlayIdInModal(registro.jugadaId);
    setIsEditRegistroModalOpen(true);
  };

  const handleCloseEditRegistroModal = () => {
    setIsEditRegistroModalOpen(false);
    setEditingRegistro(null);
    setTempEditedPlayIdInModal('');
  };

  const handleSaveEditedRegistro = (selectedJugada: Jugada) => {
    if (!currentPartido || !editingRegistro) return;
    updateCurrentPartidoAndHistory(prev => {
        if (!prev || !editingRegistro) return prev;
        const updatedRegistros = prev.registrosJuego.map(r =>
            r.id === editingRegistro.id ? { ...r, jugadaId: selectedJugada.jugada, descripcion: selectedJugada.descripcion } : r
        );
        
        let playerLineupToUpdateKey: 'lineupVisitante' | 'lineupLocal' | null = null;
        if (prev.lineupVisitante.some(p => p.id === editingRegistro.bateadorId)) {
            playerLineupToUpdateKey = 'lineupVisitante';
        } else if (prev.lineupLocal.some(p => p.id === editingRegistro.bateadorId)) {
            playerLineupToUpdateKey = 'lineupLocal';
        }

        let updatedLineupForPlayer: LineupPlayer[] | undefined = playerLineupToUpdateKey ? [...prev[playerLineupToUpdateKey]] : undefined;

        if (playerLineupToUpdateKey && updatedLineupForPlayer) {
            updatedLineupForPlayer = updatedLineupForPlayer.map(p => {
                if (p.id === editingRegistro.bateadorId) {
                    const updatedPlayerInnings = { ...p.innings };
                    if (updatedPlayerInnings[editingRegistro.inning]) {
                        updatedPlayerInnings[editingRegistro.inning] = updatedPlayerInnings[editingRegistro.inning].map(cell => {
                            if (cell.playInstanceId === editingRegistro.id) {
                                return {
                                    ...cell,
                                    jugadaId: selectedJugada.jugada,
                                    descripcion: selectedJugada.descripcion,
                                    playDisplayValue: `${selectedJugada.jugada}${editingRegistro.rbi > 0 ? ` (${editingRegistro.rbi} RBI)` : ''}`
                                };
                            }
                            return cell;
                        });
                    }
                    return { ...p, innings: updatedPlayerInnings };
                }
                return p;
            });
        }
        
        const updateObject: Partial<PartidoData> = { registrosJuego: updatedRegistros };
        if (playerLineupToUpdateKey && updatedLineupForPlayer) {
            updateObject[playerLineupToUpdateKey] = updatedLineupForPlayer;
        }

        return ({ ...prev, ...updateObject });
    });
    handleCloseEditRegistroModal();
  };

  const handleSaveGame = () => {
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
    alert('Juego guardado en el historial.');
  };

  const requestEndGame = () => {
    setConfirmActionModalProps({
        title: 'Terminar Partido',
        message: '¿Está seguro de que desea terminar el partido? El juego se guardará en el historial.',
        onConfirm: () => {
            handleSaveGame();
            setPartidoEnCurso(null);
            setPartidoHistoryStack([]);
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
            if(!currentPartido) return;
            saveToHistory(currentPartido);
            updateCurrentPartidoAndHistory(prev => {
                if (!prev) return null;

                const firstVisitorBatterIdReset = findNextBatterInLineup(prev.lineupVisitante, null);
                const firstLocalBatterIdReset = findNextBatterInLineup(prev.lineupLocal, null);

                return {
                    ...prev,
                    gameStatus: {
                        ...createEmptyGameStatus(),
                        currentBatterLineupPlayerId: firstVisitorBatterIdReset, 
                        nextVisitorBatterLineupPlayerId: firstVisitorBatterIdReset,
                        nextLocalBatterLineupPlayerId: firstLocalBatterIdReset,
                        currentHalfInning: 'Top',
                        actualInningNumber: 1
                    },
                    visitanteStats: createEmptyTeamStats(),
                    localStats: createEmptyTeamStats(),
                    registrosJuego: [],
                    lineupVisitante: prev.lineupVisitante.map(p => ({...p, stats: createEmptyBatterStats(), innings: {}})), 
                    lineupLocal: prev.lineupLocal.map(p => ({...p, stats: createEmptyBatterStats(), innings: {}})),       
                };
            });
            setInningToShowInLineups(1); 
            alert('Partido reiniciado.');
            setIsConfirmActionModalOpen(false);
        },
        confirmButtonVariant: 'warning',
        confirmButtonText: 'Reiniciar'
    });
    setIsConfirmActionModalOpen(true);
  };

  const handleUndoLastAnnotation = () => {
    if (partidoHistoryStack.length > 0) {
        const previousState = partidoHistoryStack[0];
        setCurrentPartido(previousState);
        setPartidoHistoryStack(prevStack => prevStack.slice(1));
        setInningToShowInLineups(previousState.gameStatus.actualInningNumber); 

        if (previousState) {
            const pitcher = getCurrentOpposingPitcher(previousState);
            const formatoDesc = formatos.find(f => f.codigo === previousState.formatoJuegoId)?.descripcion || 'N/A';
            const batterPlayer = (previousState.gameStatus.currentHalfInning === 'Top' ? previousState.lineupVisitante : previousState.lineupLocal).find(p => p.id === previousState.gameStatus.currentBatterLineupPlayerId);

            const undoMarkerRegistro: RegistroJuego = {
                id: generateUUID(),
                timestamp: Date.now(),
                inning: previousState.gameStatus.actualInningNumber,
                halfInning: previousState.gameStatus.currentHalfInning,
                bateadorId: 'UNDO_ACTION',
                bateadorNombre: 'Sistema',
                bateadorPosicion: '',
                pitcherResponsableId: pitcher ? pitcher.id : null,
                pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                equipoBateadorNombre: '',
                jugadaId: 'UNDO_ACTION',
                descripcion: 'Acción de deshacer última anotación.',
                outsPrev: previousState.gameStatus.outs,
                outsAfter: previousState.gameStatus.outs,
                basesPrevState: previousState.gameStatus.bases.map(p => p?.lineupPlayerId ?? 'null').join('-'),
                basesAfterState: previousState.gameStatus.bases.map(p => p?.lineupPlayerId ?? 'null').join('-'),
                runScored: 0,
                rbi: 0,
                isUndoMarker: true,
                fechaDelPartido: previousState.fecha,
                formatoDelPartidoDesc: formatoDesc,
                numeroDelPartido: previousState.numeroJuego,
                ordenDelBateador: batterPlayer?.ordenBate || 0,
            };

            updateCurrentPartidoAndHistory(current => ({
                ...current!,
                registrosJuego: [...current!.registrosJuego, undoMarkerRegistro]
            }));
        }
        alert('Última anotación deshecha.');
    } else {
        alert('No hay más acciones para deshacer.');
    }
  };

  const handleExportCurrentPartidoCSV = () => {
    if (!currentPartido) {
        alert("No hay partido en curso para exportar.");
        return;
    }
    const metadataHeader = ["KEY", "VALUE"];
    const metadataRows = [
        ["idJuego", currentPartido.idJuego || ''], ["fecha", currentPartido.fecha],
        ["formatoJuegoId", String(currentPartido.formatoJuegoId)], ["numeroJuego", currentPartido.numeroJuego],
        ["nombreEquipoVisitante", currentPartido.nombreEquipoVisitante], ["nombreEquipoLocal", currentPartido.nombreEquipoLocal],
        ["selectedEquipoVisitanteId", String(currentPartido.selectedEquipoVisitanteId || '')], ["selectedEquipoLocalId", String(currentPartido.selectedEquipoLocalId || '')],
        ["maxInnings", String(currentPartido.maxInnings)], ["finalScoreVisitante", String(currentPartido.visitanteStats.totalRuns)],
        ["finalScoreLocal", String(currentPartido.localStats.totalRuns)],
    ];
    const metadataCsv = Papa.unparse({ fields: metadataHeader, data: metadataRows });

    const lineupHeaders = ["id", "ordenBate", "jugadorId", "nombreJugador", "posicion"];
    const lineupVisitorData = currentPartido.lineupVisitante.map(p => ({ id: p.id, ordenBate: p.ordenBate, jugadorId: p.jugadorId, nombreJugador: `"${p.nombreJugador.replace(/"/g, '""')}"`, posicion: p.posicion }));
    const lineupVisitorCsv = Papa.unparse({ fields: lineupHeaders, data: lineupVisitorData.map(p => lineupHeaders.map(h => p[h as keyof typeof p]))});
    const lineupLocalData = currentPartido.lineupLocal.map(p => ({ id: p.id, ordenBate: p.ordenBate, jugadorId: p.jugadorId, nombreJugador: `"${p.nombreJugador.replace(/"/g, '""')}"`, posicion: p.posicion }));
    const lineupLocalCsv = Papa.unparse({ fields: lineupHeaders, data: lineupLocalData.map(p => lineupHeaders.map(h => p[h as keyof typeof p]))});

    let logCsv = "";
    const logHeaders = ["id", "timestamp", "inning", "halfInning", "bateadorId", "bateadorNombre", "bateadorPosicion", "pitcherResponsableId", "pitcherResponsableNombre", "equipoBateadorNombre", "jugadaId", "descripcion", "categoria", "outsPrev", "outsAfter", "basesPrevState", "basesAfterState", "runScored", "rbi", "advancementReason", "fechaDelPartido", "formatoDelPartidoDesc", "numeroDelPartido", "ordenDelBateador"];
    if (currentPartido.registrosJuego.length > 0) {
        const logData = currentPartido.registrosJuego.map(r => {
            const jugadaDef = jugadasDB.find(j => j.jugada === r.jugadaId);
            return {
                ...r,
                bateadorNombre: `"${r.bateadorNombre.replace(/"/g, '""')}"`,
                pitcherResponsableNombre: r.pitcherResponsableNombre ? `"${r.pitcherResponsableNombre.replace(/"/g, '""')}"` : '',
                equipoBateadorNombre: `"${r.equipoBateadorNombre.replace(/"/g, '""')}"`,
                descripcion: `"${r.descripcion.replace(/"/g, '""')}"`,
                categoria: jugadaDef ? jugadaDef.category : (r.isUndoMarker ? '-' : 'N/A'),
                advancementReason: r.advancementReason || ''
            };
        });
        logCsv = Papa.unparse({ fields: logHeaders, data: logData.map(r => logHeaders.map(h => r[h as keyof typeof r]))});
    } else { logCsv = Papa.unparse({ fields: logHeaders, data: [] }); }

    const fullCsv = metadataCsv + "\n\n#LINEUP_VISITANTE_START\n" + lineupVisitorCsv + "\n\n#LINEUP_LOCAL_START\n" + lineupLocalCsv + "\n\n#REGISTROS_JUEGO_START\n" + logCsv;
    const blob = new Blob([fullCsv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const filename = `partido_${currentPartido.nombreEquipoVisitante}_vs_${currentPartido.nombreEquipoLocal}_${currentPartido.fecha}.csv`;
    link.setAttribute("href", url); link.setAttribute("download", filename);
    link.style.visibility = 'hidden'; document.body.appendChild(link);
    link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
  };

  const gameLogColumns: TableColumn<RegistroJuego>[] = [
    { header: 'Inn.', accessor: (item) => `${item.halfInning === 'Top' ? 'T' : 'B'}${item.inning}`, className: "w-12 text-xs"},
    { header: 'Fecha', accessor: (item) => new Date(item.fechaDelPartido + 'T00:00:00').toLocaleDateString(), className: "text-xs hidden lg:table-cell" },
    { header: 'Formato', accessor: 'formatoDelPartidoDesc', className: "text-xs hidden xl:table-cell truncate max-w-xs" },
    { header: 'Juego #', accessor: 'numeroDelPartido', className: "text-xs hidden xl:table-cell" },
    { header: 'Equipo', accessor: 'equipoBateadorNombre', className: "text-xs hidden sm:table-cell truncate max-w-[100px]" },
    { header: 'Bateador', accessor: 'bateadorNombre', className: "text-xs truncate max-w-[120px]" },
    { header: 'OB', accessor: 'ordenDelBateador', className: "text-xs w-10 text-center hidden md:table-cell"},
    { header: 'Pos.', accessor: 'bateadorPosicion', className: "text-xs hidden md:table-cell" },
    { header: 'Pitcher Rival', accessor: (item) => item.pitcherResponsableNombre || 'N/A', className: "text-xs hidden lg:table-cell truncate max-w-[120px]" },
    { header: 'Descripción Jugada', accessor: 'descripcion', className: "text-xs truncate max-w-[150px]" },
    {
      header: 'Categoría',
      accessor: (item: RegistroJuego) => {
        if (item.isUndoMarker) return <span className="text-xs italic text-gray-500">-</span>;
        const jugadaDef = jugadasDB.find(j => j.jugada === item.jugadaId);
        return jugadaDef ? jugadaDef.category : 'N/A';
      },
      className: "text-xs hidden lg:table-cell"
    },
    {
      header: 'Acciones',
      accessor: (item) => item.isUndoMarker ? <span className="text-xs italic text-gray-500">Deshacer</span> : (
        <div className="space-x-1 flex">
          <IconButton icon={<EditIcon />} onClick={()=>handleOpenEditRegistroModal(item)} label="Editar Registro" className="text-blue-500 hover:text-blue-700 p-1" />
          <IconButton icon={<MdDeleteForever className="w-5 h-5"/>} onClick={()=>requestDeleteRegistro(item)} label="Eliminar Registro" className="text-red-500 hover:text-red-700 p-1"/>
        </div>
      ),
      className: "w-20 text-center"
    }
  ];

  const handleOpenEditPlayerPositionModal = (player: LineupPlayer, team: ActiveLineupTab) => {
    if (gamePhase === 'ended') return;
    setEditingPlayerForPosition({ player, team });
    setIsEditPlayerPositionModalOpen(true);
  };


  if (!currentPartido) {
    return <div className="p-4 text-center">Redirigiendo a configuración de partido...</div>;
  }

  const activeJugadas = jugadasDB.filter(j => j.isActive);
  const groupedPlays = activeJugadas.reduce((acc, jugada) => {
    const category = jugada.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(jugada);
    return acc;
  }, {} as Record<PlayCategory, Jugada[]>);

  const playCategoryOrder: PlayCategory[] = [PlayCategory.HIT, PlayCategory.ON_BASE, PlayCategory.OUT, PlayCategory.ADVANCEMENT, PlayCategory.SPECIAL, PlayCategory.PITCH_OUTCOME];
  const playCategoryColors: Record<PlayCategory, "primary"|"secondary"|"success"|"danger"|"warning"|"info"|"light"> = {[PlayCategory.HIT]:"success",[PlayCategory.OUT]:"danger",[PlayCategory.ON_BASE]:"info",[PlayCategory.ADVANCEMENT]:"secondary",[PlayCategory.SPECIAL]:"warning",[PlayCategory.PITCH_OUTCOME]:"light"};

  const { gameStatus, visitanteStats, localStats, maxInnings } = currentPartido;
  let currentBatterDisplay: LineupPlayer|undefined, onDeckBatterDisplay: LineupPlayer|undefined;

  const currentLineup = gameStatus.currentHalfInning === 'Top' ? currentPartido.lineupVisitante : currentPartido.lineupLocal;
  if (currentLineup.length > 0) {
      currentBatterDisplay = currentLineup.find(p => p.id === gameStatus.currentBatterLineupPlayerId && p.posicion !== 'BE' && p.posicion !== EMPTY_POSICION_PLACEHOLDER);

      if (currentBatterDisplay) { 
          const onDeckBatterId = findNextBatterInLineup(currentLineup, currentBatterDisplay.id);
          if(onDeckBatterId) onDeckBatterDisplay = currentLineup.find(p => p.id === onDeckBatterId && p.posicion !== 'BE' && p.posicion !== EMPTY_POSICION_PLACEHOLDER);
      } else if (!gameStatus.currentBatterLineupPlayerId && gameStatus.outs < 3) { // If no current batter is set (e.g., start of half-inning)
         const nextBatterId = gameStatus.currentHalfInning === 'Top' ? gameStatus.nextVisitorBatterLineupPlayerId : gameStatus.nextLocalBatterLineupPlayerId;
         if (nextBatterId) {
            currentBatterDisplay = currentLineup.find(p => p.id === nextBatterId && p.posicion !== 'BE' && p.posicion !== EMPTY_POSICION_PLACEHOLDER);
         }
      }
  }

  const lineupToDisplay = activeLineupTab === 'visitante' ? currentPartido.lineupVisitante : currentPartido.lineupLocal;
  const teamTypeForDisplay: ActiveLineupTab = activeLineupTab;

  const handlePreviousInningLineup = () => {
    setInningToShowInLineups(prev => Math.max(1, prev - 1));
  };
  const handleNextInningLineup = () => {
    if(currentPartido) {
        setInningToShowInLineups(prev => Math.min(currentPartido.gameStatus.actualInningNumber, prev + 1));
    }
  };


  return (
    <div className="p-1 sm:p-4 space-y-6">
      <div className="bg-white p-4 shadow rounded-lg"><h1 className="text-2xl font-bold text-center mb-2">{currentPartido.nombreEquipoVisitante} vs {currentPartido.nombreEquipoLocal}</h1><p className="text-center text-sm text-gray-600">Fecha: {new Date(currentPartido.fecha+'T00:00:00').toLocaleDateString()} | Formato: {formatos.find(f=>f.codigo===currentPartido.formatoJuegoId)?.descripcion||'N/A'} | Juego #: {currentPartido.numeroJuego}</p></div>
      <div className="bg-white p-4 shadow rounded-lg overflow-x-auto"><h2 className="text-xl font-semibold mb-2">Marcador</h2><table className="min-w-full table-auto"><thead><tr className="bg-gray-100"><th className="p-2 border w-1/4">Equipo</th>{[...Array(maxInnings)].map((_,i)=><th key={i} className="p-2 border text-center w-10">{i+1}</th>)}<th className="p-2 border text-center w-12">C</th><th className="p-2 border text-center w-12">H</th><th className="p-2 border text-center w-12">E</th></tr></thead><tbody><tr><td className="p-2 border font-semibold">{currentPartido.nombreEquipoVisitante}</td>{[...Array(maxInnings)].map((_,i)=><td key={i} className="p-2 border text-center">{visitanteStats.runsPerInning[i+1]??'-'}</td>)}<td className="p-2 border text-center font-bold">{visitanteStats.totalRuns}</td><td className="p-2 border text-center">{visitanteStats.hits}</td><td className="p-2 border text-center">{visitanteStats.errors}</td></tr><tr><td className="p-2 border font-semibold">{currentPartido.nombreEquipoLocal}</td>{[...Array(maxInnings)].map((_,i)=><td key={i} className="p-2 border text-center">{localStats.runsPerInning[i+1]??'-'}</td>)}<td className="p-2 border text-center font-bold">{localStats.totalRuns}</td><td className="p-2 border text-center">{localStats.hits}</td><td className="p-2 border text-center">{localStats.errors}</td></tr></tbody></table></div>
      <div className="bg-white p-4 shadow rounded-lg"><h2 className="text-xl font-semibold mb-2 text-center">Estado del Juego</h2><div className="grid grid-cols-2 gap-4 text-center items-center mb-2"><div><p className="text-sm text-gray-500">Inning</p><p className="text-2xl font-bold">{gameStatus.actualInningNumber} ({gameStatus.currentHalfInning==='Top'?'⬆️':'⬇️'})</p></div><div><p className="text-sm text-gray-500">Outs</p><p className="text-2xl font-bold">{gameStatus.outs}</p></div></div><div className="flex flex-col items-center justify-center my-1"><BaseballDiamondSVG bases={gameStatus.bases} className="w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96" onBaseClick={handleBaseClick} disabled={gamePhase==='ended'}/></div>
      <div className="my-2 space-y-1">
        {currentBatterDisplay ? (
          <div className="flex items-center justify-center gap-x-2 p-2">
            {gamePhase !== 'ended' && (
              <Button onClick={() => openPlayModal(currentBatterDisplay, false)} variant="success" size="md" className="flex items-center flex-shrink-0 px-3 py-2" disabled={!currentBatterDisplay || currentBatterDisplay.posicion === 'BE' || currentBatterDisplay.posicion === EMPTY_POSICION_PLACEHOLDER}>
                <SaveIcon className="h-4 w-4 mr-1"/> Anotar Jugada para {currentBatterDisplay.nombreJugador}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-center text-gray-600 font-semibold p-2">Seleccione un bateador de la lista para anotar o cambie de entrada.</p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 justify-center"><Button onClick={()=>setIsBoxScoreModalOpen(true)} variant="secondary" size="sm" className="px-3 py-1 flex items-center" disabled={!currentPartido}><MdOutlineLeaderboard className="mr-1 h-4 w-4"/> Box Score</Button><Button onClick={handleUndoLastAnnotation} variant="warning" size="sm" className="px-3 py-1 flex items-center" disabled={partidoHistoryStack.length === 0 || gamePhase === 'ended'}><MdUndo className="mr-1 h-4 w-4"/> Retroceder Anotación</Button></div></div>
      
      <div className="bg-white shadow rounded-lg">
          <div className="p-4 border-b border-gray-200">
            <div className="flex justify-center items-center space-x-4 mb-3">
                <IconButton 
                    icon={<MdNavigateBefore size={24}/>} 
                    onClick={handlePreviousInningLineup} 
                    disabled={inningToShowInLineups <= 1}
                    label="Inning Anterior en Lineup"
                    className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50"
                />
                <span className="text-md font-medium text-gray-700">Mostrando Actuación del Inning: {inningToShowInLineups}</span>
                <IconButton 
                    icon={<MdNavigateNext size={24}/>} 
                    onClick={handleNextInningLineup} 
                    disabled={inningToShowInLineups >= currentPartido.gameStatus.actualInningNumber && currentPartido.gameStatus.currentHalfInning === 'Top' && currentPartido.gameStatus.outs === 0 && currentPartido.gameStatus.actualInningNumber > 1}
                    label="Siguiente Inning en Lineup"
                    className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50"
                />
            </div>
            <nav className="-mb-px flex space-x-8 justify-center" aria-label="Tabs">
                <button onClick={()=>setActiveLineupTab('visitante')} className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${activeLineupTab==='visitante'?'border-blue-500 text-blue-600':'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Lineup Visitante: {currentPartido.nombreEquipoVisitante}</button>
                <button onClick={()=>setActiveLineupTab('local')} className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${activeLineupTab==='local'?'border-blue-500 text-blue-600':'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Lineup Local: {currentPartido.nombreEquipoLocal}</button>
            </nav>
          </div>
          <div className="p-0 sm:p-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">#</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jugador</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Pos.</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actuación Inning {inningToShowInLineups}</th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {lineupToDisplay.map((player)=>{
                        const isPlayerTeamAtBat=(gameStatus.currentHalfInning==='Top'&&teamTypeForDisplay==='visitante')||(gameStatus.currentHalfInning==='Bottom'&&teamTypeForDisplay==='local');
                        const canAnotar=(isPlayerTeamAtBat&&player.posicion!=='BE'&&player.posicion!==EMPTY_POSICION_PLACEHOLDER);
                        const playsInSelectedInning = player.innings[inningToShowInLineups] || [];
                        const isCurrentBatter = currentPartido.gameStatus.currentBatterLineupPlayerId === player.id && player.posicion !== 'BE' && player.posicion !== EMPTY_POSICION_PLACEHOLDER;
                        return (
                        <tr key={player.id} className={ (player.posicion==='BE' || player.posicion === EMPTY_POSICION_PLACEHOLDER) ? 'bg-gray-100 opacity-70' : (isCurrentBatter ? 'border-l-4 border-blue-500 bg-blue-50' : '')}>
                            <td className="px-2 py-2 whitespace-nowrap text-sm">{player.ordenBate}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{player.nombreJugador}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-sm">
                                <div className="flex items-center">
                                    <span>{player.posicion || EMPTY_POSICION_LABEL}</span>
                                    <IconButton
                                        icon={<EditIcon className="w-4 h-4"/>}
                                        onClick={() => handleOpenEditPlayerPositionModal(player, teamTypeForDisplay)}
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
                                <Button size="sm" variant="light" onClick={()=>openPlayModal(player,false)} disabled={gamePhase==='ended'||!canAnotar} className="py-1 px-2 text-xs">Anotar</Button>
                            </td>
                        </tr>);
                    })}
                </tbody>
            </table>
        </div>
      </div>
      <div className="bg-white p-4 shadow rounded-lg mt-6 flex flex-wrap gap-2 justify-center"><Button onClick={handleSaveGame} variant="primary">Guardar Progreso</Button><Button onClick={handleExportCurrentPartidoCSV} variant="secondary" disabled={!currentPartido}>Exportar Partido CSV</Button><Button onClick={requestResetPartido} variant="warning" disabled={gamePhase==='ended'}>Reiniciar Partido</Button><Button onClick={requestEndGame} variant="danger">Terminar Partido</Button><Button onClick={()=>navigate('/historial')} variant="secondary">Ver Historial</Button></div>
      <div className="bg-white p-4 shadow rounded-lg mt-6"><div className="flex justify-between items-center mb-2"><h2 className="text-xl font-semibold">Registro Detallado del Juego</h2><Button onClick={()=>setIsGameLogExpanded(!isGameLogExpanded)} variant="light" size="sm">{isGameLogExpanded?'Contraer':'Expandir'} Lista</Button></div><p className="text-xs text-red-600 mb-2 bg-red-50 p-2 rounded">Nota: Editar o eliminar jugadas pasadas del registro NO recalculará automáticamente las estadísticas del juego ni el estado de las bases posteriores. Estos cambios son solo para corregir el registro. Las jugadas anotadas a través de la opción "Anotar" en la lista de jugadores afectarán el estado del juego (outs, bases, etc.).</Button><div className={`overflow-y-auto transition-all duration-300 ease-in-out ${isGameLogExpanded?'max-h-none':'max-h-[30rem]'}`}><Table columns={gameLogColumns} data={[...(currentPartido?.registrosJuego||[])].reverse()}/></div></div>

      {/* Box Score Modal */}
      <Modal isOpen={isBoxScoreModalOpen} onClose={()=>setIsBoxScoreModalOpen(false)} title="Box Score" size="xl">{currentPartido&&(<div className="text-xs overflow-y-auto max-h-[75vh]"><h3 className="text-lg font-semibold mb-2 text-center">{currentPartido.nombreEquipoVisitante} vs {currentPartido.nombreEquipoLocal}</h3><div className="overflow-x-auto mb-4"><table className="min-w-full table-auto border-collapse border border-gray-300"><thead><tr className="bg-gray-100"><th className="p-1 border border-gray-300">Equipo</th>{[...Array(maxInnings)].map((_,i)=><th key={`ls-inn-${i}`} className="p-1 border border-gray-300 w-6 text-center">{i+1}</th>)}<th className="p-1 border border-gray-300 w-8 text-center">C</th><th className="p-1 border border-gray-300 w-8 text-center">H</th><th className="p-1 border border-gray-300 w-8 text-center">E</th></tr></thead><tbody><tr><td className="p-1 border border-gray-300 font-medium">{currentPartido.nombreEquipoVisitante}</td>{[...Array(maxInnings)].map((_,i)=><td key={`ls-v-inn-${i}`} className="p-1 border border-gray-300 text-center">{currentPartido.visitanteStats.runsPerInning[i+1]??0}</td>)}<td className="p-1 border border-gray-300 text-center font-bold">{currentPartido.visitanteStats.totalRuns}</td><td className="p-1 border border-gray-300 text-center font-bold">{currentPartido.visitanteStats.hits}</td><td className="p-1 border border-gray-300 text-center font-bold">{currentPartido.visitanteStats.errors}</td></tr><tr><td className="p-1 border border-gray-300 font-medium">{currentPartido.nombreEquipoLocal}</td>{[...Array(maxInnings)].map((_,i)=><td key={`ls-l-inn-${i}`} className="p-1 border border-gray-300 text-center">{currentPartido.localStats.runsPerInning[i+1]??0}</td>)}<td className="p-1 border border-gray-300 text-center font-bold">{currentPartido.localStats.totalRuns}</td><td className="p-1 border border-gray-300 text-center font-bold">{currentPartido.localStats.hits}</td><td className="p-1 border border-gray-300 text-center font-bold">{currentPartido.localStats.errors}</td></tr></tbody></table></div>
                {['visitante','local'].map(teamType=>{const lineup=teamType==='visitante'?currentPartido.lineupVisitante:currentPartido.lineupLocal; const teamName=teamType==='visitante'?currentPartido.nombreEquipoVisitante:currentPartido.nombreEquipoLocal; const totals=lineup.reduce((acc,p)=>({ab:acc.ab+p.stats.atBats,r:acc.r+p.stats.runs,h1b:acc.h1b+(p.stats.singles||0),h2b:acc.h2b+(p.stats.doubles||0),h3b:acc.h3b+(p.stats.triples||0),hr:acc.hr+(p.stats.homeRuns||0),rbi:acc.rbi+p.stats.rbi,bb:acc.bb+p.stats.walks,k:acc.k+p.stats.strikeouts}),{ab:0,r:0,h1b:0,h2b:0,h3b:0,hr:0,rbi:0,bb:0,k:0}); return (<div key={teamType} className="mb-4"><h4 className="text-md font-semibold mb-1">{teamName} - Bateo</h4><div className="overflow-x-auto"><table className="min-w-full table-auto border-collapse border border-gray-300"><thead><tr className="bg-gray-50"><th className="p-1 border border-gray-300">Jugador</th><th className="p-1 border border-gray-300">Pos</th><th className="p-1 border border-gray-300">AB</th><th className="p-1 border border-gray-300">CA</th><th className="p-1 border border-gray-300">1B</th><th className="p-1 border border-gray-300">2B</th><th className="p-1 border border-gray-300">3B</th><th className="p-1 border border-gray-300">HR</th><th className="p-1 border border-gray-300">CI</th><th className="p-1 border border-gray-300">BB</th><th className="p-1 border border-gray-300">K</th></tr></thead><tbody>
                  {lineup.map(p=>(<tr key={p.id} className={p.posicion==='BE'?'opacity-60':''}><td className="p-1 border border-gray-300">{p.nombreJugador}</td><td className="p-1 border border-gray-300">{p.posicion||'--'}</td><td className="p-1 border border-gray-300 text-center">{p.stats.atBats}</td><td className="p-1 border border-gray-300 text-center">{p.stats.runs}</td><td className="p-1 border border-gray-300 text-center">{p.stats.singles||0}</td><td className="p-1 border border-gray-300 text-center">{p.stats.doubles||0}</td><td className="p-1 border border-gray-300 text-center">{p.stats.triples||0}</td><td className="p-1 border border-gray-300 text-center">{p.stats.homeRuns||0}</td><td className="p-1 border border-gray-300 text-center">{p.stats.rbi}</td><td className="p-1 border border-gray-300 text-center">{p.stats.walks}</td><td className="p-1 border border-gray-300 text-center">{p.stats.strikeouts}</td></tr>))}
                <tr className="font-bold bg-gray-50"><td className="p-1 border border-gray-300">TOTALES</td><td className="p-1 border border-gray-300"></td><td className="p-1 border border-gray-300 text-center">{totals.ab}</td><td className="p-1 border border-gray-300 text-center">{totals.r}</td><td className="p-1 border border-gray-300 text-center">{totals.h1b}</td><td className="p-1 border border-gray-300 text-center">{totals.h2b}</td><td className="p-1 border border-gray-300 text-center">{totals.h3b}</td><td className="p-1 border border-gray-300 text-center">{totals.hr}</td><td className="p-1 border border-gray-300 text-center">{totals.rbi}</td><td className="p-1 border border-gray-300 text-center">{totals.bb}</td><td className="p-1 border border-gray-300 text-center">{totals.k}</td></tr></tbody></table></div></div>);
              })}
                <div className="flex justify-end pt-2"><Button onClick={()=>setIsBoxScoreModalOpen(false)}>Volver al Partido</Button></div></div>)}</Modal>

      {/* Play Modal */}
      <Modal isOpen={isPlayModalOpen} onClose={()=>setIsPlayModalOpen(false)} title={`Anotar Jugada para ${currentPlayerForPlay?.nombreJugador||'Jugador'} ${isFreeEditModeForModal?'(Modo Edición Libre)':''}`} size="xl"><div className="space-y-3 max-h-[70vh] overflow-y-auto">{playCategoryOrder.map(category=>(groupedPlays[category]&&groupedPlays[category].length>0&&(<div key={category}><h3 className="text-lg font-semibold my-2 text-gray-700 border-b pb-1">{category}</h3><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">{groupedPlays[category].map(jugada=>(<Button key={jugada.jugada} variant={playCategoryColors[jugada.category]||"secondary"} onClick={()=>handlePlaySelected(jugada)} className="w-full text-center text-sm break-words whitespace-normal h-auto min-h-[40px] flex items-center justify-center" title={jugada.descripcion}>{jugada.descripcion} ({jugada.jugada})</Button>))}</div></div>)))}<div className="flex justify-end pt-4"><Button variant="light" onClick={()=>setIsPlayModalOpen(false)}>Cancelar</Button></div></div></Modal>

      {/* Edit Registro Modal */}
      <Modal isOpen={isEditRegistroModalOpen} onClose={handleCloseEditRegistroModal} title={`Editar Registro de Jugada para ${editingRegistro?.bateadorNombre||'Jugador'}`} size="xl">{editingRegistro&&(<div className="space-y-3 max-h-[70vh] overflow-y-auto"><p className="text-sm">Jugada Original: <strong>{editingRegistro.descripcion}</strong></p><p className="text-sm text-yellow-600 bg-yellow-100 p-2 rounded">Seleccione la nueva jugada. Esto solo cambiará la descripción en el log, no recalculará estadísticas.</p>{playCategoryOrder.map(category=>(groupedPlays[category]&&groupedPlays[category].length>0&&(<div key={`edit-${category}`}><h3 className="text-lg font-semibold my-2 text-gray-700 border-b pb-1">{category}</h3><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">{groupedPlays[category].map(jugada=>(<Button key={`edit-${jugada.jugada}`} variant={playCategoryColors[jugada.category]||"secondary"} onClick={()=>handleSaveEditedRegistro(jugada)} className={`w-full text-center text-sm break-words whitespace-normal h-auto min-h-[40px] flex items-center justify-center ${tempEditedPlayIdInModal===jugada.jugada?'ring-2 ring-offset-2 ring-blue-500':''}`} title={jugada.descripcion}>{jugada.descripcion} ({jugada.jugada})</Button>))}</div></div>)))}<div className="flex justify-end pt-4"><Button variant="light" onClick={handleCloseEditRegistroModal}>Cancelar</Button></div></div>)}</Modal>

      {/* Position Conflict Modal (for in-game changes) */}
      <Modal isOpen={isPositionConflictModalOpen} onClose={handleClosePositionConflictModal} title="Conflicto de Posición">{positionConflictDetails&&(<div className="space-y-4"><p>La posición <strong>{positionConflictDetails.targetPosition}</strong> ya está ocupada por <strong>{positionConflictDetails.existingPlayerInTargetPosition.nombreJugador}</strong>.</p><p>¿Desea asignar a <strong>{positionConflictDetails.conflictingPlayer.nombreJugador}</strong> a la posición <strong>{positionConflictDetails.targetPosition}</strong>? Esto moverá a <strong>{positionConflictDetails.existingPlayerInTargetPosition.nombreJugador}</strong> a la Banca (BE).</p><div className="flex justify-end space-x-2 pt-2"><Button variant="light" onClick={()=>handleResolvePositionConflict(false)}>Cancelar</Button><Button variant="warning" onClick={()=>handleResolvePositionConflict(true)}>Confirmar y Mover a Banca</Button></div></div>)}</Modal>

      {/* Runner Action Modal */}
      <Modal isOpen={isRunnerActionModalOpen} onClose={()=>{setIsRunnerActionModalOpen(false);setManagingRunner(null);}} title={`Acciones para Corredor ${managingRunner?.player.nombreJugador || ''} en ${managingRunner?.baseIndex !==undefined ? (managingRunner.baseIndex+1)+'B' : ''}`} size="sm">
        {managingRunner && currentPartido && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Gestionando a {managingRunner.player.nombreJugador} en {managingRunner.baseIndex+1}ª base.</p>
            {managingRunner.baseIndex === 0 && (
              <>
                <Button onClick={()=>handleRunnerAction('advanceTo2B')} variant="primary" className="w-full">Avanzar a 2B</Button>
                <Button onClick={()=>handleRunnerAction('advanceTo3BFrom1B')} variant="primary" className="w-full">Avanzar a 3B</Button>
              </>
            )}
            {managingRunner.baseIndex === 1 && (
              <Button onClick={()=>handleRunnerAction('advanceTo3BFrom2B')} variant="primary" className="w-full">Avanzar a 3B</Button>
            )}
            <Button onClick={()=>handleRunnerAction('scoreManually')} variant="success" className="w-full">Anotar Carrera (Manual)</Button>
            <Button onClick={()=>handleRunnerAction('outRunner')} variant="danger" className="w-full">Out al Corredor</Button>
            <Button onClick={()=>{setIsRunnerActionModalOpen(false);setManagingRunner(null);}} variant="light" className="w-full">Cancelar</Button>
          </div>
        )}
      </Modal>

      {/* Assign RBI Modal */}
      {currentPartido && assignRbiModalState.scoringPlayerInfo && (
        <AssignRbiModal
            isOpen={assignRbiModalState.isOpen}
            onClose={() => setAssignRbiModalState(prev => ({ ...prev, isOpen: false, scoringPlayerInfo: null, batterForRbiContext:null, previousBatterForRbiContext: null, baseIndexOfScorer: undefined }))}
            scoringPlayerInfo={assignRbiModalState.scoringPlayerInfo}
            batterForRbiContext={assignRbiModalState.batterForRbiContext}
            previousBatterForRbiContext={assignRbiModalState.previousBatterForRbiContext}
            onConfirm={handleConfirmRbiAssignment}
        />
      )}

      {/* Error Advancement Modal */}
      {errorModalContext && currentPartido && (
        <ErrorAdvancementModal
          isOpen={isErrorModalOpen}
          onClose={() => { setIsErrorModalOpen(false); setErrorModalContext(null); }}
          onConfirm={handleErrorAdvancementConfirm}
          batterName={errorModalContext.batterLineupPlayer.nombreJugador}
          defensiveTeamLineup={currentPartido.gameStatus.currentHalfInning === 'Top' ? currentPartido.lineupLocal : currentPartido.lineupVisitante}
          defensiveTeamName={currentPartido.gameStatus.currentHalfInning === 'Top' ? currentPartido.nombreEquipoLocal : currentPartido.nombreEquipoVisitante}
        />
      )}

      {/* Double Play Out Selection Modal */}
      {currentPartido && doublePlayContext && (
        <DoublePlayOutSelectionModal
            isOpen={isDoublePlayModalOpen}
            onClose={() => { setIsDoublePlayModalOpen(false); setDoublePlayContext(null); }}
            onConfirm={doublePlayContext.onConfirm}
            playersInvolved={[doublePlayContext.batter, ...doublePlayContext.runners]}
            teamName={currentPartido.gameStatus.currentHalfInning === 'Top' ? currentPartido.nombreEquipoVisitante : currentPartido.nombreEquipoLocal}
        />
      )}

      {/* Runner Advancement Reason Modal */}
      {currentPartido && runnerAdvancementContext && (
        <RunnerAdvancementReasonModal
            isOpen={isRunnerAdvancementReasonModalOpen}
            onClose={() => { setIsRunnerAdvancementReasonModalOpen(false); setRunnerAdvancementContext(null); }}
            onConfirm={runnerAdvancementContext.onConfirm}
            runner={runnerAdvancementContext.runner}
            defensiveTeamLineup={currentPartido.gameStatus.currentHalfInning === 'Top' ? currentPartido.lineupLocal : currentPartido.lineupVisitante}
            defensiveTeamName={currentPartido.gameStatus.currentHalfInning === 'Top' ? currentPartido.nombreEquipoLocal : currentPartido.nombreEquipoVisitante}
        />
      )}
      
      {/* Runner Advancement After Hit Modal */}
      {currentPartido && runnerAdvancementAfterHitModalState.isOpen && runnerAdvancementAfterHitModalState.batter && (
        <RunnerAdvancementAfterHitModal
          isOpen={runnerAdvancementAfterHitModalState.isOpen}
          onClose={() => setRunnerAdvancementAfterHitModalState(prev => ({...prev, isOpen: false}))}
          batter={runnerAdvancementAfterHitModalState.batter}
          hitType={runnerAdvancementAfterHitModalState.hitType!}
          batterReachedBase={runnerAdvancementAfterHitModalState.batterReachedBase}
          runnersOnBase={runnerAdvancementAfterHitModalState.runnersOnBase}
          initialAdvancements={runnerAdvancementAfterHitModalState.advancements}
          onConfirm={handleConfirmRunnerAdvancementsFromHitModal}
        />
      )}

      {/* Runner Advancement After Sacrifice Modal */}
      {currentPartido && runnerAdvancementAfterSacrificeModalState.isOpen && runnerAdvancementAfterSacrificeModalState.batter && (
        <RunnerAdvancementAfterSacrificeModal
          isOpen={runnerAdvancementAfterSacrificeModalState.isOpen}
          onClose={() => setRunnerAdvancementAfterSacrificeModalState(prev => ({...prev, isOpen: false}))}
          batter={runnerAdvancementAfterSacrificeModalState.batter}
          sacrificeType={runnerAdvancementAfterSacrificeModalState.sacrificeType!}
          runnersOnBase={runnerAdvancementAfterSacrificeModalState.runnersOnBase}
          initialAdvancements={runnerAdvancementAfterSacrificeModalState.advancements}
          initialOuts={runnerAdvancementAfterSacrificeModalState.initialOuts}
          onConfirm={handleConfirmRunnerAdvancementsFromSacrificeModal}
        />
      )}


      {/* Position Selection Modal for PartidosPage */}
      {isEditPlayerPositionModalOpen && editingPlayerForPosition && currentPartido && (
        <PositionSelectionModal
          isOpen={isEditPlayerPositionModalOpen}
          onClose={() => {
            setIsEditPlayerPositionModalOpen(false);
            setEditingPlayerForPosition(null);
          }}
          onConfirm={handleConfirmPlayerPositionChange}
          currentPlayerName={editingPlayerForPosition.player.nombreJugador}
          currentPosition={editingPlayerForPosition.player.posicion}
          teamLineup={
            editingPlayerForPosition.team === 'visitante'
              ? currentPartido.lineupVisitante
              : currentPartido.lineupLocal
          }
          teamName={
            editingPlayerForPosition.team === 'visitante'
              ? currentPartido.nombreEquipoVisitante
              : currentPartido.nombreEquipoLocal
          }
        />
      )}


      {confirmActionModalProps&&(<ConfirmationModal isOpen={isConfirmActionModalOpen} onClose={()=>setIsConfirmActionModalOpen(false)} onConfirm={confirmActionModalProps.onConfirm} title={confirmActionModalProps.title} message={confirmActionModalProps.message} confirmButtonText={confirmActionModalProps.confirmButtonText} confirmButtonVariant={confirmActionModalProps.confirmButtonVariant||'danger'}/>)}
    </div>
  );
};
