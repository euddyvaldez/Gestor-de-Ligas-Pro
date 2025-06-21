
import React, { ReactNode } from 'react';
import { ModalProps } from '../../types'; // Import ModalProps from types.ts

const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md',
  contentClassName = '', // Destructure with default
  hideCloseButton = false // Destructure with default
}) => {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-full h-full'
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4 transition-opacity duration-300 ease-in-out"
      onClick={onClose}
    >
      <div 
        className={`bg-white rounded-lg shadow-xl p-6 relative ${sizeClasses[size]} w-full transform transition-all duration-300 ease-in-out scale-95 opacity-0 animate-modalShow flex flex-col`} // Added flex flex-col
        onClick={e => e.stopPropagation()} 
        style={{ animationName: 'modalShowAnim', animationDuration: '0.3s', animationFillMode: 'forwards' }}
      >
        <div className="flex-shrink-0"> {/* Header part */}
          {!hideCloseButton && (
            <button 
              onClick={onClose}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 text-2xl z-10"
              aria-label="Cerrar modal"
            >
              &times;
            </button>
          )}
          {title && <h2 className="text-xl font-semibold mb-4 text-gray-800">{title}</h2>}
        </div>
        <div className={`flex-grow overflow-y-auto ${contentClassName}`}> {/* Content part with applied class */}
          {children}
        </div>
      </div>
      <style>{`
        @keyframes modalShowAnim {
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default Modal;
