
import React, { useEffect } from 'react';

interface NotificationProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
}

export const Notification: React.FC<NotificationProps> = ({ message, type = 'info', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4000); // Some após 4 segundos
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColors = {
    success: 'bg-green-500 border-green-600',
    error: 'bg-red-500 border-red-600',
    info: 'bg-[#ffd700] border-yellow-600 text-black',
  };

  const textColors = {
    success: 'text-white',
    error: 'text-white',
    info: 'text-gray-900',
  };

  return (
    <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-[100] animate-in slide-in-from-top-5 duration-300 w-[90%] max-w-sm`}>
      <div className={`${bgColors[type]} ${textColors[type]} px-6 py-4 rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] border-b-4 flex items-center justify-between gap-4 font-black uppercase tracking-wide text-xs md:text-sm`}>
        <span className="flex-1 text-center">{message}</span>
        <button 
          onClick={onClose} 
          className="opacity-60 hover:opacity-100 transition-opacity text-lg leading-none"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
