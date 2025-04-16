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
    <div className="font-mplus bg-white/90 rounded-3xl shadow-2xl overflow-hidden w-[90vw] max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl border border-pink-100 mx-auto flex flex-col relative">
      {/* アクセントグラデーションバー */}
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-pink-300 via-blue-200 to-orange-200 rounded-t-3xl" />
      {/* 画像 */}
      <div className="relative h-60 sm:h-72 md:h-80 w-full mt-2 flex justify-center items-center">
        {user.profileImageUrl ? (
          <Image
            src={user.profileImageUrl}
            alt={`Profile picture of ${user.name}`}
            fill
            className="object-cover rounded-2xl border-4 border-white shadow-lg"
            priority
            sizes="(max-width: 640px) 90vw, (max-width: 768px) 768px, (max-width: 1024px) 1024px, 1280px"
          />
        ) : (
          <div className="bg-gray-200 h-full w-full flex items-center justify-center rounded-2xl">
            <span className="text-gray-400 text-4xl">?</span>
          </div>
        )}
      </div>
      {/* プロフィール情報 */}
      <div className="p-6 flex flex-col gap-2">
        <h2 className="text-2xl md:text-3xl font-bold text-pink-500 mb-1 tracking-tight flex items-center gap-2">
          {user.name}
          <span className="text-lg md:text-2xl text-gray-500 font-normal">{user.age}</span>
        </h2>
        <p className="text-sm md:text-base text-blue-400 mb-1">{user.gender}</p>
        <p className="text-gray-700 text-base md:text-lg leading-relaxed break-words min-h-[2.5rem]">{user.bio || '紹介文がありません。'}</p>
      </div>
    </div>
  );
}
