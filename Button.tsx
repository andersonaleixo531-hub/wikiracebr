import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'back';
}

export const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', className = '', ...props }) => {
  const baseStyle = "font-bold py-3 px-6 rounded-lg shadow-md transition-transform transform active:scale-95 text-lg w-full mb-3 border-2 border-black/10";
  
  const variants = {
    primary: "bg-[#ffd700] hover:bg-[#ffed4e] text-[#0077be]",
    secondary: "bg-white text-[#0077be] hover:bg-gray-100",
    danger: "bg-red-500 text-white hover:bg-red-400",
    back: "bg-[#00a8cc] text-white hover:bg-[#0097b8] w-auto inline-block px-4 py-2 text-sm",
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};
