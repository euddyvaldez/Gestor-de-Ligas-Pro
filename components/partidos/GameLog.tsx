import React from 'react';
import { usePartido } from '../../context/PartidoContext';
import Table, { TableColumn } from '../ui/Table';
import Button from '../ui/Button';
import IconButton from '../ui/IconButton';
import { MdDeleteForever } from 'react-icons/md';
import { EditIcon } from '../ui/IconButton';
import { RegistroJuego } from '../../types';

const GameLog: React.FC = () => {
    const {
        currentPartido,
        isGameLogExpanded,
        setIsGameLogExpanded,
        requestDeleteRegistro,
        handleOpenEditRegistroModal
    } = usePartido();

    if (!currentPartido) return null;

    const gameLogColumns: TableColumn<RegistroJuego>[] = [
        { header: 'INN.', accessor: (item) => `${item.halfInning === 'Top' ? 'T' : 'B'}${item.inning}`, className: "px-2 py-1 text-xs font-mono text-center whitespace-nowrap" },
        { header: 'FECHA', accessor: (item) => item.fechaDelPartido ? new Date(item.fechaDelPartido.replace(/-/g, '/')).toLocaleDateString() : 'N/A', className: "px-2 py-1 text-xs whitespace-nowrap" },
        { header: 'FORMATO', accessor: 'formatoDelPartidoDesc', className: "px-2 py-1 text-xs whitespace-nowrap" },
        { header: 'JUEGO #', accessor: 'numeroDelPartido', className: "px-2 py-1 text-xs text-center whitespace-nowrap" },
        { header: 'EQUIPO', accessor: 'equipoBateadorNombre', className: "px-2 py-1 text-xs whitespace-nowrap" },
        { header: 'BATEADOR', accessor: 'bateadorNombre', className: "px-2 py-1 text-xs whitespace-nowrap" },
        { header: 'OB', accessor: 'ordenDelBateador', className: "px-2 py-1 text-xs text-center" },
        { header: 'POS.', accessor: 'bateadorPosicion', className: "px-2 py-1 text-xs text-center" },
        { header: 'PITCHER', accessor: (item) => item.pitcherResponsableNombre || 'N/A', className: "px-2 py-1 text-xs whitespace-nowrap" },
        { header: 'DESCRIPCIÓN J.', accessor: 'descripcion', className: "px-2 py-1 text-xs" },
        { header: 'CATEGORÍA', accessor: 'categoria', className: "px-2 py-1 text-xs whitespace-nowrap" },
        {
            header: 'ACCIONES',
            accessor: (item) => (
                <div className="flex justify-center space-x-1">
                    <IconButton icon={<EditIcon />} onClick={() => handleOpenEditRegistroModal(item)} label="Editar Registro" className="text-blue-500 hover:text-blue-700 p-1" />
                    <IconButton icon={<MdDeleteForever className="w-5 h-5" />} onClick={() => requestDeleteRegistro(item)} label="Eliminar Registro" className="text-red-500 hover:text-red-700 p-1" />
                </div>
            ),
            className: "px-2 py-1 w-20 text-center"
        }
    ];

    return (
        <div className="bg-white p-4 shadow rounded-lg mt-6">
            <div className="flex justify-between items-center mb-2">
                <h2 className="text-xl font-semibold">Registro Detallado del Juego</h2>
                <Button onClick={() => setIsGameLogExpanded(!isGameLogExpanded)} variant="light" size="sm">
                    {isGameLogExpanded ? 'Contraer' : 'Expandir'} Lista
                </Button>
            </div>
            <p className="text-xs text-red-600 mb-2 bg-red-50 p-2 rounded">
                Nota: Editar o eliminar jugadas pasadas del registro NO recalculará automáticamente las estadísticas del juego ni el estado de las bases posteriores. Estos cambios son solo para corregir el registro. Las jugadas anotadas a través de la opción "Anotar" en la lista de jugadores afectarán el estado del juego (outs, bases, etc.).
            </p>
            <div className={`overflow-x-auto transition-all duration-300 ease-in-out ${isGameLogExpanded ? 'max-h-none' : 'max-h-[30rem]'}`}>
                <Table columns={gameLogColumns} data={[...(currentPartido?.registrosJuego || [])].sort((a, b) => b.timestamp - a.timestamp)} />
            </div>
        </div>
    );
};

export default GameLog;