
import React, { ReactNode } from 'react';

export interface TableColumn<T> { // Added export here
  header: ReactNode; // Changed from string to ReactNode
  accessor: keyof T | ((item: T, index: number) => ReactNode); // Allow accessor function for custom rendering, added index
  render?: (item: T, index: number) => ReactNode; // Alternative render function, added index
  className?: string; // class for th/td
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  // keyExtractor: (item: T) => string | number; // For React list keys
  // Adding a simple id property assumption for now
}

const Table = <T extends { id?: string | number }>(
  { columns, data }: TableProps<T>
): ReactNode => {
  return (
    <div className="overflow-x-auto shadow border-b border-gray-200 sm:rounded-lg">
      <table className="min-w-full divide-y divide-gray-200 table-auto"> {/* Changed to table-auto for better default sizing */}
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col, index) => (
              <th
                key={index}
                scope="col"
                className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                No hay datos disponibles.
              </td>
            </tr>
          ) : (
            data.map((item, rowIndex) => (
              <tr key={item.id || rowIndex} className="hover:bg-gray-50">
                {columns.map((col, colIndex) => {
                  let cellContent: ReactNode;
                  if (col.render) {
                    cellContent = col.render(item, rowIndex);
                  } else if (typeof col.accessor === 'function') {
                    cellContent = col.accessor(item, rowIndex);
                  } else {
                     // Assert item[col.accessor] is ReactNode or primitive. String() handles primitives.
                    cellContent = String(item[col.accessor as keyof T] ?? '');
                  }
                  return (
                    <td 
                      key={colIndex} 
                      className={`px-6 py-4 whitespace-nowrap text-sm text-gray-700 ${col.className || ''}`}
                    >
                      {cellContent}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default Table;