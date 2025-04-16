'use client';

import React from 'react';
import MatchProfile from '@/components/MatchProfile';

export default function ProfileDemo() {
  const handleLike = (userId: number) => {
    console.log(`ユーザー ${userId} にいいねしました`);
  };

  const handleMessage = (userId: number) => {
    console.log(`ユーザー ${userId} にメッセージを送ります`);
  };

  // サンプルユーザーデータ
  const users = [
    {
      userId: 1,
      name: '佐藤 大輔',
      age: 28,
      location: '東京都',
      bio: 'こんにちは！東京在住28歳のデザイナーです。音楽とアートが大好きで、週末はカフェ巡りをしています。新しい出会いを楽しみにしています！',
      interests: ['アート', '音楽', 'カフェ巡り', '映画鑑賞'],
      occupation: 'UIデザイナー',
      isOnline: true,
      avatarProps: {
        type: 'casual' as const,
        gender: 'male' as const,
        hairColor: '#4A2700',
        clothesColor: '#3498DB'
      }
    },
    {
      userId: 2,
      name: '田中 美咲',
      age: 25,
      location: '大阪府',
      bio: '看護師として働いています。趣味は料理と旅行です。休日はよく友達と出かけています。よろしくお願いします！',
      interests: ['料理', '旅行', 'ヨガ', '読書'],
      occupation: '看護師',
      isOnline: false,
      avatarProps: {
        type: 'sporty' as const,
        gender: 'female' as const,
        hairColor: '#8B4513',
        clothesColor: '#FF6B6B'
      }
    },
    {
      userId: 3,
      name: '鈴木 健太',
      age: 32,
      location: '名古屋市',
      bio: 'ITエンジニアとして働いています。趣味はジム通いと登山です。アウトドア派で冒険が好きです。',
      interests: ['テクノロジー', '登山', 'フィットネス', '写真'],
      occupation: 'ソフトウェアエンジニア',
      isOnline: true,
      avatarProps: {
        type: 'business' as const,
        gender: 'male' as const,
        hairColor: '#000000',
        clothesColor: '#2ECC71'
      }
    },
    {
      userId: 4,
      name: '山田 花子',
      age: 27,
      location: '福岡県',
      profileImageUrl: 'https://randomuser.me/api/portraits/women/44.jpg',
      bio: 'マーケティング会社で働いています。食べることと旅行が大好きです。新しい場所と美味しい食べ物を探すのが趣味です。',
      interests: ['グルメ', '旅行', 'マーケティング', 'ワイン'],
      occupation: 'マーケティングマネージャー',
      isOnline: true
    }
  ];

  return (
    <main className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-3xl font-bold mb-6 text-center">マッチングプロフィールカード</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
        {users.map(user => (
          <MatchProfile
            key={user.userId}
            userId={user.userId}
            name={user.name}
            age={user.age}
            location={user.location}
            profileImageUrl={user.profileImageUrl}
            bio={user.bio}
            interests={user.interests}
            occupation={user.occupation}
            isOnline={user.isOnline}
            avatarProps={user.avatarProps}
            onLike={handleLike}
            onMessage={handleMessage}
          />
        ))}
      </div>
    </main>
  );
}
