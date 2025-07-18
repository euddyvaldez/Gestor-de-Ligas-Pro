


import { LineupPlayer, BatterStats, GameStatus, PartidoData, AppGlobalConfig, Formato, EMPTY_POSICION_PLACEHOLDER, TeamStats } from '../types';

export const createEmptyBatterStats = (): BatterStats => ({ 
  atBats: 0, 
  plateAppearances: 0, // Inicializar AP
  hits: 0, 
  runs: 0, 
  rbi: 0, 
  walks: 0, 
  strikeouts: 0, 
  homeRuns: 0,
  singles: 0, // H1
  doubles: 0, // H2
  triples: 0, // H3
});

export const createEmptyGameStatus = (): GameStatus => ({ 
  currentHalfInning: 'Top', 
  actualInningNumber: 1, 
  outs: 0, 
  bases: [null, null, null], 
  currentBatterLineupPlayerId: null,
  nextVisitorBatterLineupPlayerId: null,
  nextLocalBatterLineupPlayerId: null,
  lastPlayContext: null,
});

export const initialPartidoData = (config: AppGlobalConfig, selectedFormato?: Formato): Omit<PartidoData, 'idJuego' | 'lineupVisitante' | 'lineupLocal' | 'visitanteStats' | 'localStats' | 'registrosJuego' | 'gameStatus'> & { gameStatus: GameStatus, lineupVisitante: LineupPlayer[], lineupLocal: LineupPlayer[], visitanteStats: ReturnType<typeof createEmptyTeamStats>, localStats: ReturnType<typeof createEmptyTeamStats>, registrosJuego: [] } => ({
  fecha: '',
  formatoJuegoId: selectedFormato?.codigo || 0,
  numeroJuego: '', 
  nombreEquipoVisitante: config.defaultVisitanteTeamName,
  nombreEquipoLocal: config.defaultLocalTeamName,
  selectedEquipoVisitanteId: null,
  selectedEquipoLocalId: null,
  lineupVisitante: [], // Initialized as empty
  lineupLocal: [],   // Initialized as empty
  maxInnings: selectedFormato?.cantidadInning || config.defaultMaxInnings,
  currentInningVisualized: 1,
  gameStatus: createEmptyGameStatus(),
  visitanteStats: createEmptyTeamStats(), // Initialized
  localStats: createEmptyTeamStats(),     // Initialized
  registrosJuego: [],                   // Initialized
});

export const createEmptyTeamStats = (): TeamStats => ({ hits: 0, errors: 0, homeRuns: 0, strikeOutsByBatters: 0, walksReceived: 0, leftOnBase: 0, runsPerInning: {}, totalRuns: 0 });


export const findNextBatterInLineup = (lineup: LineupPlayer[], basePlayerLineupId: string | null): string | null => {
  const sortedLineup = [...lineup].sort((a, b) => a.ordenBate - b.ordenBate);
  const activePlayers = sortedLineup.filter(p => p.posicion !== 'BE' && p.posicion !== EMPTY_POSICION_PLACEHOLDER);

  if (activePlayers.length === 0) return null;

  if (!basePlayerLineupId) { 
    return activePlayers[0].id; 
  }

  const basePlayerIndexInSortedFullLineup = sortedLineup.findIndex(p => p.id === basePlayerLineupId);

  if (basePlayerIndexInSortedFullLineup === -1) {
    return activePlayers[0].id; // Fallback if basePlayerLineupId is not found
  }
  
  for (let i = 1; i <= sortedLineup.length; i++) {
    const potentialNextPlayerIndex = (basePlayerIndexInSortedFullLineup + i) % sortedLineup.length;
    const potentialNextPlayer = sortedLineup[potentialNextPlayerIndex];
    
    if (activePlayers.some(ap => ap.id === potentialNextPlayer.id)) {
      return potentialNextPlayer.id; 
    }
  }
  return activePlayers.length > 0 ? activePlayers[0].id : null;
};

interface RecalculateResult {
  updatedLineup: LineupPlayer[];
  newNextBatterForThisTeamId: string | null;
}

export const recalculateLineupOrder = (
  lineupAfterChange: LineupPlayer[], 
  originalNextBatterId: string | null, // ID of the player who was "next up" for this team BEFORE this change
  idOfPlayerSubstitutedOut?: string | null, 
  idOfPlayerSubstitutedIn?: string | null   
): RecalculateResult => {
    let orderCounter = 1;
    
    const processingLineup = [...lineupAfterChange];

    // Get active players and sort them by their existing batting order to maintain it.
    const activePlayers = processingLineup
        .filter(p => p.posicion !== 'BE' && p.posicion !== EMPTY_POSICION_PLACEHOLDER)
        .sort((a, b) => a.ordenBate - b.ordenBate);
    
    const activePlayersProcessed = activePlayers.map(p => ({ ...p, ordenBate: orderCounter++ }));
    
    // Get bench players and sort them by their existing batting order to maintain stability.
    const benchPlayers = processingLineup
        .filter(p => p.posicion === 'BE' || p.posicion === EMPTY_POSICION_PLACEHOLDER)
        .sort((a, b) => a.ordenBate - b.ordenBate);
        
    const benchPlayersProcessed = benchPlayers.map(p => ({ ...p, ordenBate: orderCounter++ }));

    const newSortedLineup = [...activePlayersProcessed, ...benchPlayersProcessed];

    let baseIdForNextBatterSearch = originalNextBatterId;

    if (idOfPlayerSubstitutedOut && originalNextBatterId === idOfPlayerSubstitutedOut) {
        baseIdForNextBatterSearch = idOfPlayerSubstitutedIn;
    }
    
    const finalNextBatterId = findNextBatterInLineup(newSortedLineup, baseIdForNextBatterSearch);
      
    return {
        updatedLineup: newSortedLineup,
        newNextBatterForThisTeamId: finalNextBatterId,
    };
};

export const updateBattingOrderFromArrayOrder = (lineup: LineupPlayer[]): LineupPlayer[] => {
    let activePlayerOrder = 1;
    const activePlayers: LineupPlayer[] = [];
    const benchPlayers: LineupPlayer[] = [];

    // The order of the `lineup` parameter is the desired new order from the UI.
    lineup.forEach(player => {
        if (player.posicion !== 'BE' && player.posicion !== EMPTY_POSICION_PLACEHOLDER) {
            activePlayers.push(player);
        } else {
            benchPlayers.push(player);
        }
    });

    const updatedActivePlayers = activePlayers.map(player => ({
        ...player,
        ordenBate: activePlayerOrder++,
    }));

    const updatedBenchPlayers = benchPlayers.map(player => ({
        ...player,
        ordenBate: activePlayerOrder++,
    }));
    
    return [...updatedActivePlayers, ...updatedBenchPlayers];
};