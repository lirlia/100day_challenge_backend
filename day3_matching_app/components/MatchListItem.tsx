import Image from 'next/image';

// Type for the matched user data
type MatchedUser = {
  id: number;
  name: string;
  profileImageUrl: string | null;
};

interface MatchListItemProps {
  user: MatchedUser;
}

export default function MatchListItem({ user }: MatchListItemProps) {
  return (
    <div className="flex items-center p-3 sm:p-4 bg-white rounded-lg shadow hover:bg-gray-50 transition-colors border border-gray-100 w-full max-w-md">
      <div className="relative w-12 h-12 sm:w-16 sm:h-16 rounded-full overflow-hidden mr-3 sm:mr-4 flex-shrink-0">
        {user.profileImageUrl ? (
          <Image
            src={user.profileImageUrl}
            alt={`Profile picture of ${user.name}`}
            layout="fill"
            objectFit="cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-500">
            ? {/* Placeholder */}
          </div>
        )}
      </div>
      <div>
        <h3 className="text-base sm:text-lg font-semibold text-gray-800">{user.name}</h3>
        {/* Potential future addition: link to chat, last message, etc. */}
      </div>
      {/* Potential future addition: Action button (e.g., message, unmatch) */}
    </div>
  );
}
