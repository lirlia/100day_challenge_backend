package physics

import (
	"math"

	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/core"
)

// PhysicsBody 物理オブジェクト
type PhysicsBody struct {
	Position core.Vec2
	Velocity core.Vec2
	Size     core.Vec2
	Mass     float64
	IsStatic bool
	OnGround bool
	Bounce   float64 // 反発係数 (0.0 ~ 1.0)
	Friction float64 // 摩擦係数
}

// PhysicsWorld 物理ワールド
type PhysicsWorld struct {
	Gravity core.Vec2
	Bodies  []*PhysicsBody
}

// Rectangle 矩形（衝突判定用）
type Rectangle struct {
	X, Y, Width, Height float64
}

// NewPhysicsWorld 新しい物理ワールドを作成
func NewPhysicsWorld(gravity core.Vec2) *PhysicsWorld {
	return &PhysicsWorld{
		Gravity: gravity,
		Bodies:  make([]*PhysicsBody, 0),
	}
}

// NewPhysicsBody 新しい物理オブジェクトを作成
func NewPhysicsBody(pos, size core.Vec2, mass float64) *PhysicsBody {
	return &PhysicsBody{
		Position: pos,
		Velocity: core.Vec2{},
		Size:     size,
		Mass:     mass,
		IsStatic: false,
		OnGround: false,
		Bounce:   0.0,
		Friction: 0.8,
	}
}

// AddBody 物理オブジェクトを追加
func (pw *PhysicsWorld) AddBody(body *PhysicsBody) {
	pw.Bodies = append(pw.Bodies, body)
}

// RemoveBody 物理オブジェクトを削除
func (pw *PhysicsWorld) RemoveBody(body *PhysicsBody) {
	for i, b := range pw.Bodies {
		if b == body {
			pw.Bodies = append(pw.Bodies[:i], pw.Bodies[i+1:]...)
			break
		}
	}
}

// Update 物理シミュレーションを更新
func (pw *PhysicsWorld) Update(deltaTime float64) {
	// 全ボディの物理更新
	for _, body := range pw.Bodies {
		if !body.IsStatic {
			pw.updateBody(body, deltaTime)
		}
	}

	// 衝突検出と解決
	pw.resolveCollisions()
}

// updateBody 個別ボディの物理更新
func (pw *PhysicsWorld) updateBody(body *PhysicsBody, deltaTime float64) {
	// 前フレームの接地状態を保存
	wasOnGround := body.OnGround

	// 地面チェックをリセット（衝突検出で再設定される）
	body.OnGround = false

	// 重力適用
	body.Velocity = body.Velocity.Add(pw.Gravity.Mul(deltaTime))

	// 位置更新
	body.Position = body.Position.Add(body.Velocity.Mul(deltaTime))

	// 摩擦適用（前フレームで地面にいた場合のみ）
	if wasOnGround && body.Velocity.Y >= 0 {
		body.Velocity.X *= body.Friction
	}
}

// resolveCollisions 衝突検出と解決
func (pw *PhysicsWorld) resolveCollisions() {
	for i := 0; i < len(pw.Bodies); i++ {
		for j := i + 1; j < len(pw.Bodies); j++ {
			bodyA := pw.Bodies[i]
			bodyB := pw.Bodies[j]

			if pw.checkCollision(bodyA, bodyB) {
				pw.resolveCollision(bodyA, bodyB)
			}
		}
	}
}

// checkCollision 矩形衝突判定
func (pw *PhysicsWorld) checkCollision(bodyA, bodyB *PhysicsBody) bool {
	rectA := Rectangle{
		X:      bodyA.Position.X,
		Y:      bodyA.Position.Y,
		Width:  bodyA.Size.X,
		Height: bodyA.Size.Y,
	}

	rectB := Rectangle{
		X:      bodyB.Position.X,
		Y:      bodyB.Position.Y,
		Width:  bodyB.Size.X,
		Height: bodyB.Size.Y,
	}

	return rectA.X < rectB.X+rectB.Width &&
		rectA.X+rectA.Width > rectB.X &&
		rectA.Y < rectB.Y+rectB.Height &&
		rectA.Y+rectA.Height > rectB.Y
}

// resolveCollision 衝突解決
func (pw *PhysicsWorld) resolveCollision(bodyA, bodyB *PhysicsBody) {
	// 静的オブジェクト同士は処理しない
	if bodyA.IsStatic && bodyB.IsStatic {
		return
	}

	// 重なり量を計算
	overlapX := math.Min(bodyA.Position.X+bodyA.Size.X-bodyB.Position.X,
		bodyB.Position.X+bodyB.Size.X-bodyA.Position.X)
	overlapY := math.Min(bodyA.Position.Y+bodyA.Size.Y-bodyB.Position.Y,
		bodyB.Position.Y+bodyB.Size.Y-bodyA.Position.Y)

	// より小さい重なりの方向で分離
	if overlapX < overlapY {
		// 水平方向の分離
		if bodyA.Position.X < bodyB.Position.X {
			// A is left of B
			if !bodyA.IsStatic {
				bodyA.Position.X -= overlapX / 2
				bodyA.Velocity.X = -bodyA.Velocity.X * bodyA.Bounce
			}
			if !bodyB.IsStatic {
				bodyB.Position.X += overlapX / 2
				bodyB.Velocity.X = -bodyB.Velocity.X * bodyB.Bounce
			}
		} else {
			// A is right of B
			if !bodyA.IsStatic {
				bodyA.Position.X += overlapX / 2
				bodyA.Velocity.X = -bodyA.Velocity.X * bodyA.Bounce
			}
			if !bodyB.IsStatic {
				bodyB.Position.X -= overlapX / 2
				bodyB.Velocity.X = -bodyB.Velocity.X * bodyB.Bounce
			}
		}
	} else {
		// 垂直方向の分離
		if bodyA.Position.Y < bodyB.Position.Y {
			// A is above B
			if !bodyA.IsStatic {
				bodyA.Position.Y -= overlapY / 2
				if bodyA.Velocity.Y > 0 {
					bodyA.Velocity.Y = -bodyA.Velocity.Y * bodyA.Bounce
				}
				// Aが動的で、Bが静的（地面）の場合、Aは地面の上にいる
				if bodyB.IsStatic {
					bodyA.OnGround = true
				}
			}
			if !bodyB.IsStatic {
				bodyB.Position.Y += overlapY / 2
				if bodyB.Velocity.Y < 0 {
					bodyB.Velocity.Y = -bodyB.Velocity.Y * bodyB.Bounce
				}
				// Bが動的で、Aが静的（地面）の場合、Bは地面の上にいる
				if bodyA.IsStatic {
					bodyB.OnGround = true
				}
			}
		} else {
			// A is below B
			if !bodyA.IsStatic {
				bodyA.Position.Y += overlapY / 2
				if bodyA.Velocity.Y < 0 {
					bodyA.Velocity.Y = -bodyA.Velocity.Y * bodyA.Bounce
				}
			}
			if !bodyB.IsStatic {
				bodyB.Position.Y -= overlapY / 2
				if bodyB.Velocity.Y > 0 {
					bodyB.Velocity.Y = -bodyB.Velocity.Y * bodyB.Bounce
				}
			}
		}
	}
}

// ApplyForce 力を適用
func (body *PhysicsBody) ApplyForce(force core.Vec2) {
	if !body.IsStatic && body.Mass > 0 {
		acceleration := force.Mul(1.0 / body.Mass)
		body.Velocity = body.Velocity.Add(acceleration)
	}
}

// ApplyImpulse 瞬間的な力を適用
func (body *PhysicsBody) ApplyImpulse(impulse core.Vec2) {
	if !body.IsStatic && body.Mass > 0 {
		body.Velocity = body.Velocity.Add(impulse.Mul(1.0 / body.Mass))
	}
}

// GetRect 矩形情報を取得
func (body *PhysicsBody) GetRect() Rectangle {
	return Rectangle{
		X:      body.Position.X,
		Y:      body.Position.Y,
		Width:  body.Size.X,
		Height: body.Size.Y,
	}
}

// SetPosition 位置を設定
func (body *PhysicsBody) SetPosition(pos core.Vec2) {
	body.Position = pos
}

// SetVelocity 速度を設定
func (body *PhysicsBody) SetVelocity(vel core.Vec2) {
	body.Velocity = vel
}

// Rectangle のメソッド

// Contains 点が矩形内にあるかチェック
func (r Rectangle) Contains(x, y float64) bool {
	return x >= r.X && x <= r.X+r.Width && y >= r.Y && y <= r.Y+r.Height
}

// Center 矩形の中心点を取得
func (r Rectangle) Center() core.Vec2 {
	return core.Vec2{
		X: r.X + r.Width/2,
		Y: r.Y + r.Height/2,
	}
}
