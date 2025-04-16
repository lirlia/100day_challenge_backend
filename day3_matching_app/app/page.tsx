'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
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

export default function SwipePage() {
  const searchParams = useSearchParams();
  const [recommendations, setRecommendations] = useState<UserProfile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
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
        setError('Please select a user first.');
        setRecommendations([]);
        setCurrentIndex(0);
        return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/users/${userId}/recommendations`);
      if (!response.ok) {
        throw new Error('Failed to fetch recommendations');
      }
      const data: UserProfile[] = await response.json();
      setRecommendations(data);
      setCurrentIndex(0);
    } catch (err: any) {
      console.error('Error fetching recommendations:', err);
      setError(err.message || 'Could not load profiles.');
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

  // Function to handle swipe action (like or skip)
  const handleSwipe = async (action: 'like' | 'skip') => {
    if (currentIndex >= recommendations.length || !userId || isProcessingSwipe) {
      return;
    }

    setIsProcessingSwipe(true);
    const swipedUser = recommendations[currentIndex];

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
          console.warn('Attempted to swipe a user already swiped.');
          // Move to the next card even if the swipe failed due to conflict
          setCurrentIndex(prev => prev + 1);
        } else {
           throw new Error(`Failed to ${action}`);
        }
      } else {
        const result: SwipeResponse = await response.json();
        console.log(`${action} successful for user ${swipedUser.id}`);

        // Check if a match occurred
        if (result.match && result.notificationRequired) {
          console.log('Match found!', result.match);
          setMatchDetails(result.match);
          setShowMatchModal(true);
          // Show desktop notification
          showNotification(
              `It's a Match! ✨`,
              `You matched with ${result.match.user1Id.toString() === userId ? result.match.user2.name : result.match.user1.name}!`
          );
        }

        // Move to the next card
        setCurrentIndex(prev => prev + 1);
      }

    } catch (err: any) {
      console.error(`Error processing ${action}:`, err);
      setError(`Failed to ${action}. Please try again.`);
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
    return <div className="text-center p-10 text-gray-500">Please select a user from the header to start swiping.</div>;
  }

  if (isLoading) {
    return <div className="text-center p-10">Loading profiles...</div>;
  }

  if (error) {
    return <div className="text-center p-10 text-red-600">Error: {error}</div>;
  }

  if (currentIndex >= recommendations.length) {
    return <div className="text-center p-10 text-gray-500">No more profiles to show. Check back later!</div>;
  }

  const currentUserProfile = recommendations[currentIndex];

  return (
    <div className="w-full flex items-center justify-center flex-col pt-8">
      {currentUserProfile ? (
        <ProfileCard user={currentUserProfile} />
      ) : (
        <div className="text-center p-10 text-gray-500">Profile not available.</div>
      )}
      <ActionButtons
        onLike={handleLike}
        onNope={handleNope}
        disabled={isProcessingSwipe || !currentUserProfile}
      />
      {matchDetails && (
        <MatchModal
          currentUser={currentUser} // Pass the fetched current user
          matchedUser={matchDetails.user1Id.toString() === userId ? matchDetails.user2 : matchDetails.user1}
          isOpen={showMatchModal}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
