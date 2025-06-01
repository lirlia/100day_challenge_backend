import { GameState, PlayerID, GamePhase } from '../lib/mahjong/game_state';
import { AgariInfo } from '../lib/mahjong/hand'; // ScoreResult もここから取れる想定 (AgariInfo.score)
import { TileDisplay } from './tile-display';
import { ScoreResult } from '../lib/mahjong/score'; // ScoreResult を直接使用

interface GameResultModalProps {
  gameState: GameState | null;
  onClose: () => void;
  onNewGame: () => void;
}

export function GameResultModal({ gameState, onClose, onNewGame }: GameResultModalProps) {
  if (!gameState || !gameState.phase || !['player_won', 'cpu_won', 'draw', 'game_over'].includes(gameState.phase)) {
    return null;
  }

  const winner = gameState.winner;
  const gameWinner = gameState.gameWinner;
  const winningHandInfo = gameState.winningHandInfo as AgariInfo | undefined;
  const score = winningHandInfo?.score as ScoreResult | undefined;
  const yakuList = score?.yakuList || [];
  const han = score?.han || 0;
  const fu = score?.fu || 0;
  const displayPoints = score?.displayedPoint || 0;

  let title = "";
  let message = "";
  let showAgariInfo = false;

  if (gameState.phase === GamePhase.PlayerWon) {
    title = "あなたの勝利！";
    message = `おめでとうございます！ ${han}飜 ${fu}符 ${displayPoints}点獲得です。`;
    showAgariInfo = true;
  } else if (gameState.phase === GamePhase.CPUWon) {
    title = "CPUの勝利";
    message = `CPUが和了しました。 ${han}飜 ${fu}符 ${displayPoints}点です。`;
    showAgariInfo = true;
  } else if (gameState.phase === GamePhase.Draw) {
    title = "流局";
    message = "引き分けです。";
  } else if (gameState.phase === GamePhase.GameOver) {
    title = "ゲーム終了！";
    if (gameWinner === PlayerID.Player) {
      message = `あなたの勝ちです！ 最終スコア: あなた ${gameState.player.score}点, CPU ${gameState.cpu.score}点`;
    } else if (gameWinner === PlayerID.CPU) {
      message = `CPUの勝ちです。 最終スコア: あなた ${gameState.player.score}点, CPU ${gameState.cpu.score}点`;
    } else {
      message = `引き分けです。 最終スコア: あなた ${gameState.player.score}点, CPU ${gameState.cpu.score}点`;
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-md clay-area-modal text-white">
        <h2 className="text-3xl font-bold mb-4 text-yellow-300 clay-text-title text-center">{title}</h2>
        <p className="text-lg mb-6 text-center">{message}</p>

        {showAgariInfo && winningHandInfo && winner && (
          <div className="mb-6">
            <h3 className="text-xl font-semibold mb-2 text-yellow-400">和了手 ({winner === PlayerID.Player ? "あなた" : "CPU"}):</h3>
            <div className="flex flex-wrap justify-center bg-green-700/50 p-2 rounded-md border border-green-600 mb-2">
              {winningHandInfo.completedHand.map((tile, i) => (
                <TileDisplay key={`winner-hand-${tile.id}-${i}`} tile={tile} size="small" />
              ))}
            </div>
            {winningHandInfo.agariTile && (
                <p className="text-sm text-center">和了牌: <TileDisplay tile={winningHandInfo.agariTile} size="small" inline={true} /></p>
            )}

            {yakuList.length > 0 && (
              <div className="mt-4">
                <h4 className="text-md font-semibold mb-1 text-yellow-400">役一覧:</h4>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {yakuList.map((yakuItem, i) => (
                    <li key={i}>{yakuItem.yaku.name} ({yakuItem.han}飜)</li>
                  ))}
                </ul>
              </div>
            )}
             <p className="text-sm mt-2 text-center">合計: {han}飜 {fu}符</p>
             <p className="text-lg font-bold mt-1 text-center text-yellow-300">{displayPoints} 点</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-around mt-8 space-y-3 sm:space-y-0 sm:space-x-3">
          <button
            onClick={onNewGame}
            className="clay-button bg-blue-500 hover:bg-blue-600 text-white w-full sm:w-auto"
          >
            新しいゲーム
          </button>
          {/* <button
            onClick={onClose} // 閉じる機能は一旦新しいゲームに集約しても良いかも
            className="clay-button bg-gray-600 hover:bg-gray-700 text-white w-full sm:w-auto"
          >
            閉じる
          </button> */}
        </div>
      </div>
    </div>
  );
}
