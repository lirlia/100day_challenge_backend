import React from 'react';

interface NeumorphicButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'default' | 'accent' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  as?: React.ElementType;
}

export default function NeumorphicButton({
  children,
  className = '',
  variant = 'default',
  size = 'md',
  as: Component = 'button',
  ...props
}: NeumorphicButtonProps) {
  const baseStyle = "font-semibold rounded-neumorphism transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-neumorphism-bg-dark shadow-neumorphism-convex active:shadow-neumorphism-concave hover:shadow-neumorphism-soft";

  const variantStyles = {
    default: "bg-neumorphism-bg text-neumorphism-text border border-neumorphism-border/60 hover:bg-white/60 dark:bg-neumorphism-bg-dark dark:text-neumorphism-text-dark dark:border-neumorphism-border/30 focus:ring-neumorphism-accent",
    accent: "bg-neumorphism-accent text-white border border-neumorphism-accent hover:bg-neumorphism-accent/90 focus:ring-neumorphism-accent",
    danger: "bg-red-500 text-white border border-red-500 hover:bg-red-600 focus:ring-red-700",
  };

  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  return (
    <Component
      className={`${baseStyle} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </Component>
  );
}
