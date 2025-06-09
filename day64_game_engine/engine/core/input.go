package core

import (
	"math"

	"github.com/hajimehoshi/ebiten/v2"
)

// InputManager 入力管理システム
type InputManager struct {
	keyStates     map[ebiten.Key]bool
	prevKeyStates map[ebiten.Key]bool
	mousePos      Vec2
	mousePressed  bool
	mousePrevPressed bool
}

// Vec2 2Dベクター
type Vec2 struct {
	X, Y float64
}

// NewInputManager 新しい入力マネージャーを作成
func NewInputManager() *InputManager {
	return &InputManager{
		keyStates:     make(map[ebiten.Key]bool),
		prevKeyStates: make(map[ebiten.Key]bool),
	}
}

// Update 入力状態を更新
func (im *InputManager) Update() {
	// 前フレームの状態を保存
	for key, pressed := range im.keyStates {
		im.prevKeyStates[key] = pressed
	}

	// 現在の状態を更新
	keys := []ebiten.Key{
		ebiten.KeyArrowLeft, ebiten.KeyArrowRight, ebiten.KeyArrowUp, ebiten.KeyArrowDown,
		ebiten.KeyA, ebiten.KeyD, ebiten.KeyW, ebiten.KeyS,
		ebiten.KeySpace, ebiten.KeyEnter, ebiten.KeyEscape,
	}

	for _, key := range keys {
		im.keyStates[key] = ebiten.IsKeyPressed(key)
	}

	// マウス状態更新
	mouseX, mouseY := ebiten.CursorPosition()
	im.mousePos = Vec2{X: float64(mouseX), Y: float64(mouseY)}
	im.mousePrevPressed = im.mousePressed
	im.mousePressed = ebiten.IsMouseButtonPressed(ebiten.MouseButtonLeft)
}

// IsKeyPressed キーが押されているかチェック
func (im *InputManager) IsKeyPressed(key ebiten.Key) bool {
	return im.keyStates[key]
}

// IsKeyJustPressed キーが今フレームで押されたかチェック
func (im *InputManager) IsKeyJustPressed(key ebiten.Key) bool {
	return im.keyStates[key] && !im.prevKeyStates[key]
}

// IsKeyJustReleased キーが今フレームで離されたかチェック
func (im *InputManager) IsKeyJustReleased(key ebiten.Key) bool {
	return !im.keyStates[key] && im.prevKeyStates[key]
}

// GetMousePosition マウス座標を取得
func (im *InputManager) GetMousePosition() Vec2 {
	return im.mousePos
}

// IsMousePressed マウスボタンが押されているかチェック
func (im *InputManager) IsMousePressed() bool {
	return im.mousePressed
}

// IsMouseJustPressed マウスボタンが今フレームで押されたかチェック
func (im *InputManager) IsMouseJustPressed() bool {
	return im.mousePressed && !im.mousePrevPressed
}

// IsMouseJustReleased マウスボタンが今フレームで離されたかチェック
func (im *InputManager) IsMouseJustReleased() bool {
	return !im.mousePressed && im.mousePrevPressed
}

// GetMovementInput 移動用の入力を取得 (-1.0 ~ 1.0)
func (im *InputManager) GetMovementInput() Vec2 {
	var movement Vec2

	// 左右移動
	if im.IsKeyPressed(ebiten.KeyArrowLeft) || im.IsKeyPressed(ebiten.KeyA) {
		movement.X = -1.0
	} else if im.IsKeyPressed(ebiten.KeyArrowRight) || im.IsKeyPressed(ebiten.KeyD) {
		movement.X = 1.0
	}

	// 上下移動
	if im.IsKeyPressed(ebiten.KeyArrowUp) || im.IsKeyPressed(ebiten.KeyW) {
		movement.Y = -1.0
	} else if im.IsKeyPressed(ebiten.KeyArrowDown) || im.IsKeyPressed(ebiten.KeyS) {
		movement.Y = 1.0
	}

	return movement
}

// IsJumpPressed ジャンプキーが押されたかチェック
func (im *InputManager) IsJumpPressed() bool {
	return im.IsKeyJustPressed(ebiten.KeySpace)
}

// Vec2 のメソッド

// Add ベクター加算
func (v Vec2) Add(other Vec2) Vec2 {
	return Vec2{X: v.X + other.X, Y: v.Y + other.Y}
}

// Sub ベクター減算
func (v Vec2) Sub(other Vec2) Vec2 {
	return Vec2{X: v.X - other.X, Y: v.Y - other.Y}
}

// Mul スカラー乗算
func (v Vec2) Mul(scalar float64) Vec2 {
	return Vec2{X: v.X * scalar, Y: v.Y * scalar}
}

// Length ベクターの長さ
func (v Vec2) Length() float64 {
	return math.Sqrt(v.X*v.X + v.Y*v.Y)
}

// Normalize 正規化
func (v Vec2) Normalize() Vec2 {
	length := v.Length()
	if length == 0 {
		return Vec2{}
	}
	return Vec2{X: v.X / length, Y: v.Y / length}
}
