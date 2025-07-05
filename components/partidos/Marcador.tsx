import React from 'react';
import { usePartido } from '../../context/PartidoContext';

const Marcador: React.FC = () => {
    const { currentPartido } = usePartido();

    if (!currentPartido) return null;

    const { nombreEquipoVisitante, nombreEquipoLocal, visitanteStats, localStats, maxInnings } = currentPartido;

    return (
        <div className="bg-white p-4 shadow rounded-lg overflow-x-auto">
            <h2 className="text-xl font-semibold mb-2">Marcador</h2>
            <table className="min-w-full table-auto">
                <thead>
                    <tr className="bg-gray-100">
                        <th className="p-2 border w-1/4">Equipo</th>
                        {[...Array(maxInnings)].map((_, i) => (
                            <th key={i} className="p-2 border text-center w-10">{i + 1}</th>
                        ))}
                        <th className="p-2 border text-center w-12">R</th>
                        <th className="p-2 border text-center w-12">H</th>
                        <th className="p-2 border text-center w-12">E</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="p-2 border font-semibold">{nombreEquipoVisitante}</td>
                        {[...Array(maxInnings)].map((_, i) => (
                            <td key={i} className="p-2 border text-center">{visitanteStats.runsPerInning[i + 1] ?? '-'}</td>
                        ))}
                        <td className="p-2 border text-center font-bold">{visitanteStats.totalRuns}</td>
                        <td className="p-2 border text-center">{visitanteStats.hits}</td>
                        <td className="p-2 border text-center">{visitanteStats.errors}</td>
                    </tr>
                    <tr>
                        <td className="p-2 border font-semibold">{nombreEquipoLocal}</td>
                        {[...Array(maxInnings)].map((_, i) => (
                            <td key={i} className="p-2 border text-center">{localStats.runsPerInning[i + 1] ?? '-'}</td>
                        ))}
                        <td className="p-2 border text-center font-bold">{localStats.totalRuns}</td>
                        <td className="p-2 border text-center">{localStats.hits}</td>
                        <td className="p-2 border text-center">{localStats.errors}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

export default Marcador;
