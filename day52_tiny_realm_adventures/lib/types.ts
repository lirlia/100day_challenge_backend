export interface MapTileData {
  x: number;
  y: number;
  tile_type: "grass" | "wall" | "water" | "tree" | "rock";
  is_passable: boolean | number; // DBからは 0 or 1 で来る可能性
}

export interface NPCData {
  id: number;
  name: string;
  x: number;
  y: number;
  message: string;
}

export interface MonsterData {
  id: number;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  // attackPower?: number; // クライアント表示に必須ではない場合がある
}

export interface OtherPlayerData {
  id: number;
  name: string;
  x: number;
  y: number;
  // hp?: number;
  // maxHp?: number;
}

export interface WorldData {
  mapTiles: MapTileData[];
  npcs: NPCData[];
  monsters: MonsterData[];
  otherPlayers: OtherPlayerData[];
}

export interface ItemData {
  id: number;
  name: string;
  type: "potion" | "weapon" | "armor";
  effectValue?: number;
  description?: string;
  quantity?: number; // インベントリ表示用
}

// プレイヤー自身の詳細データ (セッションストレージやAPIレスポンス用)
export interface PlayerClientData {
  id: number;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attackPower: number;
  inventory: ItemData[];
  lastSeen?: string;
}

export interface ChatMessageData {
  id: number;
  playerId: number;
  playerName: string;
  message: string;
  timestamp: string;
}

// APIレスポンスの型 (例)
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

// InteractionModalで表示する内容の型
export type InteractionContent =
  | { type: 'npc'; data: NPCData }
  | { type: 'monster'; data: MonsterData }
  | { type: 'message'; title: string; text: string[] } //汎用メッセージモーダル
  | null;
