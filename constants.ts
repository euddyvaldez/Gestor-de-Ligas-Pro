

import { PlayCategory, Jugada, Formato } from './types';

export const APP_CONFIG_KEY = 'baseballAppConfig';
export const JUGADORES_STORAGE_KEY = 'baseball_jugadores';
export const CODIGO_ACTUAL_JUGADORES_STORAGE_KEY = 'baseball_codigo_actual_jugadores';
export const EQUIPOS_STORAGE_KEY = 'baseball_equipos';
export const CODIGO_ACTUAL_EQUIPOS_STORAGE_KEY = 'baseball_codigo_actual_equipos';
export const JUGADAS_STORAGE_KEY = 'baseball_jugadas';
export const CODIGO_ACTUAL_JUGADAS_STORAGE_KEY = 'baseball_codigo_actual_jugadas';
export const FORMATOS_STORAGE_KEY = 'baseball_formatos';
export const CODIGO_ACTUAL_FORMATOS_STORAGE_KEY = 'baseball_codigo_actual_formatos';
export const PARTIDO_EN_CURSO_KEY = 'baseball_partido_en_curso';
export const HISTORIAL_JUEGOS_KEY = 'baseball_historial_juegos';

export const defaultJugadas: Omit<Jugada, 'codigo'>[] = [
  // Hits
  { jugada: 'H1', descripcion: 'Hit Sencillo', category: PlayCategory.HIT, isDefault: true, isActive: true },
  { jugada: 'H2', descripcion: 'Hit Doble', category: PlayCategory.HIT, isDefault: true, isActive: true },
  { jugada: 'H3', descripcion: 'Hit Triple', category: PlayCategory.HIT, isDefault: true, isActive: true },
  { jugada: 'HR', descripcion: 'Home Run', category: PlayCategory.HIT, isDefault: true, isActive: true },
  // Outs
  { jugada: 'K', descripcion: 'Ponche', category: PlayCategory.OUT, isDefault: true, isActive: true },
  { jugada: 'GO', descripcion: 'Ground Out', category: PlayCategory.OUT, isDefault: true, isActive: true },
  { jugada: 'FO', descripcion: 'Fly Out', category: PlayCategory.OUT, isDefault: true, isActive: true },
  { jugada: 'LO', descripcion: 'Line Out', category: PlayCategory.OUT, isDefault: true, isActive: true },
  { jugada: 'SF', descripcion: 'Sacrifice Fly', category: PlayCategory.OUT, isDefault: true, isActive: true },
  { jugada: 'SH', descripcion: 'Sacrifice Hit/Bunt', category: PlayCategory.OUT, isDefault: true, isActive: true },
  { jugada: 'CS', descripcion: 'Cogido Robando', category: PlayCategory.OUT, isDefault: true, isActive: true },
  { jugada: 'PK', descripcion: 'Pickoff', category: PlayCategory.OUT, isDefault: true, isActive: true },
  { jugada: 'DP', descripcion: 'Doble Play', category: PlayCategory.OUT, isDefault: true, isActive: true },
  { jugada: 'TP', descripcion: 'Triple Play', category: PlayCategory.OUT, isDefault: true, isActive: true },
  // On Base
  { jugada: 'BB', descripcion: 'Base por Bolas', category: PlayCategory.ON_BASE, isDefault: true, isActive: true },
  { jugada: 'IBB', descripcion: 'Base por Bolas Intencional', category: PlayCategory.ON_BASE, isDefault: true, isActive: true },
  { jugada: 'HBP', descripcion: 'Golpeado por Pitcher', category: PlayCategory.ON_BASE, isDefault: true, isActive: true },
  { jugada: 'FC', descripcion: 'Fielder\'s Choice', category: PlayCategory.ON_BASE, isDefault: true, isActive: true },
  { jugada: 'E', descripcion: 'Error (permite embasarse)', category: PlayCategory.ON_BASE, isDefault: true, isActive: true },
  // Advancement
  { jugada: 'SB', descripcion: 'Base Robada', category: PlayCategory.ADVANCEMENT, isDefault: true, isActive: true },
  { jugada: 'WP', descripcion: 'Wild Pitch', category: PlayCategory.ADVANCEMENT, isDefault: true, isActive: true },
  { jugada: 'PB', descripcion: 'Passed Ball', category: PlayCategory.ADVANCEMENT, isDefault: true, isActive: true },
  { jugada: 'ID', descripcion: 'Indiferencia Defensiva', category: PlayCategory.ADVANCEMENT, isDefault: true, isActive: true },
  { jugada: 'AE', descripcion: 'Avance por Error defensivo', category: PlayCategory.ADVANCEMENT, isDefault: true, isActive: true },
  { jugada: 'OB', descripcion: 'Obstrucción', category: PlayCategory.ADVANCEMENT, isDefault: false, isActive: true },
  { jugada: 'BK', descripcion: 'Balk', category: PlayCategory.ADVANCEMENT, isDefault: false, isActive: true },
  // Special & Scoring Related
  { jugada: 'R', descripcion: 'Carrera Anotada', category: PlayCategory.SPECIAL, isDefault: true, isActive: true },
  { jugada: 'RBI', descripcion: 'Carrera Impulsada', category: PlayCategory.SPECIAL, isDefault: true, isActive: true },
  { jugada: 'ED', descripcion: 'Error Defensivo', category: PlayCategory.SPECIAL, isDefault: true, isActive: true },
  // System/Manual Plays (not directly user-selectable in general play modal, but used by system for specific logs)
  { jugada: 'OUT_RUNNER_BASE', descripcion: 'Out Corredor en Base', category: PlayCategory.OUT, isDefault: false, isActive: true },
  { jugada: 'ADV_OTRO', descripcion: 'Avance Manual (Otro Motivo)', category: PlayCategory.ADVANCEMENT, isDefault: false, isActive: true },
];

export const defaultFormatos: Omit<Formato, 'codigo'>[] = [
  { descripcion: 'INTERLIGA', cantidadInning: 4, isDefault: true },
  { descripcion: 'INTERLIGA', cantidadInning: 5, isDefault: true },
  { descripcion: 'INTERLIGA', cantidadInning: 6, isDefault: true },
  { descripcion: 'FOGUEO', cantidadInning: 4, isDefault: true },
  { descripcion: 'FOGUEO', cantidadInning: 5, isDefault: true },
  { descripcion: 'FOGUEO', cantidadInning: 6, isDefault: true },
  { descripcion: 'FOGUEO', cantidadInning: 7, isDefault: true },
  { descripcion: 'TORNEO', cantidadInning: 7, isDefault: true },
];