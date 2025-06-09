package game

import (
	"image/color"
	"log"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/assets"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/core"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/graphics"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/levels"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/physics"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/game/enemies"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/game/items"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/game/player"
)

// GameScene ゲームシーン
type GameScene struct {
	player       *player.Player
	enemyManager *enemies.EnemyManager
	itemManager  *items.ItemManager
	physicsWorld *physics.PhysicsWorld
	renderer     *graphics.Renderer
	assetManager *assets.AssetManager
	inputManager *core.InputManager
	levelLoader  *levels.LevelLoader
	platforms    []*physics.PhysicsBody
	gameState    GameState
	levelWidth   float64
	levelHeight  float64
	currentLevel *levels.Level
}

// GameState ゲーム状態
type GameState int

const (
	GameStatePlaying GameState = iota
	GameStatePaused
	GameStateGameOver
	GameStateWin
)

// NewGameScene 新しいゲームシーンを作成
func NewGameScene() *GameScene {
	// レベルローダーを作成
	levelLoader, err := levels.NewLevelLoader()
	if err != nil {
		log.Printf("Failed to create level loader: %v", err)
		levelLoader = nil
	}

	return &GameScene{
		physicsWorld: physics.NewPhysicsWorld(core.Vec2{X: 0, Y: 800}), // 重力
		renderer:     graphics.NewRenderer(),
		assetManager: assets.NewAssetManager("assets"),
		inputManager: core.NewInputManager(),
		levelLoader:  levelLoader,
		enemyManager: enemies.NewEnemyManager(),
		itemManager:  items.NewItemManager(),
		platforms:    make([]*physics.PhysicsBody, 0),
		gameState:    GameStatePlaying,
		levelWidth:   1200,
		levelHeight:  600,
	}
}

// Initialize シーンを初期化
func (gs *GameScene) Initialize() error {
	log.Println("Initializing game scene...")

	// デフォルトアセットを作成
	gs.assetManager.CreateDefaultAssets()

	// プレイヤーを作成 (地面近くに配置)
	playerImg, _ := gs.assetManager.GetImage("player")
	gs.player = player.NewPlayer(core.Vec2{X: 100, Y: gs.levelHeight - 64}, playerImg)
	gs.physicsWorld.AddBody(gs.player.PhysicsBody)

	// レベルを構築
	gs.buildLevel()

	log.Println("Game scene initialized successfully")
	return nil
}

// buildLevel レベルを構築
func (gs *GameScene) buildLevel() {
	// 既存のプラットフォーム、敵、アイテムをクリア
	for _, platform := range gs.platforms {
		gs.physicsWorld.RemoveBody(platform)
	}
	gs.platforms = gs.platforms[:0] // スライスをクリア

	// 既存の敵をクリア
	gs.enemyManager.ClearAll()

	// 既存のアイテムをクリア
	gs.itemManager.ClearAll()

	var levelData *levels.LevelData
	var level *levels.Level

	// レベルローダーからレベルデータを読み込み
	if gs.levelLoader != nil {
		var err error
		levelData, level, err = gs.levelLoader.LoadLatestLevelData()
		if err != nil {
			log.Printf("Failed to load level data: %v", err)
			levelData = gs.getDefaultLevelData()
		} else {
			gs.currentLevel = level
			if level != nil {
				gs.levelWidth = float64(level.Width)
				gs.levelHeight = float64(level.Height)
				log.Printf("Loaded level: %s (%dx%d)", level.Name, level.Width, level.Height)
			}
		}
	} else {
		levelData = gs.getDefaultLevelData()
	}

	// プレイヤーを開始位置に配置
	gs.player.PhysicsBody.Position = core.Vec2{X: levelData.PlayerStart.X, Y: levelData.PlayerStart.Y}

	// プラットフォームを作成
	for _, platform := range levelData.Platforms {
		platformBody := physics.NewPhysicsBody(
			core.Vec2{X: platform.X, Y: platform.Y},
			core.Vec2{X: platform.Width, Y: platform.Height},
			0,
		)
		platformBody.IsStatic = true
		gs.physicsWorld.AddBody(platformBody)
		gs.platforms = append(gs.platforms, platformBody)
	}
	log.Printf("Total platforms created: %d", len(gs.platforms))

	// 敵を作成
	enemyImg, _ := gs.assetManager.GetImage("enemy")
	for _, enemy := range levelData.Enemies {
		enemyEntity := enemies.NewEnemy(
			core.Vec2{X: enemy.X, Y: enemy.Y},
			enemyImg,
			enemy.PatrolDistance,
		)
		gs.enemyManager.AddEnemy(enemyEntity)
		gs.physicsWorld.AddBody(enemyEntity.PhysicsBody)
	}

	// アイテムを作成
	coinImg, _ := gs.assetManager.GetImage("coin")
	goalImg, _ := gs.assetManager.GetImage("goal")

	for _, item := range levelData.Items {
		var itemImg *ebiten.Image
		var itemType items.ItemType

		switch item.Type {
		case "coin":
			itemImg = coinImg
			itemType = items.ItemTypeCoin
		case "goal":
			itemImg = goalImg
			itemType = items.ItemTypeGoal
		default:
			continue
		}

		itemEntity := items.NewItem(
			core.Vec2{X: item.X, Y: item.Y},
			itemType,
			itemImg,
		)
		gs.itemManager.AddItem(itemEntity)
	}
}

// getDefaultLevelData デフォルトレベルデータを返す
func (gs *GameScene) getDefaultLevelData() *levels.LevelData {
	return &levels.LevelData{
		Platforms: []levels.Platform{
			{ID: "ground1", X: 0, Y: 568, Width: 1200, Height: 32, Type: "ground"},
			{ID: "platform1", X: 300, Y: 450, Width: 128, Height: 32, Type: "platform"},
			{ID: "platform2", X: 500, Y: 350, Width: 128, Height: 32, Type: "platform"},
			{ID: "platform3", X: 700, Y: 250, Width: 128, Height: 32, Type: "platform"},
			{ID: "platform4", X: 900, Y: 400, Width: 128, Height: 32, Type: "platform"},
		},
		Enemies: []levels.Enemy{
			{ID: "enemy1", X: 400, Y: 400, PatrolDistance: 100},
			{ID: "enemy2", X: 600, Y: 300, PatrolDistance: 100},
			{ID: "enemy3", X: 800, Y: 200, PatrolDistance: 100},
		},
		Items: []levels.Item{
			{ID: "coin1", X: 350, Y: 420, Type: "coin"},
			{ID: "coin2", X: 550, Y: 320, Type: "coin"},
			{ID: "coin3", X: 750, Y: 220, Type: "coin"},
			{ID: "coin4", X: 950, Y: 370, Type: "coin"},
			{ID: "coin5", X: 200, Y: 500, Type: "coin"},
			{ID: "goal1", X: 1100, Y: 500, Type: "goal"},
		},
		PlayerStart: levels.PlayerPos{X: 100, Y: 536},
	}
}

// Update シーンを更新
func (gs *GameScene) Update(deltaTime float64) error {
	// 入力を更新
	gs.inputManager.Update()

	// リスタート処理
	if gs.inputManager.IsRestartPressed() &&
	   (gs.gameState == GameStateGameOver || gs.gameState == GameStateWin) {
		gs.RestartGame()
		return nil
	}

	// レベルリロード処理（L キー）
	if gs.inputManager.IsLevelReloadPressed() {
		gs.ReloadLevel()
		return nil
	}

	if gs.gameState != GameStatePlaying {
		return nil
	}

	// プレイヤーを更新
	gs.player.Update(deltaTime, gs.inputManager)

	// 敵を更新
	gs.enemyManager.UpdateAll(deltaTime)

	// アイテムを更新
	gs.itemManager.UpdateAll(deltaTime)

	// 物理シミュレーションを更新
	gs.physicsWorld.Update(deltaTime)

	// 衝突判定
	gs.checkCollisions()

	// カメラをプレイヤーに追従
	gs.updateCamera()

	// ゲーム状態をチェック
	gs.checkGameState()

	return nil
}

// checkCollisions 衝突判定
func (gs *GameScene) checkCollisions() {
	playerRect := gs.player.GetRect()

	// プレイヤーと敵の衝突
	for _, enemy := range gs.enemyManager.GetActiveEnemies() {
		if gs.checkRectCollision(playerRect, enemy.GetRect()) {
			gs.player.TakeDamage(1)
			log.Printf("Player hit by enemy! Health: %d", gs.player.Health)

			if !gs.player.IsAlive() {
				gs.gameState = GameStateGameOver
			}
		}
	}

	// プレイヤーとアイテムの衝突
	for _, item := range gs.itemManager.GetActiveItems() {
		if gs.checkRectCollision(playerRect, item.GetRect()) {
			points := item.Collect()
			gs.player.AddScore(points)

			if item.GetType() == items.ItemTypeGoal {
				gs.gameState = GameStateWin
			}

			log.Printf("Item collected! Score: %d", gs.player.Score)
		}
	}
}

// checkRectCollision 矩形衝突判定
func (gs *GameScene) checkRectCollision(a, b physics.Rectangle) bool {
	return a.X < b.X+b.Width &&
		a.X+a.Width > b.X &&
		a.Y < b.Y+b.Height &&
		a.Y+a.Height > b.Y
}

// updateCamera カメラを更新
func (gs *GameScene) updateCamera() {
	playerPos := gs.player.GetPosition()
	camera := gs.renderer.GetCamera()

	// プレイヤーを画面中央に保つ
	camera.Position.X = playerPos.X - 400 // 画面幅の半分
	camera.Position.Y = playerPos.Y - 300 // 画面高さの半分

	// カメラの境界制限
	if camera.Position.X < 0 {
		camera.Position.X = 0
	}
	if camera.Position.X > gs.levelWidth-800 {
		camera.Position.X = gs.levelWidth - 800
	}

	// Y軸の境界制限を追加
	if camera.Position.Y < 0 {
		camera.Position.Y = 0
	}
	if camera.Position.Y > gs.levelHeight-600 {
		camera.Position.Y = gs.levelHeight - 600
	}

	gs.renderer.SetCamera(camera)
}

// checkGameState ゲーム状態をチェック
func (gs *GameScene) checkGameState() {
	// プレイヤーが落下した場合
	if gs.player.GetPosition().Y > gs.levelHeight+100 {
		gs.gameState = GameStateGameOver
	}
}

// Draw シーンを描画
func (gs *GameScene) Draw(screen *ebiten.Image) {
	gs.renderer.Begin(screen)

	// プラットフォームを描画
	groundImg, _ := gs.assetManager.GetImage("ground")
	for _, platform := range gs.platforms {
		sprite := graphics.NewSprite(groundImg, platform.Position, platform.Size)
		sprite.SetColor(color.RGBA{139, 69, 19, 255})
		gs.renderer.DrawSprite(sprite)
	}

	// アイテムを描画
	gs.itemManager.DrawAll(gs.renderer)

	// 敵を描画
	gs.enemyManager.DrawAll(gs.renderer)

	// プレイヤーを描画
	gs.player.Draw(gs.renderer)

	// UIを描画
	gs.drawUI()

	gs.renderer.End()
}

// drawUI UIを描画
func (gs *GameScene) drawUI() {
	// ゲーム状態に応じたメッセージ
	switch gs.gameState {
	case GameStateGameOver:
		gs.renderer.DrawText("GAME OVER - Press R to restart", core.Vec2{X: 300, Y: 250}, color.RGBA{255, 0, 0, 255})
	case GameStateWin:
		gs.renderer.DrawText("YOU WIN! - Press R to restart", core.Vec2{X: 300, Y: 250}, color.RGBA{0, 255, 0, 255})
	}

	// 操作説明
	gs.renderer.DrawText("Arrow Keys/WASD: Move, Space: Jump, L: Reload Level, ESC: Exit", core.Vec2{X: 10, Y: 550}, color.RGBA{255, 255, 255, 255})
}

// Cleanup シーンをクリーンアップ
func (gs *GameScene) Cleanup() {
	log.Println("Cleaning up game scene...")
	if gs.levelLoader != nil {
		gs.levelLoader.Close()
	}
}

// RestartGame ゲームを再開
func (gs *GameScene) RestartGame() {
	// デフォルト開始位置
	startPos := core.Vec2{X: 100, Y: 400}

	// レベルローダーから開始位置を取得
	if gs.levelLoader != nil {
		levelData, _, err := gs.levelLoader.LoadLatestLevelData()
		if err == nil && levelData != nil {
			startPos = core.Vec2{X: levelData.PlayerStart.X, Y: levelData.PlayerStart.Y}
		}
	}

	gs.player.Reset(startPos)
	gs.itemManager.ResetAll()
	gs.gameState = GameStatePlaying
	log.Println("Game restarted")
}

// ReloadLevel レベルを再読み込み
func (gs *GameScene) ReloadLevel() {
	log.Println("Reloading level from database...")

	// レベルを再構築
	gs.buildLevel()

	// ゲーム状態をプレイ中にリセット
	gs.gameState = GameStatePlaying

	log.Println("Level reloaded successfully!")
}
