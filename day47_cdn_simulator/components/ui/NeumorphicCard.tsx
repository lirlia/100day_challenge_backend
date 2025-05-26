import React from 'react';

interface NeumorphicCardProps {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType; // Changed to React.ElementType
}

export default function NeumorphicCard({ children, className = '', as: Component = 'div' }: NeumorphicCardProps) {
  return (
    <Component
      className={`bg-neumorphism-bg p-6 sm:p-8 rounded-neumorphism shadow-neumorphism-soft dark:bg-neumorphism-bg-dark dark:shadow-neumorphism-soft-dark border border-neumorphism-border/60 ${className}`}
    >
      {children}
    </Component>
  );
}
