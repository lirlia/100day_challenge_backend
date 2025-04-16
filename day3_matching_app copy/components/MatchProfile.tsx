import React from 'react';
import Avatar from './Avatar';
import { HeartIcon, ChatBubbleLeftIcon } from '@heroicons/react/24/solid';
import { MapPinIcon } from '@heroicons/react/24/solid';

export interface MatchProfileProps {
  userId: number;
  name: string;
  age: number;
  location?: string;
  profileImageUrl?: string | null;
  bio?: string | null;
  interests?: string[];
  occupation?: string;
  isOnline?: boolean;
  avatarProps?: {
    type?: 'casual' | 'business' | 'sporty' | 'artistic';
    skinColor?: string;
    hairColor?: string;
    clothesColor?: string;
    bgColor?: string;
    gender?: 'male' | 'female';
  };
  onLike?: (userId: number) => void;
  onMessage?: (userId: number) => void;
}

const MatchProfile: React.FC<MatchProfileProps> = ({
  userId,
  name,
  age,
  location,
  profileImageUrl,
  bio,
  interests,
  occupation,
  isOnline = false,
  avatarProps = {
    type: 'casual',
    gender: 'male',
  },
  onLike,
  onMessage,
}) => {
  // 名前からランダムな背景色を生成
  const getColorFromName = (name: string): string => {
    const colors = [
      '#1ABC9C', '#2ECC71', '#3498DB', '#9B59B6', '#16A085',
      '#27AE60', '#2980B9', '#8E44AD', '#F1C40F', '#E67E22',
      '#E74C3C', '#D35400', '#C0392B', '#6D4C41', '#546E7A'
    ];

    let sum = 0;
    for (let i = 0; i < name.length; i++) {
      sum += name.charCodeAt(i);
    }

    return colors[sum % colors.length];
  };

  const bgColor = avatarProps?.bgColor || getColorFromName(name);

  return (
    <div className="match-profile-card bg-white rounded-lg shadow-lg overflow-hidden">
      {/* プロフィール画像 / アバター */}
      <div className="relative h-64 w-full">
        {profileImageUrl ? (
          // 画像がある場合は画像を表示
          <div
            className="w-full h-full bg-cover bg-center"
            style={{ backgroundImage: `url(${profileImageUrl})` }}
          />
        ) : (
          // 画像がない場合はアバターを表示
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: bgColor }}
          >
            <div className="w-48 h-48">
              <Avatar
                type={avatarProps?.type || 'casual'}
                size={192}
                skinColor={avatarProps?.skinColor || '#F5D0A9'}
                hairColor={avatarProps?.hairColor || '#4A2700'}
                clothesColor={avatarProps?.clothesColor || '#3498DB'}
                bgColor={bgColor}
                status={isOnline ? 'online' : 'offline'}
                gender={avatarProps?.gender || 'male'}
              />
            </div>
          </div>
        )}

        {/* オンラインステータスインジケーター */}
        <div className="absolute top-4 right-4 flex items-center">
          <span className={`h-3 w-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}></span>
          <span className="ml-1 text-xs font-medium text-white bg-black/40 px-2 py-1 rounded-full">
            {isOnline ? 'オンライン' : 'オフライン'}
          </span>
        </div>

        {/* 年齢バッジ */}
        <div className="absolute bottom-4 right-4 bg-white/90 rounded-full px-3 py-1 text-pink-600 font-bold shadow-md">
          {age}歳
        </div>
      </div>

      {/* プロフィール情報 */}
      <div className="p-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-xl font-bold text-gray-800">{name}</h3>
          {location && (
            <div className="flex items-center text-gray-600 text-sm">
              <MapPinIcon className="w-4 h-4 mr-1" />
              {location}
            </div>
          )}
        </div>

        {occupation && (
          <p className="text-sm text-gray-600 mb-2">
            {occupation}
          </p>
        )}

        {bio && (
          <p className="text-gray-700 mb-4 line-clamp-3">
            {bio}
          </p>
        )}

        {interests && interests.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-1">興味・関心</h4>
            <div className="flex flex-wrap gap-1">
              {interests.map((interest, index) => (
                <span
                  key={index}
                  className="inline-block bg-pink-100 text-pink-800 text-xs px-2 py-1 rounded-full"
                >
                  {interest}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* アクションボタン */}
        <div className="flex justify-between mt-4">
          <button
            onClick={() => onLike && onLike(userId)}
            className="flex-1 mr-2 flex justify-center items-center py-2 bg-pink-50 hover:bg-pink-100 text-pink-600 rounded-lg transition-colors"
          >
            <HeartIcon className="w-5 h-5 mr-1" />
            <span className="font-medium">いいね</span>
          </button>
          <button
            onClick={() => onMessage && onMessage(userId)}
            className="flex-1 ml-2 flex justify-center items-center py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
          >
            <ChatBubbleLeftIcon className="w-5 h-5 mr-1" />
            <span className="font-medium">メッセージ</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MatchProfile;
