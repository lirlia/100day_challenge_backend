package enemies

import (
	"image/color"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/core"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/graphics"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/physics"
)

// Enemy 敵
type Enemy struct {
	PhysicsBody   *physics.PhysicsBody
	Sprite        *graphics.Sprite
	MoveSpeed     float64
	PatrolStart   core.Vec2
	PatrolEnd     core.Vec2
	MovingToEnd   bool
	Health        int
	Active        bool
}

// EnemyManager 敵管理システム
type EnemyManager struct {
	Enemies []*Enemy
}

// NewEnemy 新しい敵を作成
func NewEnemy(pos core.Vec2, image *ebiten.Image, patrolDistance float64) *Enemy {
	size := core.Vec2{X: 32, Y: 32}

	// 物理ボディを作成
	body := physics.NewPhysicsBody(pos, size, 1.0)
	body.Friction = 0.8
	body.Bounce = 0.0

	// スプライトを作成
	sprite := graphics.NewSprite(image, pos, size)
	sprite.SetColor(color.RGBA{255, 100, 100, 255})

	// パトロール範囲を設定
	patrolStart := pos
	patrolEnd := core.Vec2{X: pos.X + patrolDistance, Y: pos.Y}

	return &Enemy{
		PhysicsBody: body,
		Sprite:      sprite,
		MoveSpeed:   100.0,
		PatrolStart: patrolStart,
		PatrolEnd:   patrolEnd,
		MovingToEnd: true,
		Health:      1,
		Active:      true,
	}
}

// NewEnemyManager 新しい敵管理システムを作成
func NewEnemyManager() *EnemyManager {
	return &EnemyManager{
		Enemies: make([]*Enemy, 0),
	}
}

// AddEnemy 敵を追加
func (em *EnemyManager) AddEnemy(enemy *Enemy) {
	em.Enemies = append(em.Enemies, enemy)
}

// Update 敵を更新
func (e *Enemy) Update(deltaTime float64) {
	if !e.Active {
		return
	}

	// パトロール移動
	target := e.PatrolEnd
	if !e.MovingToEnd {
		target = e.PatrolStart
	}

	// 目標に向かって移動
	direction := target.Sub(e.PhysicsBody.Position)

	// 目標に近づいたら方向転換
	if direction.Length() < 10.0 {
		e.MovingToEnd = !e.MovingToEnd
	} else {
		// 正規化して移動速度を適用
		direction = direction.Normalize()
		e.PhysicsBody.Velocity.X = direction.X * e.MoveSpeed
	}

	// スプライト位置を物理ボディと同期
	e.Sprite.SetPosition(e.PhysicsBody.Position)

	// 移動方向に応じて色を変更
	if e.PhysicsBody.Velocity.X > 0 {
		e.Sprite.SetColor(color.RGBA{255, 50, 50, 255})
	} else {
		e.Sprite.SetColor(color.RGBA{200, 50, 50, 255})
	}
}

// Draw 敵を描画
func (e *Enemy) Draw(renderer *graphics.Renderer) {
	if !e.Active {
		return
	}
	renderer.DrawSprite(e.Sprite)
}

// UpdateAll 全敵を更新
func (em *EnemyManager) UpdateAll(deltaTime float64) {
	for _, enemy := range em.Enemies {
		enemy.Update(deltaTime)
	}
}

// DrawAll 全敵を描画
func (em *EnemyManager) DrawAll(renderer *graphics.Renderer) {
	for _, enemy := range em.Enemies {
		enemy.Draw(renderer)
	}
}

// GetPosition 位置を取得
func (e *Enemy) GetPosition() core.Vec2 {
	return e.PhysicsBody.Position
}

// SetPosition 位置を設定
func (e *Enemy) SetPosition(pos core.Vec2) {
	e.PhysicsBody.SetPosition(pos)
	e.Sprite.SetPosition(pos)
}

// TakeDamage ダメージを受ける
func (e *Enemy) TakeDamage(damage int) {
	e.Health -= damage
	if e.Health <= 0 {
		e.Active = false
	}
}

// IsActive アクティブかチェック
func (e *Enemy) IsActive() bool {
	return e.Active
}

// GetRect 当たり判定矩形を取得
func (e *Enemy) GetRect() physics.Rectangle {
	return e.PhysicsBody.GetRect()
}

// Deactivate 非アクティブ化
func (e *Enemy) Deactivate() {
	e.Active = false
	e.Sprite.SetVisible(false)
}

// Activate アクティブ化
func (e *Enemy) Activate() {
	e.Active = true
	e.Sprite.SetVisible(true)
	e.Health = 1
}

// Reset 敵をリセット
func (e *Enemy) Reset(startPos core.Vec2) {
	e.SetPosition(startPos)
	e.PhysicsBody.SetVelocity(core.Vec2{X: 0, Y: 0})
	e.Health = 1
	e.Active = true
	e.MovingToEnd = true
	e.Sprite.SetVisible(true)
}

// GetActiveEnemies アクティブな敵の一覧を取得
func (em *EnemyManager) GetActiveEnemies() []*Enemy {
	activeEnemies := make([]*Enemy, 0)
	for _, enemy := range em.Enemies {
		if enemy.IsActive() {
			activeEnemies = append(activeEnemies, enemy)
		}
	}
	return activeEnemies
}

// GetEnemyCount 敵の総数を取得
func (em *EnemyManager) GetEnemyCount() int {
	return len(em.Enemies)
}

// GetActiveEnemyCount アクティブな敵の数を取得
func (em *EnemyManager) GetActiveEnemyCount() int {
	count := 0
	for _, enemy := range em.Enemies {
		if enemy.IsActive() {
			count++
		}
	}
	return count
}

// ClearAll 全敵を削除
func (em *EnemyManager) ClearAll() {
	em.Enemies = em.Enemies[:0]
}
