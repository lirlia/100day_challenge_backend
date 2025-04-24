'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';

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

export default function Home() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [pokemons, setPokemons] = useState<Pokemon[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // TODO: Add state for pagination if needed for listing

  const fetchPokemons = useCallback(async (query: string, type: string) => {
    setIsLoading(true);
    setError(null);
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
      setPokemons([]); // エラー時はリストをクリア
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初期表示時に全件取得 (または検索 API で空クエリ)
  useEffect(() => {
    fetchPokemons('', ''); // 初回は空クエリで検索
  }, [fetchPokemons]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    fetchPokemons(searchTerm, selectedType);
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6 text-center">ポケモン図鑑検索 (Elasticsearch)</h1>

      {/* 検索フォーム */}
      <form onSubmit={handleSearch} className="mb-8 p-4 bg-gray-100 rounded-lg shadow-md">
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
          <button
            type="submit"
            disabled={isLoading}
            className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '検索中...' : '検索'}
          </button>
        </div>
      </form>

      {/* 結果表示 */}
      {error && <p className="text-red-500 text-center mb-4">エラー: {error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {!isLoading && pokemons.length === 0 && !error && (
          <p className="text-gray-500 col-span-full text-center">該当するポケモンが見つかりません。</p>
        )}
        {pokemons.map((pokemon) => (
          <div key={pokemon.id} className="border rounded-lg p-4 shadow hover:shadow-lg transition-shadow bg-white">
            <img
              src={pokemon.imageUrl || '/placeholder.png'} // placeholder 画像を用意する場合
              alt={pokemon.name}
              className="w-32 h-32 mx-auto mb-2 object-contain"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.png'; }} // 画像エラー時の代替
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
            {/* 必要であれば特性なども表示 */}
            {/* <p className="text-xs text-gray-500">Abilities: {pokemon.abilities.join(', ')}</p> */}
          </div>
        ))}
      </div>

      {/* ローディングスピナー (中央表示) */}
      {isLoading && (
        <div className="flex justify-center items-center mt-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* TODO: Add pagination controls if using listing API */}

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
