package player

import (
	"fmt"
	"image/color"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/core"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/graphics"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/physics"
)

// Player プレイヤー
type Player struct {
	PhysicsBody    *physics.PhysicsBody
	Sprite         *graphics.Sprite
	MoveSpeed      float64
	JumpPower      float64
	GroundedTime   float64 // 接地時間（ジャンプバッファ用）
	Health         int
	Score          int
	FacingRight    bool
}

// NewPlayer 新しいプレイヤーを作成
func NewPlayer(pos core.Vec2, image *ebiten.Image) *Player {
	size := core.Vec2{X: 32, Y: 32}

	// 物理ボディを作成
	body := physics.NewPhysicsBody(pos, size, 1.0)
	body.Friction = 0.9
	body.Bounce = 0.0

	// スプライトを作成
	sprite := graphics.NewSprite(image, pos, size)
	sprite.SetColor(color.RGBA{255, 255, 255, 255})

	return &Player{
		PhysicsBody:  body,
		Sprite:       sprite,
		MoveSpeed:    200.0,
		JumpPower:    400.0,
		GroundedTime: 0.0,
		Health:       3,
		Score:        0,
		FacingRight:  true,
	}
}

// Update プレイヤーを更新
func (p *Player) Update(deltaTime float64, input *core.InputManager) {
	// 接地時間を更新
	if p.PhysicsBody.OnGround {
		p.GroundedTime = 0.1 // 少しの間ジャンプ可能にする
	} else {
		p.GroundedTime -= deltaTime
		if p.GroundedTime < 0 {
			p.GroundedTime = 0
		}
	}

	// 移動処理
	movement := input.GetMovementInput()

	// ジャンプ処理
	if input.IsJumpPressed() && p.PhysicsBody.OnGround {
		p.PhysicsBody.Velocity.Y = -p.JumpPower
		p.PhysicsBody.OnGround = false
	}

	// 水平移動
	if movement.X != 0 {
		p.PhysicsBody.Velocity.X = movement.X * p.MoveSpeed
		p.FacingRight = movement.X > 0
	} else {
		// 摩擦
		p.PhysicsBody.Velocity.X *= 0.8
	}

	// 重力適用
	if !p.PhysicsBody.OnGround {
		p.PhysicsBody.Velocity.Y += 9.8 * deltaTime
	}

	// 物理更新
	p.PhysicsBody.Update()

	// スプライト位置を物理ボディと同期
	p.Sprite.SetPosition(p.PhysicsBody.Position)

	// 向きに応じてスプライトの色を変更（簡単な視覚フィードバック）
	if p.FacingRight {
		p.Sprite.SetColor(color.RGBA{100, 150, 255, 255})
	} else {
		p.Sprite.SetColor(color.RGBA{50, 100, 255, 255})
	}
}

// Draw プレイヤーを描画
func (p *Player) Draw(renderer *graphics.Renderer) {
	renderer.DrawSprite(p.Sprite)

	// デバッグ情報を描画
	debugText := fmt.Sprintf("Score: %d | Health: %d | Grounded: %v",
		p.Score, p.Health, p.PhysicsBody.OnGround)
	renderer.DrawText(debugText, core.Vec2{X: 10, Y: 10}, color.RGBA{255, 255, 255, 255})
}

// GetPosition 位置を取得
func (p *Player) GetPosition() core.Vec2 {
	return p.PhysicsBody.Position
}

// SetPosition 位置を設定
func (p *Player) SetPosition(pos core.Vec2) {
	p.PhysicsBody.SetPosition(pos)
	p.Sprite.SetPosition(pos)
}

// AddScore スコアを追加
func (p *Player) AddScore(points int) {
	p.Score += points
}

// TakeDamage ダメージを受ける
func (p *Player) TakeDamage(damage int) {
	p.Health -= damage
	if p.Health < 0 {
		p.Health = 0
	}
}

// Heal 回復
func (p *Player) Heal(amount int) {
	p.Health += amount
	if p.Health > 3 { // 最大体力3
		p.Health = 3
	}
}

// IsAlive 生存チェック
func (p *Player) IsAlive() bool {
	return p.Health > 0
}

// GetRect 当たり判定矩形を取得
func (p *Player) GetRect() physics.Rectangle {
	return p.PhysicsBody.GetRect()
}

// Reset プレイヤーをリセット
func (p *Player) Reset(startPos core.Vec2) {
	p.SetPosition(startPos)
	p.PhysicsBody.SetVelocity(core.Vec2{X: 0, Y: 0})
	p.Health = 3
	p.Score = 0
	p.FacingRight = true
	p.GroundedTime = 0
}

// GetVelocity 速度を取得
func (p *Player) GetVelocity() core.Vec2 {
	return p.PhysicsBody.Velocity
}

// IsOnGround 接地しているかチェック
func (p *Player) IsOnGround() bool {
	return p.PhysicsBody.OnGround || p.GroundedTime > 0
}
