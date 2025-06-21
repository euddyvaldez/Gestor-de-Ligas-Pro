
import React, { useState, useMemo, useEffect } from 'react';
import { Formato } from '../types';
import { FORMATOS_STORAGE_KEY, CODIGO_ACTUAL_FORMATOS_STORAGE_KEY } from '../constants';
import useLocalStorage from '../hooks/useLocalStorage';
import { getNextCodigo } from '../utils/idGenerator';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Table from '../components/ui/Table';
import IconButton, { EditIcon } from '../components/ui/IconButton';
import { MdDeleteForever } from 'react-icons/md';
import ConfirmationModal from '../components/ui/ConfirmationModal'; // Import ConfirmationModal

type FormatoConId = Formato & { id: number };

const FormatoJuegoPage: React.FC = () => {
  const [formatos, setFormatos] = useLocalStorage<Formato[]>(FORMATOS_STORAGE_KEY, []);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingFormato, setEditingFormato] = useState<Formato | null>(null);
  const [newFormato, setNewFormato] = useState<Omit<Formato, 'codigo' | 'isDefault'>>({ descripcion: '', cantidadInning: 7 });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFormatos, setSelectedFormatos] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // State for Confirmation Modal
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmModalProps, setConfirmModalProps] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    confirmButtonVariant?: 'danger' | 'primary';
  } | null>(null);
  

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'number' ? parseInt(value, 10) : value;
    if (editingFormato) {
      setEditingFormato({ ...editingFormato, [name]: val });
    } else {
      setNewFormato({ ...newFormato, [name]: val });
    }
  };
  
  const validateFormato = (formatoData: Omit<Formato, 'codigo' | 'isDefault'> | Formato): boolean => {
    const currentCodigo = 'codigo' in formatoData ? formatoData.codigo : -1;
    if (!formatoData.descripcion.trim() || formatoData.cantidadInning <= 0 || formatoData.cantidadInning > 25) {
        alert('La descripción es obligatoria y la cantidad de innings debe estar entre 1 y 25.');
        return false;
    }
    const duplicate = formatos.find(f => 
        f.codigo !== currentCodigo &&
        f.descripcion.toLowerCase() === formatoData.descripcion.toLowerCase() &&
        f.cantidadInning === formatoData.cantidadInning
    );
    if (duplicate) {
        alert('Ya existe un formato con la misma descripción y cantidad de innings.');
        return false;
    }
    return true;
  };

  const handleAddFormato = () => {
    if(!validateFormato(newFormato)) return;
    const codigo = getNextCodigo(CODIGO_ACTUAL_FORMATOS_STORAGE_KEY);
    setFormatos([...formatos, { ...newFormato, codigo, isDefault: false }]);
    setNewFormato({ descripcion: '', cantidadInning: 7 });
    setIsEditModalOpen(false);
  };

  const handleEditFormato = (formato: Formato) => {
    setEditingFormato({ ...formato });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (editingFormato && validateFormato(editingFormato)) {
      setFormatos(formatos.map(f => f.codigo === editingFormato.codigo ? editingFormato : f));
      setEditingFormato(null);
      setIsEditModalOpen(false);
    }
  };

  const requestDeleteFormato = (formatoToDelete: Formato) => {
    if (formatoToDelete.isDefault) {
      alert('Los formatos por defecto no se pueden eliminar.');
      return;
    }
    setConfirmModalProps({
      title: 'Confirmar Eliminación',
      message: `¿Está seguro de que desea eliminar el formato "${formatoToDelete.descripcion}"?`,
      onConfirm: () => {
        setFormatos(prev => prev.filter(f => f.codigo !== formatoToDelete.codigo));
        setIsConfirmModalOpen(false);
      },
      confirmButtonVariant: 'danger'
    });
    setIsConfirmModalOpen(true);
  };
  
  const filteredFormatos = useMemo(() => {
    return formatos.filter(f =>
      Object.values(f).some(val =>
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [formatos, searchTerm]);
  
  const nonDefaultFormatos = useMemo(() => filteredFormatos.filter(f => !f.isDefault), [filteredFormatos]);

  const handleSelectionToggle = (codigo: number) => {
    const formato = formatos.find(f => f.codigo === codigo);
    if (formato?.isDefault) return;

    const newSelection = new Set(selectedFormatos);
    if (newSelection.has(codigo)) {
      newSelection.delete(codigo);
    } else {
      newSelection.add(codigo);
    }
    setSelectedFormatos(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedFormatos.size === nonDefaultFormatos.length && nonDefaultFormatos.length > 0) {
      setSelectedFormatos(new Set());
    } else {
      setSelectedFormatos(new Set(nonDefaultFormatos.map(f => f.codigo)));
    }
  };

  const requestDeleteSelected = () => {
    if (selectedFormatos.size === 0) return;
    setConfirmModalProps({
      title: 'Confirmar Eliminación Múltiple',
      message: `¿Está seguro de que desea eliminar ${selectedFormatos.size} formato(s) seleccionado(s)?`,
      onConfirm: () => {
        setFormatos(prev => prev.filter(f => !selectedFormatos.has(f.codigo)));
        setSelectedFormatos(new Set());
        setIsSelectionMode(false);
        setIsConfirmModalOpen(false);
      },
      confirmButtonVariant: 'danger'
    });
    setIsConfirmModalOpen(true);
  };

  const columns: import('../components/ui/Table').TableColumn<FormatoConId>[] = [
    ...(isSelectionMode ? [{
      header: <input type="checkbox" onChange={handleSelectAll} checked={nonDefaultFormatos.length > 0 && selectedFormatos.size === nonDefaultFormatos.length} disabled={nonDefaultFormatos.length === 0} />,
      accessor: (item: FormatoConId) => item.isDefault ? null : <input type="checkbox" checked={selectedFormatos.has(item.codigo)} onChange={() => handleSelectionToggle(item.codigo)} disabled={item.isDefault} />,
      className: "w-12 text-center"
    }] : []),
    { header: 'Código', accessor: 'codigo', className: "w-20" },
    { header: 'Descripción', accessor: 'descripcion' },
    { header: 'Innings', accessor: 'cantidadInning', className: "w-24 text-center" },
    {
      header: 'Acciones',
      accessor: (item: FormatoConId) => (
        <div className="space-x-2">
          {!item.isDefault && <IconButton icon={<EditIcon />} onClick={() => handleEditFormato(item)} label="Editar" className="text-blue-500 hover:text-blue-700"/>}
          {!item.isDefault && !isSelectionMode && <IconButton icon={<MdDeleteForever className="w-5 h-5" />} onClick={() => requestDeleteFormato(item)} label="Eliminar" className="text-red-500 hover:text-red-700"/>}
        </div>
      ),
      className: "w-32 text-center"
    }
  ];

  const tableData: FormatoConId[] = filteredFormatos.map(f => ({...f, id: f.codigo}));

  return (
    <div className="p-6 bg-white shadow-lg rounded-lg">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Gestión de Formatos de Juego</h1>
      
      <div className="mb-4 flex flex-wrap gap-4 items-center">
        <Button onClick={() => { setEditingFormato(null); setNewFormato({ descripcion: '', cantidadInning: 7 }); setIsEditModalOpen(true); }} variant="primary">
          Agregar Formato Personalizado
        </Button>
        <Button onClick={() => setIsSelectionMode(!isSelectionMode)} variant={isSelectionMode ? "warning" : "secondary"}>
          {isSelectionMode ? 'Cancelar Selección' : 'Seleccionar para Eliminar'}
        </Button>
        {isSelectionMode && selectedFormatos.size > 0 && (
          <Button onClick={requestDeleteSelected} variant="danger">
            <MdDeleteForever className="inline mr-2 h-5 w-5" /> Confirmar Eliminación ({selectedFormatos.size})
          </Button>
        )}
        <Input 
          type="text" 
          placeholder="Buscar formato..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)}
          className="max-w-xs"
          label="Buscar:"
        />
      </div>

      <Table
        columns={columns}
        data={tableData}
      />

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={editingFormato ? (editingFormato.isDefault ? 'Ver Formato por Defecto' : 'Editar Formato') : 'Agregar Formato Personalizado'}>
        <div className="space-y-4">
          <Input label="Descripción" name="descripcion" value={editingFormato?.descripcion || newFormato.descripcion} onChange={handleInputChange} required disabled={!!editingFormato?.isDefault} />
          <Input label="Cantidad de Innings" name="cantidadInning" type="number" min="1" max="25" value={editingFormato?.cantidadInning || newFormato.cantidadInning} onChange={handleInputChange} required disabled={!!editingFormato?.isDefault} />
          
          {editingFormato?.isDefault && <p className="text-sm text-yellow-600 bg-yellow-100 p-2 rounded">Los formatos por defecto no se pueden editar.</p>}

          <div className="flex justify-end space-x-3 pt-2">
            <Button onClick={() => setIsEditModalOpen(false)} variant="light">Cancelar</Button>
            {(!editingFormato || !editingFormato.isDefault) && (
            <Button onClick={editingFormato ? handleSaveEdit : handleAddFormato} variant="success">
              {editingFormato ? 'Guardar Cambios' : 'Agregar Formato'}
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

export default FormatoJuegoPage;