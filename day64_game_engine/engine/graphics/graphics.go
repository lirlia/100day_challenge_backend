package graphics

import (
	"image/color"
	"log"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/ebitenutil"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/core"
)

// Sprite スプライト
type Sprite struct {
	Image    *ebiten.Image
	Position core.Vec2
	Size     core.Vec2
	Color    color.Color
	Visible  bool
}

// Animation アニメーション
type Animation struct {
	Frames       []*ebiten.Image
	FrameTime    float64
	CurrentFrame int
	Timer        float64
	Loop         bool
	Playing      bool
}

// Renderer 描画システム
type Renderer struct {
	screen       *ebiten.Image
	camera       Camera
	sprites      []*Sprite
	debugMode    bool
}

// Camera カメラ
type Camera struct {
	Position core.Vec2
	Zoom     float64
}

// NewRenderer 新しいレンダラーを作成
func NewRenderer() *Renderer {
	return &Renderer{
		camera: Camera{
			Position: core.Vec2{X: 0, Y: 0},
			Zoom:     1.0,
		},
		sprites:   make([]*Sprite, 0),
		debugMode: false,
	}
}

// NewSprite 新しいスプライトを作成
func NewSprite(image *ebiten.Image, pos, size core.Vec2) *Sprite {
	return &Sprite{
		Image:    image,
		Position: pos,
		Size:     size,
		Color:    color.RGBA{255, 255, 255, 255},
		Visible:  true,
	}
}

// NewColoredSprite 色付きの矩形スプライトを作成
func NewColoredSprite(pos, size core.Vec2, c color.Color) *Sprite {
	// 1x1の白い画像を作成
	img := ebiten.NewImage(int(size.X), int(size.Y))
	img.Fill(c)

	return &Sprite{
		Image:    img,
		Position: pos,
		Size:     size,
		Color:    color.RGBA{255, 255, 255, 255},
		Visible:  true,
	}
}

// NewAnimation 新しいアニメーションを作成
func NewAnimation(frames []*ebiten.Image, frameTime float64, loop bool) *Animation {
	return &Animation{
		Frames:       frames,
		FrameTime:    frameTime,
		CurrentFrame: 0,
		Timer:        0,
		Loop:         loop,
		Playing:      false,
	}
}

// AddSprite スプライトを追加
func (r *Renderer) AddSprite(sprite *Sprite) {
	r.sprites = append(r.sprites, sprite)
}

// RemoveSprite スプライトを削除
func (r *Renderer) RemoveSprite(sprite *Sprite) {
	for i, s := range r.sprites {
		if s == sprite {
			r.sprites = append(r.sprites[:i], r.sprites[i+1:]...)
			break
		}
	}
}

// ClearSprites 全スプライトを削除
func (r *Renderer) ClearSprites() {
	r.sprites = r.sprites[:0]
}

// SetCamera カメラを設定
func (r *Renderer) SetCamera(camera Camera) {
	r.camera = camera
}

// GetCamera カメラを取得
func (r *Renderer) GetCamera() Camera {
	return r.camera
}

// SetDebugMode デバッグモードを設定
func (r *Renderer) SetDebugMode(debug bool) {
	r.debugMode = debug
}

// Begin 描画開始
func (r *Renderer) Begin(screen *ebiten.Image) {
	r.screen = screen
	screen.Fill(color.RGBA{32, 32, 32, 255})
}

// End 描画終了
func (r *Renderer) End() {
	r.screen = nil
}

// DrawSprite スプライトを描画
func (r *Renderer) DrawSprite(sprite *Sprite) {
	if !sprite.Visible || r.screen == nil {
		return
	}

	// カメラ変換を適用
	screenPos := r.worldToScreen(sprite.Position)

	opts := &ebiten.DrawImageOptions{}

	// 位置設定
	opts.GeoM.Translate(screenPos.X, screenPos.Y)

	// ズーム適用
	opts.GeoM.Scale(r.camera.Zoom, r.camera.Zoom)

	// 色設定
	opts.ColorM.ScaleWithColor(sprite.Color)

	r.screen.DrawImage(sprite.Image, opts)
}

// DrawRectangle 矩形を描画
func (r *Renderer) DrawRectangle(pos, size core.Vec2, c color.Color) {
	screenPos := r.worldToScreen(pos)

	// 矩形を描画するための一時的な画像を作成
	img := ebiten.NewImage(int(size.X), int(size.Y))
	img.Fill(c)

	opts := &ebiten.DrawImageOptions{}
	opts.GeoM.Translate(screenPos.X, screenPos.Y)
	opts.GeoM.Scale(r.camera.Zoom, r.camera.Zoom)

	r.screen.DrawImage(img, opts)
}

// DrawLine 線を描画
func (r *Renderer) DrawLine(start, end core.Vec2, c color.Color) {
	screenStart := r.worldToScreen(start)
	screenEnd := r.worldToScreen(end)

	ebitenutil.DrawLine(r.screen, screenStart.X, screenStart.Y, screenEnd.X, screenEnd.Y, c)
}

// DrawText テキストを描画
func (r *Renderer) DrawText(txt string, pos core.Vec2, c color.Color) {
	screenPos := r.worldToScreen(pos)
	ebitenutil.DebugPrintAt(r.screen, txt, int(screenPos.X), int(screenPos.Y))
}

// DrawAllSprites 全スプライトを描画
func (r *Renderer) DrawAllSprites() {
	for _, sprite := range r.sprites {
		r.DrawSprite(sprite)
	}
}

// worldToScreen ワールド座標をスクリーン座標に変換
func (r *Renderer) worldToScreen(worldPos core.Vec2) core.Vec2 {
	return core.Vec2{
		X: (worldPos.X - r.camera.Position.X) * r.camera.Zoom,
		Y: (worldPos.Y - r.camera.Position.Y) * r.camera.Zoom,
	}
}

// screenToWorld スクリーン座標をワールド座標に変換
func (r *Renderer) screenToWorld(screenPos core.Vec2) core.Vec2 {
	return core.Vec2{
		X: screenPos.X/r.camera.Zoom + r.camera.Position.X,
		Y: screenPos.Y/r.camera.Zoom + r.camera.Position.Y,
	}
}

// LoadImageFromPath パスから画像を読み込み
func LoadImageFromPath(path string) (*ebiten.Image, error) {
	img, _, err := ebitenutil.NewImageFromFile(path)
	if err != nil {
		log.Printf("Failed to load image: %s", path)
		return nil, err
	}
	return img, nil
}

// CreateColoredImage 色付きの画像を作成
func CreateColoredImage(width, height int, c color.Color) *ebiten.Image {
	img := ebiten.NewImage(width, height)
	img.Fill(c)
	return img
}

// Animation のメソッド

// Update アニメーションを更新
func (a *Animation) Update(deltaTime float64) {
	if !a.Playing || len(a.Frames) == 0 {
		return
	}

	a.Timer += deltaTime

	if a.Timer >= a.FrameTime {
		a.Timer = 0
		a.CurrentFrame++

		if a.CurrentFrame >= len(a.Frames) {
			if a.Loop {
				a.CurrentFrame = 0
			} else {
				a.CurrentFrame = len(a.Frames) - 1
				a.Playing = false
			}
		}
	}
}

// GetCurrentFrame 現在のフレーム画像を取得
func (a *Animation) GetCurrentFrame() *ebiten.Image {
	if len(a.Frames) == 0 {
		return nil
	}
	return a.Frames[a.CurrentFrame]
}

// Play アニメーション再生開始
func (a *Animation) Play() {
	a.Playing = true
	a.Timer = 0
	a.CurrentFrame = 0
}

// Stop アニメーション停止
func (a *Animation) Stop() {
	a.Playing = false
	a.CurrentFrame = 0
	a.Timer = 0
}

// Pause アニメーション一時停止
func (a *Animation) Pause() {
	a.Playing = false
}

// Resume アニメーション再開
func (a *Animation) Resume() {
	a.Playing = true
}

// IsFinished アニメーションが終了したかチェック
func (a *Animation) IsFinished() bool {
	return !a.Playing && a.CurrentFrame >= len(a.Frames)-1
}

// Sprite のメソッド

// SetPosition 位置を設定
func (s *Sprite) SetPosition(pos core.Vec2) {
	s.Position = pos
}

// SetSize サイズを設定
func (s *Sprite) SetSize(size core.Vec2) {
	s.Size = size
}

// SetColor 色を設定
func (s *Sprite) SetColor(c color.Color) {
	s.Color = c
}

// SetVisible 表示状態を設定
func (s *Sprite) SetVisible(visible bool) {
	s.Visible = visible
}

// GetBounds スプライトの境界を取得
func (s *Sprite) GetBounds() (float64, float64, float64, float64) {
	return s.Position.X, s.Position.Y, s.Size.X, s.Size.Y
}
