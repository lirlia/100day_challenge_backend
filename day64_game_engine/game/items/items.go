package items

import (
	"image/color"
	"math"
	"time"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/core"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/graphics"
	"github.com/lirlia/100day_challenge_backend/day64_game_engine/engine/physics"
)

// ItemType アイテムタイプ
type ItemType int

const (
	ItemTypeCoin ItemType = iota
	ItemTypeGoal
	ItemTypeHealthPack
)

// Item アイテム
type Item struct {
	PhysicsBody *physics.PhysicsBody
	Sprite      *graphics.Sprite
	Type        ItemType
	Value       int
	Active      bool
	Collected   bool
}

// ItemManager アイテム管理システム
type ItemManager struct {
	Items []*Item
}

// NewItem 新しいアイテムを作成
func NewItem(pos core.Vec2, itemType ItemType, image *ebiten.Image) *Item {
	var size core.Vec2
	var value int
	var itemColor color.Color

	switch itemType {
	case ItemTypeCoin:
		size = core.Vec2{X: 20, Y: 20}
		value = 10
		itemColor = color.RGBA{255, 255, 0, 255}
	case ItemTypeGoal:
		size = core.Vec2{X: 48, Y: 48}
		value = 100
		itemColor = color.RGBA{0, 255, 0, 255}
	case ItemTypeHealthPack:
		size = core.Vec2{X: 24, Y: 24}
		value = 1
		itemColor = color.RGBA{255, 0, 255, 255}
	default:
		size = core.Vec2{X: 20, Y: 20}
		value = 0
		itemColor = color.RGBA{255, 255, 255, 255}
	}

	// 物理ボディを作成（静的オブジェクト）
	body := physics.NewPhysicsBody(pos, size, 0.0)
	body.IsStatic = true

	// スプライトを作成
	sprite := graphics.NewSprite(image, pos, size)
	sprite.SetColor(itemColor)

	return &Item{
		PhysicsBody: body,
		Sprite:      sprite,
		Type:        itemType,
		Value:       value,
		Active:      true,
		Collected:   false,
	}
}

// NewItemManager 新しいアイテム管理システムを作成
func NewItemManager() *ItemManager {
	return &ItemManager{
		Items: make([]*Item, 0),
	}
}

// AddItem アイテムを追加
func (im *ItemManager) AddItem(item *Item) {
	im.Items = append(im.Items, item)
}

// Update アイテムを更新
func (i *Item) Update(deltaTime float64) {
	if !i.Active {
		return
	}

	// コインの場合は回転アニメーション効果
	if i.Type == ItemTypeCoin {
		// 色を少し変化させて光る効果
		alpha := 200 + int(55*math.Sin(float64(time.Now().UnixNano())/1000000000))
		i.Sprite.SetColor(color.RGBA{255, 255, 0, uint8(alpha)})
	}
}

// Draw アイテムを描画
func (i *Item) Draw(renderer *graphics.Renderer) {
	if !i.Active {
		return
	}
	renderer.DrawSprite(i.Sprite)
}

// UpdateAll 全アイテムを更新
func (im *ItemManager) UpdateAll(deltaTime float64) {
	for _, item := range im.Items {
		item.Update(deltaTime)
	}
}

// DrawAll 全アイテムを描画
func (im *ItemManager) DrawAll(renderer *graphics.Renderer) {
	for _, item := range im.Items {
		item.Draw(renderer)
	}
}

// Collect アイテムを収集
func (i *Item) Collect() int {
	if !i.Active || i.Collected {
		return 0
	}

	i.Collected = true
	i.Active = false
	i.Sprite.SetVisible(false)

	return i.Value
}

// IsActive アクティブかチェック
func (i *Item) IsActive() bool {
	return i.Active && !i.Collected
}

// GetRect 当たり判定矩形を取得
func (i *Item) GetRect() physics.Rectangle {
	return i.PhysicsBody.GetRect()
}

// GetType アイテムタイプを取得
func (i *Item) GetType() ItemType {
	return i.Type
}

// GetActiveItems アクティブなアイテムの一覧を取得
func (im *ItemManager) GetActiveItems() []*Item {
	activeItems := make([]*Item, 0)
	for _, item := range im.Items {
		if item.IsActive() {
			activeItems = append(activeItems, item)
		}
	}
	return activeItems
}

// IsGoalReached ゴールに到達したかチェック
func (im *ItemManager) IsGoalReached() bool {
	for _, item := range im.Items {
		if item.Type == ItemTypeGoal && item.Collected {
			return true
		}
	}
	return false
}

// ResetAll 全アイテムをリセット
func (im *ItemManager) ResetAll() {
	for _, item := range im.Items {
		item.Active = true
		item.Collected = false
		item.Sprite.SetVisible(true)
	}
}

// ClearAll 全アイテムを削除
func (im *ItemManager) ClearAll() {
	im.Items = im.Items[:0] // スライスをクリア
}
