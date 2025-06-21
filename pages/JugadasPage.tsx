
import React, { useState, useMemo, useEffect } from 'react';
import { Jugada, PlayCategory } from '../types';
import { JUGADAS_STORAGE_KEY, CODIGO_ACTUAL_JUGADAS_STORAGE_KEY, defaultJugadas } from '../constants';
import useLocalStorage from '../hooks/useLocalStorage';
import { getNextCodigo } from '../utils/idGenerator';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import Table, { TableColumn } from '../components/ui/Table';
import IconButton, { EditIcon } from '../components/ui/IconButton';
import { MdDeleteForever } from 'react-icons/md';
import ConfirmationModal from '../components/ui/ConfirmationModal'; // Import ConfirmationModal

type JugadaConId = Jugada & { id: number };

const JugadasPage: React.FC = () => {
  const [jugadas, setJugadas] = useLocalStorage<Jugada[]>(JUGADAS_STORAGE_KEY, []);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingJugada, setEditingJugada] = useState<Jugada | null>(null);
  const [newJugada, setNewJugada] = useState<Omit<Jugada, 'codigo' | 'isDefault' | 'isActive'>>({ jugada: '', descripcion: '', category: PlayCategory.HIT });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJugadas, setSelectedJugadas] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // State for Confirmation Modal
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmModalProps, setConfirmModalProps] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    confirmButtonVariant?: 'danger' | 'primary';
  } | null>(null);

  useEffect(() => {
    if (jugadas.length === 0 && defaultJugadas.length > 0) { 
      const initialJugadas = defaultJugadas.map(j => ({
        ...j,
        codigo: getNextCodigo(CODIGO_ACTUAL_JUGADAS_STORAGE_KEY),
      }));
      setJugadas(initialJugadas);
    }
  }, []); // Removed jugadas from dependencies to avoid loop on setJugadas


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (editingJugada) {
      setEditingJugada({ ...editingJugada, [name]: value });
    } else {
      setNewJugada({ ...newJugada, [name]: value as PlayCategory });
    }
  };

  const validateJugada = (jugadaData: Omit<Jugada, 'codigo' | 'isDefault' | 'isActive'> | Jugada): boolean => {
    const currentCodigo = 'codigo' in jugadaData ? jugadaData.codigo : -1;
    if (!jugadaData.jugada.trim() || !jugadaData.descripcion.trim()) {
        alert('El código corto y la descripción son obligatorios.');
        return false;
    }
    const duplicate = jugadas.find(j => j.codigo !== currentCodigo && j.jugada.toLowerCase() === jugadaData.jugada.toLowerCase());
    if (duplicate) {
        alert('Ya existe una jugada con el mismo código corto.');
        return false;
    }
    return true;
  };

  const handleAddJugada = () => {
    if(!validateJugada(newJugada)) return;
    const codigo = getNextCodigo(CODIGO_ACTUAL_JUGADAS_STORAGE_KEY);
    setJugadas([...jugadas, { ...newJugada, codigo, isDefault: false, isActive: true }]);
    setNewJugada({ jugada: '', descripcion: '', category: PlayCategory.HIT });
    setIsEditModalOpen(false);
  };

  const handleEditJugada = (jugada: Jugada) => {
    setEditingJugada({ ...jugada });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (editingJugada) {
      if (editingJugada.isDefault) {
        alert('Las propiedades principales de las jugadas por defecto no se pueden editar.');
        setIsEditModalOpen(false);
        setEditingJugada(null);
        return;
      }
      if (validateJugada(editingJugada)) {
        setJugadas(jugadas.map(j => j.codigo === editingJugada.codigo ? editingJugada : j));
        setEditingJugada(null);
        setIsEditModalOpen(false);
      }
    }
  };

  const requestDeleteJugada = (jugadaToDelete: Jugada) => {
    if (jugadaToDelete.isDefault) {
      alert('Las jugadas por defecto no se pueden eliminar.');
      return;
    }
    setConfirmModalProps({
      title: 'Confirmar Eliminación',
      message: `¿Está seguro de que desea eliminar la jugada "${jugadaToDelete.descripcion}"?`,
      onConfirm: () => {
        setJugadas(prev => prev.filter(j => j.codigo !== jugadaToDelete.codigo));
        setIsConfirmModalOpen(false);
      },
      confirmButtonVariant: 'danger'
    });
    setIsConfirmModalOpen(true);
  };
  
  const toggleIsActive = (codigo: number) => {
    setJugadas(jugadas.map(j => j.codigo === codigo ? { ...j, isActive: !j.isActive } : j));
  };

  const filteredJugadas = useMemo(() => {
    return jugadas.filter(j =>
      Object.values(j).some(val =>
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [jugadas, searchTerm]);

  const nonDefaultJugadas = useMemo(() => filteredJugadas.filter(j => !j.isDefault), [filteredJugadas]);

  const handleSelectionToggle = (codigo: number) => {
    const jugada = jugadas.find(j => j.codigo === codigo);
    if (jugada?.isDefault) return; 

    const newSelection = new Set(selectedJugadas);
    if (newSelection.has(codigo)) {
      newSelection.delete(codigo);
    } else {
      newSelection.add(codigo);
    }
    setSelectedJugadas(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedJugadas.size === nonDefaultJugadas.length && nonDefaultJugadas.length > 0) {
      setSelectedJugadas(new Set());
    } else {
      setSelectedJugadas(new Set(nonDefaultJugadas.map(j => j.codigo)));
    }
  };

  const requestDeleteSelected = () => {
    if (selectedJugadas.size === 0) return;
    setConfirmModalProps({
      title: 'Confirmar Eliminación Múltiple',
      message: `¿Está seguro de que desea eliminar ${selectedJugadas.size} jugada(s) seleccionada(s)?`,
      onConfirm: () => {
        setJugadas(prev => prev.filter(j => !selectedJugadas.has(j.codigo)));
        setSelectedJugadas(new Set());
        setIsSelectionMode(false);
        setIsConfirmModalOpen(false);
      },
      confirmButtonVariant: 'danger'
    });
    setIsConfirmModalOpen(true);
  };

  const categoryOptions = Object.values(PlayCategory).map(cat => ({ value: cat, label: cat }));

  const columns: TableColumn<JugadaConId>[] = [ 
    ...(isSelectionMode ? [{
      header: <input 
                  type="checkbox" 
                  onChange={handleSelectAll} 
                  checked={nonDefaultJugadas.length > 0 && selectedJugadas.size === nonDefaultJugadas.length} 
                  aria-label="Seleccionar todas las jugadas no por defecto"
                  disabled={nonDefaultJugadas.length === 0}
                />,
      accessor: (item: JugadaConId) => item.isDefault ? null : <input 
                                                                    type="checkbox" 
                                                                    checked={selectedJugadas.has(item.codigo)} 
                                                                    onChange={() => handleSelectionToggle(item.codigo)} 
                                                                    aria-label={`Seleccionar jugada ${item.descripcion}`}
                                                                    disabled={item.isDefault}
                                                                  />,
      className: "w-12 text-center"
    }] : []),
    { header: 'Código', accessor: 'codigo', className: "w-20" },
    { header: 'Jugada', accessor: 'jugada' },
    { header: 'Descripción', accessor: 'descripcion' },
    { header: 'Categoría', accessor: 'category' },
    { 
      header: 'Activa', 
      accessor: (item: JugadaConId) => (
        <label className="inline-flex items-center cursor-pointer">
          <input type="checkbox" className="sr-only peer" checked={item.isActive} onChange={() => toggleIsActive(item.codigo)} />
          <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      ),
      className: "w-24 text-center"
    },
    {
      header: 'Acciones',
      accessor: (item: JugadaConId) => (
        <div className="space-x-2">
          {!item.isDefault && <IconButton icon={<EditIcon />} onClick={() => handleEditJugada(item)} label={`Editar ${item.descripcion}`} className="text-blue-500 hover:text-blue-700" />}
          {!item.isDefault && !isSelectionMode && <IconButton icon={<MdDeleteForever className="w-5 h-5" />} onClick={() => requestDeleteJugada(item)} label={`Eliminar ${item.descripcion}`} className="text-red-500 hover:text-red-700" />}
        </div>
      ),
      className: "w-32 text-center"
    }
  ];
  
  const tableData: JugadaConId[] = filteredJugadas.map(j => ({...j, id: j.codigo}));

  return (
    <div className="p-6 bg-white shadow-lg rounded-lg">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Gestión de Tipos de Jugadas</h1>
      
      <div className="mb-4 flex flex-wrap gap-4 items-center">
        <Button onClick={() => { setEditingJugada(null); setNewJugada({ jugada: '', descripcion: '', category: PlayCategory.HIT }); setIsEditModalOpen(true); }} variant="primary">
          Agregar Jugada Personalizada
        </Button>
        <Button onClick={() => setIsSelectionMode(!isSelectionMode)} variant={isSelectionMode ? "warning" : "secondary"}>
          {isSelectionMode ? 'Cancelar Selección' : 'Seleccionar para Eliminar (Personalizadas)'}
        </Button>
        {isSelectionMode && selectedJugadas.size > 0 && (
          <Button onClick={requestDeleteSelected} variant="danger">
            <MdDeleteForever className="inline mr-2 h-5 w-5" /> Confirmar Eliminación ({selectedJugadas.size})
          </Button>
        )}
        <Input 
          type="text" 
          placeholder="Buscar jugada..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)}
          className="max-w-xs"
          label="Buscar:"
        />
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Nota: Las jugadas por defecto (precargadas) no se pueden eliminar ni sus campos principales editar (solo su estado Activa/Inactiva). La eliminación individual de jugadas personalizadas se deshabilita durante el modo de selección.
      </p>

      <Table
        columns={columns}
        data={tableData}
      />

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={editingJugada ? (editingJugada.isDefault ? 'Ver Jugada por Defecto' : 'Editar Jugada') : 'Agregar Jugada Personalizada'}>
        <div className="space-y-4">
          <Input label="Nombre Jugada (Código Corto)" name="jugada" value={editingJugada?.jugada || newJugada.jugada} onChange={handleInputChange} required disabled={!!editingJugada?.isDefault} />
          <Input label="Descripción" name="descripcion" value={editingJugada?.descripcion || newJugada.descripcion} onChange={handleInputChange} required disabled={!!editingJugada?.isDefault} />
          <Select label="Categoría" name="category" options={categoryOptions} value={editingJugada?.category || newJugada.category} onChange={handleInputChange} required disabled={!!editingJugada?.isDefault} />
          
          {editingJugada?.isDefault && <p className="text-sm text-yellow-600 bg-yellow-100 p-2 rounded">Las jugadas por defecto tienen campos limitados para edición (solo 'Activa' desde la tabla).</p>}

          <div className="flex justify-end space-x-3 pt-2">
            <Button onClick={() => setIsEditModalOpen(false)} variant="light">Cerrar</Button>
            {(!editingJugada || !editingJugada.isDefault) && (
                <Button onClick={editingJugada ? handleSaveEdit : handleAddJugada} variant="success">
                {editingJugada ? 'Guardar Cambios' : 'Agregar Jugada'}
                </Button>
            )}
          </div>
        </div>
      </Modal>

      {confirmModalProps && (
        <ConfirmationModal
          isOpen={isConfirmModalOpen}
          onClose={() => setIsConfirmModalOpen(false)}
          onConfirm={confirmModalProps.onConfirm}
          title={confirmModalProps.title}
          message={confirmModalProps.message}
          confirmButtonText="Eliminar"
          confirmButtonVariant={confirmModalProps.confirmButtonVariant || 'danger'}
        />
      )}
    </div>
  );
};

export default JugadasPage;