
export interface Jugador {
  codigo: number;
  nombre: string;
  // chaqueta: string; // Removed as per user request
  numero: string;   // Can be an empty string if not set
  posicionPreferida: string; // Can be an empty string if not set
  alias?: string; // Optional alias
}

export interface Equipo {
  codigo: number;
  nombre: string;
  jugadoresIds: number[]; // Array of Jugador.codigo
}

export enum PlayCategory {
  HIT = 'Hit',
  OUT = 'Out',
  ON_BASE = 'OnBase',
  ADVANCEMENT = 'Advancement',
  SPECIAL = 'Special',
  PITCH_OUTCOME = 'PitchOutcome',
}

export interface Jugada {
  codigo: number;
  jugada: string; // Código corto
  descripcion: string;
  category: PlayCategory;
  isDefault: boolean;
  isActive: boolean;
}

export interface Formato {
  codigo: number;
  descripcion:string;
  cantidadInning: number;
  isDefault: boolean;
}

export interface PartidoConfig {
  defaultVisitanteTeamName: string;
  defaultLocalTeamName: string;
  defaultMaxInnings: number;
  showAdditionalDetailsDefault: boolean;
  defaultCantidadPlayerMax: number;
  appTitle: string;
}

export interface BatterStats {
  atBats: number;
  plateAppearances: number; // Nueva propiedad para Apariciones al Plato (AP)
  hits: number; // Total hits
  runs: number;
  rbi: number;
  walks: number;
  strikeouts: number;
  homeRuns: number;
  singles: number; // H1
  doubles: number; // H2
  triples: number; // H3
}

export interface PlayInInningCell {
  playInstanceId: string; // uuid, maps to RegistroJuego.id
  jugadaId: string; // ref a Jugada.jugada (código corto)
  descripcion: string; // descripción de la jugada en ese momento (from RegistroJuego.descripcion)
  playDisplayValue: string; // Short display value like "H1", "K", "BB+RBI"
}

export interface LineupPlayer {
  id: string; // uuid. This is unique for this player *in this game's lineup*, distinct from Jugador.codigo
  ordenBate: number;
  jugadorId: number; // ref a Jugador.codigo
  nombreJugador: string;
  posicion: string; // e.g., 'P', 'C', '1B', 'DH', '' for empty/placeholder
  innings: { [inningNum: number]: PlayInInningCell[] };
  stats: BatterStats;
}

export interface PlayerOnBase {
  lineupPlayerId: string;
  jugadorId: number; // from Jugador.codigo for easy lookup
  nombreJugador: string; // for display
  reachedOnJugadaId?: string; // jugadaId of how they got to first initially in this sequence of reaching base
}

export interface LastPlayContext {
  batterLineupPlayerId: string | null; // ID of the LineupPlayer who was the batter
  jugada: Jugada | null;          // The Jugada object for the play
  timestamp: number;              // When the play occurred, for recency checks
  previousBatterLineupPlayerId?: string | null; // ID of the LineupPlayer who was the batter *before* the current one in lastPlayContext
}


export interface GameStatus {
  currentHalfInning: 'Top' | 'Bottom';
  actualInningNumber: number;
  outs: number;
  bases: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null]; // [1B, 2B, 3B] - stores info of player on base
  currentBatterLineupPlayerId: string | null; // ID of the LineupPlayer currently at bat
  nextVisitorBatterLineupPlayerId: string | null; // Tracks next batter for Visitor team
  nextLocalBatterLineupPlayerId: string | null;   // Tracks next batter for Local team
  lastPlayContext: LastPlayContext | null; // Context of the last significant offensive play
}

export interface TeamStats {
  hits: number;
  errors: number; // Note: Errors are typically subjective, consider how to track
  homeRuns: number;
  strikeOutsByBatters: number;
  walksReceived: number;
  leftOnBase: number; // Calculated at end of inning half
  runsPerInning: { [inning: number]: number };
  totalRuns: number;
}

// Enum for Runner Advancement Reasons
export enum RunnerAdvancementReason {
  STOLEN_BASE = 'SB', // Base Robada
  WILD_PITCH = 'WP',   // Wild Pitch
  PASSED_BALL = 'PB',  // Passed Ball
  DEFENSIVE_INDIFFERENCE = 'DI', // Indiferencia Defensiva
  ERROR_ADVANCE = 'EA', // Avance por Error (no anota carrera)
  OTHER = 'OTRO' // Otro motivo no especificado
}

export interface RegistroJuego {
  id: string; // uuid
  timestamp: number;
  inning: number;
  halfInning: 'Top' | 'Bottom';
  bateadorId: string; // LineupPlayer.id
  bateadorNombre: string; // Name of the batter at the time of play
  bateadorPosicion: string; // Position of the batter at the time of play
  pitcherResponsableId: string | null; // LineupPlayer.id of the opposing pitcher
  pitcherResponsableNombre: string | null; // Name of the opposing pitcher
  equipoBateadorNombre: string; // Name of the team at bat
  jugadaId: string; // Jugada.jugada (código corto)
  descripcion: string; // Descripción de la jugada
  outsPrev: number;
  outsAfter: number;
  basesPrevState: string; // e.g., "011" for runners on 2B, 3B (1B empty) - simple representation of who was where
  basesAfterState: string; // e.g., "100" for runner on 1B
  runScored: number; // Runs scored AS A DIRECT RESULT of this single play event (e.g., HR, bases loaded walk)
  rbi: number; // RBIs credited to the BATER for this single play event
  advancementReason?: RunnerAdvancementReason | string; // For manual advancements
  isUndoMarker?: boolean; // Optional marker for undo actions in the log

  // New fields for detailed game log context
  fechaDelPartido: string;
  formatoDelPartidoDesc: string;
  numeroDelPartido: string;
  ordenDelBateador: number;
}

export interface PartidoData {
  idJuego: string | null; // uuid, null if new and not saved yet
  fecha: string; // YYYY-MM-DD
  formatoJuegoId: number; // ref to Formato.codigo
  numeroJuego: string;
  
  nombreEquipoVisitante: string;
  nombreEquipoLocal: string;
  selectedEquipoVisitanteId?: number | null; // ID of selected Equipo
  selectedEquipoLocalId?: number | null;   // ID of selected Equipo
  
  lineupVisitante: LineupPlayer[];
  lineupLocal: LineupPlayer[];
  
  maxInnings: number; // from formato or custom
  currentInningVisualized: number; // for UI navigation, distinct from actualInningNumber
  
  gameStatus: GameStatus;
  
  visitanteStats: TeamStats;
  localStats: TeamStats;
  
  registrosJuego: RegistroJuego[];

  // uiState: any; // for controlling modals, tabs, setup phase etc. Might be local to PartidosPage
}

export interface JuegoGuardado extends PartidoData {
  idJuego: string; // Must have an ID when saved
  timestampGuardado: number;
}

export const EMPTY_POSICION_PLACEHOLDER = ''; // Used for storing empty position
export const EMPTY_POSICION_LABEL = '--'; // Used for displaying empty position

export const POSICIONES = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'BE']; // Bench

// For use in Select components where a distinct placeholder option is needed
export const POSICIONES_FOR_SELECT = [
    { value: EMPTY_POSICION_PLACEHOLDER, label: EMPTY_POSICION_LABEL }, 
    ...POSICIONES.map(p => ({ value: p, label: p }))
];


export interface AppGlobalConfig extends PartidoConfig {
  appTitle: string;
}

export const DEFAULT_APP_TITLE = "Gestor de Ligas Pro";

export const DEFAULT_GLOBAL_CONFIG: AppGlobalConfig = {
  appTitle: DEFAULT_APP_TITLE,
  defaultVisitanteTeamName: 'Visitante',
  defaultLocalTeamName: 'Local',
  defaultMaxInnings: 7,
  showAdditionalDetailsDefault: false,
  defaultCantidadPlayerMax: 12, // This will be ignored in PartidosPage for player selection count
};

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  contentClassName?: string;
  hideCloseButton?: boolean; // Added prop to optionally hide default close button
}

// For DoublePlayOutSelectionModal
export interface PlayerInfoForOutSelection {
  id: string; // LineupPlayer.id
  name: string;
  isOnBase: boolean; // true if runner, false if batter
  baseNumber?: 1 | 2 | 3; // if runner
}

export interface AssignRbiModalState {
  isOpen: boolean;
  scoringPlayerInfo: PlayerOnBase | null;
  batterForRbiContext: LineupPlayer | null;
  previousBatterForRbiContext: LineupPlayer | null;
  // onConfirm is part of the component's props, not direct state
  baseIndexOfScorer?: 0 | 1 | 2; // Store the original base index of the scorer
}

// For RunnerAdvancementAfterHitModal and RunnerAdvancementAfterErrorModal
export interface RunnerAdvancementInfo extends PlayerOnBase {
  currentBase: 1 | 2 | 3; // The base the runner was on AT THE TIME OF THE HIT/ERROR
}

export interface RunnerAdvancementAfterHitModalState {
  isOpen: boolean;
  batter: LineupPlayer | null;
  hitType: 'H1' | 'H2' | 'H3' | 'HR' | null;
  batterReachedBase: 1 | 2 | 3 | 4; // 1: 1B, 2: 2B, 3: 3B, 4: HOME
  runnersOnBase: RunnerAdvancementInfo[];
  // Store chosen new base for each runner (1-3 for bases, 4 for HOME, 0 for OUT)
  advancements: { [lineupPlayerId: string]: number };
}

// For RunnerAdvancementAfterSacrificeModal
export interface RunnerAdvancementAfterSacrificeModalState {
  isOpen: boolean;
  batter: LineupPlayer | null;
  sacrificeType: 'SF' | 'SH' | null;
  runnersOnBase: RunnerAdvancementInfo[]; // Re-use RunnerAdvancementInfo
  // Store chosen new base for each runner (1-3 for bases, 4 for HOME, 0 for OUT)
  advancements: { [lineupPlayerId: string]: number };
  initialOuts: number; // Outs before this sacrifice play began
}

// For RunnerAdvancementAfterErrorModal
export interface RunnerAdvancementAfterErrorModalState {
  isOpen: boolean;
  batterWhoReachedOnError: LineupPlayer | null; // The batter involved in the error play
  batterFinalDestBaseOnError: 0 | 1 | 2 | 3; // Base batter reached (0=1B, 1=2B, etc., 3=HOME)
  runnersOnBaseAtTimeOfError: RunnerAdvancementInfo[];
  fielderWhoCommittedError: number | null; // Jugador.codigo of the fielder, or null for team error
  // Store chosen new base for each runner (1-3 for bases, 4 for HOME, 0 for OUT)
  advancements: { [lineupPlayerId: string]: number };
}

// For FielderChoiceOutcomeModal
export interface FielderChoiceModalState {
  isOpen: boolean;
  batter: LineupPlayer | null;
  runnersOnBase: RunnerAdvancementInfo[]; // Runners on base at the time of the FC
  initialOuts: number; // Outs before this FC play began
  // Propagated from PartidosPage to FielderChoiceOutcomeModal
  // These will be managed internally by the modal and then passed back up
}

export interface FielderChoiceResult {
  batterAdvancement: number; // Batter's final destination (0=OUT, 1=1B, 2=2B, 3=3B, 4=HOME)
  runnerAdvancements: { [lineupPlayerId: string]: number }; // RunnerId -> final destination (0-4)
  primaryOutPlayerId: string | null; // ID of the player selected as out from the dropdown (can be batter or a runner)
}


// For PartidosPage.tsx to pass to ErrorAdvancementModal
export interface ErrorModalContext {
    batterLineupPlayer: LineupPlayer;
    initialBasesBeforePlay: [PlayerOnBase | null, PlayerOnBase | null, PlayerOnBase | null];
}
