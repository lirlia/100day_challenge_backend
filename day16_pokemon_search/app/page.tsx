'use client';

import { useState, useEffect, useCallback } from 'react';

// ポケモンの型 (API レスポンスの型)
interface Pokemon {
  id: number;
  name: string;
  nameJa: string | null;
  types: string[];
  abilities: string[];
  imageUrl: string | null;
  height: number | null;
  weight: number | null;
  typesJa?: string[];
}

// 英語名と日本語名のマッピング
const typeMapping: { [key: string]: string } = {
  normal: 'ノーマル', fire: 'ほのお', water: 'みず', electric: 'でんき',
  grass: 'くさ', ice: 'こおり', fighting: 'かくとう', poison: 'どく',
  ground: 'じめん', flying: 'ひこう', psychic: 'エスパー', bug: 'むし',
  rock: 'いわ', ghost: 'ゴースト', dragon: 'ドラゴン', dark: 'あく',
  steel: 'はがね', fairy: 'フェアリー'
};

// 選択肢用の配列 (表示順序維持のため)
const pokemonTypesForSelect = Object.keys(typeMapping);

// Debounce hook (カスタムフック)
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // コンポーネントのアンマウント時、または value/delay 変更前にタイマーをクリア
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function Home() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [pokemons, setPokemons] = useState<Pokemon[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // デバウンスされた検索語とタイプを取得 (300ms 遅延)
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const debouncedSelectedType = useDebounce(selectedType, 300); // タイプ選択もデバウンス

  const fetchPokemons = useCallback(async (query: string, type: string) => {
    // ローディング表示は即時反映させたいので、ここでは isDebouncing は見ない
    setIsLoading(true);
    setError(null);
    console.log(`Fetching with debounced values: query='${query}', type='${type}'`);
    try {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      if (type) params.set('type', type);

      const response = await fetch(`/api/pokemons/search?${params.toString()}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch Pokemon data');
      }
      const data: Pokemon[] = await response.json();
      setPokemons(data);
    } catch (err: any) {
      console.error("Fetch error:", err);
      setError(err.message || 'An unknown error occurred');
      setPokemons([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // デバウンスされた値が変更されたら API を呼び出す
  useEffect(() => {
    // 初回マウント時や値が空の時も検索を実行
    fetchPokemons(debouncedSearchTerm, debouncedSelectedType);
  }, [debouncedSearchTerm, debouncedSelectedType, fetchPokemons]);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6 text-center">Day16 ポケモン図鑑検索 (Elasticsearch)</h1>

      {/* 検索フォーム (form タグは残しても良いが onSubmit は不要) */}
      <div className="mb-8 p-4 bg-gray-100 rounded-lg shadow-md">
        <div className="flex flex-wrap gap-4 items-center">
          <input
            type="text"
            placeholder="キーワード検索 (名前, 日本語名, タイプ, 特性)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-grow p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="p-2 border rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">タイプで絞り込み</option>
            {pokemonTypesForSelect.map(type => (
              <option key={type} value={type}>
                {typeMapping[type] || type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 結果表示 */}
      {error && <p className="text-red-500 text-center mb-4">エラー: {error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {!isLoading && pokemons.length === 0 && !error && (
          <p className="text-gray-500 col-span-full text-center">該当するポケモンが見つかりません。</p>
        )}
        {pokemons.map((pokemon) => (
          <div key={pokemon.id} className="border rounded-lg p-4 shadow hover:shadow-lg transition-shadow bg-white">
            <img
              src={pokemon.imageUrl || '/placeholder.png'}
              alt={pokemon.name}
              className="w-32 h-32 mx-auto mb-2 object-contain"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }}
            />
            <h2 className="text-xl font-semibold text-center mb-1">
              {pokemon.nameJa || pokemon.name}
              {pokemon.nameJa && pokemon.name &&
                <span className="text-sm text-gray-500 font-normal ml-1 capitalize">({pokemon.name})</span>
              }
            </h2>
            <div className="flex justify-center gap-1 flex-wrap mb-2">
              {(pokemon.typesJa || pokemon.types).map((type, index) => {
                const typeEn = pokemon.types[index];
                return (
                  <span key={`${type}-${index}`} className={`px-2 py-0.5 rounded-full text-xs text-white type-${typeEn}`}>
                    {type}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ローディング表示は isLoading で制御 (変更なし) */}
      {isLoading && (
        <div className="flex justify-center items-center my-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* タイプ別背景色定義 (globals.css または style タグ) */}
      <style jsx global>{`
        .type-normal { background-color: #A8A77A; }
        .type-fire { background-color: #EE8130; }
        .type-water { background-color: #6390F0; }
        .type-electric { background-color: #F7D02C; }
        .type-grass { background-color: #7AC74C; }
        .type-ice { background-color: #96D9D6; }
        .type-fighting { background-color: #C22E28; }
        .type-poison { background-color: #A33EA1; }
        .type-ground { background-color: #E2BF65; }
        .type-flying { background-color: #A98FF3; }
        .type-psychic { background-color: #F95587; }
        .type-bug { background-color: #A6B91A; }
        .type-rock { background-color: #B6A136; }
        .type-ghost { background-color: #735797; }
        .type-dragon { background-color: #6F35FC; }
        .type-dark { background-color: #705746; }
        .type-steel { background-color: #B7B7CE; }
        .type-fairy { background-color: #D685AD; }
      `}</style>
    </div>
  );
}
