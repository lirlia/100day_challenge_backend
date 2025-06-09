'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface Platform {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'ground' | 'platform';
}

interface Enemy {
  id: string;
  x: number;
  y: number;
  patrolDistance: number;
}

interface Item {
  id: string;
  x: number;
  y: number;
  type: 'coin' | 'goal';
}

interface Level {
  name: string;
  width: number;
  height: number;
  platforms: Platform[];
  enemies: Enemy[];
  items: Item[];
  playerStart: { x: number; y: number };
}

export default function LevelEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [level, setLevel] = useState<Level>({
    name: 'New Level',
    width: 1200,
    height: 600,
    platforms: [],
    enemies: [],
    items: [],
    playerStart: { x: 100, y: 500 }
  });

  const [selectedTool, setSelectedTool] = useState<'platform' | 'enemy' | 'coin' | 'goal' | 'player'>('platform');
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // Canvas描画
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // キャンバスクリア
    ctx.fillStyle = '#87CEEB'; // スカイブルー
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // グリッド描画
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    const gridSize = 32 * zoom;

    for (let x = -camera.x % gridSize; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    for (let y = -camera.y % gridSize; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // プラットフォーム描画
    level.platforms.forEach(platform => {
      const x = (platform.x - camera.x) * zoom;
      const y = (platform.y - camera.y) * zoom;
      const width = platform.width * zoom;
      const height = platform.height * zoom;

      ctx.fillStyle = platform.type === 'ground' ? '#8B4513' : '#654321';
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);
    });

    // 敵描画
    level.enemies.forEach(enemy => {
      const x = (enemy.x - camera.x) * zoom;
      const y = (enemy.y - camera.y) * zoom;
      const size = 32 * zoom;

      ctx.fillStyle = '#FF4500';
      ctx.fillRect(x, y, size, size);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, size, size);

      // パトロール範囲表示
      ctx.strokeStyle = '#FF6666';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(x - enemy.patrolDistance * zoom, y + size / 2);
      ctx.lineTo(x + size + enemy.patrolDistance * zoom, y + size / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // アイテム描画
    level.items.forEach(item => {
      const x = (item.x - camera.x) * zoom;
      const y = (item.y - camera.y) * zoom;
      const size = 24 * zoom;

      if (item.type === 'coin') {
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(x, y, size, size);
      }

      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      if (item.type === 'coin') {
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(x, y, size, size);
      }
    });

    // プレイヤー開始位置描画
    const playerX = (level.playerStart.x - camera.x) * zoom;
    const playerY = (level.playerStart.y - camera.y) * zoom;
    const playerSize = 32 * zoom;

    ctx.fillStyle = '#0066FF';
    ctx.fillRect(playerX, playerY, playerSize, playerSize);
    ctx.strokeStyle = '#003399';
    ctx.lineWidth = 3;
    ctx.strokeRect(playerX, playerY, playerSize, playerSize);

    ctx.fillStyle = '#FFF';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('P', playerX + playerSize / 2, playerY + playerSize / 2 + 4);

  }, [level, camera, zoom]);

  // Canvas操作
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom + camera.x;
    const y = (e.clientY - rect.top) / zoom + camera.y;

    setStartPos({ x, y });
    setIsDrawing(true);

    if (selectedTool === 'player') {
      setLevel(prev => ({
        ...prev,
        playerStart: { x: Math.round(x / 32) * 32, y: Math.round(y / 32) * 32 }
      }));
      setIsDrawing(false);
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent) => {
    if (!isDrawing || !startPos) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const endX = (e.clientX - rect.left) / zoom + camera.x;
    const endY = (e.clientY - rect.top) / zoom + camera.y;

    const x = Math.min(startPos.x, endX);
    const y = Math.min(startPos.y, endY);
    const width = Math.abs(endX - startPos.x);
    const height = Math.abs(endY - startPos.y);

    if (selectedTool === 'platform') {
      if (width > 10 && height > 10) {
        const newPlatform: Platform = {
          id: Date.now().toString(),
          x: Math.round(x / 32) * 32,
          y: Math.round(y / 32) * 32,
          width: Math.round(width / 32) * 32,
          height: Math.round(height / 32) * 32,
          type: 'platform'
        };
        setLevel(prev => ({ ...prev, platforms: [...prev.platforms, newPlatform] }));
      }
    } else if (selectedTool === 'enemy') {
      const newEnemy: Enemy = {
        id: Date.now().toString(),
        x: Math.round(x / 32) * 32,
        y: Math.round(y / 32) * 32,
        patrolDistance: 100
      };
      setLevel(prev => ({ ...prev, enemies: [...prev.enemies, newEnemy] }));
    } else if (selectedTool === 'coin' || selectedTool === 'goal') {
      const newItem: Item = {
        id: Date.now().toString(),
        x: Math.round(x / 32) * 32,
        y: Math.round(y / 32) * 32,
        type: selectedTool
      };
      setLevel(prev => ({ ...prev, items: [...prev.items, newItem] }));
    }

    setIsDrawing(false);
    setStartPos(null);
  };

  // レベル保存
  const saveLevel = async () => {
    try {
      const response = await fetch('/api/levels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(level)
      });

      if (response.ok) {
        alert('レベルが保存されました！');
      } else {
        alert('保存に失敗しました');
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('保存エラーが発生しました');
    }
  };

  // レベルクリア
  const clearLevel = () => {
    if (confirm('レベルをクリアしますか？')) {
      setLevel({
        name: 'New Level',
        width: 1200,
        height: 600,
        platforms: [],
        enemies: [],
        items: [],
        playerStart: { x: 100, y: 500 }
      });
    }
  };

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* ヘッダー */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-800">レベルエディタ</h1>
            <div className="flex gap-4">
              <button
                onClick={clearLevel}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                クリア
              </button>
              <button
                onClick={saveLevel}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                保存
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <input
              type="text"
              value={level.name}
              onChange={(e) => setLevel(prev => ({ ...prev, name: e.target.value }))}
              className="px-3 py-2 border rounded-lg"
              placeholder="レベル名"
            />
            <div className="flex gap-2">
              <label className="flex items-center gap-2">
                幅:
                <input
                  type="number"
                  value={level.width}
                  onChange={(e) => setLevel(prev => ({ ...prev, width: parseInt(e.target.value) }))}
                  className="w-20 px-2 py-1 border rounded"
                />
              </label>
              <label className="flex items-center gap-2">
                高さ:
                <input
                  type="number"
                  value={level.height}
                  onChange={(e) => setLevel(prev => ({ ...prev, height: parseInt(e.target.value) }))}
                  className="w-20 px-2 py-1 border rounded"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="flex gap-6">
          {/* ツールパネル */}
          <div className="w-64 bg-white rounded-lg shadow-md p-4">
            <h2 className="text-xl font-bold mb-4">ツール</h2>
            <div className="space-y-2">
              {[
                { key: 'platform', label: 'プラットフォーム', color: 'bg-yellow-500' },
                { key: 'enemy', label: '敵', color: 'bg-red-500' },
                { key: 'coin', label: 'コイン', color: 'bg-yellow-400' },
                { key: 'goal', label: 'ゴール', color: 'bg-green-500' },
                { key: 'player', label: 'プレイヤー開始位置', color: 'bg-blue-500' }
              ].map(tool => (
                <button
                  key={tool.key}
                  onClick={() => setSelectedTool(tool.key as any)}
                  className={`w-full p-3 rounded-lg text-white font-medium transition-all ${selectedTool === tool.key
                      ? `${tool.color} ring-2 ring-offset-2 ring-blue-500`
                      : `${tool.color} opacity-70 hover:opacity-100`
                    }`}
                >
                  {tool.label}
                </button>
              ))}
            </div>

            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2">統計</h3>
              <div className="text-sm space-y-1">
                <div>プラットフォーム: {level.platforms.length}</div>
                <div>敵: {level.enemies.length}</div>
                <div>コイン: {level.items.filter(i => i.type === 'coin').length}</div>
                <div>ゴール: {level.items.filter(i => i.type === 'goal').length}</div>
              </div>
            </div>
          </div>

          {/* キャンバス */}
          <div className="flex-1 bg-white rounded-lg shadow-md p-4">
            <div className="mb-4 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label>ズーム:</label>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-24"
                />
                <span>{Math.round(zoom * 100)}%</span>
              </div>
              <div className="text-sm text-gray-600">
                選択中: <span className="font-semibold">{selectedTool}</span>
              </div>
            </div>

            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              className="border border-gray-300 cursor-crosshair"
              onMouseDown={handleCanvasMouseDown}
              onMouseUp={handleCanvasMouseUp}
            />

            <div className="mt-4 text-sm text-gray-600">
              <p>• プラットフォーム: ドラッグして矩形を作成</p>
              <p>• 敵/アイテム: クリックして配置</p>
              <p>• プレイヤー: クリックして開始位置を設定</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
