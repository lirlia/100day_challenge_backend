'use client';

import React, { useState } from 'react';
import Avatar from '../../components/Avatar';

// アバターのカスタマイズ用のオプション
const skinColorOptions = ['#F5D0A9', '#FFD1DC', '#D1BAA1', '#A67B5B', '#713F1D'];
const hairColorOptions = ['#4A2700', '#000000', '#DAA520', '#8B4513', '#CD853F', '#A52A2A', '#800000', '#FFD700'];
const clothesColorOptions = ['#3498DB', '#FF6B6B', '#2ECC71', '#F1C40F', '#9B59B6', '#1ABC9C'];
const bgColorOptions = ['#E6F3FF', '#FFF0F0', '#F0FFF0', '#FFF8E1', '#F3E5F5'];
const avatarTypes = ['casual', 'business', 'sporty', 'artistic'];
const statusOptions = ['online', 'offline', 'away'];
const genderOptions = ['male', 'female'];

export default function AvatarDemo() {
  // アバターのカスタマイズ状態
  const [avatarConfig, setAvatarConfig] = useState({
    type: 'casual',
    skinColor: skinColorOptions[0],
    hairColor: hairColorOptions[0],
    clothesColor: clothesColorOptions[0],
    bgColor: bgColorOptions[0],
    status: 'online',
    gender: 'male'
  });

  // アバターのサイズ
  const [avatarSize, setAvatarSize] = useState(150);

  // カスタマイズオプション変更ハンドラー
  const handleConfigChange = (option: string, value: string) => {
    setAvatarConfig({
      ...avatarConfig,
      [option]: value
    });
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold mb-8">リアルなSVGアバター</h1>

      <div className="flex flex-col md:flex-row gap-8 w-full max-w-6xl">
        <div className="flex-1 flex justify-center items-center bg-white rounded-lg shadow-lg p-6">
          <Avatar
            type={avatarConfig.type as 'casual' | 'business' | 'sporty' | 'artistic'}
            size={avatarSize}
            skinColor={avatarConfig.skinColor}
            hairColor={avatarConfig.hairColor}
            clothesColor={avatarConfig.clothesColor}
            bgColor={avatarConfig.bgColor}
            status={avatarConfig.status as 'online' | 'offline' | 'away'}
            gender={avatarConfig.gender as 'male' | 'female'}
          />
        </div>

        <div className="flex-1 bg-white rounded-lg shadow-lg p-6 overflow-y-auto max-h-[600px]">
          <h2 className="text-xl font-semibold mb-4">アバターをカスタマイズする</h2>

          <div className="space-y-4">
            {/* 性別選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                性別
              </label>
              <div className="flex flex-wrap gap-2">
                {genderOptions.map(gender => (
                  <button
                    key={gender}
                    className={`px-3 py-1 rounded-full text-sm ${
                      avatarConfig.gender === gender
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                    onClick={() => handleConfigChange('gender', gender)}
                  >
                    {gender === 'male' ? '男性' : '女性'}
                  </button>
                ))}
              </div>
            </div>

            {/* アバタータイプ選択 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                タイプ
              </label>
              <div className="flex flex-wrap gap-2">
                {avatarTypes.map(type => (
                  <button
                    key={type}
                    className={`px-3 py-1 rounded-full text-sm ${
                      avatarConfig.type === type
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                    onClick={() => handleConfigChange('type', type)}
                  >
                    {type === 'casual' ? 'カジュアル' :
                     type === 'business' ? 'ビジネス' :
                     type === 'sporty' ? 'スポーティ' : 'アーティスティック'}
                  </button>
                ))}
              </div>
            </div>

            {/* 肌の色 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                肌の色
              </label>
              <div className="flex flex-wrap gap-2">
                {skinColorOptions.map(color => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-full ${
                      avatarConfig.skinColor === color ? 'ring-2 ring-offset-2 ring-blue-500' : ''
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => handleConfigChange('skinColor', color)}
                    aria-label={`肌の色: ${color}`}
                  />
                ))}
              </div>
            </div>

            {/* 髪の色 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                髪の色
              </label>
              <div className="flex flex-wrap gap-2">
                {hairColorOptions.map(color => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-full ${
                      avatarConfig.hairColor === color ? 'ring-2 ring-offset-2 ring-blue-500' : ''
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => handleConfigChange('hairColor', color)}
                    aria-label={`髪の色: ${color}`}
                  />
                ))}
              </div>
            </div>

            {/* 服の色 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                服の色
              </label>
              <div className="flex flex-wrap gap-2">
                {clothesColorOptions.map(color => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-full ${
                      avatarConfig.clothesColor === color ? 'ring-2 ring-offset-2 ring-blue-500' : ''
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => handleConfigChange('clothesColor', color)}
                    aria-label={`服の色: ${color}`}
                  />
                ))}
              </div>
            </div>

            {/* 背景色 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                背景色
              </label>
              <div className="flex flex-wrap gap-2">
                {bgColorOptions.map(color => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-full ${
                      avatarConfig.bgColor === color ? 'ring-2 ring-offset-2 ring-blue-500' : ''
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => handleConfigChange('bgColor', color)}
                    aria-label={`背景色: ${color}`}
                  />
                ))}
              </div>
            </div>

            {/* ステータス */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ステータス
              </label>
              <div className="flex flex-wrap gap-2">
                {statusOptions.map(status => (
                  <button
                    key={status}
                    className={`px-3 py-1 rounded-full text-sm ${
                      avatarConfig.status === status
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                    onClick={() => handleConfigChange('status', status)}
                  >
                    {status === 'online' ? 'オンライン' :
                     status === 'offline' ? 'オフライン' : '離席中'}
                  </button>
                ))}
              </div>
            </div>

            {/* サイズ調整 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                サイズ: {avatarSize}px
              </label>
              <input
                type="range"
                min="50"
                max="300"
                value={avatarSize}
                onChange={(e) => setAvatarSize(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-12 max-w-6xl w-full">
        <h2 className="text-2xl font-bold mb-6">さまざまなスタイルのアバター</h2>

        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-4">男性アバター</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {avatarTypes.map((type) => (
              <div key={type} className="bg-white p-4 rounded-lg shadow-md flex flex-col items-center">
                <Avatar
                  type={type as 'casual' | 'business' | 'sporty' | 'artistic'}
                  size={100}
                  skinColor="#F5D0A9"
                  hairColor={type === 'sporty' ? '#000000' :
                             type === 'business' ? '#8B4513' :
                             type === 'artistic' ? '#DAA520' : '#4A2700'}
                  clothesColor={type === 'sporty' ? '#2ECC71' :
                                type === 'business' ? '#3498DB' :
                                type === 'artistic' ? '#9B59B6' : '#FF6B6B'}
                  status={type === 'sporty' ? 'online' :
                          type === 'business' ? 'offline' :
                          type === 'artistic' ? 'away' : undefined}
                  gender="male"
                />
                <p className="mt-3 text-center font-medium">
                  {type === 'casual' ? 'カジュアル' :
                   type === 'business' ? 'ビジネス' :
                   type === 'sporty' ? 'スポーティ' : 'アーティスティック'}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xl font-semibold mb-4">女性アバター</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {avatarTypes.map((type) => (
              <div key={type} className="bg-white p-4 rounded-lg shadow-md flex flex-col items-center">
                <Avatar
                  type={type as 'casual' | 'business' | 'sporty' | 'artistic'}
                  size={100}
                  skinColor="#FFD1DC"
                  hairColor={type === 'sporty' ? '#CD853F' :
                            type === 'business' ? '#8B4513' :
                            type === 'artistic' ? '#DAA520' : '#4A2700'}
                  clothesColor={type === 'sporty' ? '#2ECC71' :
                                type === 'business' ? '#3498DB' :
                                type === 'artistic' ? '#9B59B6' : '#FF6B6B'}
                  status={type === 'sporty' ? 'online' :
                          type === 'business' ? 'offline' :
                          type === 'artistic' ? 'away' : undefined}
                  gender="female"
                />
                <p className="mt-3 text-center font-medium">
                  {type === 'casual' ? 'カジュアル' :
                   type === 'business' ? 'ビジネス' :
                   type === 'sporty' ? 'スポーティ' : 'アーティスティック'}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
