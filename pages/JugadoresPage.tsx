
import React, { useState, useMemo, useCallback, useRef, ChangeEvent } from 'react';
import Papa from 'papaparse';
import { Jugador, POSICIONES, Equipo } from '../types'; // Added Equipo
import { 
    JUGADORES_STORAGE_KEY, 
    CODIGO_ACTUAL_JUGADORES_STORAGE_KEY,
    EQUIPOS_STORAGE_KEY, // Added
    CODIGO_ACTUAL_EQUIPOS_STORAGE_KEY // Added
} from '../constants';
import useLocalStorage from '../hooks/useLocalStorage';
import { getNextCodigo } from '../utils/idGenerator';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Table, { TableColumn } from '../components/ui/Table';
import IconButton, { EditIcon, SaveIcon, CancelIcon, DeleteIcon } from '../components/ui/IconButton'; // Added DeleteIcon
import { MdDeleteForever as PlayerDeleteIcon } from 'react-icons/md'; // Aliased for clarity
import ConfirmationModal from '../components/ui/ConfirmationModal'; 

// Define the type for data passed to the Table
type JugadorConId = Jugador & { id: number; equipoNombre?: string };
type EquipoConId = Equipo & { id: number }; // For team table

type SortableJugadorFields = 'codigo' | 'nombre' | 'numero' | 'posicionPreferida' | 'alias' | 'equipoNombre';

// Helper for random data
const getRandomElement = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const getRandomString = (length: number): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

const randomNombres = ['Carlos', 'Ana', 'Luis', 'Sofia', 'Juan', 'Maria', 'Pedro', 'Laura', 'David', 'Elena'];
const randomApellidos = ['García', 'Rodríguez', 'Martínez', 'Hernández', 'López', 'González', 'Pérez', 'Sánchez', 'Romero', 'Torres'];
const randomAliasPrefs = ['El Titan', 'La Muralla', 'El Cohete', 'Silencioso', 'Capitan', 'Mago', 'Rayo'];


const generateRandomJugadorData = (): Omit<Jugador, 'codigo'> => {
  const nombre = `${getRandomElement(randomNombres)} ${getRandomElement(randomApellidos)}`;
  const numero = String(Math.floor(Math.random() * 99) + 1);
  const posicionPreferida = getRandomElement(POSICIONES); 
  const alias = Math.random() > 0.4 ? `${getRandomElement(randomAliasPrefs)} ${getRandomString(1)}` : ''; 
  
  return { nombre, numero, posicionPreferida, alias };
};


const JugadoresPage: React.FC = () => {
  // Player State
  const [jugadores, setJugadores] = useLocalStorage<Jugador[]>(JUGADORES_STORAGE_KEY, []);
  const [newNombre, setNewNombre] = useState('');
  const [newNumero, setNewNumero] = useState('');
  const [newPosicion, setNewPosicion] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingJugador, setEditingJugador] = useState<Jugador | null>(null);
  const [editFormState, setEditFormState] = useState<Jugador | null>(null);
  const [searchTermJugador, setSearchTermJugador] = useState('');
  const [filterPosicion, setFilterPosicion] = useState(''); 
  const [sortFieldJugador, setSortFieldJugador] = useState<SortableJugadorFields>('nombre');
  const [sortOrderJugador, setSortOrderJugador] = useState<'asc' | 'desc'>('asc');
  const [isPlayerListExpanded, setIsPlayerListExpanded] = useState(true);
  const [isConfirmDeleteModalOpen, setIsConfirmDeleteModalOpen] = useState(false);
  const [playerToDelete, setPlayerToDelete] = useState<Jugador | null>(null);
  const [isConfirmImportModalOpen, setIsConfirmImportModalOpen] = useState(false);
  const [playersToImport, setPlayersToImport] = useState<Jugador[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Team State (Integrated from EquiposPage)
  const [equipos, setEquipos] = useLocalStorage<Equipo[]>(EQUIPOS_STORAGE_KEY, []);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Equipo | null>(null);
  const [teamNameInput, setTeamNameInput] = useState('');
  const [selectedPlayerIdsForTeam, setSelectedPlayerIdsForTeam] = useState<Set<number>>(new Set());
  const [isConfirmDeleteTeamModalOpen, setIsConfirmDeleteTeamModalOpen] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<Equipo | null>(null);
  const [searchTermEquipo, setSearchTermEquipo] = useState('');
  const [isTeamListExpanded, setIsTeamListExpanded] = useState(true);


  // --- Player Management Functions ---
  const handleClearNewPlayerForm = () => {
    setNewNombre('');
    setNewNumero('');
    setNewPosicion('');
    setNewAlias('');
  };

  const handleAddJugador = () => {
    let nuevoJugadorData: Omit<Jugador, 'codigo'>;
    if (!newNombre.trim()) { 
      let randomData = generateRandomJugadorData();
      while (jugadores.some(j => j.nombre.toLowerCase() === randomData.nombre.toLowerCase())) {
        randomData = generateRandomJugadorData();
      }
      nuevoJugadorData = randomData;
    } else {
      if (jugadores.some(j => j.nombre.toLowerCase() === newNombre.trim().toLowerCase())) {
          alert('Un jugador con este nombre ya existe. El nombre debe ser único.');
          return; 
      }
      nuevoJugadorData = {
        nombre: newNombre.trim(),
        numero: newNumero.trim(),
        posicionPreferida: newPosicion,
        alias: newAlias.trim(),
      };
    }
    const nuevo: Jugador = {
      codigo: getNextCodigo(CODIGO_ACTUAL_JUGADORES_STORAGE_KEY),
      ...nuevoJugadorData
    };
    setJugadores(prev => [...prev, nuevo]);
    handleClearNewPlayerForm();
  };

  const handleEditJugador = (jugador: Jugador) => {
    setEditingJugador(jugador);
    setEditFormState({...jugador}); 
    setIsEditModalOpen(true);
  };

  const handleEditModalInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (editFormState) {
      setEditFormState({ ...editFormState, [name]: value });
    }
  };
  
  const validateEditedJugador = (jugadorToValidate: Jugador): boolean => {
    if (!jugadorToValidate.nombre.trim()) {
      alert('El nombre es obligatorio.');
      return false;
    }
    const duplicateName = jugadores.find(
      j => j.codigo !== jugadorToValidate.codigo && 
           j.nombre.toLowerCase() === jugadorToValidate.nombre.toLowerCase()
    );
    if (duplicateName) {
      alert('Ya existe otro jugador con el mismo nombre. El nombre debe ser único.');
      return false;
    }
    return true;
  };

  const handleSaveEdit = () => {
    if (editFormState && validateEditedJugador(editFormState)) {
      setJugadores(prevJugadores => prevJugadores.map(j => j.codigo === editFormState.codigo ? editFormState : j));
      setEditingJugador(null);
      setEditFormState(null);
      setIsEditModalOpen(false);
    }
  };

  const requestDeleteJugador = (jugador: Jugador) => {
    setPlayerToDelete(jugador);
    setIsConfirmDeleteModalOpen(true);
  };

  const confirmDeleteJugador = () => {
    if (playerToDelete) {
      // Remove player from all teams as well
      setEquipos(prevEquipos => 
        prevEquipos.map(equipo => ({
          ...equipo,
          jugadoresIds: equipo.jugadoresIds.filter(id => id !== playerToDelete.codigo)
        }))
      );
      setJugadores(prevJugadores => prevJugadores.filter(j => j.codigo !== playerToDelete.codigo));
    }
    setPlayerToDelete(null);
    setIsConfirmDeleteModalOpen(false);
  };
  
  const getEquipoNombreForJugador = useCallback((jugadorId: number): string | undefined => {
    const equipo = equipos.find(e => e.jugadoresIds.includes(jugadorId));
    return equipo?.nombre;
  }, [equipos]);

  const processedJugadores = useMemo(() => {
    let list = [...jugadores];
    if (searchTermJugador.trim()) {
      const lowerSearchTerm = searchTermJugador.toLowerCase();
      list = list.filter(j =>
        Object.values(j).some(val => String(val).toLowerCase().includes(lowerSearchTerm)) ||
        getEquipoNombreForJugador(j.codigo)?.toLowerCase().includes(lowerSearchTerm)
      );
    }
    if (filterPosicion) {
      list = list.filter(j => j.posicionPreferida === filterPosicion);
    }
    if (sortFieldJugador) {
      list.sort((a, b) => {
        let valA : string | number | undefined = a[sortFieldJugador as keyof Jugador] || '';
        let valB : string | number | undefined = b[sortFieldJugador as keyof Jugador] || '';

        if (sortFieldJugador === 'equipoNombre') {
            valA = getEquipoNombreForJugador(a.codigo) || '';
            valB = getEquipoNombreForJugador(b.codigo) || '';
        }
        
        let comparison = 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
          comparison = valA - valB;
        } else if (typeof valA === 'string' && typeof valB === 'string') {
          comparison = valA.localeCompare(valB);
        }
        return sortOrderJugador === 'asc' ? comparison : -comparison;
      });
    }
    return list.map(j => ({...j, id: j.codigo, equipoNombre: getEquipoNombreForJugador(j.codigo)}));
  }, [jugadores, equipos, searchTermJugador, filterPosicion, sortFieldJugador, sortOrderJugador, getEquipoNombreForJugador]);

  const toggleSortOrderJugador = () => {
    setSortOrderJugador(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  const handleExportJugadoresCSV = () => {
    if (jugadores.length === 0) {
      alert("No hay jugadores para exportar.");
      return;
    }
    const csvHeaders = ["codigo", "nombre", "numero", "posicionPreferida", "alias", "equipo"];
    const csvData = processedJugadores.map(j => ({
        codigo: j.codigo,
        nombre: `"${j.nombre.replace(/"/g, '""')}"`,
        numero: j.numero,
        posicionPreferida: j.posicionPreferida,
        alias: j.alias ? `"${j.alias.replace(/"/g, '""')}"` : '',
        equipo: j.equipoNombre || ''
    }));

    const csvString = Papa.unparse({ fields: csvHeaders, data: csvData.map(j => csvHeaders.map(header => j[header as keyof typeof j])) });
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "jugadores_con_equipos.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportJugadoresClick = () => {
    fileInputRef.current?.click();
  };

  const handleJugadoresFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      Papa.parse<any>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const expectedHeaders = ["codigo", "nombre", "numero", "posicionPreferida", "alias"]; // "equipo" is optional for import
          const actualHeaders = results.meta.fields || [];
          const missingRequiredHeaders = ["codigo", "nombre"].filter(h => !actualHeaders.includes(h));
          
          if (missingRequiredHeaders.length > 0) {
             alert(`El archivo CSV no tiene las cabeceras requeridas. Faltan: ${missingRequiredHeaders.join(', ')}.`);
            if(fileInputRef.current) fileInputRef.current.value = "";
            return;
          }

          try {
            const imported: Jugador[] = results.data.map((row, index) => {
              if (!row.nombre || !row.codigo) {
                throw new Error(`Fila ${index + 2}: Faltan 'codigo' o 'nombre'.`);
              }
              const importedJugador: Jugador = {
                codigo: parseInt(row.codigo, 10),
                nombre: String(row.nombre).trim(),
                numero: String(row.numero || '').trim(),
                posicionPreferida: String(row.posicionPreferida || '').trim(),
                alias: String(row.alias || '').trim(),
              };
              // Note: Team assignment from CSV is not handled in this import for simplicity.
              // Users would need to assign teams manually after import if team column was present.
              return importedJugador;
            });

            const uniqueImported = imported.filter((value, index, self) =>
              index === self.findIndex((t) => (
                t.codigo === value.codigo || t.nombre.toLowerCase() === value.nombre.toLowerCase()
              ))
            );
            
            setPlayersToImport(uniqueImported);
            setIsConfirmImportModalOpen(true);
          } catch (error: any) {
            alert(`Error procesando el archivo CSV: ${error.message}`);
          }
        },
        error: (error: any) => {
          alert(`Error al parsear el archivo CSV: ${error.message}`);
        }
      });
      if(fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const confirmImportJugadores = () => {
    setJugadores(playersToImport);
    // When importing players, they are unassigned from teams. Any existing team assignments are cleared.
    setEquipos(prevEquipos => prevEquipos.map(e => ({...e, jugadoresIds: []}))); 
    const maxImportedCodigo = playersToImport.reduce((max, p) => Math.max(max, p.codigo), 0);
    localStorage.setItem(CODIGO_ACTUAL_JUGADORES_STORAGE_KEY, String(maxImportedCodigo));
    alert(`${playersToImport.length} jugadores importados exitosamente, reemplazando la lista actual. Las asignaciones a equipos han sido reseteadas.`);
    setPlayersToImport([]);
    setIsConfirmImportModalOpen(false);
  };

  const columnsJugadores: TableColumn<JugadorConId>[] = [
    { header: 'Código', accessor: 'codigo', className: "w-20" },
    { header: 'Nombre', accessor: 'nombre' },
    { header: 'Alias', accessor: 'alias' },
    { header: 'Equipo', accessor: 'equipoNombre', className: "w-32" },
    { header: 'Número', accessor: 'numero', className: "w-20" },
    { header: 'Pos. Pref.', accessor: 'posicionPreferida', className: "w-24" },
    {
      header: 'Acciones',
      accessor: (item: JugadorConId) => (
        <div className="space-x-1 flex items-center justify-center">
          <IconButton icon={<EditIcon />} onClick={() => handleEditJugador(item)} label={`Editar ${item.nombre}`} className="text-blue-500 hover:text-blue-700" />
          <IconButton icon={<PlayerDeleteIcon className="w-5 h-5" />} onClick={() => requestDeleteJugador(item)} label={`Eliminar ${item.nombre}`} className="text-red-500 hover:text-red-700" />
        </div>
      ),
      className: "w-24 text-center" 
    }
  ];

  const posicionOptions = [{value: '', label: '-- Seleccionar Posición (Opcional) --'}, ...POSICIONES.map(p => ({ value: p, label: p }))];
  const filterPosicionOptions = [{value: '', label: 'Todas las Posiciones'}, ...POSICIONES.map(p => ({ value: p, label: p }))];
  
  const sortFieldOptionsJugador: {value: SortableJugadorFields, label: string}[] = [
    { value: 'nombre', label: 'Nombre' },
    { value: 'alias', label: 'Alias' },
    { value: 'equipoNombre', label: 'Equipo' },
    { value: 'numero', label: 'Número' },
    { value: 'codigo', label: 'Código' },
    { value: 'posicionPreferida', label: 'Pos. Preferida' },
  ];

  // --- Team Management Functions (Integrated) ---
  const allJugadoresEnOtrosEquipos = useMemo(() => {
    const ids = new Set<number>();
    equipos.forEach(team => {
      if (editingTeam && team.codigo === editingTeam.codigo) {
        return; 
      }
      team.jugadoresIds.forEach(id => ids.add(id));
    });
    return ids;
  }, [equipos, editingTeam]);

  const getTeamNameForPlayerModal = (jugadorId: number): string | null => {
    const team = equipos.find(t => t.jugadoresIds.includes(jugadorId) && (!editingTeam || t.codigo !== editingTeam.codigo));
    return team ? team.nombre : null;
  };
  
  const handleOpenTeamModal = (equipo: Equipo | null = null) => {
    if (equipo) {
      setEditingTeam(equipo);
      setTeamNameInput(equipo.nombre);
      setSelectedPlayerIdsForTeam(new Set(equipo.jugadoresIds));
    } else {
      setEditingTeam(null);
      setTeamNameInput('');
      setSelectedPlayerIdsForTeam(new Set());
    }
    setIsTeamModalOpen(true);
  };

  const handleCloseTeamModal = () => {
    setIsTeamModalOpen(false);
    setEditingTeam(null);
    setTeamNameInput('');
    setSelectedPlayerIdsForTeam(new Set());
  };

  const handleTogglePlayerSelectionForTeam = (jugadorId: number) => {
    if (allJugadoresEnOtrosEquipos.has(jugadorId) && !(editingTeam && editingTeam.jugadoresIds.includes(jugadorId))) {
      alert(`El jugador ya pertenece al equipo: ${getTeamNameForPlayerModal(jugadorId)}. No se puede agregar a otro equipo.`);
      return;
    }
    setSelectedPlayerIdsForTeam(prev => {
      const newSet = new Set(prev);
      if (newSet.has(jugadorId)) {
        newSet.delete(jugadorId);
      } else {
        newSet.add(jugadorId);
      }
      return newSet;
    });
  };

  const handleSaveTeam = () => {
    if (!teamNameInput.trim()) {
      alert('El nombre del equipo es obligatorio.');
      return;
    }
    const nombreExistente = equipos.find(e => e.nombre.toLowerCase() === teamNameInput.trim().toLowerCase() && e.codigo !== editingTeam?.codigo);
    if (nombreExistente) {
        alert('Ya existe un equipo con este nombre.');
        return;
    }

    if (editingTeam) {
      setEquipos(prev => prev.map(e => e.codigo === editingTeam.codigo ? { ...e, nombre: teamNameInput.trim(), jugadoresIds: Array.from(selectedPlayerIdsForTeam) } : e));
    } else {
      const nuevoEquipo: Equipo = {
        codigo: getNextCodigo(CODIGO_ACTUAL_EQUIPOS_STORAGE_KEY),
        nombre: teamNameInput.trim(),
        jugadoresIds: Array.from(selectedPlayerIdsForTeam),
      };
      setEquipos(prev => [...prev, nuevoEquipo]);
    }
    handleCloseTeamModal();
  };

  const requestDeleteTeam = (equipo: Equipo) => {
    setTeamToDelete(equipo);
    setIsConfirmDeleteTeamModalOpen(true);
  };

  const confirmDeleteTeam = () => {
    if (teamToDelete) {
      setEquipos(prev => prev.filter(e => e.codigo !== teamToDelete.codigo));
    }
    setTeamToDelete(null);
    setIsConfirmDeleteTeamModalOpen(false);
  };

  const filteredEquipos = useMemo(() => {
    return equipos.filter(equipo => 
      equipo.nombre.toLowerCase().includes(searchTermEquipo.toLowerCase())
    ).map(e => ({...e, id: e.codigo}));
  }, [equipos, searchTermEquipo]);

  const columnsEquipos: TableColumn<EquipoConId>[] = [
    { header: 'Nombre del Equipo', accessor: 'nombre' },
    { 
      header: 'Nº Jugadores', 
      accessor: item => item.jugadoresIds.length,
      className: "w-32 text-center"
    },
    {
      header: 'Jugadores',
      accessor: (item: EquipoConId) => {
        const teamPlayers = item.jugadoresIds.map(id => jugadores.find(j => j.codigo === id)?.nombre || 'Desconocido').join(', ');
        return <span className="text-xs truncate block max-w-xs" title={teamPlayers}>{teamPlayers || 'Sin jugadores'}</span>;
      },
      className: "max-w-xs"
    },
    {
      header: 'Acciones',
      accessor: (item: EquipoConId) => (
        <div className="space-x-2 flex items-center justify-center">
          <IconButton icon={<EditIcon />} onClick={() => handleOpenTeamModal(item)} label={`Editar ${item.nombre}`} className="text-blue-500 hover:text-blue-700" />
          <IconButton icon={<DeleteIcon />} onClick={() => requestDeleteTeam(item)} label={`Eliminar ${item.nombre}`} className="text-red-500 hover:text-red-700" />
        </div>
      ),
      className: "w-32 text-center"
    }
  ];

  return (
    <div className="space-y-8">
      {/* Player Management Section */}
      <div className="p-6 bg-white dark:bg-gray-800 shadow-md rounded-lg">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700 dark:text-gray-200">Añadir Nuevo Jugador</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Si deja el nombre vacío y hace clic en "Añadir Jugador", se generará un jugador con datos aleatorios. El nombre del jugador debe ser único.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <Input label="Nombre del Jugador" placeholder="Nombre (o dejar vacío para aleatorio)" value={newNombre} onChange={e => setNewNombre(e.target.value)} id="newPlayerName"/>
          <Input label="Número (Ej: 7, 23) (opcional)" placeholder="Número" value={newNumero} onChange={e => setNewNumero(e.target.value)} id="newPlayerNumber"/>
          <Select label="Posición (Opcional)" options={posicionOptions} value={newPosicion} onChange={e => setNewPosicion(e.target.value)} id="newPlayerPosition"/>
          <Input label="Alias (Opcional)" placeholder="Alias del jugador" value={newAlias} onChange={e => setNewAlias(e.target.value)} id="newPlayerAlias"/>
        </div>
        <div className="mt-4 flex space-x-3 flex-wrap gap-y-2">
          <Button onClick={handleAddJugador} variant="success"><SaveIcon className="inline mr-2 h-4 w-4"/> Añadir Jugador</Button>
          <Button onClick={handleClearNewPlayerForm} variant="light"><CancelIcon className="inline mr-2 h-4 w-4"/> Limpiar Formulario</Button>
        </div>
      </div>
       <div className="p-6 bg-white dark:bg-gray-800 shadow-md rounded-lg">
        <h3 className="text-xl font-semibold mb-3 text-gray-700 dark:text-gray-200">Importar / Exportar Jugadores</h3>
        <div className="flex space-x-3 flex-wrap gap-y-2">
            <Button onClick={handleExportJugadoresCSV} variant="secondary">Exportar Jugadores (CSV)</Button>
            <Button onClick={handleImportJugadoresClick} variant="info">Importar Jugadores (CSV)</Button>
            <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleJugadoresFileSelected} />
        </div>
      </div>
      
      <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg">
        <button onClick={() => setIsPlayerListExpanded(!isPlayerListExpanded)} className="w-full p-4 text-left text-xl font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex justify-between items-center rounded-t-lg" aria-expanded={isPlayerListExpanded}>
          Lista de Jugadores ({processedJugadores.length})
          <svg className={`w-6 h-6 transform transition-transform duration-200 ${isPlayerListExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
        </button>
        {isPlayerListExpanded && (
          <div className="p-6 border-t border-gray-200 dark:border-gray-700">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center mb-4">
              <Input type="text" placeholder="Buscar jugador..." value={searchTermJugador} onChange={e => setSearchTermJugador(e.target.value)} className="max-w-xs flex-grow" id="searchJugador" label="Buscar en la lista:"/>
              <div>
                <label htmlFor="filterPosicion" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filtrar por Posición:</label>
                <Select id="filterPosicion" options={filterPosicionOptions} value={filterPosicion} onChange={e => setFilterPosicion(e.target.value)}/>
              </div>
              <div>
                <label htmlFor="sortFieldJugador" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ordenar por:</label>
                <div className="flex items-center space-x-2">
                  <Select id="sortFieldJugador" options={sortFieldOptionsJugador} value={sortFieldJugador} onChange={e => setSortFieldJugador(e.target.value as SortableJugadorFields)} className="flex-grow"/>
                  <IconButton onClick={toggleSortOrderJugador} icon={sortOrderJugador === 'asc' ? <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg> : <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>} label={sortOrderJugador === 'asc' ? 'Orden Ascendente' : 'Orden Descendente'} className="p-2 border rounded hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"/>
                </div>
              </div>
            </div>
            <Table columns={columnsJugadores} data={processedJugadores}/>
          </div>
        )}
      </div>

      {/* Team Management Section */}
      <div className="bg-white dark:bg-gray-800 p-6 shadow-md rounded-lg">
        <button onClick={() => setIsTeamListExpanded(!isTeamListExpanded)} className="w-full p-4 text-left text-xl font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex justify-between items-center rounded-t-lg -mx-4 -mt-6 mb-2" aria-expanded={isTeamListExpanded}>
          Gestión de Equipos ({filteredEquipos.length})
          <svg className={`w-6 h-6 transform transition-transform duration-200 ${isTeamListExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
        </button>
        {isTeamListExpanded && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="mb-4 flex flex-wrap gap-4 items-center">
                    <Button onClick={() => handleOpenTeamModal()} variant="primary">Crear Nuevo Equipo</Button>
                    <Input type="text" placeholder="Buscar equipo..." value={searchTermEquipo} onChange={e => setSearchTermEquipo(e.target.value)} className="max-w-xs" label="Buscar Equipo:"/>
                </div>
                <Table columns={columnsEquipos} data={filteredEquipos} />
            </div>
        )}
      </div>

      {/* Player Edit Modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => { setIsEditModalOpen(false); setEditingJugador(null); setEditFormState(null); }} title={editingJugador ? 'Editar Jugador' : ''} size="lg">
        {editFormState && (
          <div className="space-y-4">
            <Input label="Nombre y Apellido" name="nombre" value={editFormState.nombre} onChange={handleEditModalInputChange} required id="editNombre"/>
            <Input label="Alias (Opcional)" name="alias" value={editFormState.alias || ''} onChange={handleEditModalInputChange} id="editAlias"/>
            <Input label="Número (Opcional)" name="numero" type="text" value={editFormState.numero} onChange={handleEditModalInputChange} id="editNumero"/>
            <Select label="Posición Preferida (Opcional)" name="posicionPreferida" options={posicionOptions} value={editFormState.posicionPreferida} onChange={handleEditModalInputChange} id="editPosicionPreferida"/>
            <div className="flex justify-end space-x-3 pt-2">
              <Button onClick={() => { setIsEditModalOpen(false); setEditingJugador(null); setEditFormState(null); }} variant="light">Cancelar</Button>
              <Button onClick={handleSaveEdit} variant="success"><SaveIcon className="inline mr-2 h-4 w-4"/> Guardar Cambios</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Team Create/Edit Modal */}
      <Modal isOpen={isTeamModalOpen} onClose={handleCloseTeamModal} title={editingTeam ? 'Editar Equipo' : 'Crear Nuevo Equipo'} size="lg">
        <div className="space-y-4">
          <Input label="Nombre del Equipo" value={teamNameInput} onChange={e => setTeamNameInput(e.target.value)} required />
          <div>
            <h3 className="text-md font-medium text-gray-700 dark:text-gray-200 mb-2">Seleccionar Jugadores:</h3>
            <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-md p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {jugadores.length === 0 && <p className="text-gray-500 dark:text-gray-400">No hay jugadores creados.</p>}
              {jugadores.map(jugador => {
                const teamNameIfAssigned = getTeamNameForPlayerModal(jugador.codigo);
                const isDisabled = !!teamNameIfAssigned;
                 return (
                  <label key={jugador.codigo} className={`p-2 border rounded flex items-center ${selectedPlayerIdsForTeam.has(jugador.codigo) ? 'bg-blue-100 dark:bg-blue-900 border-blue-400 dark:border-blue-700' : ''} ${isDisabled && !selectedPlayerIdsForTeam.has(jugador.codigo) ? 'bg-gray-100 dark:bg-gray-700 opacity-60 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer'}`}>
                    <input type="checkbox" checked={selectedPlayerIdsForTeam.has(jugador.codigo)} onChange={() => handleTogglePlayerSelectionForTeam(jugador.codigo)} disabled={isDisabled && !selectedPlayerIdsForTeam.has(jugador.codigo)} className="mr-2 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"/>
                    <span className="flex-grow text-gray-800 dark:text-gray-200">{jugador.nombre}</span>
                    {teamNameIfAssigned && <span className="text-xs text-red-500 ml-2 truncate">(En {teamNameIfAssigned})</span>}
                  </label>
                );
              })}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Jugadores seleccionados: {selectedPlayerIdsForTeam.size}</p>
          </div>
          <div className="flex justify-end space-x-3 pt-2">
            <Button onClick={handleCloseTeamModal} variant="light">Cancelar</Button>
            <Button onClick={handleSaveTeam} variant="success">Guardar Equipo</Button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modals */}
      <ConfirmationModal isOpen={isConfirmDeleteModalOpen} onClose={() => setIsConfirmDeleteModalOpen(false)} onConfirm={confirmDeleteJugador} title="Confirmar Eliminación de Jugador" message={`¿Está seguro de que desea eliminar al jugador "${playerToDelete?.nombre || ''}"? Esta acción también lo eliminará de cualquier equipo al que pertenezca y no se puede deshacer.`} confirmButtonText="Eliminar Jugador" confirmButtonVariant="danger"/>
      <ConfirmationModal isOpen={isConfirmImportModalOpen} onClose={() => setIsConfirmImportModalOpen(false)} onConfirm={confirmImportJugadores} title="Confirmar Importación de Jugadores" message={`¿Está seguro de que desea importar ${playersToImport.length} jugador(es) del archivo CSV? Esto REEMPLAZARÁ todos los jugadores existentes y sus asignaciones a equipos.`} confirmButtonText="Sí, Reemplazar" confirmButtonVariant="warning"/>
      <ConfirmationModal isOpen={isConfirmDeleteTeamModalOpen} onClose={() => setIsConfirmDeleteTeamModalOpen(false)} onConfirm={confirmDeleteTeam} title="Confirmar Eliminación de Equipo" message={`¿Está seguro de que desea eliminar el equipo "${teamToDelete?.nombre || ''}"? Los jugadores asignados quedarán sin equipo.`} confirmButtonText="Eliminar Equipo" confirmButtonVariant="danger"/>
    </div>
  );
};

export default JugadoresPage;