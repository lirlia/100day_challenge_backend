import Image from 'next/image';

// Define the type for the user prop, based on the full User model
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

interface ProfileCardProps {
  user: UserProfile;
}

export default function ProfileCard({ user }: ProfileCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden w-[90vw] max-w-sm border border-gray-200 mx-auto">
      <div className="relative h-64 w-full">
        {user.profileImageUrl ? (
          <Image
            src={user.profileImageUrl}
            alt={`Profile picture of ${user.name}`}
            layout="fill"
            objectFit="cover"
            priority // Prioritize loading the image for the current card
          />
        ) : (
          <div className="bg-gray-200 h-full w-full flex items-center justify-center">
            <span className="text-gray-500">No Image</span>
          </div>
        )}
      </div>
      <div className="p-4">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">{user.name}, {user.age}</h2>
        <p className="text-gray-600 text-sm mb-3">{user.gender}</p>
        <p className="text-gray-700 leading-relaxed">{user.bio || '紹介文がありません。'}</p>
      </div>
    </div>
  );
}
