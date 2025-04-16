'use client';

interface ActionButtonsProps {
  onNope: () => void;
  onLike: () => void;
  disabled?: boolean; // To disable buttons during loading/processing
}

// SVG Icon Components (simplified for inline use)
const NopeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
  </svg>
);

const LikeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
  </svg>
);

export default function ActionButtons({ onNope, onLike, disabled = false }: ActionButtonsProps) {
  return (
    <div className="flex justify-center items-center space-x-8 mt-6">
      {/* Nope Button */}
      <button
        onClick={onNope}
        disabled={disabled}
        className="bg-white p-4 rounded-full shadow-lg border-2 border-red-500 text-red-500 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-110 active:scale-95"
        aria-label="Nope"
      >
        <NopeIcon />
      </button>

      {/* Like Button */}
      <button
        onClick={onLike}
        disabled={disabled}
        className="bg-white p-4 rounded-full shadow-lg border-2 border-green-500 text-green-500 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-300 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-110 active:scale-95"
        aria-label="Like"
      >
        <LikeIcon />
      </button>
    </div>
  );
}
