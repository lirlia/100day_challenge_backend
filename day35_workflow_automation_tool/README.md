# Day35: ワークフロー自動化ツール

## 1. デザインコンセプト

-   今回は「**グラスモーフィズム (Glassmorphism)**」を採用します。
    -   背景にはぼかし効果を適用し、半透明の要素（カード、モーダルなど）を配置します。
    -   要素には微細な境界線や影を追加して、浮遊感を演出します。
    -   アクセントカラーは落ち着いた青や紫系を使用し、モダンで洗練された印象を目指します。

## 2. ユーザー管理

-   **ユーザー切替:**
    -   ヘッダーにシンプルなドロップダウンを設置します。
    -   `users` テーブルから取得したユーザー名を表示します。
    -   選択されたユーザーIDはクライアントサイドの状態管理（例: React Context or Zustand）で保持し、APIリクエストのヘッダーやパラメータ、またはUI表示のフィルタリングに使用します。
    -   最初は `users` テーブルに数名のサンプルユーザーを登録しておきます。

## 3. データモデル（DBスキーマ）

-   **`users`**:
    -   `id` INTEGER PRIMARY KEY AUTOINCREMENT
    -   `name` TEXT NOT NULL UNIQUE
    -   `email` TEXT UNIQUE -- ダミーデータでも可
-   **`workflows`**:
    -   `id` INTEGER PRIMARY KEY AUTOINCREMENT
    -   `name` TEXT NOT NULL
    -   `description` TEXT
    -   `created_by_user_id` INTEGER REFERENCES users(id)
    -   `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
    -   `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP
-   **`tasks`**:
    -   `id` INTEGER PRIMARY KEY AUTOINCREMENT
    -   `workflow_id` INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE
    -   `name` TEXT NOT NULL
    -   `description` TEXT
    -   `assigned_user_id` INTEGER REFERENCES users(id) -- 未割り当ては NULL
    -   `due_date` DATETIME -- 期限 (日付のみでも可)
    -   `status` TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'on_hold')) -- タスクの状態
    -   `order_index` INTEGER NOT NULL DEFAULT 0 -- ワークフロー内でのタスクの表示順/基本的な実行順
    -   `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
    -   `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP
-   **`task_dependencies`**: (タスク間の依存関係)
    -   `task_id` INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE -- このタスクは...
    -   `depends_on_task_id` INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE -- ...このタスクが完了するのを待つ
    -   PRIMARY KEY (task_id, depends_on_task_id)
    -   CHECK (task_id != depends_on_task_id) -- 自己依存の禁止

## 4. APIエンドポイント (`app/api/.../route.ts`)

-   **Users:**
    -   `GET /api/users`: 全ユーザーリスト取得
-   **Workflows:**
    -   `GET /api/workflows`: ワークフロー一覧取得 (各ワークフローのタスク数と完了タスク数を含む)
    -   `POST /api/workflows`: 新規ワークフロー作成 (リクエストボディ: `name`, `description`, `created_by_user_id`)
    -   `GET /api/workflows/[workflowId]`: 特定ワークフロー詳細取得 (ワークフロー情報 + 関連する全タスク + タスク間の依存関係)
    -   `PUT /api/workflows/[workflowId]`: ワークフロー更新 (リクエストボディ: `name`, `description`)
    -   `DELETE /api/workflows/[workflowId]`: ワークフロー削除 (関連するタスク、依存関係も削除)
-   **Tasks:**
    -   `POST /api/workflows/[workflowId]/tasks`: 特定ワークフローにタスク追加 (リクエストボディ: `name`, `description`, `assigned_user_id`, `due_date`, `order_index`)
    -   `PUT /api/tasks/[taskId]`: タスク更新 (リクエストボディ: `name`, `description`, `assigned_user_id`, `due_date`, `status`, `order_index`) - **状態変更ロジックを含む**
    -   `DELETE /api/tasks/[taskId]`: タスク削除 (関連する依存関係も削除)
-   **Task Dependencies:**
    -   `POST /api/tasks/[taskId]/dependencies`: タスクに依存関係追加 (リクエストボディ: `depends_on_task_id`) - **循環依存チェックを行う**
    -   `DELETE /api/tasks/[taskId]/dependencies/[dependsOnTaskId]`: タスクの依存関係削除

## 5. UI画面 (`app/(pages)/...` & `components/`)

-   **ヘッダー:**
    -   アプリタイトル: `Day35 - Workflow Automation` (グラスモーフィズムスタイル)
    -   ユーザー切替ドロップダウン
-   **`/` (ワークフロー一覧ページ):**
    -   グラスモーフィズムスタイルのカードでワークフローを表示。
    -   各カード: ワークフロー名, 説明(短縮), 作成者名, 進捗バー (完了タスク数 / 全タスク数), 作成日時。
    -   新規ワークフロー作成ボタン → モーダル表示。
    -   カードクリックで `/workflows/[workflowId]` へ遷移。
-   **`/workflows/[workflowId]` (ワークフロー詳細ページ):**
    -   ワークフローの詳細情報表示エリア (名前、説明、作成者など)。編集・削除ボタン。
    -   **タスク表示エリア:**
        -   カンバンボード形式 (カラム: `Pending`, `In Progress`, `Completed`, `On Hold`) を検討。
        -   各タスクカード: タスク名, 担当者アイコン/名前, 期限, 依存関係アイコン (あれば)。
        -   ドラッグ＆ドロップでステータス変更 (例: Pending → In Progress)。APIで `status` 更新。
        -   カードクリックでタスク編集モーダル表示。
        -   (オプション) タスク間に依存関係を示す矢印線を描画 (ライブラリ: `reactflow` や自前実装)。
    -   新規タスク追加ボタン → モーダル表示。
-   **モーダル:**
    -   ワークフロー作成/編集モーダル
    -   タスク作成/編集モーダル (依存関係の選択UIを含む)

## 6. 主要機能ロジック詳細

-   **ワークフロー進捗:** `GET /api/workflows` で取得時に、関連タスクを集計して算出。
-   **タスク状態変更 (`PUT /api/tasks/[taskId]`)**:
    -   リクエストされた `status` に変更する前に、`task_dependencies` を確認。
    -   `depends_on_task_id` に指定されているタスクが `completed` でない場合、`pending` 以外のステータスへの変更を禁止 (エラー応答)。
-   **依存関係追加 (`POST /api/tasks/[taskId]/dependencies`)**:
    -   追加しようとしている依存関係 (`taskId` → `depends_on_task_id`) によって循環が発生しないかチェックする。
        -   チェック方法例: `depends_on_task_id` から依存関係を辿っていき、`taskId` に到達したら循環と判断。
        -   循環する場合はエラー応答。
-   **DBトランザクション:**
    -   ワークフロー削除時、タスク削除時など、複数のテーブル操作が伴う場合は `better-sqlite3` のトランザクション (`db.transaction(() => { ... })`) を使用して原子性を担保する。

## 7. ログ出力

-   各APIエンドポイントの処理開始時、終了時、エラー発生時に詳細なログを出力。
    -   例: `[API][GET /api/workflows] Request received.`
    -   例: `[DB][Workflow] Fetched 5 workflows.`
    -   例: `[Error][PUT /api/tasks/12] Circular dependency detected.`
