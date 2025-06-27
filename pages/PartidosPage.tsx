import React, { useState, useEffect, useCallback, ChangeEvent, useRef, useMemo, DragEvent } from 'react';
import Papa from 'papaparse';
import { useNavigate } from 'react-router-dom';
import {
  PartidoData, JuegoGuardado, Formato, Jugador, Jugada, LineupPlayer, PlayInInningCell, BatterStats, GameStatus, TeamStats, RegistroJuego, AppGlobalConfig, PlayCategory, Equipo, DEFAULT_GLOBAL_CONFIG, POSICIONES_FOR_SELECT, EMPTY_POSICION_PLACEHOLDER, POSICIONES, PlayerOnBase, LastPlayContext, PlayerInfoForOutSelection, RunnerAdvancementReason, EMPTY_POSICION_LABEL, AssignRbiModalState, RunnerAdvancementAfterHitModalState, RunnerAdvancementInfo, RunnerAdvancementAfterSacrificeModalState, RunnerAdvancementAfterErrorModalState, ErrorModalContext, FielderChoiceModalState, FielderChoiceResult
} from '../types';
import {
  PARTIDO_EN_CURSO_KEY, HISTORIAL_JUEGOS_KEY, FORMATOS_STORAGE_KEY, JUGADORES_STORAGE_KEY, JUGADAS_STORAGE_KEY, APP_CONFIG_KEY, EQUIPOS_STORAGE_KEY, defaultJugadas
} from '../constants';
import useLocalStorage from '../hooks/useLocalStorage';
import { generateUUID } from '../utils/idGenerator';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import { BaseballDiamondSVG } from '../components/ui/BaseballDiamondSVG'; // Updated import
import IconButton, { EditIcon, SettingsIcon, SaveIcon } from '../components/ui/IconButton';
import { MdDeleteForever, MdOutlineLeaderboard, MdUndo, MdNavigateBefore, MdNavigateNext, MdOutlineFileDownload } from 'react-icons/md'; // Added MdUndo, MdNavigateBefore, MdNavigateNext, MdOutlineFileDownload
import Table, { TableColumn } from '../components/ui/Table';
import ConfirmationModal from '../components/ui/ConfirmationModal';
import ErrorAdvancementModal from '../components/partidos/ErrorAdvancementModal';
import DoublePlayOutSelectionModal from '../components/partidos/DoublePlayOutSelectionModal'; // Added
import TriplePlayOutSelectionModal from '../components/partidos/TriplePlayOutSelectionModal'; // Added
import RunnerAdvancementReasonModal from '../components/partidos/RunnerAdvancementReasonModal'; // Added
import AssignRbiModal from '../components/partidos/AssignRbiModal'; // Added
import RunnerAdvancementAfterHitModal from '../components/partidos/RunnerAdvancementAfterHitModal'; // Added
import RunnerAdvancementAfterSacrificeModal from '../components/partidos/RunnerAdvancementAfterSacrificeModal'; // Added
import RunnerOutSpecificReasonModal, { RunnerOutReason } from '../components/partidos/RunnerOutSpecificReasonModal'; // Added
import RunnerAdvancementAfterErrorModal from '../components/partidos/RunnerAdvancementAfterErrorModal'; // Added
import FielderChoiceOutcomeModal from '../components/partidos/FielderChoiceOutcomeModal'; // Added
import { findNextBatterInLineup, recalculateLineupOrder, createEmptyBatterStats, createEmptyGameStatus, initialPartidoData, createEmptyTeamStats } from '../utils/partidoUtils';
import PositionSelectionModal from '../components/partidos/PositionSelectionModal';


type GamePhase = 'scoring' | 'ended';
type ActiveLineupTab = 'visitante' | 'local';

interface EditingPlayerForPositionState {
  player: LineupPlayer;
  team: ActiveLineupTab;
}

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
  | 'scoreManually' // Generic score, then RBI modal
  | 'scoreWithSpecificReason' // Score from 3B with specific cause (SBH, WP, PB, Error, etc.) -> Opens RunnerAdvancementReasonModal
  | 'outRunner'; // Opens RunnerOutSpecificReasonModal


const MAX_UNDO_HISTORY_SIZE = 5;


// Helper function to get base labels
const getBaseLabel = (baseNum: number): string => {
  if (baseNum === 0) return 'OUT';
  if (baseNum === 1) return '1B';
  if (baseNum === 2) return '2B';
  if (baseNum === 3) return '3B';
  if (baseNum === 4) return 'HOME';
  return 'N/A'; // Fallback for unexpected values
};

export const PartidosPage: React.FC = () => {
  const [appConfig] = useLocalStorage<AppGlobalConfig>(APP_CONFIG_KEY, DEFAULT_GLOBAL_CONFIG);
  const [partidoEnCurso, setPartidoEnCurso] = useLocalStorage<PartidoData | null>(PARTIDO_EN_CURSO_KEY, null);
  const [historial, setHistorial] = useLocalStorage<JuegoGuardado[]>(HISTORIAL_JUEGOS_KEY, []);

  const [formatos] = useLocalStorage<Formato[]>(FORMATOS_STORAGE_KEY, []);
  const [jugadoresDB] = useLocalStorage<Jugador[]>(JUGADORES_STORAGE_KEY, []);
  const [jugadasDBFromStorage] = useLocalStorage<Jugada[]>(JUGADAS_STORAGE_KEY, []); // Renamed to avoid conflict
  
  const jugadasDB = useMemo(() => {
    if (jugadasDBFromStorage && jugadasDBFromStorage.length > 0) {
      return jugadasDBFromStorage;
    }
    // Fallback to defaultJugadas from constants if localStorage is empty or uninitialized
    // This ensures jugadasDB is always populated.
    const initialJugadasFromConstants = defaultJugadas.map((j, index) => ({
      ...j,
      codigo: index + 1000, // Assign some arbitrary unique codes if not present
    }));
    return initialJugadasFromConstants;
  }, [jugadasDBFromStorage]);


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

  const [isTriplePlayModalOpen, setIsTriplePlayModalOpen] = useState(false);
  const [triplePlayContext, setTriplePlayContext] = useState<{ batter: PlayerInfoForOutSelection, runners: PlayerInfoForOutSelection[], onConfirm: (outedPlayerIds: [string, string, string]) => void } | null>(null);


  const [isRunnerAdvancementReasonModalOpen, setIsRunnerAdvancementReasonModalOpen] = useState(false);
  // Context now includes target base: 0=1B, 1=2B, 2=3B, 3=HOME
  const [runnerAdvancementContext, setRunnerAdvancementContext] = useState<{ runner: PlayerOnBase, baseIndexAdvancedTo: 0 | 1 | 2 | 3, onConfirm: (reason: RunnerAdvancementReason | string, errorPlayerId?: number | null) => void} | null>(null);
  
  const [runnerAdvancementAfterHitModalState, setRunnerAdvancementAfterHitModalState] = useState<RunnerAdvancementAfterHitModalState>({
    isOpen: false, batter: null, hitType: null, batterReachedBase: 1, runnersOnBase: [], advancements: {},
  });

  const [runnerAdvancementAfterSacrificeModalState, setRunnerAdvancementAfterSacrificeModalState] = useState<RunnerAdvancementAfterSacrificeModalState>({
    isOpen: false, batter: null, sacrificeType: null, runnersOnBase: [], advancements: {}, initialOuts: 0,
  });

  const [runnerAdvancementAfterErrorModalState, setRunnerAdvancementAfterErrorModalState] = useState<RunnerAdvancementAfterErrorModalState>({
    isOpen: false, batterWhoReachedOnError: null, batterFinalDestBaseOnError: 0, runnersOnBaseAtTimeOfError: [], fielderWhoCommittedError: null, advancements: {},
  });

  const [isRunnerOutSpecificReasonModalOpen, setIsRunnerOutSpecificReasonModalOpen] = useState(false); // New modal state

  const [isEditPlayerPositionModalOpen, setIsEditPlayerPositionModalOpen] = useState(false);
  const [editingPlayerForPosition, setEditingPlayerForPosition] = useState<EditingPlayerForPositionState | null>(null);

  const [fielderChoiceModalState, setFielderChoiceModalState] = useState<FielderChoiceModalState>({ isOpen: false, batter: null, runnersOnBase: [], initialOuts: 0 });


  const navigate = useNavigate();

  const getOriginalJugadaDescription = useCallback((jugadaIdToFind: string, fallbackDescription?: string): string => {
    const foundJugada = jugadasDB.find(j => j.jugada === jugadaIdToFind);
    if (foundJugada) {
        return foundJugada.descripcion;
    }
    return fallbackDescription || `Jugada: ${jugadaIdToFind}`;
  }, [jugadasDB]);

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
    scoringPlayer: PlayerOnBase | LineupPlayer, 
    _rbiCreditedToPlayerId: string | null // Parameter kept for signature, but RBI update is now handled by caller
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
  
    const lineupToUpdateForScorerKey = teamAtBat === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
    const lineupToUpdateForScorer = partidoDataToUpdate[lineupToUpdateForScorerKey];
    const scorerIndex = lineupToUpdateForScorer.findIndex(p => p.id === scoringPlayerLineupId);
    if (scorerIndex !== -1) {
      lineupToUpdateForScorer[scorerIndex].stats.runs += 1;
    } else {
      console.warn(`Scoring player with ID ${scoringPlayerLineupId} not found in active lineup for run stat.`);
    }
    // RBI crediting is now handled by the calling function to avoid double counting.
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
        // Empty base click - do nothing specific for now, or show a gentle notification.
        // console.log(`Base ${baseIndex + 1} is empty. No action for empty base click.`);
        // Example: alert(`La base ${baseIndex + 1} está vacía.`);
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

    // Only trigger error modal for 'E'
    if (jugadaDef.jugada === 'E' && !isFreeEditModeForModal) { 
      const initialBasesForErrorContext: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = 
        [...currentPartido.gameStatus.bases]; // Keep as raw array of 3
      setErrorModalContext({ 
        batterLineupPlayer: currentPlayerForPlay,
        initialBasesBeforePlay: initialBasesForErrorContext
      });
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
    
    if (jugadaDef.jugada === 'TP' && !isFreeEditModeForModal) {
        if (currentPartido.gameStatus.outs !== 0) {
            alert("Triple Play solo es posible con 0 outs.");
            setIsPlayModalOpen(false); return;
        }
        const runnersOnBaseCount = currentPartido.gameStatus.bases.filter(b => b !== null).length;
        if (runnersOnBaseCount < 2) {
            alert("Triple Play requiere al menos 2 corredores en base.");
            setIsPlayModalOpen(false); return;
        }

        const batterAsPlayerInfo: PlayerInfoForOutSelection = { id: currentPlayerForPlay.id, name: currentPlayerForPlay.nombreJugador, isOnBase: false };
        const runnersOnBaseAsPlayerInfo: PlayerInfoForOutSelection[] = currentPartido.gameStatus.bases
            .map((runner, idx) => runner ? ({ id: runner.lineupPlayerId, name: runner.nombreJugador, isOnBase: true, baseNumber: (idx + 1) as 1 | 2 | 3 }) : null)
            .filter(r => r !== null) as PlayerInfoForOutSelection[];
        
        setTriplePlayContext({
            batter: batterAsPlayerInfo,
            runners: runnersOnBaseAsPlayerInfo,
            onConfirm: handleConfirmTriplePlayOuts
        });
        setIsTriplePlayModalOpen(true);
        setIsPlayModalOpen(false);
        return;
    }


    if ((jugadaDef.jugada === 'SF' || jugadaDef.jugada === 'SH') && !isFreeEditModeForModal) {
        let runnersToConsiderForSacrificeModal: RunnerAdvancementInfo[] = [];
        let batterIsOutOnSacrifice = true;
        let runnerFrom3BScored = false;

        updateCurrentPartidoAndHistory(prev => {
            if (!prev || !currentPlayerForPlay) return prev;
            let updatedPartido = { ...prev }; // Start with a mutable copy
            const batterLineupPlayer = currentPlayerForPlay;
            const teamAtBat = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'visitante' : 'local';
            const pitcher = getCurrentOpposingPitcher(updatedPartido);
            const formatoDesc = formatos.find(f => f.codigo === updatedPartido.formatoJuegoId)?.descripcion || 'N/A';
            
            const initialOutsForPlay = updatedPartido.gameStatus.outs; // Outs before this entire play starts
            const initialBasesForLog = [...updatedPartido.gameStatus.bases];

            if (jugadaDef.jugada === 'SF') {
                 if (initialOutsForPlay < 2 && updatedPartido.gameStatus.bases[2]) { // Runner on 3B and < 2 outs
                    const runnerFrom3B = updatedPartido.gameStatus.bases[2]!;
                    _applySingleRunScoringLogic(updatedPartido, runnerFrom3B, batterLineupPlayer.id);
                    runnerFrom3BScored = true;
                    
                    // Log 'R' for runner
                    const runLog: RegistroJuego = {
                        id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                        halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: runnerFrom3B.lineupPlayerId,
                        bateadorNombre: runnerFrom3B.nombreJugador, bateadorPosicion: (teamAtBat === 'visitante' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal).find(p=>p.id===runnerFrom3B.lineupPlayerId)?.posicion || '',
                        pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                        equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                        jugadaId: 'R', descripcion: getOriginalJugadaDescription('R', 'Carrera Anotada'),
                        outsPrev: initialOutsForPlay, outsAfter: initialOutsForPlay, // Runner scoring doesn't add out here
                        basesPrevState: initialBasesForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                        basesAfterState: initialBasesForLog.map((p, i) => i === 2 ? null : (p ? p.lineupPlayerId : 'null')).join('-'), // 3B vacated
                        runScored: 1, rbi: 0, 
                        fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: (teamAtBat === 'visitante' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal).find(p=>p.id===runnerFrom3B.lineupPlayerId)?.ordenBate || 0,
                    };
                    updatedPartido.registrosJuego.push(runLog);

                    // Log 'RBI' for batter
                    const rbiLog: RegistroJuego = {
                        ...runLog, id: generateUUID(), bateadorId: batterLineupPlayer.id, bateadorNombre: batterLineupPlayer.nombreJugador, bateadorPosicion: batterLineupPlayer.posicion,
                        jugadaId: 'RBI', descripcion: getOriginalJugadaDescription('RBI', 'Carrera Impulsada'), runScored: 0, rbi: 1, ordenDelBateador: batterLineupPlayer.ordenBate,
                    };
                    updatedPartido.registrosJuego.push(rbiLog);
                    
                    // Update runner's cell
                    const runnerLineupKey = teamAtBat === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
                    updatedPartido[runnerLineupKey] = updatedPartido[runnerLineupKey].map(plr => {
                        if(plr.id === runnerFrom3B.lineupPlayerId) {
                            const updatedInnings = {...plr.innings};
                            if(!updatedInnings[runLog.inning]) updatedInnings[runLog.inning] = [];
                            updatedInnings[runLog.inning].push({playInstanceId: runLog.id, jugadaId: 'R', descripcion: runLog.descripcion, playDisplayValue: 'R'});
                            return {...plr, innings: updatedInnings, stats: {...plr.stats, runs: plr.stats.runs + 1}}; // stats.runs incremented by _applySingleRunScoringLogic already
                        }
                        return plr;
                    });
                    updatedPartido.gameStatus.bases[2] = null; // Vacate 3rd base
                 } else { // Conditions for SF not met, treat as FO
                    batterIsOutOnSacrifice = false; // Handled as regular FO
                    handlePlaySelected(jugadasDB.find(j => j.jugada === 'FO')!); // Resubmit as Fly Out
                    return prev; // Exit early, FO logic will take over
                 }
            }
           
            // For both SF and SH, batter is out. Their At-Bat is not counted for SF/SH.
            // SF RBI is handled above, SH has no RBI unless error allows score.
            const batterLineupKey = teamAtBat === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
             // Create main SF/SH log for batter & update batter's cell
            const mainSacLogEntry: RegistroJuego = {
                id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batterLineupPlayer.id,
                bateadorNombre: batterLineupPlayer.nombreJugador, bateadorPosicion: batterLineupPlayer.posicion,
                pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                jugadaId: jugadaDef.jugada, descripcion: getOriginalJugadaDescription(jugadaDef.jugada),
                outsPrev: initialOutsForPlay,
                outsAfter: initialOutsForPlay + 1, // Tentative: batter's out
                basesPrevState: initialBasesForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                basesAfterState: updatedPartido.gameStatus.bases.map(p => p ? p.lineupPlayerId : 'null').join('-'), // Reflects 3B vacated if SF
                runScored: runnerFrom3BScored ? 1 : 0, // Only if SF scored the run from 3B
                rbi: runnerFrom3BScored ? 1 : 0,       // Only if SF scored the run from 3B
                fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: batterLineupPlayer.ordenBate,
            };
            updatedPartido.registrosJuego.push(mainSacLogEntry);

            updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
                if (p.id === batterLineupPlayer.id) {
                    const updatedInnings = { ...p.innings };
                    if (!updatedInnings[mainSacLogEntry.inning]) updatedInnings[mainSacLogEntry.inning] = [];
                    updatedInnings[mainSacLogEntry.inning].push({
                        playInstanceId: mainSacLogEntry.id,
                        jugadaId: mainSacLogEntry.jugadaId,
                        descripcion: mainSacLogEntry.descripcion,
                        playDisplayValue: `${mainSacLogEntry.jugadaId}${mainSacLogEntry.rbi > 0 ? ` (${mainSacLogEntry.rbi} RBI)` : ''}`
                    });
                    let updatedStats = { ...p.stats };
                    updatedStats.plateAppearances = (updatedStats.plateAppearances || 0) + 1; // AP for SF/SH
                    if (runnerFrom3BScored) { // SF RBI for batter
                        updatedStats.rbi = (updatedStats.rbi || 0) + 1;
                    }                              
                    // SF/SH do not count as AB.
                    return { ...p, innings: updatedInnings, stats: updatedStats };
                }
                return p;
            });
            // --- END MAIN SF/SH LOG & CELL ---

            // Determine runners for the advancement modal
            runnersToConsiderForSacrificeModal = updatedPartido.gameStatus.bases
                .map((runner, index) => (runner ? { ...runner, currentBase: (index + 1) as 1 | 2 | 3 } : null))
                .filter(r => r !== null) as RunnerAdvancementInfo[];
                
            if (runnersToConsiderForSacrificeModal.length > 0) {
                setRunnerAdvancementAfterSacrificeModalState({
                    isOpen: true, batter: batterLineupPlayer,
                    sacrificeType: jugadaDef.jugada as 'SF' | 'SH',
                    runnersOnBase: runnersToConsiderForSacrificeModal,
                    advancements: {}, initialOuts: initialOutsForPlay,
                });
            } else { // No other runners to advance, finalize SF/SH here
                const { updatedGameStatus, gameShouldEnd } = _calculateOutsUpdate(
                    {...updatedPartido.gameStatus, outs: initialOutsForPlay}, // Start with outs before batter's sac out
                    1, // Batter is out on sacrifice
                    updatedPartido.maxInnings, updatedPartido.lineupVisitante, updatedPartido.lineupLocal,
                    updatedPartido.visitanteStats.totalRuns, updatedPartido.localStats.totalRuns
                );
                updatedPartido.gameStatus = updatedGameStatus;
                
                // Main SF log's outsAfter is already initialOutsForPlay + 1, which is correct here.
                // BasesAfterState is also correct (3B vacated if SF).
                if (gameShouldEnd && gamePhase === 'scoring') {
                    setGamePhase('ended');
                }
            }
            return updatedPartido;
        });
        setIsPlayModalOpen(false);
        return;
    }

    if (jugadaDef.jugada === 'FC' && !isFreeEditModeForModal) {
      if (currentPartido.gameStatus.bases.every(b => b === null)) {
          alert("Fielder's Choice no es posible sin corredores en base.");
          setIsPlayModalOpen(false);
          return;
      }
      const runnersOnBaseAtTimeOfPlay = currentPartido.gameStatus.bases
          .map((runner, index) => runner ? { ...runner, currentBase: (index + 1) as 1 | 2 | 3 } : null)
          .filter(r => r !== null) as RunnerAdvancementInfo[];
      
      setFielderChoiceModalState({
          isOpen: true,
          batter: currentPlayerForPlay,
          runnersOnBase: runnersOnBaseAtTimeOfPlay,
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

                // Update batter's direct HR stats (AB, AP, H, HR)
                const batterLineupKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
                updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
                    if (p.id === batterLineupPlayer.id) {
                        const newStats = { ...p.stats };
                        newStats.atBats += 1;
                        newStats.plateAppearances +=1;
                        newStats.hits += 1;
                        newStats.homeRuns += 1;
                        // RBI will be added from totalRBIsForBatterOnHR later
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
                                equipoBateadorNombre: teamAtBatNombre, jugadaId: 'R', descripcion: getOriginalJugadaDescription('R', 'Carrera Anotada'), 
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
                                equipoBateadorNombre: teamAtBatNombre, jugadaId: 'RBI', descripcion: getOriginalJugadaDescription('RBI', 'Carrera Impulsada'),
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
                        equipoBateadorNombre: teamAtBatNombre, jugadaId: 'R', descripcion: getOriginalJugadaDescription('R', 'Carrera Anotada'),
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
                        equipoBateadorNombre: teamAtBatNombre, jugadaId: 'RBI', descripcion: getOriginalJugadaDescription('RBI', 'Carrera Impulsada'),
                        outsPrev: prevPartido.gameStatus.outs, outsAfter: prevPartido.gameStatus.outs,
                        basesPrevState: initialBasesStateForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                        basesAfterState: [null,null,null].map(p => p ? p.lineupPlayerId : 'null').join('-'),
                        runScored: 0, rbi: 1,
                        fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: batterLineupPlayer.ordenBate,
                    });
                }

                // Create main HR log entry
                const hrJugadaDefResolved = jugadasDB.find(j => j.jugada === 'HR')!;
                const mainHRLogEntry: RegistroJuego = {
                    id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                    halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batterLineupPlayer.id,
                    bateadorNombre: batterLineupPlayer.nombreJugador, bateadorPosicion: batterLineupPlayer.posicion,
                    pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                    equipoBateadorNombre: teamAtBatNombre, jugadaId: 'HR', descripcion: getOriginalJugadaDescription('HR', 'Home Run'),
                    outsPrev: prevPartido.gameStatus.outs, outsAfter: prevPartido.gameStatus.outs,
                    basesPrevState: initialBasesStateForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                    basesAfterState: [null,null,null].map(p => p ? p.lineupPlayerId : 'null').join('-'), // Bases cleared
                    runScored: totalRunsOnHR, rbi: totalRBIsForBatterOnHR,
                    fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: batterLineupPlayer.ordenBate,
                };
                updatedPartido.registrosJuego.push(mainHRLogEntry);

                // Add HR to batter's innings cell display & update RBI stat
                const playInInningCellToAdd: PlayInInningCell = {
                    playInstanceId: mainHRLogEntry.id, jugadaId: mainHRLogEntry.jugadaId, descripcion: mainHRLogEntry.descripcion,
                    playDisplayValue: `${mainHRLogEntry.jugadaId}${mainHRLogEntry.rbi > 0 ? ` (${mainHRLogEntry.rbi} RBI)` : ''}`
                };
                updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
                    if (p.id === batterLineupPlayer.id) {
                        const updatedInnings = { ...p.innings };
                        if (!updatedInnings[mainHRLogEntry.inning]) updatedInnings[mainHRLogEntry.inning] = [];
                        updatedInnings[mainHRLogEntry.inning].push(playInInningCellToAdd);
                        
                        const updatedStats = {...p.stats, rbi: (p.stats.rbi || 0) + totalRBIsForBatterOnHR};
                        return { ...p, stats: updatedStats, innings: updatedInnings };
                    }
                    return p;
                });
                
                // Update game status
                updatedPartido.gameStatus = {
                    ...updatedPartido.gameStatus,
                    bases: [null, null, null], // Clear bases
                    lastPlayContext: { batterLineupPlayerId: batterLineupPlayer.id, jugada: hrJugadaDefResolved, timestamp: Date.now(), previousBatterLineupPlayerId: prevPartido.gameStatus.lastPlayContext?.batterLineupPlayerId !== batterLineupPlayer.id ? prevPartido.gameStatus.lastPlayContext?.batterLineupPlayerId : prevPartido.gameStatus.lastPlayContext?.previousBatterLineupPlayerId },
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
                tempBatterStats.plateAppearances +=1;
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
                    jugadaId: jugadaDef.jugada, descripcion: getOriginalJugadaDescription(jugadaDef.jugada, jugadaDef.descripcion), outsPrev: updatedPartido.gameStatus.outs,
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
            // Increment AP for all relevant plays; AB is conditional
            if (jugadaDef.category === PlayCategory.OUT || jugadaDef.category === PlayCategory.ON_BASE || jugadaDef.category === PlayCategory.HIT) {
                // SF/SH AP is handled in their specific block to avoid double counting if logic branches
                if (jugadaDef.jugada !== 'SF' && jugadaDef.jugada !== 'SH') {
                     tempBatterStats.plateAppearances += 1;
                }
            }

            if (jugadaDef.category !== PlayCategory.HIT && (jugadaDef.jugada === 'FC' || jugadaDef.jugada === 'E' || (jugadaDef.category === PlayCategory.OUT && jugadaDef.jugada !== 'SF' && jugadaDef.jugada !== 'SH'))) {
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
                     if (jugadaDef.jugada !== 'E' && jugadaDef.jugada !== 'FC') { // E and FC are handled by their modals
                        newBasesState[0] = batterAsPlayerOnBase;
                     }
                }
            } else if (jugadaDef.category === PlayCategory.OUT) {
                if (jugadaDef.jugada === 'K') tempBatterStats.strikeouts += 1;

                if (jugadaDef.jugada === 'SF' || jugadaDef.jugada === 'SH') { 
                    // AP for SF/SH handled in their specific block. AB is not counted.
                    // Outs are handled by _calculateOutsUpdate.
                }
                
                if (jugadaDef.jugada !== 'DP' && jugadaDef.jugada !== 'TP' && jugadaDef.jugada !== 'SF' && jugadaDef.jugada !== 'SH') { 
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
            jugadaId: jugadaDef.jugada, descripcion: getOriginalJugadaDescription(jugadaDef.jugada, jugadaDef.descripcion), outsPrev: updatedPartido.gameStatus.outs,
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
        } else if (!isFreeEditModeForModal && jugadaDef.category !== PlayCategory.OUT && jugadaDef.category !== PlayCategory.HIT && jugadaDef.jugada !== 'E' && jugadaDef.jugada !== 'SF' && jugadaDef.jugada !== 'SH' && jugadaDef.jugada !== 'FC') { 
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
        tempBatterStats.plateAppearances +=1;

        let outsFromPlay = 2;

        if (treatAsBatterOutTwice) {
            // Bases remain as they were, batter is effectively out twice
        } else {
            outedPlayerIds.forEach(outedId => {
                if (outedId !== batterLineupPlayer.id) {
                    newBasesState = newBasesState.map(runnerOnBase =>
                        runnerOnBase && runnerOnBase.lineupPlayerId === outedId ? null : runnerOnBase
                    ) as [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null];
                }
            });
        }

        const newLastPlayContext: LastPlayContext = {
            batterLineupPlayerId: batterLineupPlayer.id, 
            jugada: jugadaDef,
            timestamp: Date.now(),
            previousBatterLineupPlayerId: updatedPartido.gameStatus.lastPlayContext?.batterLineupPlayerId !== batterLineupPlayer.id ? updatedPartido.gameStatus.lastPlayContext?.batterLineupPlayerId : updatedPartido.gameStatus.lastPlayContext?.previousBatterLineupPlayerId
        };

        const baseStateToString = (basesTuple: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null]): string => {
            return basesTuple.map(p => p ? p.lineupPlayerId : 'null').join('-');
        };

        const pitcher = getCurrentOpposingPitcher(updatedPartido);
        const formatoDesc = formatos.find(f => f.codigo === updatedPartido.formatoJuegoId)?.descripcion || 'N/A';
        
        let dpDescription = getOriginalJugadaDescription(jugadaDef.jugada, jugadaDef.descripcion);

        const newRegistro: RegistroJuego = {
            id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
            halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batterLineupPlayer.id,
            bateadorNombre: batterLineupPlayer.nombreJugador, bateadorPosicion: batterLineupPlayer.posicion,
            pitcherResponsableId: pitcher ? pitcher.id : null,
            pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
            equipoBateadorNombre: updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
            jugadaId: jugadaDef.jugada, 
            descripcion: dpDescription, 
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

        updatedPartido.gameStatus = { 
            ...updatedPartido.gameStatus,
            bases: newBasesState, 
            lastPlayContext: newLastPlayContext,
        };
        updatedPartido.registrosJuego = [...updatedPartido.registrosJuego, newRegistro];

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
        return updatedPartido;
    });
    setIsDoublePlayModalOpen(false);
    setDoublePlayContext(null);
    setCurrentPlayerForPlay(null);
  };

  const handleConfirmTriplePlayOuts = (outedPlayerIds: [string, string, string]) => {
    if (!currentPartido || !currentPlayerForPlay) return;
    saveToHistory(currentPartido);

    updateCurrentPartidoAndHistory(prev => {
        if (!prev || !currentPlayerForPlay) return prev;
        let updatedPartido = { ...prev };
        const batterLineupPlayer = currentPlayerForPlay; 
        const initialBases: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [...updatedPartido.gameStatus.bases];
        let newBasesState: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [...updatedPartido.gameStatus.bases];
        
        const pitcher = getCurrentOpposingPitcher(updatedPartido);
        const formatoDesc = formatos.find(f => f.codigo === updatedPartido.formatoJuegoId)?.descripcion || 'N/A';
        const teamAtBat = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'visitante' : 'local';
        const teamAtBatNombre = teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal;
        const outRunnerBaseJugadaDef = jugadasDB.find(j => j.jugada === 'OUT_RUNNER_BASE')!;
        const tpJugadaDef = jugadasDB.find(j => j.jugada === 'TP')!;

        let tempBatterStats = { ...batterLineupPlayer.stats };
        tempBatterStats.plateAppearances += 1; // Batter always gets an AP for TP
        if (outedPlayerIds.includes(batterLineupPlayer.id)) {
            tempBatterStats.atBats += 1;
        }
        
        const outsBeforePlay = prev.gameStatus.outs; // Should be 0 for TP

        outedPlayerIds.forEach((outedId, index) => {
            newBasesState = newBasesState.map(runnerOnBase =>
                runnerOnBase && runnerOnBase.lineupPlayerId === outedId ? null : runnerOnBase
            ) as [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null];

            const outedPlayerLineup = (teamAtBat === 'visitante' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal).find(p => p.id === outedId);
            if (outedPlayerLineup) {
                const outLog: RegistroJuego = {
                    id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                    halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: outedId,
                    bateadorNombre: outedPlayerLineup.nombreJugador, bateadorPosicion: outedPlayerLineup.posicion,
                    pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                    equipoBateadorNombre: teamAtBatNombre,
                    jugadaId: outRunnerBaseJugadaDef.jugada, 
                    descripcion: `${getOriginalJugadaDescription(outRunnerBaseJugadaDef.jugada)} (Parte de TP)`,
                    outsPrev: outsBeforePlay + index, 
                    outsAfter: outsBeforePlay + index + 1,
                    basesPrevState: initialBases.map(p => p ? p.lineupPlayerId : 'null').join('-'), 
                    basesAfterState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'), 
                    runScored: 0, rbi: 0,
                    fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: outedPlayerLineup.ordenBate,
                };
                updatedPartido.registrosJuego.push(outLog);

                const lineupToUpdate = teamAtBat === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
                updatedPartido[lineupToUpdate] = updatedPartido[lineupToUpdate].map(p => {
                    if (p.id === outedId) {
                        const updatedInnings = { ...p.innings };
                        if (!updatedInnings[outLog.inning]) updatedInnings[outLog.inning] = [];
                        updatedInnings[outLog.inning].push({ playInstanceId: outLog.id, jugadaId: outLog.jugadaId, descripcion: outLog.descripcion, playDisplayValue: 'Out (TP)' });
                        if (p.id === batterLineupPlayer.id) return { ...p, stats: tempBatterStats, innings: updatedInnings }; 
                        return { ...p, innings: updatedInnings };
                    }
                    return p;
                });
            }
        });
        
        const mainTPLog: RegistroJuego = {
            id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
            halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batterLineupPlayer.id,
            bateadorNombre: batterLineupPlayer.nombreJugador, bateadorPosicion: batterLineupPlayer.posicion,
            pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
            equipoBateadorNombre: teamAtBatNombre,
            jugadaId: tpJugadaDef.jugada, descripcion: getOriginalJugadaDescription(tpJugadaDef.jugada),
            outsPrev: outsBeforePlay,
            outsAfter: outsBeforePlay + 3,
            basesPrevState: initialBases.map(p => p ? p.lineupPlayerId : 'null').join('-'),
            basesAfterState: [null,null,null].map(p => p ? p.lineupPlayerId : 'null').join('-'), // Bases always cleared
            runScored: 0, rbi: 0,
            fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: batterLineupPlayer.ordenBate,
        };
        updatedPartido.registrosJuego.push(mainTPLog);

        const lineupToUpdateBatter = teamAtBat === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
        if (!updatedPartido[lineupToUpdateBatter].find(p=>p.id === batterLineupPlayer.id)?.innings[mainTPLog.inning]?.some(cell => cell.jugadaId === 'OUT_RUNNER_BASE')) {
             updatedPartido[lineupToUpdateBatter] = updatedPartido[lineupToUpdateBatter].map(p => {
                if (p.id === batterLineupPlayer.id) {
                    const updatedInnings = { ...p.innings };
                    if (!updatedInnings[mainTPLog.inning]) updatedInnings[mainTPLog.inning] = [];
                    updatedInnings[mainTPLog.inning].push({ playInstanceId: mainTPLog.id, jugadaId: tpJugadaDef.jugada, descripcion: mainTPLog.descripcion, playDisplayValue: 'TP' });
                    // Apply batter stats (AP, and AB if they were out)
                    // If tempBatterStats wasn't applied before (e.g., batter wasn't an out but hit into TP), ensure AP is set.
                    const finalBatterStats = {...p.stats, ...tempBatterStats};
                    if (finalBatterStats.plateAppearances === p.stats.plateAppearances) { // If AP wasn't incremented yet by being an out
                        finalBatterStats.plateAppearances +=1;
                    }
                    return { ...p, stats: finalBatterStats, innings: updatedInnings };
                }
                return p;
            });
        }


        const { updatedGameStatus, gameShouldEnd } = _calculateOutsUpdate(
            { ...prev.gameStatus, bases: initialBases }, 
            3, 
            updatedPartido.maxInnings, updatedPartido.lineupVisitante, updatedPartido.lineupLocal,
            updatedPartido.visitanteStats.totalRuns, updatedPartido.localStats.totalRuns
        );
        updatedPartido.gameStatus = updatedGameStatus;
        updatedPartido.gameStatus.lastPlayContext = {
            batterLineupPlayerId: batterLineupPlayer.id,
            jugada: tpJugadaDef,
            timestamp: Date.now(),
            previousBatterLineupPlayerId: prev.gameStatus.lastPlayContext?.batterLineupPlayerId !== batterLineupPlayer.id ? prev.gameStatus.lastPlayContext?.batterLineupPlayerId : prev.gameStatus.lastPlayContext?.previousBatterLineupPlayerId,
        };

        if (gameShouldEnd && gamePhase === 'scoring') {
            setGamePhase('ended');
        }
        return updatedPartido;
    });

    setIsTriplePlayModalOpen(false);
    setTriplePlayContext(null);
    setCurrentPlayerForPlay(null);
  };


  const handleErrorAdvancementConfirm = (batterDestBase: 0 | 1 | 2 | 3, fielderWhoErredId: number | null) => {
    if (!currentPartido || !errorModalContext) return;
    saveToHistory(currentPartido); 

    const { batterLineupPlayer, initialBasesBeforePlay } = errorModalContext;
    
    const runnersOnBaseAtTimeOfError = initialBasesBeforePlay
      .map((runner, index) => {
        if (runner) {
          return {
            ...runner,
            currentBase: (index + 1) as 1 | 2 | 3,
          };
        }
        return null;
      })
      .filter(r => r !== null) as RunnerAdvancementInfo[];

    setIsErrorModalOpen(false); 

    if (runnersOnBaseAtTimeOfError.length > 0) {
      setRunnerAdvancementAfterErrorModalState({
        isOpen: true,
        batterWhoReachedOnError: batterLineupPlayer,
        batterFinalDestBaseOnError: batterDestBase,
        runnersOnBaseAtTimeOfError: runnersOnBaseAtTimeOfError,
        fielderWhoCommittedError: fielderWhoErredId,
        advancements: {}, 
      });
      setErrorModalContext(null); 
    } else {
      updateCurrentPartidoAndHistory(prev => {
          if (!prev) return prev;
          let updatedPartido = { ...prev };
          let newBasesState: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [null, null, null];
          let runsScoredThisPlay = 0;

          const batterAsPlayerOnBase: PlayerOnBase = {
              lineupPlayerId: batterLineupPlayer.id,
              jugadorId: batterLineupPlayer.jugadorId,
              nombreJugador: batterLineupPlayer.nombreJugador,
              reachedOnJugadaId: 'E' 
          };
          
          // Update batter stats for 'E'
          const batterLineupKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
          updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
            if (p.id === batterLineupPlayer.id) {
                const newStats = { ...p.stats };
                newStats.atBats += 1; 
                newStats.plateAppearances += 1;
                return { ...p, stats: newStats };
            }
            return p;
          });


          if (batterDestBase === 3) { // Home
              _applySingleRunScoringLogic(updatedPartido, batterAsPlayerOnBase, null); 
              runsScoredThisPlay++;
          } else if (batterDestBase >=0 && batterDestBase < 3) { // 1B, 2B, 3B
              newBasesState[batterDestBase] = batterAsPlayerOnBase;
          }
          updatedPartido.gameStatus.bases = newBasesState;

          const defensiveTeamKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'localStats' : 'visitanteStats';
          updatedPartido[defensiveTeamKey].errors += 1;

          const pitcher = getCurrentOpposingPitcher(updatedPartido); 
          const formatoDesc = formatos.find(f => f.codigo === updatedPartido.formatoJuegoId)?.descripcion || 'N/A';

          const batterErrorLog: RegistroJuego = {
              id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
              halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batterLineupPlayer.id,
              bateadorNombre: batterLineupPlayer.nombreJugador, bateadorPosicion: batterLineupPlayer.posicion,
              pitcherResponsableId: pitcher ? pitcher.id : null,
              pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
              equipoBateadorNombre: updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
              jugadaId: 'E', 
              descripcion: getOriginalJugadaDescription('E', "Error (permite embasarse)"), 
              outsPrev: prev.gameStatus.outs,
              outsAfter: prev.gameStatus.outs, 
              basesPrevState: initialBasesBeforePlay.map(p => p ? p.lineupPlayerId : 'null').join('-'),
              basesAfterState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'),
              runScored: runsScoredThisPlay, rbi: 0,
              fechaDelPartido: updatedPartido.fecha,
              formatoDelPartidoDesc: formatoDesc,
              numeroDelPartido: updatedPartido.numeroJuego,
              ordenDelBateador: batterLineupPlayer.ordenBate,
          };
          updatedPartido.registrosJuego.push(batterErrorLog);
          
          if (fielderWhoErredId) {
            const errorPlayerInfo = jugadoresDB.find(j => j.codigo === fielderWhoErredId);
            if (errorPlayerInfo) {
                const defensiveLineupKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'lineupLocal' : 'lineupVisitante';
                const fielderLineupPlayerIndex = updatedPartido[defensiveLineupKey].findIndex(p => p.jugadorId === errorPlayerInfo.codigo);
                const edLog: RegistroJuego = { 
                  id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                  halfInning: updatedPartido.gameStatus.currentHalfInning, 
                  bateadorId: fielderLineupPlayerIndex !== -1 ? updatedPartido[defensiveLineupKey][fielderLineupPlayerIndex].id : String(errorPlayerInfo.codigo),
                  bateadorNombre: errorPlayerInfo.nombre,
                  bateadorPosicion: fielderLineupPlayerIndex !== -1 ? updatedPartido[defensiveLineupKey][fielderLineupPlayerIndex].posicion : errorPlayerInfo.posicionPreferida,
                  pitcherResponsableId: pitcher ? pitcher.id : null, 
                  pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                  equipoBateadorNombre: updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.nombreEquipoLocal : updatedPartido.nombreEquipoVisitante, 
                  jugadaId: 'ED',
                  descripcion: getOriginalJugadaDescription('ED', "Error Defensivo"), 
                  outsPrev: updatedPartido.gameStatus.outs, 
                  outsAfter: updatedPartido.gameStatus.outs,
                  basesPrevState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'), 
                  basesAfterState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                  runScored: 0, rbi: 0,
                  fechaDelPartido: updatedPartido.fecha,
                  formatoDelPartidoDesc: formatoDesc,
                  numeroDelPartido: updatedPartido.numeroJuego,
                  ordenDelBateador: fielderLineupPlayerIndex !== -1 ? updatedPartido[defensiveLineupKey][fielderLineupPlayerIndex].ordenBate : 0,
                };
                updatedPartido.registrosJuego.push(edLog);
                if (fielderLineupPlayerIndex !== -1) {
                    const playInInningCellForFielder: PlayInInningCell = {playInstanceId: edLog.id, jugadaId: 'ED', descripcion: edLog.descripcion, playDisplayValue: 'ED'};
                    const fielderToUpdate = updatedPartido[defensiveLineupKey][fielderLineupPlayerIndex];
                    const updatedFielderInnings = { ...fielderToUpdate.innings };
                    if (!updatedFielderInnings[edLog.inning]) updatedFielderInnings[edLog.inning] = [];
                    updatedFielderInnings[edLog.inning].push(playInInningCellForFielder);
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
          
          updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
              if (p.id === batterLineupPlayer.id) {
                  const updatedInnings = { ...p.innings };
                  if (!updatedInnings[batterErrorLog.inning]) updatedInnings[batterErrorLog.inning] = [];
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
      setErrorModalContext(null);
    }
  };

  const handleConfirmRbiAssignment = (rbiCreditedToPlayerId: string | null) => {
    if (!currentPartido || !assignRbiModalState.scoringPlayerInfo) return;
    const { scoringPlayerInfo } = assignRbiModalState; 

    saveToHistory(currentPartido); 

    updateCurrentPartidoAndHistory(prev => {
        if (!prev || !scoringPlayerInfo) return prev;
        let updatedPartido = { ...prev };

        const pitcher = getCurrentOpposingPitcher(updatedPartido);
        const formatoDesc = formatos.find(f => f.codigo === updatedPartido.formatoJuegoId)?.descripcion || 'N/A';
        const rbiDescription = getOriginalJugadaDescription('RBI', 'Carrera Impulsada');
        
        if (rbiCreditedToPlayerId) {
            const batterLineupKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
            const rbiBatterIndex = updatedPartido[batterLineupKey].findIndex(p => p.id === rbiCreditedToPlayerId);

            if (rbiBatterIndex !== -1) {
                updatedPartido[batterLineupKey][rbiBatterIndex].stats.rbi += 1;

                const rbiBatter = updatedPartido[batterLineupKey][rbiBatterIndex];
                const rbiLog: RegistroJuego = {
                    id: generateUUID(),
                    timestamp: Date.now(),
                    inning: updatedPartido.gameStatus.actualInningNumber,
                    halfInning: updatedPartido.gameStatus.currentHalfInning,
                    bateadorId: rbiBatter.id, 
                    bateadorNombre: rbiBatter.nombreJugador,
                    bateadorPosicion: rbiBatter.posicion,
                    pitcherResponsableId: pitcher ? pitcher.id : null,
                    pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                    equipoBateadorNombre: updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                    jugadaId: "RBI",
                    descripcion: rbiDescription,
                    outsPrev: prev.gameStatus.outs, 
                    outsAfter: updatedPartido.gameStatus.outs,
                    basesPrevState: [...prev.gameStatus.bases].map(p => p ? p.lineupPlayerId : 'null').join('-'), 
                    basesAfterState: [...updatedPartido.gameStatus.bases].map(p => p ? p.lineupPlayerId : 'null').join('-'), 
                    runScored: 0, 
                    rbi: 1,
                    fechaDelPartido: updatedPartido.fecha,
                    formatoDelPartidoDesc: formatoDesc,
                    numeroDelPartido: updatedPartido.numeroJuego,
                    ordenDelBateador: rbiBatter.ordenBate,
                };
                updatedPartido.registrosJuego = [...updatedPartido.registrosJuego, rbiLog];

                const playInInningCellForRbi: PlayInInningCell = {
                    playInstanceId: rbiLog.id,
                    jugadaId: "RBI",
                    descripcion: rbiDescription,
                    playDisplayValue: "RBI"
                };
                const rbiBatterInnings = { ...updatedPartido[batterLineupKey][rbiBatterIndex].innings };
                if (!rbiBatterInnings[rbiLog.inning]) {
                    rbiBatterInnings[rbiLog.inning] = [];
                }
                rbiBatterInnings[rbiLog.inning].push(playInInningCellForRbi);
                updatedPartido[batterLineupKey][rbiBatterIndex] = {
                    ...updatedPartido[batterLineupKey][rbiBatterIndex],
                    innings: rbiBatterInnings
                };
            } else {
                console.warn(`RBI player with ID ${rbiCreditedToPlayerId} not found in active lineup for RBI stat.`);
            }
        }
        return updatedPartido;
    });
    setAssignRbiModalState({ isOpen: false, scoringPlayerInfo: null, batterForRbiContext: null, previousBatterForRbiContext: null, baseIndexOfScorer: undefined });
  };


  const handleRunnerAction = (action: RunnerActionType) => {
    if (!currentPartido || !managingRunner || gamePhase === 'ended') return;
    const { player: runnerInfo, baseIndex: originalRunnerBaseIndex } = managingRunner;

    setIsRunnerActionModalOpen(false); 

    if (action === 'scoreWithSpecificReason') {
        setRunnerAdvancementContext({
            runner: runnerInfo,
            baseIndexAdvancedTo: 3, // Target is HOME
            onConfirm: handleRunnerAdvancementReasonConfirm,
        });
        setIsRunnerAdvancementReasonModalOpen(true);
        setManagingRunner(null);
        return;
    }

    if (action === 'advanceTo2B' || action === 'advanceTo3BFrom1B' || action === 'advanceTo3BFrom2B') {
        const targetBaseIndex = action === 'advanceTo2B' ? 1 : 2; // 1 for 2B, 2 for 3B
        setRunnerAdvancementContext({
            runner: runnerInfo,
            baseIndexAdvancedTo: targetBaseIndex as 0 | 1 | 2 | 3, 
            onConfirm: handleRunnerAdvancementReasonConfirm
        });
        setIsRunnerAdvancementReasonModalOpen(true);
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
        setManagingRunner(null);
        return; 
    }
    
    if (action === 'outRunner') {
        setIsRunnerOutSpecificReasonModalOpen(true);
        return;
    }
  };

  const handleRunnerAdvancementReasonConfirm = (reason: RunnerAdvancementReason | string, errorPlayerId?: number | null) => {
    if (!currentPartido || !runnerAdvancementContext) return;
    saveToHistory(currentPartido);

    const { runner: runnerToAdvance, baseIndexAdvancedTo } = runnerAdvancementContext;
    const originalBaseIndexOfRunner = currentPartido.gameStatus.bases.findIndex(r => r?.lineupPlayerId === runnerToAdvance.lineupPlayerId);

    updateCurrentPartidoAndHistory(prev => {
        if (!prev) return prev;
        let updatedPartido = { ...prev };
        let newBases: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [...updatedPartido.gameStatus.bases];
        let runsScoredThisPlay = 0;
        const isScoring = baseIndexAdvancedTo === 3; // 3 means HOME

        if (originalBaseIndexOfRunner !== -1) {
            const validBaseIndex = originalBaseIndexOfRunner as 0 | 1 | 2; 
            newBases[validBaseIndex] = null; // Vacate original base
        }

        if (isScoring) {
            _applySingleRunScoringLogic(updatedPartido, runnerToAdvance, null);
            runsScoredThisPlay = 1;
        } else if (baseIndexAdvancedTo >=0 && baseIndexAdvancedTo < 3) { // baseIndexAdvancedTo is 0, 1, or 2
            newBases[baseIndexAdvancedTo] = runnerToAdvance; // Place on new base
        }
        updatedPartido.gameStatus.bases = newBases;
        updatedPartido.gameStatus.lastPlayContext = null; // Non-batter action resets context

        if (reason === RunnerAdvancementReason.ERROR_ADVANCE) {
            const defensiveTeamKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'localStats' : 'visitanteStats';
            updatedPartido[defensiveTeamKey].errors += 1;
        }

        const pitcher = getCurrentOpposingPitcher(updatedPartido);
        const formatoDesc = formatos.find(f => f.codigo === updatedPartido.formatoJuegoId)?.descripcion || 'N/A';
        const runnerLineupPlayer = (updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal).find(p => p.id === runnerToAdvance.lineupPlayerId);
        
        let jugadaIdForLog: string;
        switch (reason) {
            case RunnerAdvancementReason.STOLEN_BASE: jugadaIdForLog = 'SB'; break;
            case RunnerAdvancementReason.WILD_PITCH: jugadaIdForLog = 'WP'; break;
            case RunnerAdvancementReason.PASSED_BALL: jugadaIdForLog = 'PB'; break;
            case RunnerAdvancementReason.DEFENSIVE_INDIFFERENCE: jugadaIdForLog = 'ID'; break;
            case RunnerAdvancementReason.ERROR_ADVANCE: jugadaIdForLog = 'AE'; break;
            case 'OB': jugadaIdForLog = 'OB'; break;
            case 'BK': jugadaIdForLog = 'BK'; break;
            case RunnerAdvancementReason.OTHER: jugadaIdForLog = 'ADV_OTRO'; break;
            default: jugadaIdForLog = String(reason); 
        }
        const logDescription = getOriginalJugadaDescription(jugadaIdForLog);

        const newRegistro: RegistroJuego = {
            id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
            halfInning: updatedPartido.gameStatus.currentHalfInning,
            bateadorId: runnerToAdvance.lineupPlayerId,
            bateadorNombre: runnerToAdvance.nombreJugador,
            bateadorPosicion: runnerLineupPlayer?.posicion || '',
            pitcherResponsableId: pitcher ? pitcher.id : null,
            pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
            equipoBateadorNombre: updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
            jugadaId: isScoring ? 'R' : jugadaIdForLog, 
            descripcion: isScoring ? getOriginalJugadaDescription('R') : logDescription,
            outsPrev: prev.gameStatus.outs,
            outsAfter: prev.gameStatus.outs,
            basesPrevState: [...prev.gameStatus.bases].map(p => p ? p.lineupPlayerId : 'null').join('-'),
            basesAfterState: newBases.map(p => p ? p.lineupPlayerId : 'null').join('-'),
            runScored: runsScoredThisPlay, rbi: 0,
            advancementReason: reason,
            fechaDelPartido: updatedPartido.fecha,
            formatoDelPartidoDesc: formatoDesc,
            numeroDelPartido: updatedPartido.numeroJuego,
            ordenDelBateador: runnerLineupPlayer ? runnerLineupPlayer.ordenBate : 0,
        };
        updatedPartido.registrosJuego.push(newRegistro);

        const lineupKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
        updatedPartido[lineupKey] = updatedPartido[lineupKey].map(p => {
            if (p.id === runnerToAdvance.lineupPlayerId) {
                const updatedInnings = { ...p.innings };
                if (!updatedInnings[newRegistro.inning]) updatedInnings[newRegistro.inning] = [];
                updatedInnings[newRegistro.inning].push({
                    playInstanceId: newRegistro.id,
                    jugadaId: newRegistro.jugadaId,
                    descripcion: newRegistro.descripcion,
                    playDisplayValue: isScoring ? 'R' : newRegistro.jugadaId,
                });
                return { ...p, innings: updatedInnings };
            }
            return p;
        });

        if (reason === RunnerAdvancementReason.ERROR_ADVANCE && errorPlayerId) {
             const errorFielderInfo = jugadoresDB.find(j => j.codigo === errorPlayerId);
             if (errorFielderInfo) {
                const defensiveLineupKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'lineupLocal' : 'lineupVisitante'; 
                const fielderLineupPlayer = updatedPartido[defensiveLineupKey].find(lp => lp.jugadorId === errorPlayerId);
                 const edLog : RegistroJuego = {
                    ...newRegistro, 
                    id: generateUUID(),
                    bateadorId: fielderLineupPlayer ? fielderLineupPlayer.id : String(errorPlayerId),
                    bateadorNombre: errorFielderInfo.nombre,
                    bateadorPosicion: fielderLineupPlayer ? fielderLineupPlayer.posicion : errorFielderInfo.posicionPreferida,
                    equipoBateadorNombre: updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.nombreEquipoLocal : updatedPartido.nombreEquipoVisitante, 
                    jugadaId: 'ED',
                    descripcion: getOriginalJugadaDescription('ED'),
                    runScored: 0, rbi: 0, advancementReason: undefined,
                    ordenDelBateador: fielderLineupPlayer ? fielderLineupPlayer.ordenBate : 0,
                 };
                 updatedPartido.registrosJuego.push(edLog);
                 if (fielderLineupPlayer) {
                    const fielderLineupToUpdate = updatedPartido[defensiveLineupKey];
                    const fidx = fielderLineupToUpdate.findIndex(flp => flp.id === fielderLineupPlayer.id);
                    if (fidx !== -1) {
                        const updatedInnings = {...fielderLineupToUpdate[fidx].innings};
                        if (!updatedInnings[edLog.inning]) updatedInnings[edLog.inning] = [];
                        updatedInnings[edLog.inning].push({ playInstanceId: edLog.id, jugadaId: 'ED', descripcion: edLog.descripcion, playDisplayValue: 'ED' });
                        fielderLineupToUpdate[fidx] = {...fielderLineupToUpdate[fidx], innings: updatedInnings};
                    }
                 }
             }
        }

        if (isScoring) { 
            const currentLineupForContext = updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal;
            const batterForContext = currentLineupForContext.find(p => p.id === updatedPartido.gameStatus.currentBatterLineupPlayerId);
            let previousBatterForContext: LineupPlayer | null = null;
            if(updatedPartido.gameStatus.lastPlayContext?.previousBatterLineupPlayerId) {
                previousBatterForContext = currentLineupForContext.find(p => p.id === updatedPartido.gameStatus.lastPlayContext!.previousBatterLineupPlayerId);
            } else if (updatedPartido.gameStatus.lastPlayContext?.batterLineupPlayerId && updatedPartido.gameStatus.lastPlayContext?.batterLineupPlayerId !== batterForContext?.id) {
                previousBatterForContext = currentLineupForContext.find(p => p.id === updatedPartido.gameStatus.lastPlayContext!.batterLineupPlayerId);
            }
            setAssignRbiModalState({ isOpen: true, scoringPlayerInfo: runnerToAdvance, batterForRbiContext: batterForContext || null, previousBatterForRbiContext: previousBatterForContext, baseIndexOfScorer: originalBaseIndexOfRunner as 0 | 1 | 2 });
        }
        return updatedPartido;
    });
    setIsRunnerAdvancementReasonModalOpen(false);
    setRunnerAdvancementContext(null);
  };

  const handleRunnerOutSpecificReasonConfirm = (outReason: RunnerOutReason) => {
    if (!currentPartido || !managingRunner) return;
    saveToHistory(currentPartido);
    
    const { player: runnerInfo, baseIndex: originalRunnerBaseIndex } = managingRunner;

    updateCurrentPartidoAndHistory(prev => {
        if (!prev) return prev;
        let updatedPartido = { ...prev };
        let newBases: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [...updatedPartido.gameStatus.bases];
        
        const pitcher = getCurrentOpposingPitcher(updatedPartido);
        const formatoDesc = formatos.find(f => f.codigo === updatedPartido.formatoJuegoId)?.descripcion || 'N/A';
        const runnerLineupPlayer = (updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal).find(p => p.id === runnerInfo.lineupPlayerId);

        const outsPrevForLog = updatedPartido.gameStatus.outs;
        newBases[originalRunnerBaseIndex] = null; // Runner is out, remove from base
        
        updatedPartido.gameStatus.bases = newBases;

        const { updatedGameStatus: statusAfterOut, gameShouldEnd } = _calculateOutsUpdate(
            updatedPartido.gameStatus, 1, updatedPartido.maxInnings,
            updatedPartido.lineupVisitante, updatedPartido.lineupLocal,
            updatedPartido.visitanteStats.totalRuns,
            updatedPartido.localStats.totalRuns
        );
        updatedPartido.gameStatus = statusAfterOut; 
        
        if (gameShouldEnd && gamePhase === 'scoring') {
            setGamePhase('ended');
        }

        let jugadaIdForLog: string = 'OUT_RUNNER_BASE';
        let logDescription: string = getOriginalJugadaDescription('OUT_RUNNER_BASE');

        if (outReason === 'CS') {
            jugadaIdForLog = 'CS';
            logDescription = getOriginalJugadaDescription('CS');
        } else if (outReason === 'PK') {
            jugadaIdForLog = 'OUT_RUNNER_BASE'; 
            logDescription = `Out por Pickoff en ${getBaseLabel(originalRunnerBaseIndex + 1)}`; 
        }

        const outLog: RegistroJuego = {
            id: generateUUID(), timestamp: Date.now(), inning: statusAfterOut.actualInningNumber,
            halfInning: prev.gameStatus.currentHalfInning, 
            bateadorId: runnerInfo.lineupPlayerId, 
            bateadorNombre: runnerInfo.nombreJugador, 
            bateadorPosicion: runnerLineupPlayer?.posicion || '',
            pitcherResponsableId: pitcher ? pitcher.id : null,
            pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
            equipoBateadorNombre: updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
            jugadaId: jugadaIdForLog,
            descripcion: logDescription,
            outsPrev: outsPrevForLog,
            outsAfter: updatedPartido.gameStatus.outs,
            basesPrevState: [...prev.gameStatus.bases].map(p => p ? p.lineupPlayerId : 'null').join('-'),
            basesAfterState: newBases.map(p => p ? p.lineupPlayerId : 'null').join('-'),
            runScored: 0, rbi: 0,
            fechaDelPartido: updatedPartido.fecha,
            formatoDelPartidoDesc: formatoDesc,
            numeroDelPartido: updatedPartido.numeroJuego,
            ordenDelBateador: runnerLineupPlayer ? runnerLineupPlayer.ordenBate : 0,
        };
        updatedPartido.registrosJuego.push(outLog);
        updatedPartido.gameStatus.lastPlayContext = null;

        const lineupKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
        updatedPartido[lineupKey] = updatedPartido[lineupKey].map(p => {
            if (p.id === runnerInfo.lineupPlayerId) {
                const updatedInnings = { ...p.innings };
                if (!updatedInnings[outLog.inning]) updatedInnings[outLog.inning] = [];
                updatedInnings[outLog.inning].push({
                    playInstanceId: outLog.id,
                    jugadaId: outLog.jugadaId,
                    descripcion: outLog.descripcion,
                    playDisplayValue: jugadaIdForLog,
                });
                return { ...p, innings: updatedInnings };
            }
            return p;
        });
        
        return updatedPartido;
    });

    setIsRunnerOutSpecificReasonModalOpen(false);
    setManagingRunner(null);
  };

  const handleUndoLastPlay = () => {
    if (partidoHistoryStack.length > 0) {
      const [lastState, ...restOfHistory] = partidoHistoryStack;
      setCurrentPartido(lastState);
      setPartidoHistoryStack(restOfHistory);
    } else {
      alert("No hay más acciones para deshacer.");
    }
  };

  const requestSaveAndEndGame = () => {
    setConfirmActionModalProps({
      title: 'Finalizar y Guardar Juego',
      message: '¿Está seguro de que desea finalizar el partido y guardarlo en el historial? Ya no podrá anotar más jugadas.',
      onConfirm: handleSaveAndEndGame,
      confirmButtonText: 'Finalizar y Guardar',
      confirmButtonVariant: 'success',
    });
    setIsConfirmActionModalOpen(true);
  };

  const handleSaveAndEndGame = () => {
    if (!currentPartido) return;
    const finalGameData: JuegoGuardado = {
      ...currentPartido,
      idJuego: currentPartido.idJuego || generateUUID(),
      timestampGuardado: Date.now(),
    };
    setHistorial(prevHistorial => [...prevHistorial.filter(j => j.idJuego !== finalGameData.idJuego), finalGameData]);
    setPartidoEnCurso(null);
    setPartidoHistoryStack([]);
    navigate('/historial');
  };
  
  const handleArchiveGame = () => {
    if (!currentPartido) return;
    const gameToSave: JuegoGuardado = {
        ...currentPartido,
        idJuego: currentPartido.idJuego || generateUUID(),
        timestampGuardado: Date.now(),
    };
    setHistorial(prev => [...prev.filter(j => j.idJuego !== gameToSave.idJuego), gameToSave]);
    alert("Partido guardado en el historial. Puede continuar jugando.");
    setIsConfirmActionModalOpen(false); // Close any open confirmation modal
  };

  const requestClearGame = () => {
     setConfirmActionModalProps({
        title: 'Borrar Partido Actual',
        message: '¿Está seguro de que desea borrar todos los datos del partido actual? Esta acción no se puede deshacer.',
        onConfirm: () => {
            setPartidoEnCurso(null);
            setPartidoHistoryStack([]);
            navigate('/configurar-partido');
        },
        confirmButtonText: 'Borrar Partido',
        confirmButtonVariant: 'danger',
    });
    setIsConfirmActionModalOpen(true);
  };

  const handleOpenEditRegistroModal = (registro: RegistroJuego) => {
    setEditingRegistro(registro);
    setTempEditedPlayIdInModal(registro.jugadaId);
    setIsEditRegistroModalOpen(true);
  };
  
  const handleConfirmEditRegistro = () => {
      // Logic for editing a game log entry would be complex and is omitted for this fix.
      // It would require recalculating all subsequent game states.
      alert("La edición del historial de jugadas no está implementada en esta versión.");
      setIsEditRegistroModalOpen(false);
      setEditingRegistro(null);
  };

  if (!currentPartido) {
    return (
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold text-gray-700 dark:text-gray-200">Cargando partido...</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">Si esta pantalla persiste, es posible que no haya un partido en curso.</p>
        <Button onClick={() => navigate('/configurar-partido')} variant="primary" className="mt-4">
          Configurar Nuevo Partido
        </Button>
      </div>
    );
  }

  const currentBatter = 
    currentPartido.gameStatus.currentHalfInning === 'Top' 
      ? currentPartido.lineupVisitante.find(p => p.id === currentPartido.gameStatus.currentBatterLineupPlayerId) 
      : currentPartido.lineupLocal.find(p => p.id === currentPartido.gameStatus.currentBatterLineupPlayerId);
  
  const lineupForTable = activeLineupTab === 'visitante' ? currentPartido.lineupVisitante : currentPartido.lineupLocal;
  const teamLineupTableColumns: TableColumn<LineupPlayer>[] = [
    { header: '#', accessor: 'ordenBate', className: 'w-8 text-center font-mono' },
    { header: 'Jugador', accessor: 'nombreJugador', className: 'font-medium' },
    { header: 'Pos.', accessor: 'posicion', className: 'w-12 text-center' },
    ...Array.from({ length: currentPartido.maxInnings }, (_, i) => i + 1).map(inningNum => ({
      header: String(inningNum),
      accessor: (item: LineupPlayer) => (
          <div className="text-center text-xs space-x-1">
              {(item.innings[inningNum] || []).map(play => (
                  <span key={play.playInstanceId} title={play.descripcion}>{play.playDisplayValue}</span>
              ))}
          </div>
      ),
      className: `w-16 text-center ${inningNum === inningToShowInLineups ? 'bg-blue-50 dark:bg-blue-900/50' : ''}`
    })),
  ];

  const gameLogTableColumns: TableColumn<RegistroJuego & {id: string}>[] = [
    { header: 'Inn', accessor: (item) => `${item.inning}${item.halfInning === 'Top' ? '↑' : '↓'}`, className: "w-10" },
    { header: 'Jugador', accessor: 'bateadorNombre' },
    { header: 'Jugada', accessor: (item) => <span title={item.descripcion}>{item.jugadaId}</span>, className: "w-16 font-bold" },
    { header: 'Descripción', accessor: 'descripcion' },
    { header: 'Outs', accessor: 'outsAfter', className: "w-12 text-center" },
    { header: 'Acciones', accessor: (item) => (
        <IconButton icon={<EditIcon />} onClick={() => handleOpenEditRegistroModal(item)} label="Editar Jugada" />
    ), className: "w-16 text-center" },
  ];


  return (
    <div className="space-y-6">
       {/* Game Header */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md sticky top-16 z-30">
        <div className="grid grid-cols-3 items-center text-center">
            <div className="text-left">
                <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{currentPartido.nombreEquipoVisitante}</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{currentPartido.visitanteStats.totalRuns}</p>
            </div>
            <div>
                <p className="text-lg font-semibold text-gray-600 dark:text-gray-300">
                    {currentPartido.gameStatus.currentHalfInning === 'Top' ? '⬆' : '⬇'} Inning {currentPartido.gameStatus.actualInningNumber}
                </p>
                <p className="text-md text-gray-500 dark:text-gray-400">Outs: {currentPartido.gameStatus.outs}</p>
            </div>
            <div className="text-right">
                <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{currentPartido.nombreEquipoLocal}</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{currentPartido.localStats.totalRuns}</p>
            </div>
        </div>
      </div>
      
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Side: Diamond and Game Log */}
        <div className="lg:w-2/3 space-y-4">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200">
                    Al Bate: {currentBatter?.nombreJugador || 'N/A'} ({currentBatter?.posicion || 'N/A'})
                </h3>
                <BaseballDiamondSVG bases={currentPartido.gameStatus.bases} onBaseClick={handleBaseClick} disabled={gamePhase === 'ended'} />
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
                <button onClick={() => setIsGameLogExpanded(!isGameLogExpanded)} className="w-full text-left text-xl font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex justify-between items-center rounded-t-lg p-2 -m-2 mb-2" aria-expanded={isGameLogExpanded}>
                    Registro de Jugadas ({currentPartido.registrosJuego.length})
                    <svg className={`w-6 h-6 transform transition-transform duration-200 ${isGameLogExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                {isGameLogExpanded && (
                    <div className="mt-2 max-h-96 overflow-y-auto">
                        <Table columns={gameLogTableColumns} data={[...currentPartido.registrosJuego].reverse()} />
                    </div>
                )}
            </div>
        </div>
        {/* Right Side: Lineups and Actions */}
        <div className="lg:w-1/3 space-y-4">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200">Anotación y Controles</h3>
            <div className="grid grid-cols-2 gap-2">
                <Button onClick={handleUndoLastPlay} disabled={partidoHistoryStack.length === 0 || gamePhase === 'ended'} variant="warning"><MdUndo className="inline mr-1" /> Deshacer</Button>
                <Button onClick={() => setIsBoxScoreModalOpen(true)} variant="info"><MdOutlineLeaderboard className="inline mr-1" /> Box Score</Button>
                <Button onClick={handleArchiveGame} variant="secondary"><SaveIcon className="inline mr-1" /> Guardar</Button>
                {gamePhase === 'ended' ? (
                   <Button onClick={requestSaveAndEndGame} variant="success">Finalizar y Archivar</Button>
                ) : (
                   <Button onClick={requestSaveAndEndGame} variant="success">Finalizar Partido</Button>
                )}
                <Button onClick={requestClearGame} variant="danger" className="col-span-2"><MdDeleteForever className="inline mr-1" /> Borrar Partido</Button>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <div className="flex border-b border-gray-200 dark:border-gray-700">
                <button onClick={() => setActiveLineupTab('visitante')} className={`flex-1 py-2 px-4 text-sm font-medium ${activeLineupTab === 'visitante' ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    {currentPartido.nombreEquipoVisitante}
                </button>
                <button onClick={() => setActiveLineupTab('local')} className={`flex-1 py-2 px-4 text-sm font-medium ${activeLineupTab === 'local' ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    {currentPartido.nombreEquipoLocal}
                </button>
            </div>
            <div className="p-2 overflow-x-auto">
                <Table columns={teamLineupTableColumns.map(col => {
                    const isCurrentInningCol = typeof col.header === 'string' && parseInt(col.header, 10) === currentPartido.gameStatus.actualInningNumber;
                    return ({
                        ...col,
                        className: `${col.className || ''} ${isCurrentInningCol ? 'bg-blue-50 dark:bg-blue-900/50' : ''}`
                    })
                 })} data={lineupForTable.map(p => ({...p, id: p.id}))} />
            </div>
          </div>
        </div>
      </div>
       {/* Modals */}
       <Modal isOpen={isPlayModalOpen} onClose={() => setIsPlayModalOpen(false)} title={`Anotar Jugada para ${currentPlayerForPlay?.nombreJugador}`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {jugadasDB.filter(j => j.isActive).map(jugada => (
                    <Button key={jugada.codigo} onClick={() => handlePlaySelected(jugada)} variant="light" className="flex-col h-16">
                        <span className="font-bold text-lg">{jugada.jugada}</span>
                        <span className="text-xs">{jugada.descripcion}</span>
                    </Button>
                ))}
            </div>
       </Modal>
       {managingRunner && (
          <Modal isOpen={isRunnerActionModalOpen} onClose={() => setIsRunnerActionModalOpen(false)} title={`Acción para ${managingRunner.player.nombreJugador}`}>
            <div className="space-y-2">
                <Button onClick={() => handleRunnerAction('advanceTo2B')} className="w-full" disabled={managingRunner.baseIndex >= 1}>Avanzar a 2B</Button>
                <Button onClick={() => handleRunnerAction('advanceTo3BFrom2B')} className="w-full" disabled={managingRunner.baseIndex !== 1}>Avanzar a 3B (desde 2B)</Button>
                <Button onClick={() => handleRunnerAction('advanceTo3BFrom1B')} className="w-full" disabled={managingRunner.baseIndex !== 0}>Avanzar a 3B (desde 1B)</Button>
                <Button onClick={() => handleRunnerAction('scoreManually')} className="w-full" variant="success">Anotar Carrera</Button>
                <Button onClick={() => handleRunnerAction('outRunner')} className="w-full" variant="danger">Out Corredor</Button>
            </div>
          </Modal>
       )}
       {isRunnerOutSpecificReasonModalOpen && managingRunner && (
           <RunnerOutSpecificReasonModal
             isOpen={isRunnerOutSpecificReasonModalOpen}
             onClose={() => setIsRunnerOutSpecificReasonModalOpen(false)}
             onConfirm={handleRunnerOutSpecificReasonConfirm}
             runnerName={managingRunner.player.nombreJugador}
             baseBeingRunFrom={getBaseLabel(managingRunner.baseIndex + 1)}
           />
       )}
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
        {doublePlayContext && (
            <DoublePlayOutSelectionModal
                isOpen={isDoublePlayModalOpen}
                onClose={() => setIsDoublePlayModalOpen(false)}
                onConfirm={doublePlayContext.onConfirm}
                playersInvolved={[doublePlayContext.batter, ...doublePlayContext.runners]}
                teamName={currentPartido.gameStatus.currentHalfInning === 'Top' ? currentPartido.nombreEquipoVisitante : currentPartido.nombreEquipoLocal}
            />
        )}
        {triplePlayContext && (
             <TriplePlayOutSelectionModal
                isOpen={isTriplePlayModalOpen}
                onClose={() => setIsTriplePlayModalOpen(false)}
                onConfirm={triplePlayContext.onConfirm}
                playersInvolved={[triplePlayContext.batter, ...triplePlayContext.runners]}
                teamName={currentPartido.gameStatus.currentHalfInning === 'Top' ? currentPartido.nombreEquipoVisitante : currentPartido.nombreEquipoLocal}
            />
        )}
        {runnerAdvancementContext && (
            <RunnerAdvancementReasonModal
                isOpen={isRunnerAdvancementReasonModalOpen}
                onClose={() => setIsRunnerAdvancementReasonModalOpen(false)}
                onConfirm={runnerAdvancementContext.onConfirm}
                runner={runnerAdvancementContext.runner}
                defensiveTeamLineup={currentPartido.gameStatus.currentHalfInning === 'Top' ? currentPartido.lineupLocal : currentPartido.lineupVisitante}
                defensiveTeamName={currentPartido.gameStatus.currentHalfInning === 'Top' ? currentPartido.nombreEquipoLocal : currentPartido.nombreEquipoVisitante}
                isScoringAttempt={runnerAdvancementContext.baseIndexAdvancedTo === 3}
            />
        )}
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
       {runnerAdvancementAfterHitModalState.isOpen && runnerAdvancementAfterHitModalState.batter && runnerAdvancementAfterHitModalState.hitType && (
           <RunnerAdvancementAfterHitModal
             isOpen={runnerAdvancementAfterHitModalState.isOpen}
             onClose={() => setRunnerAdvancementAfterHitModalState(prev => ({...prev, isOpen: false}))}
             batter={runnerAdvancementAfterHitModalState.batter}
             hitType={runnerAdvancementAfterHitModalState.hitType}
             batterReachedBase={runnerAdvancementAfterHitModalState.batterReachedBase}
             runnersOnBase={runnerAdvancementAfterHitModalState.runnersOnBase}
             initialAdvancements={runnerAdvancementAfterHitModalState.advancements}
             onConfirm={() => {/* Complex logic needed here */}}
           />
       )}
       {runnerAdvancementAfterSacrificeModalState.isOpen && runnerAdvancementAfterSacrificeModalState.batter && runnerAdvancementAfterSacrificeModalState.sacrificeType && (
            <RunnerAdvancementAfterSacrificeModal
                isOpen={runnerAdvancementAfterSacrificeModalState.isOpen}
                onClose={() => setRunnerAdvancementAfterSacrificeModalState(prev => ({...prev, isOpen: false}))}
                batter={runnerAdvancementAfterSacrificeModalState.batter}
                sacrificeType={runnerAdvancementAfterSacrificeModalState.sacrificeType}
                runnersOnBase={runnerAdvancementAfterSacrificeModalState.runnersOnBase}
                initialAdvancements={runnerAdvancementAfterSacrificeModalState.advancements}
                initialOuts={runnerAdvancementAfterSacrificeModalState.initialOuts}
                onConfirm={() => {/* Complex logic needed here */}}
            />
       )}
       {runnerAdvancementAfterErrorModalState.isOpen && runnerAdvancementAfterErrorModalState.batterWhoReachedOnError && (
          <RunnerAdvancementAfterErrorModal
              isOpen={runnerAdvancementAfterErrorModalState.isOpen}
              onClose={() => setRunnerAdvancementAfterErrorModalState(prev => ({...prev, isOpen: false}))}
              batterWhoReachedOnError={runnerAdvancementAfterErrorModalState.batterWhoReachedOnError}
              batterFinalDestBaseOnError={runnerAdvancementAfterErrorModalState.batterFinalDestBaseOnError}
              runnersOnBaseAtTimeOfError={runnerAdvancementAfterErrorModalState.runnersOnBaseAtTimeOfError}
              fielderWhoCommittedError={runnerAdvancementAfterErrorModalState.fielderWhoCommittedError}
              onConfirm={() => {/* Complex logic needed here */}}
          />
       )}
       {fielderChoiceModalState.isOpen && fielderChoiceModalState.batter && (
           <FielderChoiceOutcomeModal
               isOpen={fielderChoiceModalState.isOpen}
               onClose={() => setFielderChoiceModalState(prev => ({...prev, isOpen: false}))}
               batter={fielderChoiceModalState.batter}
               runnersOnBase={fielderChoiceModalState.runnersOnBase}
               initialOuts={fielderChoiceModalState.initialOuts}
               onConfirm={() => {/* Complex logic needed here */}}
           />
       )}
        {confirmActionModalProps && (
           <ConfirmationModal
             isOpen={isConfirmActionModalOpen}
             onClose={() => setIsConfirmActionModalOpen(false)}
             onConfirm={() => { confirmActionModalProps.onConfirm(); setIsConfirmActionModalOpen(false); }}
             title={confirmActionModalProps.title}
             message={confirmActionModalProps.message}
             confirmButtonText={confirmActionModalProps.confirmButtonText}
             confirmButtonVariant={confirmActionModalProps.confirmButtonVariant}
           />
       )}
       {editingPlayerForPosition && (
          <PositionSelectionModal
            isOpen={isEditPlayerPositionModalOpen}
            onClose={() => setIsEditPlayerPositionModalOpen(false)}
            onConfirm={handleConfirmPlayerPositionChange}
            currentPlayerName={editingPlayerForPosition.player.nombreJugador}
            currentPosition={editingPlayerForPosition.player.posicion}
            teamLineup={editingPlayerForPosition.team === 'visitante' ? currentPartido.lineupVisitante : currentPartido.lineupLocal}
            teamName={editingPlayerForPosition.team === 'visitante' ? currentPartido.nombreEquipoVisitante : currentPartido.nombreEquipoLocal}
          />
       )}
    </div>
  );
};
