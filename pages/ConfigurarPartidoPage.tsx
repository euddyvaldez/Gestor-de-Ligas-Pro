

import React, { useState, useEffect, useCallback, ChangeEvent, useRef, DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import {
  PartidoData, Formato, Jugador, LineupPlayer, BatterStats, AppGlobalConfig, Equipo, DEFAULT_GLOBAL_CONFIG, POSICIONES_FOR_SELECT, EMPTY_POSICION_PLACEHOLDER, POSICIONES, RegistroJuego, PlayerOnBase, EMPTY_POSICION_LABEL
} from '../types';
import {
  PARTIDO_EN_CURSO_KEY, FORMATOS_STORAGE_KEY, JUGADORES_STORAGE_KEY, APP_CONFIG_KEY, EQUIPOS_STORAGE_KEY
} from '../constants';
import useLocalStorage from '../hooks/useLocalStorage';
import { generateUUID } from '../utils/idGenerator';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import { findNextBatterInLineup, recalculateLineupOrder, createEmptyBatterStats, createEmptyGameStatus, initialPartidoData, createEmptyTeamStats } from '../utils/partidoUtils';
import PlayerSelectionModal from '../components/partidos/PlayerSelectionModal';
import PositionSelectionModal from '../components/partidos/PositionSelectionModal';
import IconButton, { ArrowUpTriangleIcon, ArrowDownTriangleIcon } from '../components/ui/IconButton';


interface PositionConflictDetails {
    conflictingPlayer: LineupPlayer; 
    targetPlayerOriginalPosition: string; 
    existingPlayerInTargetPosition: LineupPlayer; 
    targetPosition: string;
    team: 'visitante' | 'local';
}

const ConfigurarPartidoPage: React.FC = () => {
  const [appConfig] = useLocalStorage<AppGlobalConfig>(APP_CONFIG_KEY, DEFAULT_GLOBAL_CONFIG);
  const [formatos] = useLocalStorage<Formato[]>(FORMATOS_STORAGE_KEY, []);
  const [jugadoresDB] = useLocalStorage<Jugador[]>(JUGADORES_STORAGE_KEY, []);
  const [equiposDB] = useLocalStorage<Equipo[]>(EQUIPOS_STORAGE_KEY, []);

  const [setupStep, setSetupStep] = useState(1);
  const [tempSetupData, setTempSetupData] = useState<Partial<PartidoData>>(() => {
    return initialPartidoData(appConfig, undefined);
  });
  
  const [selectedVisitantePlayers, setSelectedVisitantePlayers] = useState<Set<number>>(new Set());
  const [selectedLocalPlayers, setSelectedLocalPlayers] = useState<Set<number>>(new Set());
  
  const [isPositionConflictModalOpen, setIsPositionConflictModalOpen] = useState(false);
  const [positionConflictDetails, setPositionConflictDetails] = useState<PositionConflictDetails | null>(null);
  const [isPositionMissingModalOpen, setIsPositionMissingModalOpen] = useState(false);
  const [playersMissingPositionInfo, setPlayersMissingPositionInfo] = useState<{ teamName: string, players: string[] }[]>([]);
  
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null);
  const [dragOverPlayerId, setDragOverPlayerId] = useState<string | null>(null);
  
  const importGameCsvInputRef = useRef<HTMLInputElement>(null);
  const [importedRegistrosJuego, setImportedRegistrosJuego] = useState<RegistroJuego[] | null>(null);

  const [isPlayerSelectionModalOpen, setIsPlayerSelectionModalOpen] = useState(false);
  const [teamForModalSelection, setTeamForModalSelection] = useState<'visitante' | 'local' | null>(null);
  const modalManuallyClosedRef = useRef(false);

  const [isPositionSelectionModalOpen, setIsPositionSelectionModalOpen] = useState(false);
  const [playerForPositionModal, setPlayerForPositionModal] = useState<LineupPlayer | null>(null);
  const [teamForPositionModal, setTeamForPositionModal] = useState<'visitante' | 'local' | null>(null);

  const [isFieldsMissingModalOpen, setIsFieldsMissingModalOpen] = useState(false);
  const [missingFieldsList, setMissingFieldsList] = useState<string[]>([]);


  const navigate = useNavigate();

  useEffect(() => {
    if (jugadoresDB.length === 0) return; 

    if (setupStep === 2 && !isPlayerSelectionModalOpen && !modalManuallyClosedRef.current) {
        openPlayerSelectionModal('visitante');
    } else if (setupStep === 3 && !isPlayerSelectionModalOpen && !modalManuallyClosedRef.current) {
        openPlayerSelectionModal('local');
    }
  }, [setupStep, isPlayerSelectionModalOpen, jugadoresDB.length]);


  const handleSetupInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let processedValue: string | number | null = value;
     
    setTempSetupData(prev => {
        const updated = { ...prev };

        if (name === "formatoJuegoId") {
            processedValue = parseInt(value, 10);
            if (isNaN(processedValue as number)) processedValue = 0;
            updated.formatoJuegoId = processedValue as number;
            const selectedFormato = formatos.find(f => f.codigo === processedValue);
            if (selectedFormato) {
                updated.maxInnings = selectedFormato.cantidadInning;
            } else { 
                 updated.maxInnings = appConfig.defaultMaxInnings;
            }
        } else if (name === "maxInnings") {
            processedValue = parseInt(value, 10);
            if (isNaN(processedValue as number)) processedValue = appConfig.defaultMaxInnings;
            updated.maxInnings = processedValue as number;
        } else if (name === "selectedEquipoVisitanteId" || name === "selectedEquipoLocalId") {
            processedValue = value ? parseInt(value, 10) : null;
            const selectedEquipo = equiposDB.find(eq => eq.codigo === processedValue);
            if (name === "selectedEquipoVisitanteId") {
                updated.selectedEquipoVisitanteId = processedValue as number | null;
                updated.nombreEquipoVisitante = selectedEquipo ? selectedEquipo.nombre : (appConfig.defaultVisitanteTeamName);
                if (selectedEquipo) setSelectedVisitantePlayers(new Set(selectedEquipo.jugadoresIds)); else setSelectedVisitantePlayers(new Set());
            } else {
                updated.selectedEquipoLocalId = processedValue as number | null;
                updated.nombreEquipoLocal = selectedEquipo ? selectedEquipo.nombre : (appConfig.defaultLocalTeamName);
                if (selectedEquipo) setSelectedLocalPlayers(new Set(selectedEquipo.jugadoresIds)); else setSelectedLocalPlayers(new Set());
            }
        } else if (name === "nombreEquipoVisitante" || name === "nombreEquipoLocal") {
            if (name === "nombreEquipoVisitante") {
                updated.selectedEquipoVisitanteId = null;
                updated.nombreEquipoVisitante = value;
                if(!updated.selectedEquipoVisitanteId) setSelectedVisitantePlayers(new Set());
            } else {
                updated.selectedEquipoLocalId = null;
                updated.nombreEquipoLocal = value;
                 if(!updated.selectedEquipoLocalId) setSelectedLocalPlayers(new Set());
            }
        } else if (name === "numeroJuego") {
            const numericValue = value.replace(/[^0-9]/g, ''); 
            updated.numeroJuego = numericValue;
        } else if (name === 'fecha') {
            updated.fecha = processedValue as string;
        } else {
            (updated as Record<string, any>)[name] = processedValue;
        }
        return updated;
    });
  };
  
  const finalizeLineupFromSelection = (team: 'visitante' | 'local', selectedIds: Set<number>): LineupPlayer[] => {
    return Array.from(selectedIds).map((jugadorId, index) => {
        const jugador = jugadoresDB.find(j => j.codigo === jugadorId);
        return {
            id: generateUUID(),
            ordenBate: index + 1,
            jugadorId: jugadorId,
            nombreJugador: jugador?.nombre || 'Desconocido',
            posicion: EMPTY_POSICION_PLACEHOLDER, 
            innings: {},
            stats: createEmptyBatterStats(),
        };
    }).sort((a,b) => a.ordenBate - b.ordenBate);
  };

  const proceedToNextSetupStep = () => {
    modalManuallyClosedRef.current = false;
    if (setupStep === 1) {
        const missingFields: string[] = [];
        if (!tempSetupData.fecha?.trim()) {
            missingFields.push("Fecha del Juego");
        }
        if (!tempSetupData.formatoJuegoId || tempSetupData.formatoJuegoId === 0) {
            missingFields.push("Formato del Juego");
        }
        if (!tempSetupData.numeroJuego?.trim()) {
            missingFields.push("Número de Juego");
        }
        if (!tempSetupData.nombreEquipoVisitante?.trim()) {
            missingFields.push("Nombre Equipo Visitante");
        }
        if (!tempSetupData.nombreEquipoLocal?.trim()) {
            missingFields.push("Nombre Equipo Local");
        }

        if (missingFields.length > 0) {
            setMissingFieldsList(missingFields);
            setIsFieldsMissingModalOpen(true);
            return;
        }
        setSetupStep(2);
    } else if (setupStep === 4) { 
        const visitorLineup = tempSetupData.lineupVisitante || [];
        const playersWithoutPos = visitorLineup.filter(p => p.posicion === EMPTY_POSICION_PLACEHOLDER).map(p => p.nombreJugador);
        if (playersWithoutPos.length > 0) {
            setPlayersMissingPositionInfo([{ teamName: tempSetupData.nombreEquipoVisitante || "Visitante", players: playersWithoutPos }]);
            setIsPositionMissingModalOpen(true);
            return;
        }
        setSetupStep(5); 
    }
  };

  const handleStartGame = () => {
    if (!tempSetupData.nombreEquipoVisitante?.trim() || !tempSetupData.nombreEquipoLocal?.trim()) {
        alert("Por favor, complete los detalles del juego, incluyendo nombres de equipo.");
        return;
    }
    
    const visitorLineup = tempSetupData.lineupVisitante || [];
    const localLineup = tempSetupData.lineupLocal || [];
    
    const visitorPlayersWithoutPos = visitorLineup.filter(p => p.posicion === EMPTY_POSICION_PLACEHOLDER).map(p => p.nombreJugador);
    const localPlayersWithoutPos = localLineup.filter(p => p.posicion === EMPTY_POSICION_PLACEHOLDER).map(p => p.nombreJugador);
    
    const missingInfo: { teamName: string, players: string[] }[] = [];
    if (visitorPlayersWithoutPos.length > 0) {
        missingInfo.push({ teamName: tempSetupData.nombreEquipoVisitante || "Visitante", players: visitorPlayersWithoutPos });
    }
    if (localPlayersWithoutPos.length > 0) {
        missingInfo.push({ teamName: tempSetupData.nombreEquipoLocal || "Local", players: localPlayersWithoutPos });
    }

    if (missingInfo.length > 0) {
        setPlayersMissingPositionInfo(missingInfo);
        setIsPositionMissingModalOpen(true);
        return;
    }
    
    const selectedFormato = formatos.find(f => f.codigo === tempSetupData.formatoJuegoId);
    const maxInningsForGame = selectedFormato?.cantidadInning || tempSetupData.maxInnings || appConfig.defaultMaxInnings;

    let gameDataToSet: PartidoData;
    
    const lineupVisitanteFromSetup = tempSetupData.lineupVisitante || [];
    const lineupLocalFromSetup = tempSetupData.lineupLocal || [];

    if (lineupVisitanteFromSetup.filter(p => p.posicion !== 'BE' && p.posicion !== EMPTY_POSICION_PLACEHOLDER).length === 0 || 
        lineupLocalFromSetup.filter(p => p.posicion !== 'BE' && p.posicion !== EMPTY_POSICION_PLACEHOLDER).length === 0) {
        alert("Ambos lineups deben tener al menos un jugador activo (no en BE o sin posición) antes de comenzar el partido.");
        return;
    }
    
    const firstVisitorBatterId = findNextBatterInLineup(lineupVisitanteFromSetup, null);
    const firstLocalBatterId = findNextBatterInLineup(lineupLocalFromSetup, null);


    if (importedRegistrosJuego) { 
        if (lineupVisitanteFromSetup.length === 0 || lineupLocalFromSetup.length === 0) {
           alert("Los lineups (visitante o local) no pudieron ser cargados desde el CSV o generados. Verifique el archivo CSV o la selección de equipos.");
           return;
        }
        
        let restoredGameStatus = createEmptyGameStatus();
        restoredGameStatus.nextVisitorBatterLineupPlayerId = firstVisitorBatterId;
        restoredGameStatus.nextLocalBatterLineupPlayerId = firstLocalBatterId;
        
        if (importedRegistrosJuego.length > 0) {
            const lastPlay = importedRegistrosJuego[importedRegistrosJuego.length - 1];
            restoredGameStatus.actualInningNumber = lastPlay.inning;
            restoredGameStatus.currentHalfInning = lastPlay.halfInning;
            restoredGameStatus.outs = lastPlay.outsAfter;
            
            const lineupForLastPlayHalf = lastPlay.halfInning === 'Top' ? lineupVisitanteFromSetup : lineupLocalFromSetup;
            const tempBasesInitialized: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null] = [null, null, null];
            
            const lastPlayBaseRunnerIds = lastPlay.basesAfterState.split('-'); 
            lastPlayBaseRunnerIds.forEach((id, index) => {
                if (id && id !== 'null' && index < 3) {
                    const runner = lineupForLastPlayHalf.find(p => p.id === id);
                    if (runner) {
                        tempBasesInitialized[index as 0 | 1 | 2] = { lineupPlayerId: runner.id, jugadorId: runner.jugadorId, nombreJugador: runner.nombreJugador };
                    }
                }
            });
            restoredGameStatus.bases = tempBasesInitialized;

            if (lastPlay.halfInning === 'Top') { 
                const nextVisitor = findNextBatterInLineup(lineupVisitanteFromSetup, lastPlay.bateadorId);
                restoredGameStatus.nextVisitorBatterLineupPlayerId = nextVisitor;
                if (lastPlay.outsAfter === 3) { 
                    restoredGameStatus.currentBatterLineupPlayerId = restoredGameStatus.nextLocalBatterLineupPlayerId;
                    restoredGameStatus.currentHalfInning = 'Bottom';
                } else { 
                    restoredGameStatus.currentBatterLineupPlayerId = nextVisitor;
                }
            } else { 
                const nextLocal = findNextBatterInLineup(lineupLocalFromSetup, lastPlay.bateadorId);
                restoredGameStatus.nextLocalBatterLineupPlayerId = nextLocal;
                if (lastPlay.outsAfter === 3) { 
                    restoredGameStatus.currentBatterLineupPlayerId = restoredGameStatus.nextVisitorBatterLineupPlayerId;
                    restoredGameStatus.currentHalfInning = 'Top';
                    restoredGameStatus.actualInningNumber = lastPlay.inning + 1;
                } else { 
                    restoredGameStatus.currentBatterLineupPlayerId = nextLocal;
                }
            }
        } else { 
             restoredGameStatus.currentBatterLineupPlayerId = firstVisitorBatterId;
        }

        gameDataToSet = {
            ...(initialPartidoData(appConfig, selectedFormato)), 
            ...tempSetupData, 
            idJuego: tempSetupData.idJuego || generateUUID(),
            lineupVisitante: lineupVisitanteFromSetup, 
            lineupLocal: lineupLocalFromSetup,   
            registrosJuego: importedRegistrosJuego,
            maxInnings: maxInningsForGame,
            gameStatus: restoredGameStatus, 
            visitanteStats: createEmptyTeamStats(), 
            localStats: createEmptyTeamStats(),  
        } as PartidoData; 
        
        alert("Partido importado. El registro de jugadas y lineups han sido cargados. Las estadísticas de jugadores y equipos se inician desde cero. El estado del juego se ha intentado restaurar.");
        setImportedRegistrosJuego(null); 

    } else { 
        gameDataToSet = {
            ...(initialPartidoData(appConfig, selectedFormato)), 
            ...tempSetupData,
            lineupVisitante: lineupVisitanteFromSetup,
            lineupLocal: lineupLocalFromSetup,
            idJuego: tempSetupData.idJuego || generateUUID(), 
            gameStatus: {
                ...createEmptyGameStatus(), 
                currentBatterLineupPlayerId: firstVisitorBatterId,
                nextVisitorBatterLineupPlayerId: firstVisitorBatterId,
                nextLocalBatterLineupPlayerId: firstLocalBatterId,
            },
            visitanteStats: createEmptyTeamStats(), 
            localStats: createEmptyTeamStats(),   
            registrosJuego: [], 
            maxInnings: maxInningsForGame,
        } as PartidoData; 
    }
    
    localStorage.setItem(PARTIDO_EN_CURSO_KEY, JSON.stringify(gameDataToSet));
    navigate('/partidos');
  };

  const handleChangePlayerPosition = (playerId: string, newPosition: string, team: 'visitante' | 'local') => {
    const sourceLineup = (tempSetupData as any)[team === 'visitante' ? 'lineupVisitante' : 'lineupLocal'] || [];

    const playerToChange = sourceLineup.find((p: LineupPlayer) => p.id === playerId);
    if (!playerToChange) return;

    if (newPosition !== EMPTY_POSICION_PLACEHOLDER && newPosition !== 'DH' && newPosition !== 'BE') {
        const existingPlayerInTargetPosition = sourceLineup.find((p: LineupPlayer) => p.id !== playerId && p.posicion === newPosition);
        if (existingPlayerInTargetPosition) {
            setPositionConflictDetails({
                conflictingPlayer: playerToChange,
                targetPlayerOriginalPosition: playerToChange.posicion,
                existingPlayerInTargetPosition: existingPlayerInTargetPosition,
                targetPosition: newPosition,
                team: team,
            });
            setIsPositionConflictModalOpen(true);
            return;
        }
    }
    
    setTempSetupData(prevData => {
        if (!prevData) return null;
        const lineupKey = team === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
        let currentLineupForTeam = (prevData as any)[lineupKey] ? [...(prevData as any)[lineupKey]] : [];
        if(currentLineupForTeam.length === 0) return prevData;

        const updatedTeamLineup = currentLineupForTeam.map((p: LineupPlayer) => p.id === playerId ? { ...p, posicion: newPosition } : p);
        const { updatedLineup } = recalculateLineupOrder(updatedTeamLineup, null); 
        
        return { ...prevData, [lineupKey]: updatedLineup };
    });
  };

  const handleOpenPositionModal = (player: LineupPlayer, team: 'visitante' | 'local') => {
    setPlayerForPositionModal(player);
    setTeamForPositionModal(team);
    setIsPositionSelectionModalOpen(true);
  };
  
  const handlePositionSelectionConfirm = (selectedPosition: string) => {
    if (playerForPositionModal && teamForPositionModal) {
      handleChangePlayerPosition(playerForPositionModal.id, selectedPosition, teamForPositionModal);
    }
    setIsPositionSelectionModalOpen(false);
    setPlayerForPositionModal(null);
    setTeamForPositionModal(null);
  };

  const handleClosePositionConflictModal = () => setIsPositionConflictModalOpen(false);

  const handleResolvePositionConflict = (confirmMove: boolean) => {
    if (!positionConflictDetails) return;

    if (confirmMove) {
        setTempSetupData(prevData => {
            if (!prevData || !positionConflictDetails) return prevData;
            const { conflictingPlayer, existingPlayerInTargetPosition, targetPosition, team } = positionConflictDetails;
            const lineupKey = team === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
            let lineup = (prevData as any)[lineupKey] ? [...(prevData as any)[lineupKey]] : [];
            if(lineup.length === 0) return prevData;
            
            lineup = lineup.map((p:LineupPlayer) => {
                if (p.id === conflictingPlayer.id) return { ...p, posicion: targetPosition };
                if (p.id === existingPlayerInTargetPosition.id) return { ...p, posicion: 'BE' }; 
                return p;
            });

            const { updatedLineup } = recalculateLineupOrder(lineup, null);
            return { ...prevData, [lineupKey]: updatedLineup };
        });
    }
    handleClosePositionConflictModal();
    setPositionConflictDetails(null);
  };
  
  const handleImportGameCSVClick = () => {
    importGameCsvInputRef.current?.click();
  };
  
  const handleImportGameCSVFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) { 
        Papa.parse(file, {
            skipEmptyLines: true, header: false, dynamicTyping: false, 
            complete: (results) => {
                const rows = results.data as string[][]; 
                if (rows.length === 0) { alert("El archivo CSV está vacío."); return; }

                const newSetupDataFromCsv: Partial<PartidoData> = { lineupVisitante: [], lineupLocal: [] };
                const newRegistrosJuegoFromCsv: RegistroJuego[] = [];
                let readingLog = false, readingVisitorLineup = false, readingLocalLineup = false;
                let logHeaders: string[] = [], visitorLineupHeaders: string[] = [], localLineupHeaders: string[] = [];
                const parsedVisitorLineup: LineupPlayer[] = [], parsedLocalLineup: LineupPlayer[] = [];

                for (const row of rows) {
                    const firstCellTrimmed = String(row[0] || '').trim().toUpperCase();
                    if (firstCellTrimmed === "#LINEUP_VISITANTE_START") { readingVisitorLineup = true; readingLocalLineup = false; readingLog = false; visitorLineupHeaders = []; continue; }
                    if (firstCellTrimmed === "#LINEUP_LOCAL_START") { readingLocalLineup = true; readingVisitorLineup = false; readingLog = false; localLineupHeaders = []; continue; }
                    if (firstCellTrimmed === "#REGISTROS_JUEGO_START") {  readingLog = true; readingVisitorLineup = false; readingLocalLineup = false; logHeaders = []; continue;  }

                    if (readingVisitorLineup) {
                        if (visitorLineupHeaders.length === 0) { visitorLineupHeaders = row.map(h => String(h).trim()); continue; }
                        const parsedRow: Record<string, any> = {}; visitorLineupHeaders.forEach((header, index) => parsedRow[header] = row[index]);
                        parsedVisitorLineup.push({ id: String(parsedRow.id || generateUUID()), ordenBate: Number(parsedRow.ordenBate || 0), jugadorId: Number(parsedRow.jugadorId || 0), nombreJugador: String(parsedRow.nombreJugador || 'Imported Player'), posicion: String(parsedRow.posicion || EMPTY_POSICION_PLACEHOLDER), stats: createEmptyBatterStats(), innings: {}, });
                    } else if (readingLocalLineup) {
                        if (localLineupHeaders.length === 0) { localLineupHeaders = row.map(h => String(h).trim()); continue; }
                        const parsedRow: Record<string, any> = {}; localLineupHeaders.forEach((header, index) => parsedRow[header] = row[index]);
                        parsedLocalLineup.push({ id: String(parsedRow.id || generateUUID()), ordenBate: Number(parsedRow.ordenBate || 0), jugadorId: Number(parsedRow.jugadorId || 0), nombreJugador: String(parsedRow.nombreJugador || 'Imported Player'), posicion: String(parsedRow.posicion || EMPTY_POSICION_PLACEHOLDER), stats: createEmptyBatterStats(), innings: {}, });
                    } else if (readingLog) { 
                        if (logHeaders.length === 0) { logHeaders = row.map(h => String(h).trim()); continue; }
                        const r: Record<string, any> = {}; logHeaders.forEach((header, index) => r[header] = row[index]);
                        if (!r.id && !r.bateadorNombre && !r.jugadaId) { console.warn("Skipping incomplete log row:", r); continue; }
                        newRegistrosJuegoFromCsv.push({
                            id: String(r.id||generateUUID()),
                            timestamp:Number(r.timestamp||Date.now()),
                            inning:Number(r.inning||1),
                            halfInning:(String(r.halfInning)==='Top'||String(r.halfInning)==='Bottom')?String(r.halfInning)as 'Top'|'Bottom':'Top',
                            bateadorId:String(r.bateadorId||'unknown-bid'),
                            bateadorNombre:String(r.bateadorNombre||'Unknown Batter'),
                            bateadorPosicion:String(r.bateadorPosicion||'N/A'),
                            pitcherResponsableId:r.pitcherResponsableId!==null&&r.pitcherResponsableId!==undefined&&String(r.pitcherResponsableId).trim()!==''?String(r.pitcherResponsableId):null,
                            pitcherResponsableNombre:r.pitcherResponsableNombre!==null&&r.pitcherResponsableNombre!==undefined&&String(r.pitcherResponsableNombre).trim()!==''?String(r.pitcherResponsableNombre):null,
                            equipoBateadorNombre:String(r.equipoBateadorNombre||'Unknown Team'),
                            jugadaId:String(r.jugadaId||'UNKNOWN_PLAY'),
                            descripcion:String(r.descripcion||'Unknown Play Desc'),
                            categoria: String(r.categoria || ''),
                            outsPrev:Number(r.outsPrev||0),
                            outsAfter:Number(r.outsAfter||0),
                            basesPrevState: String(r.basesPrevState || "null-null-null"),
                            basesAfterState: String(r.basesAfterState || "null-null-null"),
                            runScored:Number(r.runScored||0),
                            rbi:Number(r.rbi||0),
                            advancementReason: String(r.advancementReason || ''),
                            fechaDelPartido: String(r.fechaDelPartido || newSetupDataFromCsv.fecha || new Date().toISOString().split('T')[0]),
                            formatoDelPartidoDesc: String(r.formatoDelPartidoDesc || formatos.find(f => f.codigo === newSetupDataFromCsv.formatoJuegoId)?.descripcion || 'N/A'),
                            numeroDelPartido: String(r.numeroDelPartido || newSetupDataFromCsv.numeroJuego || ''),
                            ordenDelBateador: Number(r.ordenDelBateador || 0)
                        });
                    } else { 
                        if (row.length >= 2) {
                            const key = String(row[0]).trim(), value = String(row[1]||'').trim(); 
                            if (key.toUpperCase() === 'KEY') continue; 
                            if (key === 'idJuego') newSetupDataFromCsv.idJuego=value?value:generateUUID(); else if(key==='fecha')newSetupDataFromCsv.fecha=value; else if(key==='formatoJuegoId')newSetupDataFromCsv.formatoJuegoId=value===''?0:Number(value); else if(key==='numeroJuego')newSetupDataFromCsv.numeroJuego=value; else if(key==='nombreEquipoVisitante')newSetupDataFromCsv.nombreEquipoVisitante=value; else if(key==='nombreEquipoLocal')newSetupDataFromCsv.nombreEquipoLocal=value; else if(key==='selectedEquipoVisitanteId')newSetupDataFromCsv.selectedEquipoVisitanteId=value===''?null:Number(value); else if(key==='selectedEquipoLocalId')newSetupDataFromCsv.selectedEquipoLocalId=value===''?null:Number(value); else if(key==='maxInnings')newSetupDataFromCsv.maxInnings=value===''? (appConfig.defaultMaxInnings):Number(value);
                        }
                    }
                }
                if (parsedVisitorLineup.length > 0) newSetupDataFromCsv.lineupVisitante = parsedVisitorLineup;
                if (parsedLocalLineup.length > 0) newSetupDataFromCsv.lineupLocal = parsedLocalLineup;
                if(newSetupDataFromCsv.selectedEquipoVisitanteId){const e=equiposDB.find(eq=>eq.codigo===newSetupDataFromCsv.selectedEquipoVisitanteId); if(e&&(!newSetupDataFromCsv.lineupVisitante||newSetupDataFromCsv.lineupVisitante.length===0)){setSelectedVisitantePlayers(new Set(e.jugadoresIds));}else if(newSetupDataFromCsv.lineupVisitante){setSelectedVisitantePlayers(new Set(newSetupDataFromCsv.lineupVisitante.map(p=>p.jugadorId)));}}else if(newSetupDataFromCsv.lineupVisitante&&newSetupDataFromCsv.lineupVisitante.length>0){setSelectedVisitantePlayers(new Set(newSetupDataFromCsv.lineupVisitante.map(p=>p.jugadorId)));}else{setSelectedVisitantePlayers(new Set());}
                if(newSetupDataFromCsv.selectedEquipoLocalId){const e=equiposDB.find(eq=>eq.codigo===newSetupDataFromCsv.selectedEquipoLocalId); if(e&&(!newSetupDataFromCsv.lineupLocal||newSetupDataFromCsv.lineupLocal.length===0)){setSelectedLocalPlayers(new Set(e.jugadoresIds));}else if(newSetupDataFromCsv.lineupLocal){setSelectedLocalPlayers(new Set(newSetupDataFromCsv.lineupLocal.map(p=>p.jugadorId)));}}else if(newSetupDataFromCsv.lineupLocal&&newSetupDataFromCsv.lineupLocal.length>0){setSelectedLocalPlayers(new Set(newSetupDataFromCsv.lineupLocal.map(p=>p.jugadorId)));}else{setSelectedLocalPlayers(new Set());}
                setTempSetupData(prev=>({...prev,...newSetupDataFromCsv})); setImportedRegistrosJuego(newRegistrosJuegoFromCsv);
                alert(`Metadata, ${newSetupDataFromCsv.lineupVisitante?.length||0} jugadores visitantes, ${newSetupDataFromCsv.lineupLocal?.length||0} jugadores locales y ${newRegistrosJuegoFromCsv.length} registros de juego importados del CSV. Revise la configuración y continúe para seleccionar/confirmar lineups si es necesario.`);
                setSetupStep(1); 
            },
            error: (error: any) => { alert(`Error al parsear el archivo CSV del juego: ${error.message}`); }
        });
        if(importGameCsvInputRef.current) importGameCsvInputRef.current.value = "";
    }
  };

  const openPlayerSelectionModal = (team: 'visitante' | 'local') => {
    setTeamForModalSelection(team);
    setIsPlayerSelectionModalOpen(true);
    modalManuallyClosedRef.current = false;
  };

  const handlePlayerSelectionConfirm = (selectedIds: Set<number>) => {
    modalManuallyClosedRef.current = false;
    const team = teamForModalSelection;
    if (team === 'visitante') {
      setSelectedVisitantePlayers(selectedIds);
      if(selectedIds.size === 0) { alert("Debe seleccionar al menos un jugador para el equipo visitante."); setIsPlayerSelectionModalOpen(false); setTeamForModalSelection(null); return; }
      setTempSetupData(prev => ({
          ...prev,
          lineupVisitante: finalizeLineupFromSelection('visitante', selectedIds)
      }));
      setSetupStep(3); 
    } else if (team === 'local') {
      setSelectedLocalPlayers(selectedIds);
      if(selectedIds.size === 0) { alert("Debe seleccionar al menos un jugador para el equipo local."); setIsPlayerSelectionModalOpen(false); setTeamForModalSelection(null); return; }
      setTempSetupData(prev => ({
          ...prev,
          lineupLocal: finalizeLineupFromSelection('local', selectedIds)
      }));
      setSetupStep(4);
    }
    setIsPlayerSelectionModalOpen(false);
    setTeamForModalSelection(null);
  };


  const handleDragStart = (e: DragEvent<HTMLTableRowElement>, playerId: string) => {
    e.dataTransfer.setData("playerId", playerId);
    setDraggingPlayerId(playerId);
  };

  const handleDragOver = (e: DragEvent<HTMLTableRowElement>, targetPlayerId: string) => {
    if (!draggingPlayerId) return;
    e.preventDefault(); // Necessary to allow drop
    if (targetPlayerId !== draggingPlayerId) { // Don't highlight if dragging over itself
      setDragOverPlayerId(targetPlayerId);
    }
  };
  
  const handleDragLeave = (e: DragEvent<HTMLTableRowElement>) => {
    setDragOverPlayerId(null);
  };

  const handleDrop = (e: DragEvent<HTMLTableRowElement>, targetPlayerId: string, team: 'visitante' | 'local') => {
    if (!draggingPlayerId) return;
    e.preventDefault();
    const sourcePlayerId = draggingPlayerId; // Use state directly
    setDraggingPlayerId(null);
    setDragOverPlayerId(null);

    if (sourcePlayerId === targetPlayerId) return; // Dropped on itself

    setTempSetupData(prev => {
        if (!prev) return prev;
        const lineupKey = team === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
        let lineup = prev[lineupKey] ? [...prev[lineupKey]!] : [];
        if (lineup.length === 0) return prev;

        const sourcePlayerIndex = lineup.findIndex(p => p.id === sourcePlayerId);
        let targetPlayerIndex = lineup.findIndex(p => p.id === targetPlayerId);

        if (sourcePlayerIndex === -1 || targetPlayerIndex === -1) return prev; 
        
        const items = Array.from(lineup);
        const [reorderedItem] = items.splice(sourcePlayerIndex, 1);
        
        // Adjust targetPlayerIndex if source was before target
        if (sourcePlayerIndex < targetPlayerIndex) {
            targetPlayerIndex--; 
        }
        items.splice(targetPlayerIndex, 0, reorderedItem);
        
        const { updatedLineup } = recalculateLineupOrder(items, null); 
        return { ...prev, [lineupKey]: updatedLineup };
    });
  };

  const handleMovePlayerInBattingOrder = (playerId: string, direction: 'up' | 'down', team: 'visitante' | 'local') => {
    setTempSetupData(prev => {
      if (!prev) return prev;
      const lineupKey = team === 'visitante' ? 'lineupVisitante' : 'lineupLocal';
      let lineup = prev[lineupKey] ? [...prev[lineupKey]!] : [];
      if (lineup.length <= 1) return prev;

      const playerIndex = lineup.findIndex(p => p.id === playerId);
      if (playerIndex === -1) return prev;

      let newIndex = playerIndex;
      if (direction === 'up' && playerIndex > 0) {
        newIndex = playerIndex - 1;
      } else if (direction === 'down' && playerIndex < lineup.length - 1) {
        newIndex = playerIndex + 1;
      }

      if (newIndex !== playerIndex) {
        const items = Array.from(lineup);
        const [playerToMove] = items.splice(playerIndex, 1);
        items.splice(newIndex, 0, playerToMove);
        
        const { updatedLineup } = recalculateLineupOrder(items, null);
        return { ...prev, [lineupKey]: updatedLineup };
      }
      return prev;
    });
  };


  const renderLineupOrganizationStep = (teamType: 'visitante' | 'local') => {
    const lineupData = teamType === 'visitante' ? tempSetupData.lineupVisitante : tempSetupData.lineupLocal;
    const teamName = teamType === 'visitante' ? tempSetupData.nombreEquipoVisitante : tempSetupData.nombreEquipoLocal;

    if (!lineupData) return <p>Cargando lineup...</p>;
    
    return (
        <div className="space-y-4">
            <h2 className="text-xl font-semibold">
                Paso {setupStep}: Organizar Lineup {teamType === 'visitante' ? 'Visitante' : 'Local'} ({teamName})
            </h2>
            <p className="text-sm text-gray-600">Arrastre y suelte o use las flechas para cambiar el orden de bateo. Asegúrese que todos los jugadores (excepto los de banca 'BE' o sin posición '--') tengan una posición asignada.</p>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">#</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jugador</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">Pos.</th>
                            <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Mover</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {lineupData.map((player, index) => (
                            <tr 
                                key={player.id} 
                                draggable={player.posicion !== 'BE' && player.posicion !== EMPTY_POSICION_PLACEHOLDER} // Only active players draggable for order
                                onDragStart={(e) => (player.posicion !== 'BE' && player.posicion !== EMPTY_POSICION_PLACEHOLDER) && handleDragStart(e, player.id)}
                                onDragOver={(e) => (player.posicion !== 'BE' && player.posicion !== EMPTY_POSICION_PLACEHOLDER) && handleDragOver(e, player.id)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => (player.posicion !== 'BE' && player.posicion !== EMPTY_POSICION_PLACEHOLDER) && handleDrop(e, player.id, teamType)}
                                className={`
                                    ${(player.posicion === 'BE' || player.posicion === EMPTY_POSICION_PLACEHOLDER) ? 'bg-gray-100 opacity-70' : 'cursor-grab'}
                                    ${draggingPlayerId === player.id ? 'opacity-30 bg-blue-100' : ''}
                                    ${dragOverPlayerId === player.id && draggingPlayerId !== player.id ? 'border-2 border-blue-500' : ''}
                                `}
                                aria-grabbed={draggingPlayerId === player.id}
                            >
                                <td className="px-2 py-2 whitespace-nowrap text-sm">{player.ordenBate}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{player.nombreJugador}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm">
                                    <Button
                                      variant="light"
                                      onClick={() => handleOpenPositionModal(player, teamType)}
                                      className="w-full text-left text-xs p-1 h-8 border-gray-300"
                                    >
                                      {player.posicion || EMPTY_POSICION_LABEL}
                                    </Button>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-sm text-center">
                                  <div className="flex justify-center items-center space-x-1">
                                    <IconButton
                                      icon={<ArrowUpTriangleIcon />}
                                      onClick={() => handleMovePlayerInBattingOrder(player.id, 'up', teamType)}
                                      disabled={index === 0 || player.posicion === 'BE' || player.posicion === EMPTY_POSICION_PLACEHOLDER}
                                      label="Mover arriba"
                                      className="p-1 disabled:opacity-30"
                                    />
                                    <IconButton
                                      icon={<ArrowDownTriangleIcon />}
                                      onClick={() => handleMovePlayerInBattingOrder(player.id, 'down', teamType)}
                                      disabled={index === lineupData.filter(p => p.posicion !== 'BE' && p.posicion !== EMPTY_POSICION_PLACEHOLDER).length -1 || player.posicion === 'BE' || player.posicion === EMPTY_POSICION_PLACEHOLDER }
                                      label="Mover abajo"
                                      className="p-1 disabled:opacity-30"
                                    />
                                  </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="flex justify-between mt-4">
                <Button onClick={() => { modalManuallyClosedRef.current = false; setSetupStep(prev => prev - 1); }} variant="secondary">Anterior</Button>
                {setupStep === 4 && <Button onClick={proceedToNextSetupStep} variant="primary">Siguiente (Organizar Local)</Button>}
                {setupStep === 5 && <Button onClick={handleStartGame} variant="success">Comenzar Partido</Button>}
            </div>
        </div>
    );
};

  const formatoOptions = formatos.map(f => ({ value: String(f.codigo), label: `${f.descripcion} (${f.cantidadInning} innings)` }));
  const equipoOptions = [{ value: "", label: "Personalizado / Nuevo" }, ...equiposDB.map(e => ({ value: String(e.codigo), label: e.nombre }))];


  return (
    <div className="p-6 bg-white shadow-lg rounded-lg max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Configurar Nuevo Partido</h1>
      <div className="mb-4">
        <Button onClick={handleImportGameCSVClick} variant="info">Importar Partido Completo (CSV)</Button>
        <input type="file" ref={importGameCsvInputRef} className="hidden" accept=".csv" onChange={handleImportGameCSVFileSelected} />
      </div>

      {setupStep === 1 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Paso 1: Información General del Partido</h2>
          <Input label="Fecha del Juego" type="date" name="fecha" value={tempSetupData.fecha || ''} onChange={handleSetupInputChange} className="bg-gray-50"/>
          <Select label="Formato del Juego" name="formatoJuegoId" options={formatoOptions} value={String(tempSetupData.formatoJuegoId || '0')} onChange={handleSetupInputChange} className="bg-gray-50" placeholder="-- Seleccione un Formato --"/>
          <Input label="Número de Juego" name="numeroJuego" value={tempSetupData.numeroJuego || ''} onChange={handleSetupInputChange} placeholder="Ej: 101" className="bg-gray-50"/>
          <h3 className="text-lg font-medium pt-2">Equipo Visitante</h3>
          <Select label="Seleccionar Equipo Visitante Existente (Opcional)" name="selectedEquipoVisitanteId" options={equipoOptions} value={String(tempSetupData.selectedEquipoVisitanteId || '')} onChange={handleSetupInputChange} />
          <Input label="Nombre Equipo Visitante" name="nombreEquipoVisitante" value={tempSetupData.nombreEquipoVisitante || ''} onChange={handleSetupInputChange} required disabled={!!tempSetupData.selectedEquipoVisitanteId} className="bg-gray-50"/>
          <h3 className="text-lg font-medium pt-2">Equipo Local</h3>
          <Select label="Seleccionar Equipo Local Existente (Opcional)" name="selectedEquipoLocalId" options={equipoOptions} value={String(tempSetupData.selectedEquipoLocalId || '')} onChange={handleSetupInputChange} />
          <Input label="Nombre Equipo Local" name="nombreEquipoLocal" value={tempSetupData.nombreEquipoLocal || ''} onChange={handleSetupInputChange} required disabled={!!tempSetupData.selectedEquipoLocalId} className="bg-gray-50"/>
          <div className="flex justify-end mt-6">
            <Button onClick={proceedToNextSetupStep} variant="primary">Siguiente (Seleccionar Jugadores Visitantes)</Button>
          </div>
        </div>
      )}

      {setupStep === 2 && (
         <div className="space-y-4">
            <h2 className="text-xl font-semibold">Paso 2: Selección de Jugadores Visitantes ({tempSetupData.nombreEquipoVisitante})</h2>
            <p className="text-sm text-gray-600">El modal para seleccionar jugadores visitantes debería abrirse automáticamente. Si no, haga clic abajo.</p>
            <Button onClick={() => openPlayerSelectionModal('visitante')} variant="secondary">Abrir Selección de Jugadores Visitantes</Button>
            <p className="text-sm text-gray-500 mt-2">Jugadores seleccionados: {selectedVisitantePlayers.size}</p>
             <div className="flex justify-between mt-6">
                <Button onClick={() => setSetupStep(1)} variant="secondary">Anterior</Button>
                 {selectedVisitantePlayers.size > 0 && <Button onClick={() => { modalManuallyClosedRef.current = false; setSetupStep(3);}} variant="primary">Siguiente (Seleccionar Locales)</Button>}
            </div>
         </div>
      )}

      {setupStep === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Paso 3: Selección de Jugadores Locales ({tempSetupData.nombreEquipoLocal})</h2>
            <p className="text-sm text-gray-600">El modal para seleccionar jugadores locales debería abrirse automáticamente. Si no, haga clic abajo.</p>
            <Button onClick={() => openPlayerSelectionModal('local')} variant="secondary">Abrir Selección de Jugadores Locales</Button>
            <p className="text-sm text-gray-500 mt-2">Jugadores seleccionados: {selectedLocalPlayers.size}</p>
            <div className="flex justify-between mt-6">
                <Button onClick={() => { modalManuallyClosedRef.current = false; setSetupStep(2); }} variant="secondary">Anterior</Button>
                {selectedLocalPlayers.size > 0 && <Button onClick={() => { modalManuallyClosedRef.current = false; setSetupStep(4); }} variant="primary">Siguiente (Organizar Lineup Visitante)</Button>}
            </div>
          </div>
      )}

      {setupStep === 4 && renderLineupOrganizationStep('visitante')}
      {setupStep === 5 && renderLineupOrganizationStep('local')}

      {isPlayerSelectionModalOpen && teamForModalSelection && (
        <PlayerSelectionModal
          isOpen={isPlayerSelectionModalOpen}
          onClose={() => { setIsPlayerSelectionModalOpen(false); setTeamForModalSelection(null); modalManuallyClosedRef.current = true;}}
          onConfirm={handlePlayerSelectionConfirm}
          teamName={teamForModalSelection === 'visitante' ? tempSetupData.nombreEquipoVisitante || 'Visitante' : tempSetupData.nombreEquipoLocal || 'Local'}
          allPlayersDB={jugadoresDB}
          initialSelectedIds={teamForModalSelection === 'visitante' ? selectedVisitantePlayers : selectedLocalPlayers}
          opposingTeamSelectedIds={teamForModalSelection === 'visitante' ? selectedLocalPlayers : selectedVisitantePlayers}
          opposingTeamName={teamForModalSelection === 'visitante' ? tempSetupData.nombreEquipoLocal || 'Local' : tempSetupData.nombreEquipoVisitante || 'Visitante'}
        />
      )}

      {isPositionSelectionModalOpen && playerForPositionModal && teamForPositionModal && (
        <PositionSelectionModal
          isOpen={isPositionSelectionModalOpen}
          onClose={() => {setIsPositionSelectionModalOpen(false); setPlayerForPositionModal(null); setTeamForPositionModal(null);}}
          onConfirm={handlePositionSelectionConfirm}
          currentPlayerName={playerForPositionModal.nombreJugador}
          currentPosition={playerForPositionModal.posicion}
          teamLineup={teamForPositionModal === 'visitante' ? (tempSetupData.lineupVisitante || []) : (tempSetupData.lineupLocal || [])}
          teamName={teamForPositionModal === 'visitante' ? (tempSetupData.nombreEquipoVisitante || 'Visitante') : (tempSetupData.nombreEquipoLocal || 'Local')}
        />
      )}

      <Modal isOpen={isPositionConflictModalOpen} onClose={handleClosePositionConflictModal} title="Conflicto de Posición">
        {positionConflictDetails && (
          <div className="space-y-4">
            <p>La posición <strong>{positionConflictDetails.targetPosition}</strong> ya está ocupada por <strong>{positionConflictDetails.existingPlayerInTargetPosition.nombreJugador}</strong>.</p>
            <p>¿Desea asignar a <strong>{positionConflictDetails.conflictingPlayer.nombreJugador}</strong> a la posición <strong>{positionConflictDetails.targetPosition}</strong>? Esto moverá a <strong>{positionConflictDetails.existingPlayerInTargetPosition.nombreJugador}</strong> a la Banca (BE).</p>
            <div className="flex justify-end space-x-2 pt-2">
              <Button variant="light" onClick={() => handleResolvePositionConflict(false)}>Cancelar</Button>
              <Button variant="warning" onClick={() => handleResolvePositionConflict(true)}>Confirmar y Mover a Banca</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={isPositionMissingModalOpen} onClose={() => setIsPositionMissingModalOpen(false)} title="Posiciones Faltantes">
          <div className="space-y-3">
              <p className="text-red-600 font-semibold">Los siguientes jugadores no tienen una posición asignada. Todos los jugadores activos deben tener una posición (excepto 'BE' - Banca).</p>
              {playersMissingPositionInfo.map(teamInfo => (
                  <div key={teamInfo.teamName}>
                      <h4 className="font-medium text-gray-700">{teamInfo.teamName}:</h4>
                      <ul className="list-disc list-inside text-sm text-gray-600 pl-4">
                          {teamInfo.players.map(playerName => <li key={playerName}>{playerName}</li>)}
                      </ul>
                  </div>
              ))}
              <div className="flex justify-end pt-3">
                  <Button variant="primary" onClick={() => setIsPositionMissingModalOpen(false)}>Entendido</Button>
              </div>
          </div>
      </Modal>

      <Modal isOpen={isFieldsMissingModalOpen} onClose={() => setIsFieldsMissingModalOpen(false)} title="Campos Obligatorios Faltantes">
          <div className="space-y-3">
              <p className="text-red-600 font-semibold">Por favor, complete los siguientes campos antes de continuar:</p>
              <ul className="list-disc list-inside text-sm text-gray-600 pl-4">
                  {missingFieldsList.map(field => <li key={field}>{field}</li>)}
              </ul>
              <div className="flex justify-end pt-3">
                  <Button variant="primary" onClick={() => setIsFieldsMissingModalOpen(false)}>Entendido</Button>
              </div>
          </div>
      </Modal>

    </div>
  );
};

export default ConfigurarPartidoPage;