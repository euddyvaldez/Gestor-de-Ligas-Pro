
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info' | 'light' | 'dark' | 'link' | 'custom';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md',
  className = '', 
  isLoading = false,
  disabled,
  ...props 
}) => {
  const baseStyle = 'font-semibold rounded focus:outline-none focus:ring-2 focus:ring-opacity-50 transition duration-150 ease-in-out';
  
  const variantStyles = {
    primary: 'bg-blue-500 hover:bg-blue-600 text-white focus:ring-blue-400 dark:bg-blue-600 dark:hover:bg-blue-700',
    secondary: 'bg-gray-500 hover:bg-gray-600 text-white focus:ring-gray-400 dark:bg-gray-600 dark:hover:bg-gray-700',
    success: 'bg-green-500 hover:bg-green-600 text-white focus:ring-green-400 dark:bg-green-600 dark:hover:bg-green-700',
    danger: 'bg-red-500 hover:bg-red-600 text-white focus:ring-red-400 dark:bg-red-600 dark:hover:bg-red-700',
    warning: 'bg-yellow-500 hover:bg-yellow-600 text-black focus:ring-yellow-400 dark:bg-yellow-500 dark:hover:bg-yellow-600', // Ensured text-black for yellow
    info: 'bg-sky-500 hover:bg-sky-600 text-white focus:ring-sky-400 dark:bg-sky-600 dark:hover:bg-sky-700',
    light: 'bg-gray-200 hover:bg-gray-300 text-gray-800 focus:ring-gray-300 border border-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100 dark:border-gray-600',
    dark: 'bg-gray-800 hover:bg-gray-900 text-white focus:ring-gray-700 dark:bg-gray-300 dark:hover:bg-gray-400 dark:text-black',
    link: 'text-blue-500 hover:text-blue-600 hover:underline focus:ring-blue-400 bg-transparent border-transparent dark:text-blue-400 dark:hover:text-blue-300',
    custom: '' // Minimal style for custom, relies on className
  };

  const sizeStyles = {
    sm: 'py-1 px-2 text-sm',
    md: 'py-2 px-4 text-base',
    lg: 'py-3 px-6 text-lg'
  };

  const disabledStyles = 'opacity-50 cursor-not-allowed';

  return (
    <button
      type="button"
      className={`${baseStyle} ${variantStyles[variant]} ${sizeStyles[size]} ${className} ${ (disabled || isLoading) ? disabledStyles : ''}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : null}
      {children}
    </button>
  );
};

export default Button;