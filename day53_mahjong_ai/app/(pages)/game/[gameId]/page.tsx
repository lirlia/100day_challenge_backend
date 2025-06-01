'use client';

import { useEffect, useState, useCallback } from 'react';
import { Tile, TileSuit, HonorType, isSameTile } from '../../../../lib/mahjong/tiles';
import { GameState, PlayerID, ActionType, GamePhase, TileInRiver, KanPossibility, Meld } from '../../../../lib/mahjong/game_state';
import Link from 'next/link';

// TileDisplayコンポーネント (仮。実際の定義に合わせてください)
const TileDisplay = ({ tile, onClick, className }: { tile: Tile | TileInRiver, onClick?: () => void, className?: string }) => {
  let tileClass = 'border border-gray-300 p-1 m-0.5 text-xs rounded shadow clay-tile min-w-[20px] min-h-[30px] flex items-center justify-center';
  if (className) tileClass += ` ${className}`;
  if (onClick) tileClass += ' cursor-pointer hover:border-blue-500';

  const getSuitSymbol = (suit: TileSuit) => {
    if (suit === TileSuit.MANZU) return '萬';
    if (suit === TileSuit.SOZU) return '索';
    if (suit === TileSuit.PINZU) return '筒';
    return '';
  };

  const getHonorName = (value: HonorType) => {
    switch (value) {
      case HonorType.TON: return '東';
      case HonorType.NAN: return '南';
      case HonorType.SHA: return '西';
      case HonorType.PEI: return '北';
      case HonorType.HAKU: return '白';
      case HonorType.HATSU: return '發';
      case HonorType.CHUN: return '中';
      default: return '';
    }
  };

  return (
    <button type="button" onClick={onClick} className={tileClass} disabled={!onClick}>
      {tile.suit === TileSuit.JIHAI ? getHonorName(tile.value as HonorType) : `${tile.value}${getSuitSymbol(tile.suit)}`}
      {(tile as TileInRiver).isRiichiDeclare && <span className="absolute bottom-0 right-0 text-xs text-red-500 transform rotate-[-90deg] origin-bottom-right">―</span>}
    </button>
  );
};

export default function GamePage({ params }: { params: { gameId: string } }) {
  const { gameId } = params;
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTileForRiichi, setSelectedTileForRiichi] = useState<Tile | null>(null);
  const [isKanModalOpen, setIsKanModalOpen] = useState(false);
  const [selectedKan, setSelectedKan] = useState<KanPossibility | null>(null);

  const fetchGameState = useCallback(async () => {
    try {
      const response = await fetch(`/api/game/${gameId}`);
      if (!response.ok) {
        if (response.status === 404) throw new Error('Game not found. Create a new game.');
        throw new Error('Failed to fetch game state');
      }
      const data = await response.json();
      setGameState(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setGameState(null); // エラー時はゲーム状態をクリア
    }
  }, [gameId]);

  useEffect(() => {
    fetchGameState();
    // ポーリングやWebSocket接続をここに設定することも可能
    const intervalId = setInterval(fetchGameState, 5000); // 5秒ごとに状態をポーリング
    return () => clearInterval(intervalId);
  }, [fetchGameState]);

  const handleDiscardTile = async (tile: Tile) => {
    if (!gameState || gameState.turn !== PlayerID.Player || gameState.player.hand.length % 3 !== 2 || (gameState.player.canPon && gameState.player.tileToPon)) return;
    if (gameState.player.canRiichi && !selectedTileForRiichi) {
        alert("リーチ宣言牌を選択してください。");
        return;
    }
    try {
      const actionType = gameState.player.canRiichi && selectedTileForRiichi && selectedTileForRiichi.id === tile.id ? ActionType.Riichi : ActionType.Discard;
      const actionPayload: any = { gameId, playerId: PlayerID.Player, action: { type: actionType } };
      if (actionType === ActionType.Riichi) {
        actionPayload.action.tileToDiscard = tile;
      } else {
        actionPayload.action.tile = tile;
      }

      const response = await fetch(`/api/game/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actionPayload),
      });
      if (!response.ok) throw new Error(actionType === ActionType.Riichi ? 'Failed to declare riichi' : 'Failed to discard tile');
      const data = await response.json();
      setGameState(data);
      setSelectedTileForRiichi(null); // リーチ後はリセット
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    }
  };

  const handlePon = async () => {
    if (!gameState || !gameState.player.canPon || !gameState.player.tileToPon) return;
    try {
      const response = await fetch(`/api/game/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, playerId: PlayerID.Player, action: { type: ActionType.Pon, targetTile: gameState.player.tileToPon } }),
      });
      if (!response.ok) throw new Error('Failed to pon');
      const data = await response.json();
      setGameState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    }
  };

  const handleExecuteKan = async () => {
    if (!gameState || !selectedKan) return;
    try {
      const actionPayload: { gameId: string; playerId: PlayerID; action: { type: ActionType; tile?: Tile; meldType?: 'ankan' | 'kakan' | 'daiminkan'; meld?: Meld } } = {
        gameId,
        playerId: PlayerID.Player,
        action: {
          type: ActionType.Kan,
          meldType: selectedKan.type,
        },
      };

      if (selectedKan.type === 'ankan' || selectedKan.type === 'daiminkan') {
        actionPayload.action.tile = selectedKan.tile;
      } else if (selectedKan.type === 'kakan') {
        actionPayload.action.tile = selectedKan.tile; // 加える牌
        actionPayload.action.meld = selectedKan.meldToUpgrade; // 元の刻子
      }

      const response = await fetch(`/api/game/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actionPayload),
      });
      if (!response.ok) throw new Error('Failed to execute kan');
      const data = await response.json();
      setGameState(data);
      setIsKanModalOpen(false);
      setSelectedKan(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    }
  };

  const handleSkipPon = async () => {
    console.log("Pon skipped by player.");
    if (gameState) {
      // スキップした場合、サーバー側でプレイヤーのツモ処理が進むことを期待。
      // UI上はcanPonフラグをfalseにして一時的にボタンを消し、サーバーからの更新を待つ。
      setGameState(prev => prev ? {
         ...prev,
          player: { ...prev.player, canPon: false, tileToPon: undefined }
      } : null);
      // 必要であれば、ここでfetchGameState()を呼び出して即時更新を試みる。
      // ただし、サーバーの処理タイミングとの競合に注意。
    }
  };

  // 他のハンドラ（カン、ロンなど）もここに追加していく

  if (error && !gameState) {
    return (
      <div className="container mx-auto p-4 text-center clay-background">
        <h1 className="text-2xl font-bold text-red-500 mb-4">エラー</h1>
        <p className="mb-4">{error}</p>
        <Link href="/day53_mahjong_ai" className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded clay-button">
          ゲーム作成に戻る
        </Link>
      </div>
    );
  }

  if (!gameState) {
    return <div className="container mx-auto p-4 text-center clay-background">読み込み中...</div>;
  }

  const player = gameState.player;
  const cpu = gameState.cpu;

  // ソート用のスーツ順序
  const suitOrder: TileSuit[] = [TileSuit.MANZU, TileSuit.PINZU, TileSuit.SOZU, TileSuit.JIHAI];

  return (
    <div className="container mx-auto p-4 clay-background min-h-screen">
      <h1 className="text-3xl font-bold text-center mb-2 text-gray-800 clay-text-title">Day53 - CPU対戦麻雀</h1>
      <p className="text-center text-sm text-gray-600 mb-6">クレイモーフィズム UI</p>

      {error && <p className="text-red-500 bg-red-100 border border-red-400 p-2 rounded mb-4">エラー: {error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="clay-card p-3">
          <h2 className="text-lg font-semibold text-gray-700">局: {gameState.round} 本場: {gameState.honba}</h2>
        </div>
        <div className="clay-card p-3">
          <h2 className="text-lg font-semibold text-gray-700">あなたの点数: {player.score}</h2>
        </div>
        <div className="clay-card p-3">
          <h2 className="text-lg font-semibold text-gray-700">CPUの点数: {cpu.score}</h2>
        </div>
      </div>

      {/* ドラ表示 */}
      {gameState.dora && gameState.dora.length > 0 && (
        <div className="mb-4 p-3 clay-card flex flex-col items-center">
            <h3 className="text-md font-semibold text-gray-700 mb-1">ドラ表示</h3>
            <div className="flex">
                {gameState.yama.doraIndicators.map((tile, index) => <TileDisplay key={index} tile={tile} />)}
            </div>
        </div>
      )}

      {/* CPUの情報 */}
      <div className="mb-6 p-4 clay-card">
        <h2 className="text-xl font-semibold text-gray-700 mb-2">CPU ({gameState.oya === PlayerID.CPU ? '親' : '子'})</h2>
        <div className="mb-2">
          <h3 className="text-md font-semibold text-gray-600">河:</h3>
          <div className="flex flex-wrap bg-gray-100 p-2 rounded min-h-[50px] clay-inset">
            {cpu.river.map((tile, index) => <TileDisplay key={index} tile={tile} />)}
          </div>
        </div>
        <div className="mb-2">
          <h3 className="text-md font-semibold text-gray-600">副露:</h3>
          <div className="flex flex-wrap min-h-[30px]">
            {cpu.melds.map((meld, meldIndex) => (
              <div key={meldIndex} className="flex border border-gray-400 rounded mr-1 mb-1 clay-meld">
                {meld.tiles.map((tile, tileIndex) => <TileDisplay key={tileIndex} tile={tile} />)}
              </div>
            ))}
          </div>
        </div>
        {/* CPUの手牌は通常見えないが、デバッグ用に表示することも可能 */}
        {/* <p>CPU手牌数: {cpu.hand.length}</p> */}
      </div>

      {/* プレイヤーの情報 */}
      <div className="mb-6 p-4 clay-card">
        <h2 className="text-xl font-semibold text-gray-700 mb-2">あなた ({gameState.oya === PlayerID.Player ? '親' : '子'})</h2>
        <div className="mb-2">
          <h3 className="text-md font-semibold text-gray-600">手牌: (クリックで打牌{player.canRiichi ? ' / リーチ宣言牌選択' : ''})</h3>
          <div className="flex flex-wrap bg-green-50 p-2 rounded min-h-[60px] clay-inset">
            {player.hand.sort((a,b) => {
                if (a.suit !== b.suit) {
                  return suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
                }
                return (a.value as number) - (b.value as number); // valueがHonorTypeの場合も数値として比較されるが、同スーツ内なら問題ないはず
            }).map((tile, index) => (
              <TileDisplay
                key={index}
                tile={tile}
                onClick={() => {
                  if (player.canRiichi && player.hand.length % 3 === 2 && !selectedTileForRiichi) {
                    setSelectedTileForRiichi(tile);
                  } else {
                    handleDiscardTile(tile);
                  }
                }}
                className={`${(selectedTileForRiichi && selectedTileForRiichi.id === tile.id) ? 'border-red-500 ring-2 ring-red-500' : ''} ${(gameState.turn === PlayerID.Player && player.hand.length % 3 === 2 && !(player.canPon && player.tileToPon) && !isKanModalOpen) ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}
              />
            ))}
          </div>
          {selectedTileForRiichi && (
            <p className="text-sm text-red-600 mt-1">リーチ宣言牌: <TileDisplay tile={selectedTileForRiichi} /> (もう一度クリックで確定打牌)</p>
          )}
        </div>
        <div className="mb-2">
          <h3 className="text-md font-semibold text-gray-600">河:</h3>
          <div className="flex flex-wrap bg-gray-100 p-2 rounded min-h-[50px] clay-inset">
            {player.river.map((tile, index) => <TileDisplay key={index} tile={tile} />)}
          </div>
        </div>
        <div>
          <h3 className="text-md font-semibold text-gray-600">副露:</h3>
          <div className="flex flex-wrap min-h-[30px]">
            {player.melds.map((meld, meldIndex) => (
              <div key={meldIndex} className="flex border border-gray-400 rounded mr-1 mb-1 clay-meld">
                {meld.tiles.map((tile, tileIndex) => <TileDisplay key={tileIndex} tile={tile} />)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* アクションボタンとプレイヤー手番情報 */}
      {gameState.turn === PlayerID.Player && gameState.phase === GamePhase.Playing && (
        <div className="mt-4 flex flex-col items-center p-3 clay-card">
          <h3 className="text-lg font-semibold mb-2 text-gray-700">あなたの行動</h3>
          {player.canPon && player.tileToPon && (
            <div className="mb-4 p-3 border border-yellow-500 rounded bg-yellow-100 clay-inset">
              <p className="text-yellow-800 font-semibold mb-2">
                CPUの捨て牌: <TileDisplay tile={player.tileToPon} /> <br/> ポンしますか？
              </p>
              <button
                onClick={handlePon}
                className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded mr-2 transition-colors duration-150 ease-in-out clay-button-green"
              >
                ポン
              </button>
              <button
                onClick={handleSkipPon}
                className="bg-gray-400 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded transition-colors duration-150 ease-in-out clay-button-gray"
              >
                スキップ
              </button>
            </div>
          )}
          {/* ポン可能な時は打牌指示を非表示 */}
          {!(player.canPon && player.tileToPon) && player.hand.length % 3 === 2 && (
            <p className="text-sm mb-2 text-gray-600">手牌から牌を選択して捨ててください。{player.canRiichi ? 'リーチも可能です。宣言する場合は、まず捨て牌を選択してください。' : ''}</p>
          )}
          {/* アクションボタン群 */}
          <div className="flex space-x-2 mt-2">
            {player.canRiichi && player.hand.length % 3 === 2 && !selectedTileForRiichi && !(player.canPon && player.tileToPon) && (
              <button
                // onClick={handleDeclareRiichi} // 適切なハンドラを後で設定
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded transition-colors duration-150 ease-in-out clay-button-red disabled:opacity-50"
                disabled={player.score < 1000 || isKanModalOpen}
              >
                リーチ (宣言牌を選択)
              </button>
            )}
            {player.canKan && !(player.canPon && player.tileToPon) && (
              <button
                onClick={() => setIsKanModalOpen(true)}
                className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-4 rounded transition-colors duration-150 ease-in-out clay-button-purple disabled:opacity-50"
                disabled={isKanModalOpen}
              >
                カン
              </button>
            )}
            {player.canTsumoAgari && !(player.canPon && player.tileToPon) && (
               <button
                  // onClick={handleTsumoAgari} // 後で実装
                  className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded transition-colors duration-150 ease-in-out clay-button-yellow disabled:opacity-50"
                  disabled={isKanModalOpen}
              >
                  ツモ和了！
              </button>
            )}
             {/* TODO: Ron button */}
          </div>
        </div>
      )}

      {/* Kan Selection Modal */}
      {isKanModalOpen && gameState && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full clay-card-modal">
            <h3 className="text-xl font-semibold mb-4 text-gray-800">カンを選択</h3>
            {gameState.player.possibleKans.length === 0 && <p className="text-gray-600">可能なカンがありません。</p>}
            <ul className="space-y-2 mb-4 max-h-60 overflow-y-auto">
              {gameState.player.possibleKans.map((kanOption, index) => (
                <li key={index}>
                  <button
                    onClick={() => setSelectedKan(kanOption)}
                    className={`w-full text-left p-3 rounded border transition-colors duration-150 ease-in-out clay-button-selectable ${selectedKan && selectedKan.type === kanOption.type && selectedKan.tile.id === kanOption.tile.id && ((selectedKan.meldToUpgrade && kanOption.meldToUpgrade && selectedKan.meldToUpgrade.tiles[0].id === kanOption.meldToUpgrade.tiles[0].id) || (!selectedKan.meldToUpgrade && !kanOption.meldToUpgrade))  ? 'bg-blue-500 text-white border-blue-600' : 'bg-gray-50 hover:bg-gray-100 border-gray-300 text-gray-700'}`}
                  >
                    {kanOption.type === 'ankan' && `暗槓: ${kanOption.tile.name} x 4`}
                    {kanOption.type === 'kakan' && `加槓: ${kanOption.meldToUpgrade?.tiles[0].name} に ${kanOption.tile.name} を追加`}
                    {kanOption.type === 'daiminkan' && `大明槓: ${kanOption.tile.name} を鳴く`}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setIsKanModalOpen(false);
                  setSelectedKan(null);
                }}
                className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400 text-gray-800 transition-colors duration-150 ease-in-out clay-button-gray"
              >
                キャンセル
              </button>
              <button
                onClick={handleExecuteKan}
                disabled={!selectedKan}
                className="px-4 py-2 rounded bg-green-500 hover:bg-green-600 text-white transition-colors duration-150 ease-in-out clay-button-green disabled:opacity-50"
              >
                実行
              </button>
            </div>
          </div>
        </div>
      )}

      {gameState.phase !== GamePhase.Playing && gameState.phase !== GamePhase.GameOver && (
        <div className="mt-6 p-4 text-center clay-card">
          <h2 className="text-xl font-bold mb-2">結果</h2>
          <p className="mb-2">{gameState.lastActionMessage}</p>
          {gameState.winningHandInfo && (
            <div className="mb-2 text-left">
              <p>和了牌: <TileDisplay tile={gameState.winningHandInfo.agariTile} /></p>
              <p>役: {gameState.winningHandInfo.score?.yakuList.map(y => `${y.yaku.name}(${y.han}飜)`).join(', ') || '役なし'}</p>
              <p>点数: {gameState.winningHandInfo.score?.displayedPoint !== undefined ? `${gameState.winningHandInfo.score.displayedPoint}点` : '計算エラー'}</p>
            </div>
          )}
          <button
            onClick={fetchGameState} // 次の局へ or ゲーム終了処理
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded clay-button"
          >
            {gameState.phase === GamePhase.CPUWon || gameState.phase === GamePhase.PlayerWon || gameState.phase === GamePhase.Draw ? '次の局へ' : '盤面更新'}
          </button>
        </div>
      )}
      {gameState.phase === GamePhase.GameOver && (
         <div className="mt-6 p-4 text-center clay-card">
            <h2 className="text-2xl font-bold mb-2">ゲーム終了！</h2>
            <p className="mb-4">{gameState.gameWinner === PlayerID.Player ? 'あなたの勝ちです！' : gameState.gameWinner === PlayerID.CPU ? 'CPUの勝ちです。' : '引き分けです。'}</p>
            <Link href="/day53_mahjong_ai" className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded clay-button">
                新しいゲームを始める
            </Link>
        </div>
      )}

      <div className="mt-8 text-center">
        <Link href="/day53_mahjong_ai" className="text-blue-600 hover:text-blue-800 clay-link">ゲーム選択に戻る</Link>
      </div>
    </div>
  );
}
