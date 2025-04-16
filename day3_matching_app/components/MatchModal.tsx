'use client';

import Image from 'next/image';

// Type for the matched user data passed to the modal
type MatchedUser = {
  id: number;
  name: string;
  profileImageUrl: string | null;
};

interface MatchModalProps {
  currentUser: MatchedUser | null; // The user currently using the app
  matchedUser: MatchedUser | null; // The user they matched with
  isOpen: boolean;
  onClose: () => void;
}

export default function MatchModal({ currentUser, matchedUser, isOpen, onClose }: MatchModalProps) {
  if (!isOpen || !currentUser || !matchedUser) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 transition-opacity duration-300 ease-in-out">
      <div className="bg-gradient-to-br from-pink-400 to-purple-500 rounded-lg shadow-2xl p-8 text-center max-w-md w-full mx-4 relative transform scale-100 transition-transform duration-300 ease-out">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-white hover:text-gray-200 focus:outline-none"
          aria-label="Close modal"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-4 animate-pulse">IT'S A MATCH!</h2>
        <p className="text-md sm:text-lg text-pink-100 mb-6">You and {matchedUser.name} liked each other!</p>

        <div className="flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-4 mb-6">
          {/* Current User Avatar */}
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-white shadow-lg overflow-hidden">
            {currentUser.profileImageUrl ? (
              <Image src={currentUser.profileImageUrl} alt={currentUser.name} layout="fill" objectFit="cover" />
            ) : (
              <div className="bg-gray-300 w-full h-full flex items-center justify-center text-gray-600">?</div>
            )}
          </div>

          {/* Heart Icon - Rotate on small screens */}
          <span className="text-4xl text-white animate-ping transform rotate-90 sm:rotate-0">❤️</span>

          {/* Matched User Avatar */}
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-white shadow-lg overflow-hidden">
            {matchedUser.profileImageUrl ? (
              <Image src={matchedUser.profileImageUrl} alt={matchedUser.name} layout="fill" objectFit="cover" />
            ) : (
              <div className="bg-gray-300 w-full h-full flex items-center justify-center text-gray-600">?</div>
            )}
          </div>
        </div>

        <button
          onClick={onClose} // Simple close button for now
          className="bg-white text-pink-500 font-bold py-2 px-6 rounded-full shadow-md hover:bg-pink-100 transition-colors duration-200"
        >
          Continue Swiping
        </button>
      </div>
    </div>
  );
}
