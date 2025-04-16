'use client';

interface ActionButtonsProps {
  onNope: () => void;
  onLike: () => void;
  disabled?: boolean; // To disable buttons during loading/processing
}

// SVG Icon Components（カラフルに）
const NopeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-10 h-10">
    <circle cx="24" cy="24" r="22" fill="url(#nope-gradient)" />
    <defs>
      <linearGradient id="nope-gradient" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
        <stop stopColor="#60a5fa" />
        <stop offset="1" stopColor="#a5b4fc" />
      </linearGradient>
    </defs>
    <path d="M16 16 L32 32 M32 16 L16 32" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

const LikeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-10 h-10">
    <circle cx="24" cy="24" r="22" fill="url(#like-gradient)" />
    <defs>
      <linearGradient id="like-gradient" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
        <stop stopColor="#f472b6" />
        <stop offset="1" stopColor="#fbbf24" />
      </linearGradient>
    </defs>
    <path d="M24 34s-9-6.5-9-13.5A5.5 5.5 0 0 1 24 15a5.5 5.5 0 0 1 9 5.5C33 27.5 24 34 24 34z" fill="#fff" />
  </svg>
);

export default function ActionButtons({ onNope, onLike, disabled = false }: ActionButtonsProps) {
  return (
    <div className="flex justify-center items-center space-x-8 mt-8">
      {/* Nope Button */}
      <button
        onClick={onNope}
        disabled={disabled}
        className="font-mplus bg-gradient-to-br from-blue-300 to-blue-400 text-white p-6 rounded-full shadow-xl border-4 border-blue-200 hover:scale-110 hover:shadow-2xl hover:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Nope"
      >
        <NopeIcon />
      </button>

      {/* Like Button */}
      <button
        onClick={onLike}
        disabled={disabled}
        className="font-mplus bg-gradient-to-br from-pink-300 via-pink-400 to-orange-300 text-white p-6 rounded-full shadow-xl border-4 border-pink-200 hover:scale-110 hover:shadow-2xl hover:border-pink-400 focus:outline-none focus:ring-4 focus:ring-pink-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Like"
      >
        <LikeIcon />
      </button>
    </div>
  );
}
