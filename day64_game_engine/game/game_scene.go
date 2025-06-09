package game

import (
	"image/color"
	"log"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/assets"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/core"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/graphics"
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
	platforms    []*physics.PhysicsBody
	gameState    GameState
	levelWidth   float64
	levelHeight  float64
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
	return &GameScene{
		physicsWorld: physics.NewPhysicsWorld(core.Vec2{X: 0, Y: 800}), // 重力
		renderer:     graphics.NewRenderer(),
		assetManager: assets.NewAssetManager("assets"),
		inputManager: core.NewInputManager(),
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
	// 地面を作成
	for x := float64(0); x < gs.levelWidth; x += 64 {
		ground := physics.NewPhysicsBody(core.Vec2{X: x, Y: gs.levelHeight - 32}, core.Vec2{X: 64, Y: 32}, 0)
		ground.IsStatic = true
		gs.physicsWorld.AddBody(ground)
		gs.platforms = append(gs.platforms, ground)
	}

	// プラットフォームを作成
	platforms := []struct {
		x, y, w, h float64
	}{
		{300, 450, 128, 32},
		{500, 350, 128, 32},
		{700, 250, 128, 32},
		{900, 400, 128, 32},
	}

	for _, p := range platforms {
		platform := physics.NewPhysicsBody(core.Vec2{X: p.x, Y: p.y}, core.Vec2{X: p.w, Y: p.h}, 0)
		platform.IsStatic = true
		gs.physicsWorld.AddBody(platform)
		gs.platforms = append(gs.platforms, platform)
	}

	// 敵を作成
	enemyImg, _ := gs.assetManager.GetImage("enemy")
	enemyPositions := []core.Vec2{
		{X: 400, Y: 400},
		{X: 600, Y: 300},
		{X: 800, Y: 200},
	}

	for _, pos := range enemyPositions {
		enemy := enemies.NewEnemy(pos, enemyImg, 100)
		gs.enemyManager.AddEnemy(enemy)
		gs.physicsWorld.AddBody(enemy.PhysicsBody)
	}

	// コインを作成
	coinImg, _ := gs.assetManager.GetImage("coin")
	coinPositions := []core.Vec2{
		{X: 350, Y: 420},
		{X: 550, Y: 320},
		{X: 750, Y: 220},
		{X: 950, Y: 370},
		{X: 200, Y: 500},
	}

	for _, pos := range coinPositions {
		coin := items.NewItem(pos, items.ItemTypeCoin, coinImg)
		gs.itemManager.AddItem(coin)
	}

	// ゴールを作成
	goalImg, _ := gs.assetManager.GetImage("goal")
	goal := items.NewItem(core.Vec2{X: 1100, Y: 500}, items.ItemTypeGoal, goalImg)
	gs.itemManager.AddItem(goal)
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
	gs.renderer.DrawText("Arrow Keys/WASD: Move, Space: Jump, ESC: Exit", core.Vec2{X: 10, Y: 550}, color.RGBA{255, 255, 255, 255})
}

// Cleanup シーンをクリーンアップ
func (gs *GameScene) Cleanup() {
	log.Println("Cleaning up game scene...")
}

// RestartGame ゲームを再開
func (gs *GameScene) RestartGame() {
	gs.player.Reset(core.Vec2{X: 100, Y: 400})
	gs.itemManager.ResetAll()
	gs.gameState = GameStatePlaying
	log.Println("Game restarted")
}
