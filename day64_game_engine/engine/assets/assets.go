package assets

import (
	"fmt"
	"image/color"
	"log"
	"path/filepath"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/ebitenutil"
)

// AssetManager アセット管理システム
type AssetManager struct {
	images map[string]*ebiten.Image
	sounds map[string][]byte // 音声データ（簡単のためbyte配列）
	basePath string
}

// NewAssetManager 新しいアセット管理システムを作成
func NewAssetManager(basePath string) *AssetManager {
	return &AssetManager{
		images:   make(map[string]*ebiten.Image),
		sounds:   make(map[string][]byte),
		basePath: basePath,
	}
}

// LoadImage 画像を読み込み
func (am *AssetManager) LoadImage(name, path string) error {
	fullPath := filepath.Join(am.basePath, path)

	img, _, err := ebitenutil.NewImageFromFile(fullPath)
	if err != nil {
		log.Printf("Failed to load image: %s (path: %s)", name, fullPath)
		return fmt.Errorf("failed to load image %s: %w", name, err)
	}

	am.images[name] = img
	log.Printf("Loaded image: %s from %s", name, fullPath)
	return nil
}

// GetImage 画像を取得
func (am *AssetManager) GetImage(name string) (*ebiten.Image, bool) {
	img, exists := am.images[name]
	return img, exists
}

// LoadSound 音声を読み込み（プレースホルダー実装）
func (am *AssetManager) LoadSound(name, path string) error {
	// 今回は音声をプレースホルダーとして実装
	log.Printf("Sound loading placeholder: %s from %s", name, path)
	am.sounds[name] = []byte{}
	return nil
}

// GetSound 音声を取得
func (am *AssetManager) GetSound(name string) ([]byte, bool) {
	sound, exists := am.sounds[name]
	return sound, exists
}

// CreateDefaultAssets デフォルトアセットを作成
func (am *AssetManager) CreateDefaultAssets() {
	// プレイヤー用の青い矩形
	playerImg := ebiten.NewImage(32, 32)
	playerImg.Fill(color.RGBA{0, 100, 255, 255})
	am.images["player"] = playerImg

	// 敵用の赤い矩形
	enemyImg := ebiten.NewImage(32, 32)
	enemyImg.Fill(color.RGBA{255, 0, 0, 255})
	am.images["enemy"] = enemyImg

	// コイン用の黄色い円（矩形で代用）
	coinImg := ebiten.NewImage(20, 20)
	coinImg.Fill(color.RGBA{255, 255, 0, 255})
	am.images["coin"] = coinImg

	// ゴール用の緑の矩形
	goalImg := ebiten.NewImage(48, 48)
	goalImg.Fill(color.RGBA{0, 255, 0, 255})
	am.images["goal"] = goalImg

	// 地面用の茶色い矩形
	groundImg := ebiten.NewImage(64, 32)
	groundImg.Fill(color.RGBA{139, 69, 19, 255})
	am.images["ground"] = groundImg

	// 壁用の灰色の矩形
	wallImg := ebiten.NewImage(32, 32)
	wallImg.Fill(color.RGBA{128, 128, 128, 255})
	am.images["wall"] = wallImg

	log.Println("Created default assets")
}

// HasImage 画像が存在するかチェック
func (am *AssetManager) HasImage(name string) bool {
	_, exists := am.images[name]
	return exists
}

// HasSound 音声が存在するかチェック
func (am *AssetManager) HasSound(name string) bool {
	_, exists := am.sounds[name]
	return exists
}

// ListImages 読み込まれた画像一覧を取得
func (am *AssetManager) ListImages() []string {
	names := make([]string, 0, len(am.images))
	for name := range am.images {
		names = append(names, name)
	}
	return names
}

// ListSounds 読み込まれた音声一覧を取得
func (am *AssetManager) ListSounds() []string {
	names := make([]string, 0, len(am.sounds))
	for name := range am.sounds {
		names = append(names, name)
	}
	return names
}

// Clear 全アセットを削除
func (am *AssetManager) Clear() {
	am.images = make(map[string]*ebiten.Image)
	am.sounds = make(map[string][]byte)
	log.Println("Cleared all assets")
}

// GetImageCount 読み込まれた画像数を取得
func (am *AssetManager) GetImageCount() int {
	return len(am.images)
}

// GetSoundCount 読み込まれた音声数を取得
func (am *AssetManager) GetSoundCount() int {
	return len(am.sounds)
}
