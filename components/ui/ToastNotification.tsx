import React, { useEffect } from 'react';
import { MdInfo, MdWarning, MdError, MdCheckCircle, MdClose } from 'react-icons/md';
import { ToastMessage, ToastType } from '../../types';

interface ToastNotificationProps {
  toast: ToastMessage;
  onClose: (id: string) => void;
}

const ToastNotification: React.FC<ToastNotificationProps> = ({ toast, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(toast.id);
    }, 6000); // 6 seconds auto-dismiss

    return () => {
      clearTimeout(timer);
    };
  }, [toast.id, onClose]);

  const icons: { [key in ToastType]: React.ReactNode } = {
    info: <MdInfo className="h-6 w-6 text-blue-500" />,
    success: <MdCheckCircle className="h-6 w-6 text-green-500" />,
    warning: <MdWarning className="h-6 w-6 text-yellow-500" />,
    danger: <MdError className="h-6 w-6 text-red-500" />,
  };

  const typeStyles: { [key in ToastType]: { bg: string, text: string, border: string } } = {
    info: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-400' },
    success: { bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-400' },
    warning: { bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-400' },
    danger: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-400' },
  };

  const style = typeStyles[toast.type];

  return (
    <div className={`max-w-sm w-full bg-white shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden border-l-4 ${style.border} animate-toast-in`}>
      <div className={`p-4 ${style.bg}`}>
        <div className="flex items-start">
          <div className="flex-shrink-0">
            {icons[toast.type]}
          </div>
          <div className="ml-3 w-0 flex-1 pt-0.5">
            <p className={`text-sm font-medium ${style.text}`}>{toast.message}</p>
          </div>
          <div className="ml-4 flex-shrink-0 flex">
            <button
              onClick={() => onClose(toast.id)}
              className={`inline-flex rounded-md p-1 ${style.text} hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
            >
              <span className="sr-only">Cerrar</span>
              <MdClose className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
       <style>{`
        @keyframes toast-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-toast-in {
            animation: toast-in 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default ToastNotification;
