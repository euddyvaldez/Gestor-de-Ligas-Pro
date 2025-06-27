
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { JuegoGuardado, PartidoData } from '../types';
import { HISTORIAL_JUEGOS_KEY, PARTIDO_EN_CURSO_KEY } from '../constants';
import useLocalStorage from '../hooks/useLocalStorage';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import ConfirmationModal from '../components/ui/ConfirmationModal'; // Import ConfirmationModal

const HistorialPage: React.FC = () => {
  const [historial, setHistorial] = useLocalStorage<JuegoGuardado[]>(HISTORIAL_JUEGOS_KEY, []);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  // State for Confirmation Modal
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [juegoToDelete, setJuegoToDelete] = useState<JuegoGuardado | null>(null);

  const handleVerContinuar = (juego: JuegoGuardado) => {
    localStorage.setItem(PARTIDO_EN_CURSO_KEY, JSON.stringify(juego as PartidoData));
    navigate('/partidos');
  };

  const requestEliminarJuego = (juego: JuegoGuardado) => {
    setJuegoToDelete(juego);
    setIsConfirmModalOpen(true);
  };

  const confirmEliminarJuego = () => {
    if (juegoToDelete) {
      setHistorial(prev => prev.filter(j => j.idJuego !== juegoToDelete.idJuego));
    }
    setJuegoToDelete(null);
    setIsConfirmModalOpen(false);
  };
  
  const convertBaseStateToBinaryString = (baseState: string | undefined | null): string => {
    if (!baseState) return "0-0-0"; // Handle undefined, null or empty string
    return baseState.split('-').map(slot => (slot && slot !== 'null' && slot !== '') ? '1' : '0').join('-');
  };

  const handleExportCSV = (juego: JuegoGuardado) => {
    if (!juego.registrosJuego || juego.registrosJuego.length === 0) {
        alert("No hay jugadas registradas para exportar en este juego.");
        return;
    }
    const headers = ["ID", "Timestamp", "Inning", "Parte", "BateadorID", "JugadaID", "Descripción", "Outs Antes", "Outs Después", "Bases Antes", "Bases Después", "Carreras Anotadas", "RBI"];
    const rows = juego.registrosJuego.map(r => [
        r.id,
        new Date(r.timestamp).toLocaleString(),
        r.inning,
        r.halfInning,
        r.bateadorId,
        r.jugadaId,
        `"${r.descripcion.replace(/"/g, '""')}"`, 
        r.outsPrev,
        r.outsAfter,
        convertBaseStateToBinaryString(r.basesPrevState),
        convertBaseStateToBinaryString(r.basesAfterState),
        r.runScored,
        r.rbi
    ].join(','));
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `juego_${juego.idJuego}_log.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert('Log del juego exportado como CSV.');
  };

  const filteredHistorial = useMemo(() => {
    return historial
      .filter(juego => {
        const searchTermLower = searchTerm.toLowerCase();
        return (
          juego.nombreEquipoVisitante.toLowerCase().includes(searchTermLower) ||
          juego.nombreEquipoLocal.toLowerCase().includes(searchTermLower) ||
          juego.fecha.includes(searchTermLower) ||
          (juego.formatoJuegoId && String(juego.formatoJuegoId).includes(searchTermLower)) || 
          (juego.numeroJuego && juego.numeroJuego.toLowerCase().includes(searchTermLower))
        );
      })
      .sort((a, b) => b.timestampGuardado - a.timestampGuardado);
  }, [historial, searchTerm]);

  return (
    <div className="p-6 bg-white dark:bg-gray-800 shadow-lg rounded-lg">
      <h1 className="text-3xl font-bold mb-6 text-gray-800 dark:text-gray-100">Historial de Juegos</h1>
      <Input
        type="text"
        placeholder="Buscar juego (fecha, equipo, formato...)"
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        className="mb-6 w-full max-w-md"
      />
      {filteredHistorial.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-300">No hay juegos guardados o que coincidan con su búsqueda.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredHistorial.map(juego => (
            <div key={juego.idJuego} className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg shadow hover:shadow-md transition-shadow">
              <h2 className="text-xl font-semibold text-blue-600 dark:text-blue-400">{juego.nombreEquipoVisitante} vs {juego.nombreEquipoLocal}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Fecha del juego: {new Date(juego.fecha).toLocaleDateString()}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Número de Juego: {juego.numeroJuego || 'N/A'}</p>
              <p className="text-lg font-bold my-2 text-gray-800 dark:text-gray-100">
                Resultado: {juego.visitanteStats.totalRuns} - {juego.localStats.totalRuns}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Guardado: {new Date(juego.timestampGuardado).toLocaleString()}</p>
              <div className="mt-4 space-x-2 flex flex-wrap gap-2">
                <Button onClick={() => handleVerContinuar(juego)} variant="info" size="sm">Ver / Continuar</Button>
                <Button onClick={() => handleExportCSV(juego)} variant="secondary" size="sm">Exportar Log (CSV)</Button>
                <Button onClick={() => requestEliminarJuego(juego)} variant="danger" size="sm">Eliminar</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmationModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={confirmEliminarJuego}
        title="Confirmar Eliminación"
        message={`¿Está seguro de que desea eliminar el juego entre ${juegoToDelete?.nombreEquipoVisitante || ''} y ${juegoToDelete?.nombreEquipoLocal || ''} del historial?`}
        confirmButtonText="Eliminar"
        confirmButtonVariant="danger"
      />
    </div>
  );
};

export default HistorialPage;