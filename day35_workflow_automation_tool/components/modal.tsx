'use client';

import React, { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
    // Handle Escape key press to close modal
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
        } else {
            document.removeEventListener('keydown', handleEscape);
        }
        // Cleanup listener on component unmount or when modal closes
        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    if (!isOpen) {
        return null;
    }

    // Prevent clicks inside the modal content from closing it
    const handleContentClick = (event: React.MouseEvent) => {
        event.stopPropagation();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 transition-opacity duration-300 ease-in-out"
            onClick={onClose} // Click outside closes the modal
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
        >
            <div
                className="relative w-full max-w-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg rounded-xl shadow-2xl border border-white/30 dark:border-gray-700/30 overflow-hidden transform transition-all duration-300 ease-in-out scale-95 opacity-0 animate-modal-appear"
                onClick={handleContentClick}
                style={{
                    animation: 'modalAppear 0.3s ease-out forwards'
                }}
            >
                 {/* Simple scale-up animation */}
                 <style jsx global>{`
                    @keyframes modalAppear {
                        to {
                            opacity: 1;
                            transform: scale(1);
                        }
                    }
                    .animate-modal-appear {
                        animation-fill-mode: forwards;
                    }
                 `}</style>

                {/* Modal Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200/50 dark:border-gray-700/50">
                    <h2 id="modal-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded-full p-1 -mr-1"
                        aria-label="Close modal"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 overflow-y-auto max-h-[70vh]">
                    {children}
                </div>
            </div>
        </div>
    );
}
