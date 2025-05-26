import React from 'react';

interface NeumorphicInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  // any additional props specific to NeumorphicInput can be added here
}

export default function NeumorphicInput({ className = '', ...props }: NeumorphicInputProps) {
  return (
    <input
      className={`w-full px-4 py-3 rounded-neumorphism bg-neumorphism-bg text-neumorphism-text shadow-neumorphism-input border border-neumorphism-border/60
                 focus:outline-none focus:ring-2 focus:ring-neumorphism-accent focus:border-neumorphism-accent
                 dark:bg-neumorphism-bg-dark dark:text-neumorphism-text-dark dark:shadow-neumorphism-input-dark dark:border-neumorphism-border/30
                 transition-all duration-150 ease-in-out ${className}`}
      {...props}
    />
  );
}

// components/ui/NeumorphicTextarea.tsx (similar to input)
interface NeumorphicTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { }

export function NeumorphicTextarea({ className = '', ...props }: NeumorphicTextareaProps) {
  return (
    <textarea
      className={`w-full px-4 py-3 rounded-neumorphism bg-neumorphism-bg text-neumorphism-text shadow-neumorphism-input border border-neumorphism-border/60
                 focus:outline-none focus:ring-2 focus:ring-neumorphism-accent focus:border-neumorphism-accent
                 dark:bg-neumorphism-bg-dark dark:text-neumorphism-text-dark dark:shadow-neumorphism-input-dark dark:border-neumorphism-border/30
                 transition-all duration-150 ease-in-out ${className}`}
      {...props}
    />
  );
}

// components/ui/NeumorphicSelect.tsx
interface NeumorphicSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode;
}
export function NeumorphicSelect({ className = '', children, ...props }: NeumorphicSelectProps) {
  return (
    <select
      className={`w-full px-4 py-3 rounded-neumorphism bg-neumorphism-bg text-neumorphism-text shadow-neumorphism-input border border-neumorphism-border/60
                 focus:outline-none focus:ring-2 focus:ring-neumorphism-accent focus:border-neumorphism-accent
                 dark:bg-neumorphism-bg-dark dark:text-neumorphism-text-dark dark:shadow-neumorphism-input-dark dark:border-neumorphism-border/30
                 appearance-none pr-8 bg-no-repeat bg-right-2 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%238b95a2%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%20d%3D%22M6%208l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')]
                 dark:bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2220%22%20height%3D%2220%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%23c0c8d4%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%20d%3D%22M6%208l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')]
                 transition-all duration-150 ease-in-out ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}
