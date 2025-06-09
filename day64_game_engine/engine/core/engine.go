package core

import (
	"fmt"
	"image/color"
	"log"
	"time"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/ebitenutil"
)

// GameEngine はゲームエンジンのメインコンテナ
type GameEngine struct {
	screenWidth  int
	screenHeight int
	title        string
	running      bool
	currentScene Scene
	deltaTime    float64
	lastTime     time.Time
	fpsCounter   *FPSCounter
}

// Scene インターフェース - 各ゲームシーンが実装する
type Scene interface {
	Update(deltaTime float64) error
	Draw(screen *ebiten.Image)
	Initialize() error
	Cleanup()
}

// FPSCounter FPS計測用
type FPSCounter struct {
	frameCount int
	lastTime   time.Time
	fps        float64
}

// NewGameEngine 新しいゲームエンジンを作成
func NewGameEngine(width, height int, title string) *GameEngine {
	return &GameEngine{
		screenWidth:  width,
		screenHeight: height,
		title:        title,
		running:      false,
		fpsCounter:   &FPSCounter{lastTime: time.Now()},
		lastTime:     time.Now(),
	}
}

// SetScene 現在のシーンを設定
func (e *GameEngine) SetScene(scene Scene) error {
	if e.currentScene != nil {
		e.currentScene.Cleanup()
	}

	e.currentScene = scene
	if scene != nil {
		return scene.Initialize()
	}
	return nil
}

// Run ゲームループを開始
func (e *GameEngine) Run() error {
	if e.currentScene == nil {
		return fmt.Errorf("no scene set")
	}

	log.Printf("Starting TinyEngine: %s (%dx%d)", e.title, e.screenWidth, e.screenHeight)

	ebiten.SetWindowSize(e.screenWidth, e.screenHeight)
	ebiten.SetWindowTitle(e.title)

	e.running = true
	e.lastTime = time.Now()

	return ebiten.RunGame(e)
}

// Stop ゲームループを停止
func (e *GameEngine) Stop() {
	e.running = false
}

// Update Ebitenから呼ばれる更新処理
func (e *GameEngine) Update() error {
	if !e.running {
		return ebiten.Termination
	}

	// Delta time計算
	now := time.Now()
	e.deltaTime = now.Sub(e.lastTime).Seconds()
	e.lastTime = now

	// FPS更新
	e.fpsCounter.Update()

	// ESCキーで終了
	if ebiten.IsKeyPressed(ebiten.KeyEscape) {
		log.Println("Game terminated by user")
		return ebiten.Termination
	}

	// 現在のシーンを更新
	if e.currentScene != nil {
		return e.currentScene.Update(e.deltaTime)
	}

	return nil
}

// Draw Ebitenから呼ばれる描画処理
func (e *GameEngine) Draw(screen *ebiten.Image) {
	// 背景をクリア
	screen.Fill(color.RGBA{32, 32, 32, 255})

	// 現在のシーンを描画
	if e.currentScene != nil {
		e.currentScene.Draw(screen)
	}

	// FPS表示
	ebitenutil.DebugPrint(screen, fmt.Sprintf("FPS: %.1f", e.fpsCounter.GetFPS()))
}

// Layout Ebitenから呼ばれるレイアウト処理
func (e *GameEngine) Layout(outsideWidth, outsideHeight int) (int, int) {
	return e.screenWidth, e.screenHeight
}

// GetDeltaTime 前フレームからの経過時間を取得
func (e *GameEngine) GetDeltaTime() float64 {
	return e.deltaTime
}

// GetScreenSize 画面サイズを取得
func (e *GameEngine) GetScreenSize() (int, int) {
	return e.screenWidth, e.screenHeight
}

// FPSCounter のメソッド

// Update FPSを更新
func (f *FPSCounter) Update() {
	f.frameCount++
	now := time.Now()

	if now.Sub(f.lastTime) >= time.Second {
		f.fps = float64(f.frameCount) / now.Sub(f.lastTime).Seconds()
		f.frameCount = 0
		f.lastTime = now
	}
}

// GetFPS 現在のFPSを取得
func (f *FPSCounter) GetFPS() float64 {
	return f.fps
}