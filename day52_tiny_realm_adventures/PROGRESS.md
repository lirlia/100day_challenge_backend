# 進捗

以下に進捗を記載してください。


- [x] 
- [x] 
- [x] 
- [x] 
- [x] 
- [x] 
- [x] 

### 0. プロジェクトの仕様決定 (完了済)
*   **テーマ:** 小規模2DタイルベースMMORPG (ポーリングベース同期)
*   **コア機能:**
    *   キャラクター管理 (名前、HP、位置)
    *   マップ移動 (2Dグリッド)
    *   他プレイヤー表示 (ポーリング)
    *   NPCとのインタラクション (固定メッセージ)
    *   モンスターとの簡易戦闘 (クリック攻撃、HP減少、ドロップ)
    *   チャット機能 (ポーリング)
    *   簡易アイテムとインベントリ (回復アイテムなど)
*   **デザインテーマ:** レトロピクセルアート風 (Tailwind CSS)
*   **技術スタック:** Next.js (App Router), TypeScript, SQLite (better-sqlite3), Tailwind CSS

---

### 1. プロジェクト初期化
    *   [x] `template` ディレクトリをコピーして `day52_tiny_realm_adventures` を作成。
    *   [x] `day52_tiny_realm_adventures/package.json` の `name` フィールドを `day52_tiny_realm_adventures` に変更。
    *   [x] `day52_tiny_realm_adventures/README.md` を今回のアプリの設計内容で更新。
    *   [x] `day52_tiny_realm_adventures/PROGRESS.md` を作成し、この作業手順を記述。
    *   [x] `app/layout.tsx` と `app/page.tsx` を基本構成で作成 (タイトル: "Day52 - タイニーレルム冒険譚")。
    *   [x] `app/globals.css` にピクセルアート風デザインのための基本的なスタイルを追加 (フォント、背景色など)。
    *   [x] Gitコミット: `day52: step 1/8 project initialization`

---

### 2. データモデリングとDB設定
    *   [x] `day52_tiny_realm_adventures/lib/db.ts` の `initializeSchema` 関数内に以下のテーブル作成SQLを記述:
        *   `players`: `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `name` (TEXT UNIQUE), `x` (INTEGER), `y` (INTEGER), `hp` (INTEGER), `maxHp` (INTEGER), `attackPower` (INTEGER), `lastSeen` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)
        *   `npcs`: `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `name` (TEXT), `x` (INTEGER), `y` (INTEGER), `message` (TEXT)
        *   `monsters`: `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `name` (TEXT), `x` (INTEGER), `y` (INTEGER), `hp` (INTEGER), `maxHp` (INTEGER), `attackPower` (INTEGER), `dropsItemId` (INTEGER, REFERENCES items(id) ON DELETE SET NULL), `respawnTimeSeconds` (INTEGER DEFAULT 60), `lastDefeatedAt` (TIMESTAMP)
        *   `items`: `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `name` (TEXT UNIQUE), `type` (TEXT CHECK(type IN ('potion', 'weapon', 'armor'))), `effectValue` (INTEGER), `description` (TEXT)
        *   `player_inventory`: `playerId` (INTEGER, REFERENCES players(id) ON DELETE CASCADE), `itemId` (INTEGER, REFERENCES items(id) ON DELETE CASCADE), `quantity` (INTEGER DEFAULT 1), PRIMARY KEY (`playerId`, `itemId`)
        *   `chat_messages`: `id` (INTEGER PRIMARY KEY AUTOINCREMENT), `playerId` (INTEGER, REFERENCES players(id) ON DELETE CASCADE), `playerName` (TEXT), `message` (TEXT), `timestamp` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP)
        *   `game_map_tiles`: `x` (INTEGER), `y` (INTEGER), `tile_type` (TEXT DEFAULT 'grass' CHECK(tile_type IN ('grass', 'wall', 'water', 'tree', 'rock'))), `is_passable` (BOOLEAN DEFAULT TRUE), PRIMARY KEY (`x`, `y`)
    *   [x] `day52_tiny_realm_adventures/db/dev.db` ファイルを削除 (もし存在すれば)。
    *   [x] 簡単な初期マップデータとNPC、モンスター、アイテムデータを `initializeSchema` に `INSERT` 文で追加。
    *   [x] Gitコミット: `day52: step 2/8 data modeling and db setup`

---

### 3. APIエンドポイント実装 (`app/api/.../route.ts`)
    *   [x] **ワールド情報API** (`app/api/world/route.ts`):
        *   `GET`: マップタイル、NPCs、モンスターズ、他プレイヤーの位置情報をまとめて取得。
    *   [x] **プレイヤーAPI** (`app/api/players/route.ts` および `app/api/players/[playerId]/.../route.ts`):
        *   `POST /api/players/join`: プレイヤー参加/復帰 (名前を受け取り、プレイヤー情報を返すか、新規作成)。
        *   `POST /api/players/[playerId]/move`: プレイヤー移動 (`{ direction: 'up'|'down'|'left'|'right' }` を受け取り、移動後のプレイヤー情報を返す)。壁やマップ境界の衝突判定も実装。
        *   `GET /api/players/[playerId]`: 特定プレイヤーの詳細情報取得 (HP、インベントリなど)。
    *   [x] **戦闘API** (`app/api/combat/route.ts`):
        *   `POST /api/combat/attack`: プレイヤーがモンスターを攻撃 (`{ playerId: number, monsterId: number }` を受け取る)。モンスターのHPを更新し、戦闘結果 (ダメージ量、モンスター討伐、アイテムドロップなど) を返す。モンスターが倒されたら `lastDefeatedAt` を更新。
    *   [x] **アイテムAPI** (`app/api/items/route.ts`):
        *   `POST /api/items/use`: プレイヤーがアイテムを使用 (`{ playerId: number, itemId: number, quantity?: number }` を受け取る)。アイテムの効果を適用 (例: HP回復) し、インベントリを更新。
    *   [x] **チャットAPI** (`app/api/chat/route.ts`):
        *   `POST /api/chat`: チャットメッセージ投稿 (`{ playerId: number, message: string }` を受け取る)。
        *   `GET /api/chat`: 最新のチャットメッセージ取得 (過去N件など)。
    *   [x] モンスターリスポーンロジック (APIリクエスト時や別プロセスで定期的にチェックを検討。今回はAPIリクエスト時に簡易的にチェック)。
    *   [x] 各APIの基本的な動作を `curl` などで確認。
    *   [x] Gitコミット: `day52: step 3/8 api endpoint implementation`

---

### 4. ユーザー識別機構とクライアントサイド状態管理
    *   [x] `app/(pages)/game/page.tsx` で `userId` (実際には `playerId`) を管理。最初はプロンプトで名前を入力させ、サーバーから `playerId` を取得。
    *   [x] 取得した `playerId` をクライアントの状態 (例: `useState` or `Zustand`) で管理し、APIリクエスト時に使用。
    *   [x] 簡易的なユーザー切り替え機能 (例: ページリロード時に再度名前を入力)。
    *   [x] Gitコミット: `day52: step 4/8 user identification and client state`

---

### 5. UIコンポーネント実装
    *   [x] **ゲームページ** (`app/(pages)/game/page.tsx`):
        *   [x] 全体のレイアウトを定義。
        *   [x] ゲーム状態 (マップデータ、プレイヤー情報、NPC、モンスター、チャット) をポーリングで定期的に取得 (`/api/world`, `/api/chat`, `/api/players/[playerId]`)。
    *   [x] **`GameMap`コンポーネント** (`components/GameMap.tsx`):
        *   [x] 受け取ったマップタイル、プレイヤー、NPC、モンスターのデータに基づいて2Dグリッドマップを描画 (Tailwind CSSのグリッドシステムを利用)。
        *   [x] タイルごとに異なる背景色やアイコンで表現 (ピクセルアート風)。
        *   [x] プレイヤーキャラクターの表示。
        *   [x] NPCとモンスターをマップ上に表示 (クリックでインタラクションできるようにする)。
        *   [x] キーボードイベント (矢印キー) で移動入力。
    *   [x] **`PlayerHUD`コンポーネント** (`components/PlayerHUD.tsx`):
        *   [x] 現在のプレイヤー名、HPバー、所持アイテムなどを表示。
    *   [x] **`ChatWindow`コンポーネント** (`components/ChatWindow.tsx`):
        *   [x] チャットメッセージのリストを表示。
        *   [x] メッセージ入力フィールドと送信ボタン。
    *   [x] **`InteractionModal`コンポーネント** (`components/InteractionModal.tsx`):
        *   [x] NPCとの会話メッセージや、モンスターとの戦闘選択肢などを表示するモーダル。
    *   [x] ピクセルアート風フォントやUI要素のスタイルを `globals.css` や各コンポーネントに適用。
    *   [x] Gitコミット: `day52: step 5/8 ui component implementation`

---

### 6. 主要業務フロー実装
    *   [ ] **ゲーム参加:** ページロード時に名前入力 → `POST /api/players/join` → 成功したらゲーム画面表示。
    *   [ ] **移動:** 矢印キー入力 → `POST /api/players/[playerId]/move` → 成功したらクライアント側のプレイヤー位置を更新 (サーバーからのレスポンスで同期)。
    *   [ ] **ワールド情報ポーリング:** 数秒ごとに `GET /api/world` を実行し、マップ上の全エンティティ (他プレイヤー、NPC、モンスター) の状態を更新・再描画。
    *   [ ] **NPCインタラクション:** NPCをクリック → NPCのメッセージを `InteractionModal` に表示。
    *   [ ] **モンスター戦闘:** モンスターをクリック → `InteractionModal` で攻撃選択肢表示 → 「攻撃」選択で `POST /api/combat/attack` → 結果を通知 (ダメージ量、討伐メッセージ、ドロップアイテムなど)。
    *   [ ] **アイテム取得と使用:** モンスター討伐時にアイテムがドロップされたら、自動的にインベントリに追加 (API側で処理)。`PlayerHUD` のインベントリからアイテムを選択 → 「使用」で `POST /api/items/use` → 効果反映。
    *   [ ] **チャット送受信:** `ChatWindow` でメッセージ入力・送信 → `POST /api/chat`。数秒ごとに `GET /api/chat` を実行し、新しいメッセージを `ChatWindow` に表示。
    *   [ ] Gitコミット: `day52: step 6/8 main business flow implementation`

---

### 7. デバッグとテスト
    *   [ ] 各機能の動作をブラウザで確認。
        *   複数ブラウザウィンドウを開き、別々のプレイヤーとしてログインして、他プレイヤーの表示やチャットが機能することを確認。
    *   [ ] サーバーログ (`console.log`, `console.error`) を確認し、エラーや意図しない動作がないかチェック。
    *   [ ] モンスターのリスポーンが機能するか確認。
    *   [ ] 簡単なPlaywrightテストを作成 (例: プレイヤー参加、数歩移動、チャット送信)。
        *   `tests/e2e/game.spec.ts`
    *   [ ] Playwrightテストを実行し、パスすることを確認。
    *   [ ] 不要な `console.log` 等を削除。
    *   [ ] Gitコミット: `day52: step 7/8 debugging and testing`

---

### 8. ドキュメント作成
    *   [ ] `day52_tiny_realm_adventures/README.md` を最終更新。
        *   アプリの概要、目的。
        *   起動方法 (`npm run dev`)。
        *   簡単な操作方法。
        *   APIエンドポイント一覧（任意）。
        *   使用したデザインテーマ（レトロピクセルアート風）について言及。
    *   [ ] `.cursor/rules/knowledge.mdc` に今回のアプリ (`Day52 - タイニーレルム冒険譚`) の情報を追記。
    *   [ ] Gitコミット: `day52: step 8/8 documentation`

---
