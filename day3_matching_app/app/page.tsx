'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import ProfileCard from '@/components/ProfileCard';
import ActionButtons from '@/components/ActionButtons';
import MatchModal from '@/components/MatchModal';
import { requestNotificationPermission, showNotification } from '@/lib/notification'; // Assuming notification helpers

// Define the type for user data used in this page
type UserProfile = {
  id: number;
  name: string;
  age: number;
  gender: string;
  bio: string | null;
  profileImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// Define type for the matched user data
type MatchedUser = {
    id: number;
    name: string;
    profileImageUrl: string | null;
}

// Define type for the swipe API response
interface SwipeResponse {
  swipe: any; // Consider defining a specific type for Swipe record if needed
  match: {
      id: number;
      user1Id: number;
      user2Id: number;
      createdAt: string; // Comes as string from JSON
      user1: MatchedUser;
      user2: MatchedUser;
  } | null;
  notificationRequired: boolean;
}

// Animation variants for Framer Motion
const cardVariants = {
  enter: (direction: number) => {
    return {
      x: direction > 0 ? 1000 : -1000,
      opacity: 0,
      scale: 0.8,
    };
  },
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
        duration: 0.4,
        ease: [0.645, 0.045, 0.355, 1] // easeInOutCubic
    }
  },
  exit: (direction: number) => {
    return {
      zIndex: 0,
      x: direction < 0 ? 1000 : -1000,
      opacity: 0,
      scale: 0.8,
      filter: 'blur(5px)',
      transition: {
          duration: 0.3,
          ease: [0.645, 0.045, 0.355, 1]
      }
    };
  },
  // Variant for side cards (not actively entering/exiting)
  side: {
    zIndex: 0,
    opacity: 0.6,
    scale: 0.9,
    filter: 'blur(2px)',
    transition: {
        duration: 0.4,
        ease: [0.645, 0.045, 0.355, 1]
    }
  }
};

// Custom hook for swipe direction (for animation)
const useSwipeDirection = () => {
  const [direction, setDirection] = useState(0);
  // Return state and setter separately
  return [direction, setDirection] as [number, React.Dispatch<React.SetStateAction<number>>];
}

export default function SwipePage() {
  const searchParams = useSearchParams();
  const [recommendations, setRecommendations] = useState<UserProfile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useSwipeDirection(); // Use the corrected hook return
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingSwipe, setIsProcessingSwipe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchDetails, setMatchDetails] = useState<SwipeResponse['match']>(null);
  const [currentUser, setCurrentUser] = useState<MatchedUser | null>(null); // Store current user for modal

  const userId = searchParams.get('userId');

  // Function to fetch recommendations
  const fetchRecommendations = useCallback(async () => {
    if (!userId) {
        setIsLoading(false);
        setError('ヘッダーからユーザーを選択してください。');
        setRecommendations([]);
        setCurrentIndex(0);
        return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/users/${userId}/recommendations`);
      if (!response.ok) {
        throw new Error('おすすめユーザーの取得に失敗しました');
      }
      const data: UserProfile[] = await response.json();
      setRecommendations(data);
      setCurrentIndex(0);
    } catch (err: any) {
      console.error('Error fetching recommendations:', err);
      setError(err.message || 'プロファイルの読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // Fetch recommendations when userId changes
  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  // Fetch current user details when userId changes (needed for MatchModal)
  useEffect(() => {
    const fetchCurrentUser = async () => {
      if (!userId) {
        setCurrentUser(null);
        return;
      }
      try {
        // We could add a specific endpoint /api/users/[userId] if needed,
        // but for simplicity, let's try fetching all users and finding the current one.
        // This is NOT efficient for many users, but okay for this demo.
        const res = await fetch('/api/users');
        if (!res.ok) throw new Error();
        const allUsers: MatchedUser[] = await res.json();
        const foundUser = allUsers.find(u => u.id.toString() === userId);
        // A more robust way would be to fetch the full profile:
        // const profileRes = await fetch(`/api/users/${userId}/profile`); // Example: Needs API endpoint
        // const foundUser = await profileRes.json();
        setCurrentUser(foundUser || null);
      } catch {
        console.error('Could not fetch current user details for modal');
        setCurrentUser(null); // Handle error case
      }
    };
    fetchCurrentUser();
  }, [userId]);

  // Ask for notification permission on mount
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const paginate = (newDirection: number) => {
    setDirection(newDirection); // Use the setter from the hook
    setCurrentIndex(prevIndex => {
        // Loop back or forward
        let nextIndex = prevIndex + newDirection;
        if (nextIndex < 0) {
            // Optionally loop back to end, or just stop
            // return recommendations.length - 1; // Loop
            return 0; // Stop at beginning
        } else if (nextIndex >= recommendations.length) {
            // Optionally loop back to start, or just stop
            // return 0; // Loop
            return recommendations.length; // Stop at end (will show empty state)
        }
        return nextIndex;
    });
};

  // Function to handle swipe action (like or skip)
  const handleSwipe = async (action: 'like' | 'skip') => {
    if (currentIndex >= recommendations.length || !userId || isProcessingSwipe) {
      return;
    }

    setIsProcessingSwipe(true);
    const swipedUser = recommendations[currentIndex];
    const swipeDir = action === 'like' ? 1 : -1; // Like goes right, Nope goes left

    try {
      const response = await fetch('/api/swipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          swiperUserId: parseInt(userId, 10),
          swipedUserId: swipedUser.id,
          action: action,
        }),
      });

      if (!response.ok) {
        // Handle specific errors like 409 Conflict (already swiped)
        if (response.status === 409) {
          console.warn('既にスワイプ済みのユーザーです。');
          paginate(swipeDir); // Move to next even on conflict
        } else {
           throw new Error(`${action === 'like' ? 'いいね' : 'スキップ'}に失敗しました`);
        }
      } else {
        const result: SwipeResponse = await response.json();
        console.log(`${action === 'like' ? 'いいね' : 'スキップ'}成功: user ${swipedUser.id}`);

        // Check if a match occurred
        if (result.match && result.notificationRequired) {
          console.log('マッチしました！', result.match);
          setMatchDetails(result.match);
          setShowMatchModal(true);
          // Show desktop notification
          showNotification(
              `マッチしました！ ✨`,
              `${result.match.user1Id.toString() === userId ? result.match.user2.name : result.match.user1.name}さんとマッチしました！`
          );
        }

        paginate(swipeDir); // Move to next on success
      }

    } catch (err: any) {
      console.error(`Error processing ${action}:`, err);
      setError(`${action === 'like' ? 'いいね' : 'スキップ'}処理に失敗しました。再試行してください。`);
      // Don't advance card on general error
    } finally {
      setIsProcessingSwipe(false);
    }
  };

  const handleLike = () => handleSwipe('like');
  const handleNope = () => handleSwipe('skip');

  const closeModal = () => {
    setShowMatchModal(false);
    setMatchDetails(null);
  };

  // --- Render Logic ---
  if (!userId) {
    return <div className="text-center p-10 text-gray-500">ヘッダーからユーザーを選択してスワイプを開始してください。</div>;
  }

  if (isLoading) {
    return <div className="text-center p-10">プロファイル読込中...</div>;
  }

  if (error) {
    return <div className="text-center p-10 text-red-600">エラー: {error}</div>;
  }

  // Get the index relative to the current index for animation
  const getCardIndex = (index: number) => {
      if (index < 0 || index >= recommendations.length) return null; // Out of bounds
      return index;
  }

  // Determine the indices to render (current, previous, next)
  const indicesToRender = [
      getCardIndex(currentIndex - 1),
      getCardIndex(currentIndex),
      getCardIndex(currentIndex + 1)
  ].filter(index => index !== null) as number[];

  return (
    <div className="w-full flex flex-col items-center justify-center pt-8 gap-y-8 sm:gap-y-12 md:gap-y-16 relative">
      {/* Bottom Fade Effect */}
      <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-pink-100 via-blue-100/50 to-transparent pointer-events-none z-20" />

      {/* Carousel Container - Increased height to accommodate animation */}
      <div className="relative flex justify-center items-center w-full h-[450px] sm:h-[550px] md:h-[650px] overflow-visible px-4" style={{ perspective: '1000px' }}>
        <AnimatePresence initial={false} custom={direction}>
          {recommendations.length > 0 && currentIndex < recommendations.length ? (
            <motion.div
              key={currentIndex} // Key change triggers animation
              custom={direction}
              variants={cardVariants}
              initial="enter"
              animate="center"
              exit="exit"
              drag="x" // Optional: Allow dragging
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={1}
              onDragEnd={(e, { offset, velocity }) => {
                const swipeThreshold = 100; // Distance threshold
                const swipePower = Math.abs(offset.x) * velocity.x;
                if (swipePower < -swipeThreshold) {
                  handleNope();
                } else if (swipePower > swipeThreshold) {
                  handleLike();
                }
              }}
              className="absolute top-0 flex items-center justify-center w-full h-full"
            >
              <ProfileCard user={recommendations[currentIndex]} />
            </motion.div>
          ) : (
            <div className="text-center p-10 text-gray-500">表示できるプロファイルは以上です。</div>
          )}
        </AnimatePresence>
      </div>

      {/* Action Buttons */}
      <ActionButtons
        onLike={handleLike}
        onNope={handleNope}
        disabled={isProcessingSwipe || currentIndex >= recommendations.length}
      />

      {/* Match Modal */}
      {matchDetails && (
        <MatchModal
          currentUser={currentUser}
          matchedUser={matchDetails.user1Id.toString() === userId ? matchDetails.user2 : matchDetails.user1}
          isOpen={showMatchModal}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
