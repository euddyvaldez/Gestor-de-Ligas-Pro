
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

  const handleConfirmRunnerAdvancementsFromErrorModal = (
    runnerAdvancements: { [lineupPlayerId: string]: number },
    originalFielderErrorId: number | null,
    batterAtPlay: LineupPlayer,
    batterDestBase: 0 | 1 | 2 | 3 // 0=1B, 1=2B, etc.
  ) => {
    if (!currentPartido) return;
    saveToHistory(currentPartido);
    const initialBasesForLog = [...currentPartido.gameStatus.bases]; 
    const outsBeforePlayForLog = currentPartido.gameStatus.outs;

    updateCurrentPartidoAndHistory(prev => {
      if (!prev) return prev;
      let updatedPartido = { ...prev };
      let newBasesState: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [null, null, null];
      let runsScoredThisPlayByRunners = 0;
      let outsGeneratedThisPlay = 0;
      
      const batterAsPlayerOnBase: PlayerOnBase = {
        lineupPlayerId: batterAtPlay.id,
        jugadorId: batterAtPlay.jugadorId,
        nombreJugador: batterAtPlay.nombreJugador,
        reachedOnJugadaId: 'E'
      };

      const pitcher = getCurrentOpposingPitcher(updatedPartido);
      const formatoDesc = formatos.find(f => f.codigo === updatedPartido.formatoJuegoId)?.descripcion || 'N/A';
      const teamAtBatNombre = updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal;
      const batterLineupKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
      
      updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
        if (p.id === batterAtPlay.id) {
            const newStats = { ...p.stats };
            newStats.atBats += 1; 
            newStats.plateAppearances += 1;
            return { ...p, stats: newStats };
        }
        return p;
      });


      runnerAdvancementAfterErrorModalState.runnersOnBaseAtTimeOfError.forEach(runnerInfo => {
        const targetBase = runnerAdvancements[runnerInfo.lineupPlayerId];
        const runnerLineupPlayer = updatedPartido[batterLineupKey].find(p => p.id === runnerInfo.lineupPlayerId);

        if (targetBase === 0) { 
          outsGeneratedThisPlay++;
          const outLog: RegistroJuego = {
            id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
            halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: runnerInfo.lineupPlayerId, 
            bateadorNombre: runnerInfo.nombreJugador, bateadorPosicion: runnerLineupPlayer?.posicion || '',
            pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
            equipoBateadorNombre: teamAtBatNombre, jugadaId: 'OUT_ROE', 
            descripcion: getOriginalJugadaDescription('OUT_ROE', `Out Corredor en Jugada de Error`),
            outsPrev: outsBeforePlayForLog + outsGeneratedThisPlay - 1, outsAfter: outsBeforePlayForLog + outsGeneratedThisPlay,
            basesPrevState: initialBasesForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
            basesAfterState: "Pending", 
            runScored: 0, rbi: 0,
            fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: runnerLineupPlayer?.ordenBate || 0,
          };
          updatedPartido.registrosJuego.push(outLog);
           if(runnerLineupPlayer){
                const updatedInnings = { ...runnerLineupPlayer.innings };
                if (!updatedInnings[outLog.inning]) updatedInnings[outLog.inning] = [];
                updatedInnings[outLog.inning].push({playInstanceId: outLog.id, jugadaId: 'OUT_ROE', descripcion: outLog.descripcion, playDisplayValue: 'Out'});
                updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => p.id === runnerLineupPlayer.id ? {...runnerLineupPlayer, innings: updatedInnings} : p);
            }

        } else if (targetBase === 4) { 
          _applySingleRunScoringLogic(updatedPartido, runnerInfo, null); 
          runsScoredThisPlayByRunners++;
          const runLog: RegistroJuego = { 
             id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
            halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: runnerInfo.lineupPlayerId,
            bateadorNombre: runnerInfo.nombreJugador, bateadorPosicion: runnerLineupPlayer?.posicion || '',
            pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
            equipoBateadorNombre: teamAtBatNombre, jugadaId: 'R', 
            descripcion: getOriginalJugadaDescription('R', `Carrera Anotada`),
            outsPrev: outsBeforePlayForLog + outsGeneratedThisPlay, outsAfter: outsBeforePlayForLog + outsGeneratedThisPlay,
            basesPrevState: initialBasesForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
            basesAfterState: "Pending",
            runScored: 1, rbi: 0,
            fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: runnerLineupPlayer?.ordenBate || 0,
          };
          updatedPartido.registrosJuego.push(runLog);
           if(runnerLineupPlayer){
                const updatedInnings = { ...runnerLineupPlayer.innings };
                if (!updatedInnings[runLog.inning]) updatedInnings[runLog.inning] = [];
                updatedInnings[runLog.inning].push({playInstanceId: runLog.id, jugadaId: 'R', descripcion: runLog.descripcion, playDisplayValue: 'R'});
                 updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => p.id === runnerLineupPlayer.id ? {...runnerLineupPlayer, innings: updatedInnings} : p);
            }
        } else if (targetBase >= 1 && targetBase <= 3) {
          newBasesState[targetBase - 1] = runnerInfo;
        }
      });
      
      let runsScoredByBatter = 0;
      if (batterDestBase === 3) { 
        _applySingleRunScoringLogic(updatedPartido, batterAtPlay, null); 
        runsScoredByBatter++;
      } else if (batterDestBase >= 0 && batterDestBase <= 2) {
        newBasesState[batterDestBase] = batterAsPlayerOnBase;
      }
      
      const defensiveTeamKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'localStats' : 'visitanteStats';
      updatedPartido[defensiveTeamKey].errors += 1;

      const batterErrorLog: RegistroJuego = {
        id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
        halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batterAtPlay.id,
        bateadorNombre: batterAtPlay.nombreJugador, bateadorPosicion: batterAtPlay.posicion,
        pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
        equipoBateadorNombre: teamAtBatNombre, jugadaId: 'E',
        descripcion: getOriginalJugadaDescription('E', "Error (permite embasarse)"),
        outsPrev: outsBeforePlayForLog, outsAfter: outsBeforePlayForLog + outsGeneratedThisPlay,
        basesPrevState: initialBasesForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
        basesAfterState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'),
        runScored: runsScoredByBatter, rbi: 0, 
        fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: batterAtPlay.ordenBate,
      };
      updatedPartido.registrosJuego.push(batterErrorLog);
      
      const playInCellForBatter: PlayInInningCell = {
          playInstanceId: batterErrorLog.id, jugadaId: 'E', descripcion: batterErrorLog.descripcion,
          playDisplayValue: `E${runsScoredByBatter > 0 ? ' (Anota)' : ''}`
      };
      updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
          if (p.id === batterAtPlay.id) {
              const updatedInnings = { ...p.innings };
              if (!updatedInnings[batterErrorLog.inning]) updatedInnings[batterErrorLog.inning] = [];
              updatedInnings[batterErrorLog.inning].push(playInCellForBatter);
              return { ...p, innings: updatedInnings };
          }
          return p;
      });

      if (originalFielderErrorId) {
          const errorPlayerInfo = jugadoresDB.find(j => j.codigo === originalFielderErrorId);
          if (errorPlayerInfo) {
              const defensiveLineupKey = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'lineupLocal' : 'lineupVisitante';
              const fielderLineupPlayer = updatedPartido[defensiveLineupKey].find(p => p.jugadorId === errorPlayerInfo.codigo);
              const edLog: RegistroJuego = { 
                id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                halfInning: updatedPartido.gameStatus.currentHalfInning, 
                bateadorId: fielderLineupPlayer ? fielderLineupPlayer.id : String(errorPlayerInfo.codigo), 
                bateadorNombre: errorPlayerInfo.nombre,
                bateadorPosicion: fielderLineupPlayer ? fielderLineupPlayer.posicion : errorPlayerInfo.posicionPreferida,
                pitcherResponsableId: pitcher ? pitcher.id : null, 
                pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                equipoBateadorNombre: updatedPartido.gameStatus.currentHalfInning === 'Top' ? updatedPartido.nombreEquipoLocal : updatedPartido.nombreEquipoVisitante, 
                jugadaId: 'ED',
                descripcion: getOriginalJugadaDescription('ED', "Error Defensivo"), 
                outsPrev: outsBeforePlayForLog + outsGeneratedThisPlay, 
                outsAfter: outsBeforePlayForLog + outsGeneratedThisPlay,
                basesPrevState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'), 
                basesAfterState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                runScored: 0, rbi: 0,
                fechaDelPartido: updatedPartido.fecha,
                formatoDelPartidoDesc: formatoDesc,
                numeroDelPartido: updatedPartido.numeroJuego,
                ordenDelBateador: fielderLineupPlayer ? fielderLineupPlayer.ordenBate : 0, 
              };
              updatedPartido.registrosJuego.push(edLog);
              if (fielderLineupPlayer) {
                  const playInCellForFielder: PlayInInningCell = {playInstanceId: edLog.id, jugadaId: 'ED', descripcion: edLog.descripcion, playDisplayValue: 'ED'};
                  const updatedFielderInnings = { ...fielderLineupPlayer.innings };
                  if (!updatedFielderInnings[edLog.inning]) updatedFielderInnings[edLog.inning] = [];
                  updatedFielderInnings[edLog.inning].push(playInCellForFielder);
                  updatedPartido[defensiveLineupKey] = updatedPartido[defensiveLineupKey].map(p => p.id === fielderLineupPlayer.id ? {...fielderLineupPlayer, innings: updatedFielderInnings} : p);
              }
          }
      }
      
      const { updatedGameStatus, gameShouldEnd } = _calculateOutsUpdate(
        { ...updatedPartido.gameStatus, bases: newBasesState, outs: outsBeforePlayForLog },
        outsGeneratedThisPlay, updatedPartido.maxInnings,
        updatedPartido.lineupVisitante, updatedPartido.lineupLocal,
        updatedPartido.visitanteStats.totalRuns, updatedPartido.localStats.totalRuns
      );
      updatedPartido.gameStatus = updatedGameStatus;
      updatedPartido.gameStatus.lastPlayContext = { batterLineupPlayerId: batterAtPlay.id, jugada: jugadasDB.find(j => j.jugada === 'E') || null, timestamp: Date.now(), previousBatterLineupPlayerId: prev.gameStatus.lastPlayContext?.batterLineupPlayerId !== batterAtPlay.id ? prev.gameStatus.lastPlayContext?.batterLineupPlayerId : prev.gameStatus.lastPlayContext?.previousBatterLineupPlayerId};
      
      if (outsGeneratedThisPlay === 0 && updatedPartido.gameStatus.outs === outsBeforePlayForLog) {
         updatedPartido.gameStatus.currentBatterLineupPlayerId = findNextBatterInLineup(updatedPartido[batterLineupKey], batterAtPlay.id);
      }


      if (gameShouldEnd && gamePhase === 'scoring') {
          setGamePhase('ended');
      }
      return updatedPartido;
    });
    setRunnerAdvancementAfterErrorModalState(prev => ({ ...prev, isOpen: false, batterWhoReachedOnError: null, runnersOnBaseAtTimeOfError: [] }));
    setCurrentPlayerForPlay(null); 
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
                const inningForCell = outLog.inning; 
                if (!updatedInnings[inningForCell]) updatedInnings[inningForCell] = [];
                updatedInnings[inningForCell].push({
                    playInstanceId: outLog.id,
                    jugadaId: outLog.jugadaId,
                    descripcion: outLog.descripcion,
                    playDisplayValue: outLog.jugadaId === 'CS' ? 'CS' : 'Out', 
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


  const handleConfirmRunnerAdvancementsFromHitModal = (
    advancements: { [key: string]: number }, 
    batter: LineupPlayer,
    hitType: 'H1' | 'H2' | 'H3' | 'HR', 
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

        let tempBatterStats = { ...batter.stats }; 
        tempBatterStats.atBats +=1;
        tempBatterStats.plateAppearances +=1;
        tempBatterStats.hits +=1;
        if (hitType === 'H1') tempBatterStats.singles +=1;
        else if (hitType === 'H2') tempBatterStats.doubles +=1;
        else if (hitType === 'H3') tempBatterStats.triples +=1;
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
        const outRunnerOnHitJugadaDef = jugadasDB.find(j => j.jugada === 'OUT_ROH') || { jugada: 'OUT_ROH', descripcion: 'Out Corredor en Hit', category: PlayCategory.OUT, isDefault: false, isActive: true};
        const pitcher = getCurrentOpposingPitcher(updatedPartido);
        const formatoDesc = formatos.find(f => f.codigo === updatedPartido.formatoJuegoId)?.descripcion || 'N/A';
        const initialBasesForLog = [...prev.gameStatus.bases];
        const outsBeforePlayForLog = prev.gameStatus.outs;


        const runnersToPlaceOnBases: { player: PlayerOnBase, targetBase: number }[] = [];
        runnerAdvancementAfterHitModalState.runnersOnBase.forEach(runnerInfo => {
            const targetBase = advancements[runnerInfo.lineupPlayerId]; 
            if (targetBase === 0) { 
                outsThisPlay++;
                const outLog: RegistroJuego = {
                    id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                    halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: runnerInfo.lineupPlayerId, 
                    bateadorNombre: runnerInfo.nombreJugador, bateadorPosicion: (teamAtBat === 'visitante' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal).find(p=>p.id===runnerInfo.lineupPlayerId)?.posicion || '',
                    pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                    equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                    jugadaId: outRunnerOnHitJugadaDef.jugada, descripcion: getOriginalJugadaDescription(outRunnerOnHitJugadaDef.jugada, outRunnerOnHitJugadaDef.descripcion),
                    outsPrev: outsBeforePlayForLog + outsThisPlay -1, 
                    outsAfter: outsBeforePlayForLog + outsThisPlay,   
                    basesPrevState: initialBasesForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'), 
                    basesAfterState: initialBasesForLog.map(p => p && p.lineupPlayerId !== runnerInfo.lineupPlayerId ? p.lineupPlayerId : 'null').join('-'), 
                    runScored: 0, rbi: 0,
                    fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: (teamAtBat === 'visitante' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal).find(p=>p.id===runnerInfo.lineupPlayerId)?.ordenBate || 0,
                };
                updatedPartido.registrosJuego.push(outLog);
                const runnerLineupKeyForOut = teamAtBat === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
                updatedPartido[runnerLineupKeyForOut] = updatedPartido[runnerLineupKeyForOut].map(plr => {
                  if (plr.id === runnerInfo.lineupPlayerId) {
                    const updatedInnings = { ...plr.innings };
                    if (!updatedInnings[outLog.inning]) updatedInnings[outLog.inning] = [];
                    updatedInnings[outLog.inning].push({
                      playInstanceId: outLog.id, jugadaId: outLog.jugadaId, descripcion: outLog.descripcion, playDisplayValue: 'Out'
                    });
                    return { ...plr, innings: updatedInnings };
                  }
                  return plr;
                });

            } else if (targetBase === 4) { 
                _applySingleRunScoringLogic(updatedPartido, runnerInfo, batter.id); 
                runsScoredThisPlay++;
                rbisForBatterThisPlay++;

                if (runJugadaDef) { 
                    const runLog = {
                        id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                        halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: runnerInfo.lineupPlayerId,
                        bateadorNombre: runnerInfo.nombreJugador, bateadorPosicion: (teamAtBat === 'visitante' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal).find(p=>p.id===runnerInfo.lineupPlayerId)?.posicion || '',
                        pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                        equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                        jugadaId: 'R', descripcion: getOriginalJugadaDescription('R', runJugadaDef.descripcion), outsPrev: outsBeforePlayForLog + outsThisPlay,
                        outsAfter: outsBeforePlayForLog + outsThisPlay, basesPrevState: initialBasesForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                        basesAfterState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'), 
                        runScored: 1, rbi: 0,
                        fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: (teamAtBat === 'visitante' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal).find(p=>p.id===runnerInfo.lineupPlayerId)?.ordenBate || 0,
                    };
                    updatedPartido.registrosJuego.push(runLog);
                    const runnerLineupKeyForRun = teamAtBat === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
                    updatedPartido[runnerLineupKeyForRun] = updatedPartido[runnerLineupKeyForRun].map(plr => {
                        if (plr.id === runnerInfo.lineupPlayerId) {
                            const updatedInnings = { ...plr.innings };
                            if (!updatedInnings[runLog.inning]) updatedInnings[runLog.inning] = [];
                            updatedInnings[runLog.inning].push({
                                playInstanceId: runLog.id, jugadaId: runLog.jugadaId, descripcion: runLog.descripcion, playDisplayValue: 'R'
                            });
                            return { ...plr, innings: updatedInnings };
                        }
                        return plr;
                    });
                }
                if (rbiJugadaDef) { 
                     updatedPartido.registrosJuego.push({
                        id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                        halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batter.id,
                        bateadorNombre: batter.nombreJugador, bateadorPosicion: batter.posicion,
                        pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                        equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                        jugadaId: 'RBI', descripcion: getOriginalJugadaDescription('RBI', rbiJugadaDef.descripcion), outsPrev: outsBeforePlayForLog + outsThisPlay,
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
        
        if (batterFinalDestBase === 4) { 
            _applySingleRunScoringLogic(updatedPartido, batter, batter.id); 
            runsScoredThisPlay++;
            rbisForBatterThisPlay++;
            if (runJugadaDef) { 
                 const batterRunLog = {
                    id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                    halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batter.id,
                    bateadorNombre: batter.nombreJugador, bateadorPosicion: batter.posicion,
                    pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                    equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                    jugadaId: 'R', descripcion: getOriginalJugadaDescription('R', runJugadaDef.descripcion), outsPrev: outsBeforePlayForLog + outsThisPlay,
                    outsAfter: outsBeforePlayForLog + outsThisPlay, basesPrevState: initialBasesForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                    basesAfterState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'), 
                    runScored: 1, rbi: 0,
                    fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: batter.ordenBate,
                };
                updatedPartido.registrosJuego.push(batterRunLog);
                const batterLineupKeyForRun = teamAtBat === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
                updatedPartido[batterLineupKeyForRun] = updatedPartido[batterLineupKeyForRun].map(plr => {
                    if (plr.id === batter.id) {
                        const updatedInnings = { ...plr.innings };
                        if (!updatedInnings[batterRunLog.inning]) updatedInnings[batterRunLog.inning] = [];
                        updatedInnings[batterRunLog.inning].push({
                           playInstanceId: batterRunLog.id, jugadaId: batterRunLog.jugadaId, descripcion: batterRunLog.descripcion, playDisplayValue: 'R'
                        });
                        return { ...plr, innings: updatedInnings };
                    }
                    return plr;
                });
            }
            if (rbiJugadaDef) { 
                updatedPartido.registrosJuego.push({
                    id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                    halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batter.id,
                    bateadorNombre: batter.nombreJugador, bateadorPosicion: batter.posicion,
                    pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                    equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                    jugadaId: 'RBI', descripcion: getOriginalJugadaDescription('RBI', rbiJugadaDef.descripcion), outsPrev: outsBeforePlayForLog + outsThisPlay,
                    outsAfter: outsBeforePlayForLog + outsThisPlay, basesPrevState: initialBasesForLog.map(p => p ? p.lineupPlayerId : 'null').join('-'),
                    basesAfterState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-'), 
                    runScored: 0, rbi: 1,
                    fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: batter.ordenBate,
                });
            }
        } else if (batterFinalDestBase >=1 && batterFinalDestBase <=3) {
             runnersToPlaceOnBases.push({ player: batterAsPlayerOnBase, targetBase: batterFinalDestBase });
        }
        
        runnersToPlaceOnBases.sort((a, b) => b.targetBase - a.targetBase);
        runnersToPlaceOnBases.forEach(item => {
            if (newBasesState[item.targetBase - 1] === null) {
                newBasesState[item.targetBase - 1] = item.player;
            } else {
                console.warn(`Collision on base ${item.targetBase} while placing ${item.player.nombreJugador}. Previous: ${newBasesState[item.targetBase-1]?.nombreJugador}`);
            }
        });
        
        const batterLineupKey = teamAtBat === 'visitante' ? 'lineupVisitante' : 'lineupLocal'; 
        updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
            if (p.id === batter.id) {
                return {...p, stats: { ...p.stats, ...tempBatterStats, rbi: p.stats.rbi + rbisForBatterThisPlay } };
            }
            return p;
        });

        const hitJugadaDefResolved = jugadasDB.find(j => j.jugada === hitType)!;
        const mainHitRegistro: RegistroJuego = {
            id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
            halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batter.id,
            bateadorNombre: batter.nombreJugador, bateadorPosicion: batter.posicion,
            pitcherResponsableId: pitcher ? pitcher.id : null,
            pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
            equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
            jugadaId: hitType, descripcion: getOriginalJugadaDescription(hitType, hitJugadaDefResolved.descripcion), 
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

        updatedPartido.gameStatus = {
            ...updatedPartido.gameStatus,
            bases: newBasesState,
            lastPlayContext: { batterLineupPlayerId: batter.id, jugada: hitJugadaDefResolved, timestamp: Date.now(), previousBatterLineupPlayerId: prev.gameStatus.lastPlayContext?.batterLineupPlayerId !== batter.id ? prev.gameStatus.lastPlayContext?.batterLineupPlayerId : prev.gameStatus.lastPlayContext?.previousBatterLineupPlayerId },
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
        } else { 
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
    initialOutsAtStartOfSacPlay: number 
  ) => {
    saveToHistory(currentPartido!);
    updateCurrentPartidoAndHistory(prev => {
      if (!prev) return prev;
      let updatedPartido = { ...prev };
      let newBasesState: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [...updatedPartido.gameStatus.bases]; 
      let runsScoredByOtherRunners = 0;
      let rbisForBatterByOtherRunners = 0; 
      let additionalOutsFromRunners = 0;
  
      const teamAtBat = updatedPartido.gameStatus.currentHalfInning === 'Top' ? 'visitante' : 'local';
      const pitcher = getCurrentOpposingPitcher(updatedPartido);
      const formatoDesc = formatos.find(f => f.codigo === updatedPartido.formatoJuegoId)?.descripcion || 'N/A';
      const outRunnerOnSacJugadaDef = jugadasDB.find(j => j.jugada === 'OUT_ROS');
      const runJugadaDef = jugadasDB.find(j => j.jugada === 'R');
      const rbiJugadaDef = jugadasDB.find(j => j.jugada === 'RBI'); 
      
      runnerAdvancementAfterSacrificeModalState.runnersOnBase.forEach(runnerInfo => {
        const targetBase = advancements[runnerInfo.lineupPlayerId];
        const runnerLineupPlayer = (teamAtBat === 'visitante' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal).find(p => p.id === runnerInfo.lineupPlayerId);
        
        const originalBaseIndex = newBasesState.findIndex(b => b?.lineupPlayerId === runnerInfo.lineupPlayerId);
        if (originalBaseIndex !== -1) {
            newBasesState[originalBaseIndex] = null;
        }

        if (targetBase === 0) { 
          additionalOutsFromRunners++;
          if (outRunnerOnSacJugadaDef && runnerLineupPlayer) {
            const outLog: RegistroJuego = {
                id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: runnerInfo.lineupPlayerId,
                bateadorNombre: runnerInfo.nombreJugador, bateadorPosicion: runnerLineupPlayer.posicion,
                pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                jugadaId: 'OUT_ROS', descripcion: getOriginalJugadaDescription('OUT_ROS', 'Out Corredor en Sacrificio'),
                outsPrev: initialOutsAtStartOfSacPlay + 1 + additionalOutsFromRunners -1, 
                outsAfter: initialOutsAtStartOfSacPlay + 1 + additionalOutsFromRunners,
                basesPrevState: runnerAdvancementAfterSacrificeModalState.runnersOnBase.map(rnr => rnr ? rnr.lineupPlayerId : 'null').join('-'), 
                basesAfterState: "Pending", runScored: 0, rbi: 0,
                fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: runnerLineupPlayer.ordenBate,
            };
            updatedPartido.registrosJuego.push(outLog);
            const lineupKey = teamAtBat === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
            updatedPartido[lineupKey] = updatedPartido[lineupKey].map(p => {
                if (p.id === runnerInfo.lineupPlayerId) {
                    const updatedInnings = { ...p.innings };
                    if (!updatedInnings[outLog.inning]) updatedInnings[outLog.inning] = [];
                    updatedInnings[outLog.inning].push({ playInstanceId: outLog.id, jugadaId: outLog.jugadaId, descripcion: outLog.descripcion, playDisplayValue: 'Out' });
                    return { ...p, innings: updatedInnings };
                }
                return p;
            });
          }
        } else if (targetBase === 4) { 
          _applySingleRunScoringLogic(updatedPartido, runnerInfo, batter.id); 
          runsScoredByOtherRunners++;
          rbisForBatterByOtherRunners++; 
           if (runJugadaDef && runnerLineupPlayer) {
            const runLogEntry: RegistroJuego = {
                id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: runnerInfo.lineupPlayerId,
                bateadorNombre: runnerInfo.nombreJugador, bateadorPosicion: runnerLineupPlayer.posicion,
                pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
                equipoBateadorNombre: teamAtBat === 'visitante' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                jugadaId: 'R', descripcion: getOriginalJugadaDescription('R', 'Carrera Anotada'),
                outsPrev: initialOutsAtStartOfSacPlay + 1 + additionalOutsFromRunners, 
                outsAfter: initialOutsAtStartOfSacPlay + 1 + additionalOutsFromRunners,
                basesPrevState: runnerAdvancementAfterSacrificeModalState.runnersOnBase.map(rnr => rnr ? rnr.lineupPlayerId : 'null').join('-'), 
                basesAfterState: "Pending", runScored: 1, rbi: 0,
                fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: runnerLineupPlayer.ordenBate,
             };
             updatedPartido.registrosJuego.push(runLogEntry);
             if (rbiJugadaDef) { 
                updatedPartido.registrosJuego.push({
                    ...runLogEntry, id:generateUUID(), bateadorId: batter.id, bateadorNombre: batter.nombreJugador, bateadorPosicion: batter.posicion,
                    jugadaId: 'RBI', descripcion: getOriginalJugadaDescription('RBI'), runScored:0, rbi:1, ordenDelBateador: batter.ordenBate
                });
             }
            const lineupKey = teamAtBat === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
            updatedPartido[lineupKey] = updatedPartido[lineupKey].map(p => {
                if (p.id === runnerInfo.lineupPlayerId) {
                    const updatedInnings = { ...p.innings };
                    if (!updatedInnings[updatedPartido.gameStatus.actualInningNumber]) updatedInnings[updatedPartido.gameStatus.actualInningNumber] = [];
                    updatedInnings[updatedPartido.gameStatus.actualInningNumber].push({ playInstanceId: runLogEntry.id, jugadaId: 'R', descripcion: 'Carrera Anotada', playDisplayValue: 'R' });
                    return { ...p, innings: updatedInnings };
                }
                return p;
            });
           }
        } else if (targetBase >= 1 && targetBase <= 3) { 
          if (newBasesState[targetBase - 1] === null) {
            newBasesState[targetBase - 1] = runnerInfo;
          } else {
            console.warn(`Collision on base ${targetBase} for runner ${runnerInfo.nombreJugador} during sacrifice advancement.`);
          }
        }
      });
  
      const batterLineupKey = teamAtBat === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
      updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
          if (p.id === batter.id) {
              return { ...p, stats: { ...p.stats, rbi: p.stats.rbi + rbisForBatterByOtherRunners } };
          }
          return p;
      });

      updatedPartido.gameStatus.bases = newBasesState;
      const totalOutsAfterPlay = initialOutsAtStartOfSacPlay + 1 + additionalOutsFromRunners;
      
      updatedPartido.registrosJuego = updatedPartido.registrosJuego.map(reg => {
        if (reg.basesAfterState === "Pending") {
            return { ...reg, basesAfterState: newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-') };
        }
        return reg;
      });

      const mainSacLogIndex = updatedPartido.registrosJuego.findIndex(r => r.bateadorId === batter.id && (r.jugadaId === 'SF' || r.jugadaId === 'SH') && r.outsPrev === initialOutsAtStartOfSacPlay);
      if (mainSacLogIndex !== -1) {
          updatedPartido.registrosJuego[mainSacLogIndex].rbi += rbisForBatterByOtherRunners; 
          updatedPartido.registrosJuego[mainSacLogIndex].runScored += runsScoredByOtherRunners; 
          updatedPartido.registrosJuego[mainSacLogIndex].outsAfter = totalOutsAfterPlay; 
          updatedPartido.registrosJuego[mainSacLogIndex].basesAfterState = newBasesState.map(p => p ? p.lineupPlayerId : 'null').join('-');

          const mainSacLog = updatedPartido.registrosJuego[mainSacLogIndex];
          const batterTeamLineup = teamAtBat === 'visitante' ? updatedPartido.lineupVisitante : updatedPartido.lineupLocal;
          const batterPlayerIndex = batterTeamLineup.findIndex(p=>p.id === batter.id);
          if(batterPlayerIndex !== -1){
            const batterPlayerToUpdate = batterTeamLineup[batterPlayerIndex];
            const inningCells = batterPlayerToUpdate.innings[mainSacLog.inning] || [];
            const cellIndex = inningCells.findIndex(cell => cell.playInstanceId === mainSacLog.id);
            if(cellIndex !== -1){
                inningCells[cellIndex].playDisplayValue = `${mainSacLog.jugadaId}${mainSacLog.rbi > 0 ? ` (${mainSacLog.rbi} RBI)` : ''}`;
            }
          }
      }
      
      const { updatedGameStatus, gameShouldEnd } = _calculateOutsUpdate(
        { ...updatedPartido.gameStatus, outs: initialOutsAtStartOfSacPlay },
        1 + additionalOutsFromRunners, 
        updatedPartido.maxInnings,
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
            r.id === editingRegistro.id ? { ...r, jugadaId: selectedJugada.jugada, descripcion: getOriginalJugadaDescription(selectedJugada.jugada, selectedJugada.descripcion) } : r
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
                                    descripcion: getOriginalJugadaDescription(selectedJugada.jugada, selectedJugada.descripcion),
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

  const handleConfirmFielderChoice = (result: FielderChoiceResult) => {
    if (!currentPartido || !fielderChoiceModalState.batter) return;
    saveToHistory(currentPartido);
  
    const batterLineupPlayer = fielderChoiceModalState.batter;
    const initialOutsForPlay = fielderChoiceModalState.initialOuts;
    const pitcher = getCurrentOpposingPitcher(currentPartido);
    const formatoDesc = formatos.find(f => f.codigo === currentPartido.formatoJuegoId)?.descripcion || 'N/A';
    const teamAtBatHalfInning = currentPartido.gameStatus.currentHalfInning;
    const batterLineupKey: 'lineupVisitante' | 'lineupLocal' = teamAtBatHalfInning === 'Top' ? 'lineupVisitante' : 'lineupLocal';
    const currentLineupForTeam = currentPartido[batterLineupKey];
  
    const outJugadaDef = jugadasDB.find(j => j.jugada === 'OUT_RUNNER_BASE');
    const runJugadaDef = jugadasDB.find(j => j.jugada === 'R');
    const rbiJugadaDef = jugadasDB.find(j => j.jugada === 'RBI');
    const fcJugadaDef = jugadasDB.find(j => j.jugada === 'FC');
    const advOtroJugadaDef = jugadasDB.find(j => j.jugada === 'ADV_OTRO'); 
  
    updateCurrentPartidoAndHistory(prev => {
      if (!prev) return prev;
      let updatedPartido = { ...prev };
      const initialBasesForLog = [...prev.gameStatus.bases];
      let newBasesState: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [...prev.gameStatus.bases];
      let outsGeneratedThisPlay = 0;
      let totalRunsScoredOnPlay = 0;
      let totalRBIsForBatterOnPlay = 0;
  
      updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
        if (p.id === batterLineupPlayer.id) {
          return { ...p, stats: { ...p.stats, atBats: p.stats.atBats + 1, plateAppearances: p.stats.plateAppearances + 1 } };
        }
        return p;
      });
  
      const batterFinalDest = result.batterAdvancement;
      const batterAsPBase: PlayerOnBase = { lineupPlayerId: batterLineupPlayer.id, jugadorId: batterLineupPlayer.jugadorId, nombreJugador: batterLineupPlayer.nombreJugador, reachedOnJugadaId: 'FC' };
      
      if (batterFinalDest === 0 || result.primaryOutPlayerId === batterLineupPlayer.id) {
        outsGeneratedThisPlay++;
      }
  
      if (result.primaryOutPlayerId && result.primaryOutPlayerId !== batterLineupPlayer.id) {
        const outedRunnerInfo = fielderChoiceModalState.runnersOnBase.find(r => r.lineupPlayerId === result.primaryOutPlayerId);
        if (outedRunnerInfo) {
          outsGeneratedThisPlay++;
          const runnerOriginalBaseIdx = newBasesState.findIndex(b => b?.lineupPlayerId === outedRunnerInfo.lineupPlayerId);
          if (runnerOriginalBaseIdx !== -1) newBasesState[runnerOriginalBaseIdx] = null;
          
          if (outJugadaDef) {
            const outRunnerLog: RegistroJuego = {
              id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
              halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: outedRunnerInfo.lineupPlayerId,
              bateadorNombre: outedRunnerInfo.nombreJugador, 
              bateadorPosicion: currentLineupForTeam.find(p=>p.id===outedRunnerInfo.lineupPlayerId)?.posicion || '',
              pitcherResponsableId: pitcher?.id || null, pitcherResponsableNombre: pitcher?.nombreJugador || null,
              equipoBateadorNombre: teamAtBatHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
              jugadaId: outJugadaDef.jugada, descripcion: getOriginalJugadaDescription(outJugadaDef.jugada),
              outsPrev: initialOutsForPlay + (outsGeneratedThisPlay > 0 ? outsGeneratedThisPlay -1 : 0), 
              outsAfter: initialOutsForPlay + outsGeneratedThisPlay,
              basesPrevState: initialBasesForLog.map(r => r?.lineupPlayerId || 'null').join('-'),
              basesAfterState: "Pending", runScored: 0, rbi: 0,
              fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego,
              ordenDelBateador: currentLineupForTeam.find(p=>p.id===outedRunnerInfo.lineupPlayerId)?.ordenBate || 0
            };
            updatedPartido.registrosJuego.push(outRunnerLog);
            updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
              if (p.id === outedRunnerInfo.lineupPlayerId) {
                const updatedInnings = { ...p.innings };
                if (!updatedInnings[outRunnerLog.inning]) updatedInnings[outRunnerLog.inning] = [];
                updatedInnings[outRunnerLog.inning].push({ playInstanceId: outRunnerLog.id, jugadaId: outJugadaDef.jugada, descripcion: outRunnerLog.descripcion, playDisplayValue: 'Out'});
                return { ...p, innings: updatedInnings };
              }
              return p;
            });
          }
        }
      }
      
      const playersToPlaceOnBases: { player: PlayerOnBase, targetBase: number }[] = [];
      if (batterFinalDest > 0 && batterFinalDest < 4 && result.primaryOutPlayerId !== batterLineupPlayer.id) { 
        playersToPlaceOnBases.push({ player: batterAsPBase, targetBase: batterFinalDest });
      } else if (batterFinalDest === 4 && result.primaryOutPlayerId !== batterLineupPlayer.id) { 
        _applySingleRunScoringLogic(updatedPartido, batterLineupPlayer, null);
        totalRunsScoredOnPlay++;
        if (runJugadaDef) { 
            const batterRunLog : RegistroJuego = {
                id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batterLineupPlayer.id,
                bateadorNombre: batterLineupPlayer.nombreJugador, bateadorPosicion: batterLineupPlayer.posicion,
                pitcherResponsableId: pitcher?.id || null, pitcherResponsableNombre: pitcher?.nombreJugador || null,
                equipoBateadorNombre: teamAtBatHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                jugadaId: runJugadaDef.jugada, descripcion: getOriginalJugadaDescription(runJugadaDef.jugada),
                outsPrev: initialOutsForPlay + outsGeneratedThisPlay, outsAfter: initialOutsForPlay + outsGeneratedThisPlay, 
                basesPrevState: initialBasesForLog.map(r => r?.lineupPlayerId || 'null').join('-'),
                basesAfterState: "Pending", runScored: 1, rbi: 0,
                fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego,
                ordenDelBateador: batterLineupPlayer.ordenBate
            };
            updatedPartido.registrosJuego.push(batterRunLog);
             updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
                if (p.id === batterLineupPlayer.id) {
                    const updatedInnings = { ...p.innings };
                    if (!updatedInnings[batterRunLog.inning]) updatedInnings[batterRunLog.inning] = [];
                    updatedInnings[batterRunLog.inning].push({playInstanceId: batterRunLog.id, jugadaId: 'R', descripcion: batterRunLog.descripcion, playDisplayValue: 'R'});
                    return {...p, innings: updatedInnings};
                }
                return p;
            });
        }
      }

      fielderChoiceModalState.runnersOnBase.forEach(runner => {
        if (runner.lineupPlayerId === result.primaryOutPlayerId) return; 

        const runnerDest = result.runnerAdvancements[runner.lineupPlayerId];
        const runnerOriginalBaseIdx = newBasesState.findIndex(b => b?.lineupPlayerId === runner.lineupPlayerId);
        if (runnerOriginalBaseIdx !== -1) newBasesState[runnerOriginalBaseIdx] = null;
        const runnerLineupData = currentLineupForTeam.find(p => p.id === runner.lineupPlayerId);

        if (runnerDest === 0) { 
          if(result.primaryOutPlayerId !== runner.lineupPlayerId) outsGeneratedThisPlay++; 
          if (outJugadaDef && runnerLineupData) {
            const outRunnerLog: RegistroJuego = { 
                id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: runner.lineupPlayerId,
                bateadorNombre: runner.nombreJugador, bateadorPosicion: runnerLineupData.posicion,
                pitcherResponsableId: pitcher?.id || null, pitcherResponsableNombre: pitcher?.nombreJugador || null,
                equipoBateadorNombre: teamAtBatHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                jugadaId: outJugadaDef.jugada, descripcion: getOriginalJugadaDescription(outJugadaDef.jugada),
                outsPrev: initialOutsForPlay + outsGeneratedThisPlay -1, outsAfter: initialOutsForPlay + outsGeneratedThisPlay,
                basesPrevState: initialBasesForLog.map(r => r?.lineupPlayerId || 'null').join('-'),
                basesAfterState: "Pending", runScored: 0, rbi: 0,
                fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego,
                ordenDelBateador: runnerLineupData.ordenBate
            };
            updatedPartido.registrosJuego.push(outRunnerLog);
            updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
              if (p.id === runner.lineupPlayerId) {
                const updatedInnings = { ...p.innings };
                if (!updatedInnings[outRunnerLog.inning]) updatedInnings[outRunnerLog.inning] = [];
                updatedInnings[outRunnerLog.inning].push({ playInstanceId: outRunnerLog.id, jugadaId: outJugadaDef.jugada, descripcion: outRunnerLog.descripcion, playDisplayValue: 'Out'});
                return { ...p, innings: updatedInnings };
              }
              return p;
            });
          }
        } else if (runnerDest === 4) { 
            const batterIsOutOnPlay = result.batterAdvancement === 0 || result.primaryOutPlayerId === batterLineupPlayer.id;
            const primaryOutWasARunner = result.primaryOutPlayerId !== null && result.primaryOutPlayerId !== batterLineupPlayer.id;
            let batterShouldGetRbiForThisRunner = false;
            if (!batterIsOutOnPlay) { 
              if (!primaryOutWasARunner) { 
                batterShouldGetRbiForThisRunner = true;
              }
            }
          
            _applySingleRunScoringLogic(updatedPartido, runner, batterShouldGetRbiForThisRunner ? batterLineupPlayer.id : null);
            totalRunsScoredOnPlay++;
            if (batterShouldGetRbiForThisRunner) totalRBIsForBatterOnPlay++;

            if (runJugadaDef && runnerLineupData) {
                const runLog: RegistroJuego = { 
                    id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                    halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: runner.lineupPlayerId,
                    bateadorNombre: runner.nombreJugador, bateadorPosicion: runnerLineupData.posicion,
                    pitcherResponsableId: pitcher?.id || null, pitcherResponsableNombre: pitcher?.nombreJugador || null,
                    equipoBateadorNombre: teamAtBatHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                    jugadaId: runJugadaDef.jugada, descripcion: getOriginalJugadaDescription(runJugadaDef.jugada),
                    outsPrev: initialOutsForPlay + outsGeneratedThisPlay, outsAfter: initialOutsForPlay + outsGeneratedThisPlay,
                    basesPrevState: initialBasesForLog.map(r => r?.lineupPlayerId || 'null').join('-'),
                    basesAfterState: "Pending", runScored: 1, rbi: 0,
                    fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego,
                    ordenDelBateador: runnerLineupData.ordenBate
                };
                updatedPartido.registrosJuego.push(runLog);
                 updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
                    if (p.id === runner.lineupPlayerId) {
                        const updatedInnings = { ...p.innings };
                        if (!updatedInnings[runLog.inning]) updatedInnings[runLog.inning] = [];
                        updatedInnings[runLog.inning].push({playInstanceId: runLog.id, jugadaId: 'R', descripcion: runLog.descripcion, playDisplayValue: 'R'});
                        return {...p, innings: updatedInnings};
                    }
                    return p;
                });
            }
            if (batterShouldGetRbiForThisRunner && rbiJugadaDef) {
                const rbiLogForBatter: RegistroJuego = { 
                    id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                    halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batterLineupPlayer.id,
                    bateadorNombre: batterLineupPlayer.nombreJugador, bateadorPosicion: batterLineupPlayer.posicion,
                    pitcherResponsableId: pitcher?.id || null, pitcherResponsableNombre: pitcher?.nombreJugador || null,
                    equipoBateadorNombre: teamAtBatHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                    jugadaId: rbiJugadaDef.jugada, descripcion: getOriginalJugadaDescription(rbiJugadaDef.jugada),
                    outsPrev: initialOutsForPlay + outsGeneratedThisPlay, outsAfter: initialOutsForPlay + outsGeneratedThisPlay,
                    basesPrevState: initialBasesForLog.map(r => r?.lineupPlayerId || 'null').join('-'),
                    basesAfterState: "Pending", runScored: 0, rbi: 1,
                    fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego,
                    ordenDelBateador: batterLineupPlayer.ordenBate
                };
                updatedPartido.registrosJuego.push(rbiLogForBatter);
            }
        } else if (runnerDest >= 1 && runnerDest <= 3) {
          playersToPlaceOnBases.push({ player: runner, targetBase: runnerDest });
          if (advOtroJugadaDef && runnerLineupData) {
             const advLog: RegistroJuego = { 
                id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
                halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: runner.lineupPlayerId,
                bateadorNombre: runner.nombreJugador, bateadorPosicion: runnerLineupData.posicion,
                pitcherResponsableId: pitcher?.id || null, pitcherResponsableNombre: pitcher?.nombreJugador || null,
                equipoBateadorNombre: teamAtBatHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
                jugadaId: advOtroJugadaDef.jugada, descripcion: getOriginalJugadaDescription(advOtroJugadaDef.jugada),
                outsPrev: initialOutsForPlay + outsGeneratedThisPlay, outsAfter: initialOutsForPlay + outsGeneratedThisPlay,
                basesPrevState: initialBasesForLog.map(r => r?.lineupPlayerId || 'null').join('-'),
                basesAfterState: "Pending", runScored: 0, rbi: 0,
                fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego,
                ordenDelBateador: runnerLineupData.ordenBate
             };
             updatedPartido.registrosJuego.push(advLog);
             updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
                if (p.id === runner.lineupPlayerId) {
                    const updatedInnings = { ...p.innings };
                    if (!updatedInnings[advLog.inning]) updatedInnings[advLog.inning] = [];
                    updatedInnings[advLog.inning].push({playInstanceId: advLog.id, jugadaId: advLog.jugadaId, descripcion: advLog.descripcion, playDisplayValue: `${getBaseLabel(runnerDest)}`});
                    return {...p, innings: updatedInnings};
                }
                return p;
            });
          }
        }
      });
      
      playersToPlaceOnBases.sort((a, b) => b.targetBase - a.targetBase);
      playersToPlaceOnBases.forEach(item => {
          if(item.targetBase >=1 && item.targetBase <=3){
            if (newBasesState[item.targetBase - 1] === null) {
                newBasesState[item.targetBase - 1] = item.player;
            } else {
                console.warn(`FC Base collision: ${item.player.nombreJugador} to ${getBaseLabel(item.targetBase)}, but occupied by ${newBasesState[item.targetBase-1]?.nombreJugador}`);
            }
          }
      });

      const finalBasesStr = newBasesState.map(r => r?.lineupPlayerId || 'null').join('-');
      updatedPartido.registrosJuego = updatedPartido.registrosJuego.map(reg => 
        reg.basesAfterState === "Pending" ? { ...reg, basesAfterState: finalBasesStr } : reg
      );
      
      let fcLogDescription = getOriginalJugadaDescription('FC');
      if (batterFinalDest === 0 || result.primaryOutPlayerId === batterLineupPlayer.id) fcLogDescription += ` (Bateador Out)`;
      
      const fcLogForBatter: RegistroJuego = {
        id: generateUUID(), timestamp: Date.now(), inning: updatedPartido.gameStatus.actualInningNumber,
        halfInning: updatedPartido.gameStatus.currentHalfInning, bateadorId: batterLineupPlayer.id,
        bateadorNombre: batterLineupPlayer.nombreJugador, bateadorPosicion: batterLineupPlayer.posicion,
        pitcherResponsableId: pitcher ? pitcher.id : null, pitcherResponsableNombre: pitcher ? pitcher.nombreJugador : null,
        equipoBateadorNombre: teamAtBatHalfInning === 'Top' ? updatedPartido.nombreEquipoVisitante : updatedPartido.nombreEquipoLocal,
        jugadaId: 'FC', descripcion: fcLogDescription,
        outsPrev: initialOutsForPlay, outsAfter: initialOutsForPlay + outsGeneratedThisPlay,
        basesPrevState: initialBasesForLog.map(r => r?.lineupPlayerId || 'null').join('-'),
        basesAfterState: finalBasesStr, 
        runScored: totalRunsScoredOnPlay, 
        rbi: totalRBIsForBatterOnPlay,
        fechaDelPartido: updatedPartido.fecha, formatoDelPartidoDesc: formatoDesc, numeroDelPartido: updatedPartido.numeroJuego, ordenDelBateador: batterLineupPlayer.ordenBate,
      };
      updatedPartido.registrosJuego.push(fcLogForBatter);
  
      updatedPartido[batterLineupKey] = updatedPartido[batterLineupKey].map(p => {
        if (p.id === batterLineupPlayer.id) {
          const updatedInnings = { ...p.innings };
          if (!updatedInnings[fcLogForBatter.inning]) updatedInnings[fcLogForBatter.inning] = [];
          let cellDisplay = `FC`;
          if(batterFinalDest === 0 || result.primaryOutPlayerId === batterLineupPlayer.id) cellDisplay = 'FC (Out)';
          else if (batterFinalDest === 4) cellDisplay = 'R'; 
          
          if (totalRBIsForBatterOnPlay > 0 && batterFinalDest !== 4) { 
            cellDisplay += ` (${totalRBIsForBatterOnPlay} RBI)`;
          }
          updatedInnings[fcLogForBatter.inning].push({ playInstanceId: fcLogForBatter.id, jugadaId: 'FC', descripcion: fcLogForBatter.descripcion, playDisplayValue: cellDisplay });
          
          const currentBatterStats = {...p.stats};
          currentBatterStats.rbi += totalRBIsForBatterOnPlay;

          return { ...p, innings: updatedInnings, stats: currentBatterStats };
        }
        return p;
      });
      
      const { updatedGameStatus, gameShouldEnd } = _calculateOutsUpdate(
        { ...prev.gameStatus, bases: newBasesState, outs: initialOutsForPlay },
        outsGeneratedThisPlay,
        updatedPartido.maxInnings,
        updatedPartido.lineupVisitante,
        updatedPartido.lineupLocal,
        updatedPartido.visitanteStats.totalRuns,
        updatedPartido.localStats.totalRuns
      );
      updatedPartido.gameStatus = updatedGameStatus;
      if (fcJugadaDef) {
        updatedPartido.gameStatus.lastPlayContext = { 
            batterLineupPlayerId: batterLineupPlayer.id, 
            jugada: fcJugadaDef, 
            timestamp: Date.now(),
            previousBatterLineupPlayerId: prev.gameStatus.lastPlayContext?.batterLineupPlayerId !== batterLineupPlayer.id ? prev.gameStatus.lastPlayContext?.batterLineupPlayerId : prev.gameStatus.lastPlayContext?.previousBatterLineupPlayerId
        };
      }
      
      if (gameShouldEnd && gamePhase === 'scoring') {
        setGamePhase('ended');
      }
      
      return updatedPartido;
    });
  
    setFielderChoiceModalState({ isOpen: false, batter: null, runnersOnBase: [], initialOuts: 0 });
    setCurrentPlayerForPlay(null);
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
  
  const handleExportBoxScoreCSV = () => {
    if (!currentPartido) {
        alert("No hay partido en curso para exportar el Box Score.");
        return;
    }

    const { maxInnings, visitanteStats, localStats, nombreEquipoVisitante, nombreEquipoLocal, lineupVisitante, lineupLocal, fecha } = currentPartido;
    let csvString = "";

    const lineScoreHeaders = ["Equipo", ...[...Array(maxInnings)].map((_, i) => String(i + 1)), "R", "H", "E"];
    csvString += Papa.unparse({
        fields: lineScoreHeaders,
        data: [
            [nombreEquipoVisitante, ...[...Array(maxInnings)].map((_, i) => visitanteStats.runsPerInning[i + 1] ?? 0), visitanteStats.totalRuns, visitanteStats.hits, visitanteStats.errors],
            [nombreEquipoLocal, ...[...Array(maxInnings)].map((_, i) => localStats.runsPerInning[i + 1] ?? 0), localStats.totalRuns, localStats.hits, localStats.errors]
        ]
    }) + "\n\n";

    const battingHeaders = ["Jugador", "Pos", "AB", "AP", "R", "H1", "H2", "H3", "HR", "RBI", "BB", "K"];
    
    csvString += `"${nombreEquipoVisitante} - Bateo"\n`;
    const visitorBattingData = lineupVisitante.map(p => [
        p.nombreJugador, p.posicion || '--', p.stats.atBats, p.stats.plateAppearances || 0, p.stats.runs, p.stats.singles || 0, p.stats.doubles || 0, p.stats.triples || 0, p.stats.homeRuns || 0, p.stats.rbi, p.stats.walks, p.stats.strikeouts
    ]);
    const visitorTotals = lineupVisitante.reduce((acc, p) => ({
        ab: acc.ab + p.stats.atBats, ap: acc.ap + (p.stats.plateAppearances || 0) , r: acc.r + p.stats.runs, h1b: acc.h1b + (p.stats.singles || 0), h2b: acc.h2b + (p.stats.doubles || 0), h3b: acc.h3b + (p.stats.triples || 0), hr: acc.hr + (p.stats.homeRuns || 0), rbi: acc.rbi + p.stats.rbi, bb: acc.bb + p.stats.walks, k: acc.k + p.stats.strikeouts
    }), { ab: 0, ap: 0, r: 0, h1b: 0, h2b: 0, h3b: 0, hr: 0, rbi: 0, bb: 0, k: 0 });
    visitorBattingData.push(["TOTALES", "", visitorTotals.ab, visitorTotals.ap, visitorTotals.r, visitorTotals.h1b, visitorTotals.h2b, visitorTotals.h3b, visitorTotals.hr, visitorTotals.rbi, visitorTotals.bb, visitorTotals.k]);
    csvString += Papa.unparse({ fields: battingHeaders, data: visitorBattingData }) + "\n\n";

    csvString += `"${nombreEquipoLocal} - Bateo"\n`;
    const localBattingData = lineupLocal.map(p => [
        p.nombreJugador, p.posicion || '--', p.stats.atBats, p.stats.plateAppearances || 0, p.stats.runs, p.stats.singles || 0, p.stats.doubles || 0, p.stats.triples || 0, p.stats.homeRuns || 0, p.stats.rbi, p.stats.walks, p.stats.strikeouts
    ]);
    const localTotals = lineupLocal.reduce((acc, p) => ({
        ab: acc.ab + p.stats.atBats, ap: acc.ap + (p.stats.plateAppearances || 0), r: acc.r + p.stats.runs, h1b: acc.h1b + (p.stats.singles || 0), h2b: acc.h2b + (p.stats.doubles || 0), h3b: acc.h3b + (p.stats.triples || 0), hr: acc.hr + (p.stats.homeRuns || 0), rbi: acc.rbi + p.stats.rbi, bb: acc.bb + p.stats.walks, k: acc.k + p.stats.strikeouts
    }), { ab: 0, ap: 0, r: 0, h1b: 0, h2b: 0, h3b: 0, hr: 0, rbi: 0, bb: 0, k: 0 });
    localBattingData.push(["TOTALES", "", localTotals.ab, localTotals.ap, localTotals.r, localTotals.h1b, localTotals.h2b, localTotals.h3b, localTotals.hr, localTotals.rbi, localTotals.bb, localTotals.k]);
    csvString += Papa.unparse({ fields: battingHeaders, data: localBattingData });

    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const filename = `box_score_${nombreEquipoVisitante}_vs_${nombreEquipoLocal}_${fecha}.csv`;
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    alert('Box Score exportado como CSV.');
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

  const playsToExcludeFromModal: Set<string> = new Set(['OUT_RUNNER_BASE', 'OUT_ROH', 'ED', 'R', 'RBI']); 
  
  const activeJugadasForModal = jugadasDB.filter(j => j.isActive && !playsToExcludeFromModal.has(j.jugada));
  
  const groupedPlays = activeJugadasForModal.reduce((acc, jugada) => {
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
      } else if (!gameStatus.currentBatterLineupPlayerId && gameStatus.outs < 3) { 
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
      <div className="bg-white p-4 shadow rounded-lg overflow-x-auto"><h2 className="text-xl font-semibold mb-2">Marcador</h2><table className="min-w-full table-auto"><thead><tr className="bg-gray-100"><th className="p-2 border w-1/4">Equipo</th>{[...Array(maxInnings)].map((_,i)=><th key={i} className="p-2 border text-center w-10">{i+1}</th>)}<th className="p-2 border text-center w-12">R</th><th className="p-2 border text-center w-12">H</th><th className="p-2 border text-center w-12">E</th></tr></thead><tbody><tr><td className="p-2 border font-semibold">{currentPartido.nombreEquipoVisitante}</td>{[...Array(maxInnings)].map((_,i)=><td key={i} className="p-2 border text-center">{visitanteStats.runsPerInning[i+1]??'-'}</td>)}<td className="p-2 border text-center font-bold">{visitanteStats.totalRuns}</td><td className="p-2 border text-center">{visitanteStats.hits}</td><td className="p-2 border text-center">{visitanteStats.errors}</td></tr><tr><td className="p-2 border font-semibold">{currentPartido.nombreEquipoLocal}</td>{[...Array(maxInnings)].map((_,i)=><td key={i} className="p-2 border text-center">{localStats.runsPerInning[i+1]??'-'}</td>)}<td className="p-2 border text-center font-bold">{localStats.totalRuns}</td><td className="p-2 border text-center">{localStats.hits}</td><td className="p-2 border text-center">{localStats.errors}</td></tr></tbody></table></div>
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
      <div className="bg-white p-4 shadow rounded-lg mt-6">
        <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-semibold">Registro Detallado del Juego</h2>
            <Button onClick={()=>setIsGameLogExpanded(!isGameLogExpanded)} variant="light" size="sm">{isGameLogExpanded?'Contraer':'Expandir'} Lista</Button>
        </div>
        <p className="text-xs text-red-600 mb-2 bg-red-50 p-2 rounded">
            Nota: Editar o eliminar jugadas pasadas del registro NO recalculará automáticamente las estadísticas del juego ni el estado de las bases posteriores. Estos cambios son solo para corregir el registro. Las jugadas anotadas a través de la opción "Anotar" en la lista de jugadores afectarán el estado del juego (outs, bases, etc.).
        </p>
        <div className={`overflow-y-auto transition-all duration-300 ease-in-out ${isGameLogExpanded?'max-h-none':'max-h-[30rem]'}`}>
            <Table columns={gameLogColumns} data={[...(currentPartido?.registrosJuego||[])].reverse()}/>
        </div>
      </div>

      {/* Box Score Modal */}
      <Modal isOpen={isBoxScoreModalOpen} onClose={()=>setIsBoxScoreModalOpen(false)} title="Box Score" size="xl">
        {currentPartido && (
          <div className="text-xs overflow-y-auto max-h-[75vh]">
            <h3 className="text-lg font-semibold mb-2 text-center">{currentPartido.nombreEquipoVisitante} vs {currentPartido.nombreEquipoLocal}</h3>
            <div className="overflow-x-auto mb-4">
              <table className="min-w-full table-auto border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-1 border border-gray-300">Equipo</th>
                    {[...Array(maxInnings)].map((_,i)=><th key={`ls-inn-${i}`} className="p-1 border border-gray-300 w-6 text-center">{i+1}</th>)}
                    <th className="p-1 border border-gray-300 w-8 text-center">R</th>
                    <th className="p-1 border border-gray-300 w-8 text-center">H</th>
                    <th className="p-1 border border-gray-300 w-8 text-center">E</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-1 border border-gray-300 font-medium">{currentPartido.nombreEquipoVisitante}</td>
                    {[...Array(maxInnings)].map((_,i)=><td key={`ls-v-inn-${i}`} className="p-1 border border-gray-300 text-center">{currentPartido.visitanteStats.runsPerInning[i+1]??0}</td>)}
                    <td className="p-1 border border-gray-300 text-center font-bold">{currentPartido.visitanteStats.totalRuns}</td>
                    <td className="p-1 border border-gray-300 text-center font-bold">{currentPartido.visitanteStats.hits}</td>
                    <td className="p-1 border border-gray-300 text-center font-bold">{currentPartido.visitanteStats.errors}</td>
                  </tr>
                  <tr>
                    <td className="p-1 border border-gray-300 font-medium">{currentPartido.nombreEquipoLocal}</td>
                    {[...Array(maxInnings)].map((_,i)=><td key={`ls-l-inn-${i}`} className="p-1 border border-gray-300 text-center">{currentPartido.localStats.runsPerInning[i+1]??0}</td>)}
                    <td className="p-1 border border-gray-300 text-center font-bold">{currentPartido.localStats.totalRuns}</td>
                    <td className="p-1 border border-gray-300 text-center font-bold">{currentPartido.localStats.hits}</td>
                    <td className="p-1 border border-gray-300 text-center font-bold">{currentPartido.localStats.errors}</td>
                  </tr>
                </tbody>
              </table>
            </div>
                {['visitante','local'].map(teamType=>{const lineup=teamType==='visitante'?currentPartido.lineupVisitante:currentPartido.lineupLocal; const teamName=teamType==='visitante'?currentPartido.nombreEquipoVisitante:currentPartido.nombreEquipoLocal; const totals=lineup.reduce((acc,p)=>({ab:acc.ab+p.stats.atBats, ap: acc.ap + (p.stats.plateAppearances || 0), r:acc.r+p.stats.runs,h1b:acc.h1b+(p.stats.singles||0),h2b:acc.h2b+(p.stats.doubles||0),h3b:acc.h3b+(p.stats.triples||0),hr:acc.hr+(p.stats.homeRuns||0),rbi:acc.rbi+p.stats.rbi,bb:acc.bb+p.stats.walks,k:acc.k+p.stats.strikeouts}),{ab:0, ap:0, r:0,h1b:0,h2b:0,h3b:0,hr:0,rbi:0,bb:0,k:0}); return (<div key={teamType} className="mb-4"><h4 className="text-md font-semibold mb-1">{teamName} - Bateo</h4><div className="overflow-x-auto"><table className="min-w-full table-auto border-collapse border border-gray-300"><thead><tr className="bg-gray-50"><th className="p-1 border border-gray-300">Jugador</th><th className="p-1 border border-gray-300">Pos</th><th className="p-1 border border-gray-300">AB</th><th className="p-1 border border-gray-300">AP</th><th className="p-1 border border-gray-300">R</th><th className="p-1 border border-gray-300">H1</th><th className="p-1 border border-gray-300">H2</th><th className="p-1 border border-gray-300">H3</th><th className="p-1 border border-gray-300">HR</th><th className="p-1 border border-gray-300">RBI</th><th className="p-1 border border-gray-300">BB</th><th className="p-1 border border-gray-300">K</th></tr></thead><tbody>
                  {lineup.map(p=>(<tr key={p.id} className={p.posicion==='BE'?'opacity-60':''}><td className="p-1 border border-gray-300">{p.nombreJugador}</td><td className="p-1 border border-gray-300">{p.posicion||'--'}</td><td className="p-1 border border-gray-300 text-center">{p.stats.atBats}</td><td className="p-1 border border-gray-300 text-center">{p.stats.plateAppearances}</td><td className="p-1 border border-gray-300 text-center">{p.stats.runs}</td><td className="p-1 border border-gray-300 text-center">{p.stats.singles||0}</td><td className="p-1 border border-gray-300 text-center">{p.stats.doubles||0}</td><td className="p-1 border border-gray-300 text-center">{p.stats.triples||0}</td><td className="p-1 border border-gray-300 text-center">{p.stats.homeRuns||0}</td><td className="p-1 border border-gray-300 text-center">{p.stats.rbi}</td><td className="p-1 border border-gray-300 text-center">{p.stats.walks}</td><td className="p-1 border border-gray-300 text-center">{p.stats.strikeouts}</td></tr>))}
                <tr className="font-bold bg-gray-50"><td className="p-1 border border-gray-300">TOTALES</td><td className="p-1 border border-gray-300"></td><td className="p-1 border border-gray-300 text-center">{totals.ab}</td><td className="p-1 border border-gray-300 text-center">{totals.ap}</td><td className="p-1 border border-gray-300 text-center">{totals.r}</td><td className="p-1 border border-gray-300 text-center">{totals.h1b}</td><td className="p-1 border border-gray-300 text-center">{totals.h2b}</td><td className="p-1 border border-gray-300 text-center">{totals.h3b}</td><td className="p-1 border border-gray-300 text-center">{totals.hr}</td><td className="p-1 border border-gray-300 text-center">{totals.rbi}</td><td className="p-1 border border-gray-300 text-center">{totals.bb}</td><td className="p-1 border border-gray-300 text-center">{totals.k}</td></tr></tbody></table></div></div>);
              })}
            <div className="flex justify-between items-center pt-2">
                <Button 
                    onClick={handleExportBoxScoreCSV} 
                    variant="success" 
                    size="sm"
                    className="flex items-center"
                    disabled={!currentPartido}
                >
                    <MdOutlineFileDownload className="mr-1.5 h-4 w-4"/>
                    Exportar Box Score (CSV)
                </Button>
                <Button onClick={()=>setIsBoxScoreModalOpen(false)} size="sm">Volver al Partido</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Play Modal */}
      <Modal isOpen={isPlayModalOpen} onClose={()=>setIsPlayModalOpen(false)} title={`Anotar Jugada para ${currentPlayerForPlay?.nombreJugador||'Jugador'} ${isFreeEditModeForModal?'(Modo Edición Libre)':''}`} size="xl"><div className="space-y-3 max-h-[70vh] overflow-y-auto">{playCategoryOrder.map(category=>(groupedPlays[category]&&groupedPlays[category].length>0&&(<div key={category}><h3 className="text-lg font-semibold my-2 text-gray-700 border-b pb-1">{category}</h3><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">{groupedPlays[category].map(jugada=>(<Button key={jugada.jugada} variant={playCategoryColors[jugada.category]||"secondary"} onClick={()=>handlePlaySelected(jugada)} className="w-full text-left p-2 h-auto text-sm leading-tight flex flex-col items-start"><span className="font-semibold">{jugada.jugada}</span><span className="text-xs">{jugada.descripcion}</span></Button>))}</div></div>)))}</div></Modal>
      {isConfirmActionModalOpen && confirmActionModalProps && ( <ConfirmationModal isOpen={isConfirmActionModalOpen} onClose={()=>setIsConfirmActionModalOpen(false)} title={confirmActionModalProps.title} message={confirmActionModalProps.message} onConfirm={confirmActionModalProps.onConfirm} confirmButtonText={confirmActionModalProps.confirmButtonText} confirmButtonVariant={confirmActionModalProps.confirmButtonVariant}/>)}
      {isRunnerActionModalOpen && managingRunner && currentPartido && ( <Modal isOpen={isRunnerActionModalOpen} onClose={()=>setIsRunnerActionModalOpen(false)} title={`Acciones para ${managingRunner.player.nombreJugador} en ${getBaseLabel(managingRunner.baseIndex+1)}`} size="sm"> <div className="space-y-2"> <Button onClick={()=>handleRunnerAction('scoreWithSpecificReason')} variant="success" className="w-full">Anotar Carrera</Button> {managingRunner.baseIndex < 2 && <Button onClick={()=>handleRunnerAction(managingRunner.baseIndex===0?'advanceTo2B':'advanceTo3BFrom2B')} variant="info" className="w-full">Avanzar a {getBaseLabel(managingRunner.baseIndex+2)}</Button>} {managingRunner.baseIndex === 0 && <Button onClick={()=>handleRunnerAction('advanceTo3BFrom1B')} variant="info" className="w-full">Avanzar a {getBaseLabel(managingRunner.baseIndex+3)}</Button>} <Button onClick={()=>handleRunnerAction('outRunner')} variant="danger" className="w-full">Poner Out al Corredor</Button> </div> </Modal> )}
      {assignRbiModalState.isOpen && assignRbiModalState.scoringPlayerInfo && currentPartido && ( <AssignRbiModal isOpen={assignRbiModalState.isOpen} onClose={()=>setAssignRbiModalState({isOpen:false,scoringPlayerInfo:null,batterForRbiContext:null,previousBatterForRbiContext:null})} onConfirm={handleConfirmRbiAssignment} scoringPlayerInfo={assignRbiModalState.scoringPlayerInfo} batterForRbiContext={assignRbiModalState.batterForRbiContext} previousBatterForRbiContext={assignRbiModalState.previousBatterForRbiContext}/> )}
      {errorModalContext && currentPartido && ( <ErrorAdvancementModal isOpen={isErrorModalOpen} onClose={()=>{setIsErrorModalOpen(false);setErrorModalContext(null);}} onConfirm={handleErrorAdvancementConfirm} batterName={errorModalContext.batterLineupPlayer.nombreJugador} defensiveTeamLineup={currentPartido.gameStatus.currentHalfInning==='Top'?currentPartido.lineupLocal:currentPartido.lineupVisitante} defensiveTeamName={currentPartido.gameStatus.currentHalfInning==='Top'?currentPartido.nombreEquipoLocal:currentPartido.nombreEquipoVisitante} /> )}
      {isDoublePlayModalOpen && doublePlayContext && currentPartido && ( <DoublePlayOutSelectionModal isOpen={isDoublePlayModalOpen} onClose={()=>{setIsDoublePlayModalOpen(false);setDoublePlayContext(null);}} onConfirm={doublePlayContext.onConfirm} playersInvolved={[doublePlayContext.batter,...doublePlayContext.runners]} teamName={currentPartido.gameStatus.currentHalfInning==='Top'?currentPartido.nombreEquipoVisitante:currentPartido.nombreEquipoLocal} /> )}
      {isTriplePlayModalOpen && triplePlayContext && currentPartido && (
        <TriplePlayOutSelectionModal
            isOpen={isTriplePlayModalOpen}
            onClose={() => { setIsTriplePlayModalOpen(false); setTriplePlayContext(null); }}
            onConfirm={triplePlayContext.onConfirm}
            playersInvolved={[triplePlayContext.batter, ...triplePlayContext.runners]}
            teamName={
                currentPartido.gameStatus.currentHalfInning === 'Top'
                ? currentPartido.nombreEquipoVisitante
                : currentPartido.nombreEquipoLocal
            }
        />
      )}
      {runnerAdvancementContext && currentPartido && ( <RunnerAdvancementReasonModal isOpen={isRunnerAdvancementReasonModalOpen} onClose={()=>{setIsRunnerAdvancementReasonModalOpen(false);setRunnerAdvancementContext(null);}} onConfirm={handleRunnerAdvancementReasonConfirm} runner={runnerAdvancementContext.runner} defensiveTeamLineup={currentPartido.gameStatus.currentHalfInning === 'Top' ? currentPartido.lineupLocal : currentPartido.lineupVisitante} defensiveTeamName={currentPartido.gameStatus.currentHalfInning === 'Top' ? currentPartido.nombreEquipoLocal : currentPartido.nombreEquipoVisitante} isScoringAttempt={runnerAdvancementContext.baseIndexAdvancedTo===3} /> )}
      {isRunnerOutSpecificReasonModalOpen && managingRunner && ( <RunnerOutSpecificReasonModal isOpen={isRunnerOutSpecificReasonModalOpen} onClose={()=>{setIsRunnerOutSpecificReasonModalOpen(false);setManagingRunner(null);}} onConfirm={handleRunnerOutSpecificReasonConfirm} runnerName={managingRunner.player.nombreJugador} baseBeingRunFrom={getBaseLabel(managingRunner.baseIndex+1)} /> )}
      {runnerAdvancementAfterHitModalState.isOpen && runnerAdvancementAfterHitModalState.batter && currentPartido && ( <RunnerAdvancementAfterHitModal isOpen={runnerAdvancementAfterHitModalState.isOpen} onClose={()=>setRunnerAdvancementAfterHitModalState(prev=>({...prev,isOpen:false}))} batter={runnerAdvancementAfterHitModalState.batter} hitType={runnerAdvancementAfterHitModalState.hitType!} batterReachedBase={runnerAdvancementAfterHitModalState.batterReachedBase} runnersOnBase={runnerAdvancementAfterHitModalState.runnersOnBase} initialAdvancements={runnerAdvancementAfterHitModalState.advancements} onConfirm={handleConfirmRunnerAdvancementsFromHitModal} /> )}
      {runnerAdvancementAfterSacrificeModalState.isOpen && runnerAdvancementAfterSacrificeModalState.batter && currentPartido && ( <RunnerAdvancementAfterSacrificeModal isOpen={runnerAdvancementAfterSacrificeModalState.isOpen} onClose={()=>setRunnerAdvancementAfterSacrificeModalState(prev => ({...prev,isOpen:false}))} batter={runnerAdvancementAfterSacrificeModalState.batter} sacrificeType={runnerAdvancementAfterSacrificeModalState.sacrificeType!} runnersOnBase={runnerAdvancementAfterSacrificeModalState.runnersOnBase} initialAdvancements={runnerAdvancementAfterSacrificeModalState.advancements} initialOuts={runnerAdvancementAfterSacrificeModalState.initialOuts} onConfirm={handleConfirmRunnerAdvancementsFromSacrificeModal} /> )}
      {runnerAdvancementAfterErrorModalState.isOpen && runnerAdvancementAfterErrorModalState.batterWhoReachedOnError && currentPartido && (
        <RunnerAdvancementAfterErrorModal
            isOpen={runnerAdvancementAfterErrorModalState.isOpen}
            onClose={()=>{setIsErrorModalOpen(false); setErrorModalContext(null); setRunnerAdvancementAfterErrorModalState(prev=>({...prev, isOpen:false}))}}
            batterWhoReachedOnError={runnerAdvancementAfterErrorModalState.batterWhoReachedOnError}
            batterFinalDestBaseOnError={runnerAdvancementAfterErrorModalState.batterFinalDestBaseOnError}
            runnersOnBaseAtTimeOfError={runnerAdvancementAfterErrorModalState.runnersOnBaseAtTimeOfError}
            fielderWhoCommittedError={runnerAdvancementAfterErrorModalState.fielderWhoCommittedError}
            onConfirm={handleConfirmRunnerAdvancementsFromErrorModal}
        />
      )}
      {isEditRegistroModalOpen && editingRegistro && (
        <Modal isOpen={isEditRegistroModalOpen} onClose={handleCloseEditRegistroModal} title={`Editar Registro de Jugada #${editingRegistro.id.substring(0,6)}`} size="lg">
            <p className="text-sm mb-2">Bateador: <span className="font-semibold">{editingRegistro.bateadorNombre}</span></p>
            <p className="text-sm mb-2">Jugada Original: <span className="font-semibold">{getOriginalJugadaDescription(editingRegistro.jugadaId, editingRegistro.descripcion)} ({editingRegistro.jugadaId})</span></p>
            <p className="text-xs text-red-500 bg-red-100 p-2 rounded mb-3">Advertencia: Cambiar la jugada aquí solo actualiza el texto del log. No recalcula estadísticas, outs, ni movimiento de bases.</p>
            <Select
                label="Nueva Jugada (Solo para el log):"
                options={jugadasDB.map(j => ({value: j.jugada, label: `${j.descripcion} (${j.jugada})`}))}
                value={tempEditedPlayIdInModal}
                onChange={(e) => setTempEditedPlayIdInModal(e.target.value)}
            />
            <div className="mt-4 flex justify-end space-x-2">
                <Button variant="light" onClick={handleCloseEditRegistroModal}>Cancelar</Button>
                <Button variant="success" onClick={() => {
                    const selected = jugadasDB.find(j => j.jugada === tempEditedPlayIdInModal);
                    if(selected) handleSaveEditedRegistro(selected);
                }}>Guardar Solo Texto del Log</Button>
            </div>
        </Modal>
      )}
      {isPositionConflictModalOpen && positionConflictDetails && (
          <Modal isOpen={isPositionConflictModalOpen} onClose={handleClosePositionConflictModal} title="Conflicto de Posición">
            <p>La posición <strong>{positionConflictDetails.targetPosition}</strong> ya está ocupada por <strong>{positionConflictDetails.existingPlayerInTargetPosition.nombreJugador}</strong>.</p>
            <p>¿Desea asignar a <strong>{positionConflictDetails.conflictingPlayer.nombreJugador}</strong> a la posición <strong>{positionConflictDetails.targetPosition}</strong>? Esto moverá a <strong>{positionConflictDetails.existingPlayerInTargetPosition.nombreJugador}</strong> a la Banca (BE).</p>
            <div className="flex justify-end space-x-2 pt-3">
              <Button variant="light" onClick={() => handleResolvePositionConflict(false)}>Cancelar</Button>
              <Button variant="warning" onClick={() => handleResolvePositionConflict(true)}>Confirmar y Mover a Banca</Button>
            </div>
          </Modal>
      )}
       {isEditPlayerPositionModalOpen && editingPlayerForPosition && currentPartido && (
        <PositionSelectionModal
          isOpen={isEditPlayerPositionModalOpen}
          onClose={() => {setIsEditPlayerPositionModalOpen(false); setEditingPlayerForPosition(null);}}
          onConfirm={handleConfirmPlayerPositionChange}
          currentPlayerName={editingPlayerForPosition.player.nombreJugador}
          currentPosition={editingPlayerForPosition.player.posicion}
          teamLineup={editingPlayerForPosition.team === 'visitante' ? currentPartido.lineupVisitante : currentPartido.lineupLocal}
          teamName={editingPlayerForPosition.team === 'visitante' ? currentPartido.nombreEquipoVisitante : currentPartido.nombreEquipoLocal}
        />
      )}
      {fielderChoiceModalState.isOpen && fielderChoiceModalState.batter && currentPartido && (
         <FielderChoiceOutcomeModal 
            isOpen={fielderChoiceModalState.isOpen}
            onClose={() => setFielderChoiceModalState({ isOpen: false, batter: null, runnersOnBase: [], initialOuts: 0 })}
            batter={fielderChoiceModalState.batter!}
            runnersOnBase={fielderChoiceModalState.runnersOnBase}
            initialOuts={fielderChoiceModalState.initialOuts}
            onConfirm={handleConfirmFielderChoice}
        />
      )}
    </div>
  );
};
