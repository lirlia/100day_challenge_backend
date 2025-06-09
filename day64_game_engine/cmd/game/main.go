package main

import (
	"log"

	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/core"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/game"
)

func main() {
	log.Println("Starting TinyEngine Demo Game...")

	// ゲームエンジンを作成
	engine := core.NewGameEngine(800, 600, "Day64 - TinyEngine プラットフォーマー")

	// ゲームシーンを作成
	gameScene := game.NewGameScene()

	// シーンを設定
	err := engine.SetScene(gameScene)
	if err != nil {
		log.Fatalf("Failed to set scene: %v", err)
	}

	// ゲームを実行
	log.Println("Game engine starting...")
	if err := engine.Run(); err != nil {
		log.Fatalf("Game engine error: %v", err)
	}

	log.Println("Game engine stopped.")
}
