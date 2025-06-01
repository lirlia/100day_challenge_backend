import { GameState, PlayerIdentifier, GamePhase } from '../lib/mahjong/game_state';
import { AgariInfo } from '../lib/mahjong/hand';
import { TileDisplay } from './tile-display';
import { ScoreResult, getScoreNameAndPayments } from '../lib/mahjong/score';

interface GameResultModalProps {
  gameState: GameState | null;
  onClose: () => void;
  onNewGame: () => void;
}

export function GameResultModal({ gameState, onClose, onNewGame }: GameResultModalProps) {
  if (!gameState || !gameState.phase || ![
    GamePhase.ROUND_ENDED,
    GamePhase.GAME_OVER
  ].includes(gameState.phase)) {
    return null;
  }

  const winner = gameState.winner;
  const gameWinner = gameState.gameWinner;
  const winningHandInfo = gameState.winningHandInfo as AgariInfo | undefined;
  const score = winningHandInfo?.score as ScoreResult | undefined;

  let title = "";
  let message = "";
  let showAgariInfo = false;

  if (gameState.phase === GamePhase.ROUND_ENDED) {
    if (winner === 'player' && score) {
      const scoreDisplay = getScoreNameAndPayments(score, gameState.dealer === 'player');
      title = "あなたの和了！";
      message = `${scoreDisplay.totalPointsText} です。`;
      showAgariInfo = true;
    } else if (winner === 'cpu' && score) {
      const scoreDisplay = getScoreNameAndPayments(score, gameState.dealer === 'cpu');
      title = "CPUの和了";
      message = `${scoreDisplay.totalPointsText} です。`;
      showAgariInfo = true;
    } else if (winner === 'draw') {
      title = "流局";
      message = gameState.lastActionMessage || "引き分けです。"; // 流局理由を表示
    } else {
      // ROUND_ENDED だが勝者がいないケース (通常は流局メッセージがあるはず)
      title = "局終了";
      message = gameState.lastActionMessage || "次の局へ進みます。";
    }
  } else if (gameState.phase === GamePhase.GAME_OVER) {
    title = "ゲーム終了！";
    const playerFinalScore = gameState.player.score;
    const cpuFinalScore = gameState.cpu.score;
    if (gameWinner === 'player') {
      message = `あなたの総合勝利です！ 最終スコア: あなた ${playerFinalScore}点, CPU ${cpuFinalScore}点`;
    } else if (gameWinner === 'cpu') {
      message = `CPUの総合勝利です。 最終スコア: あなた ${playerFinalScore}点, CPU ${cpuFinalScore}点`;
    } else {
      message = `総合引き分けです。 最終スコア: あなた ${playerFinalScore}点, CPU ${cpuFinalScore}点`;
    }
    // ゲームオーバー時も直前の局の和了情報があれば表示する
    if (winningHandInfo && score) {
        showAgariInfo = true;
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-md clay-area-modal text-white">
        <h2 className="text-3xl font-bold mb-4 text-yellow-300 clay-text-title text-center">{title}</h2>
        <p className="text-lg mb-6 text-center whitespace-pre-wrap">{message}</p>

        {showAgariInfo && winningHandInfo && score && (
          <div className="mb-6">
            <h3 className="text-xl font-semibold mb-2 text-yellow-400">和了手 ({winner === 'player' ? "あなた" : "CPU"}):</h3>
            <div className="flex flex-wrap justify-center bg-green-700/50 p-2 rounded-md border border-green-600 mb-2">
              {winningHandInfo.completedHand.map((tile, i) => (
                <TileDisplay key={`winner-hand-${tile.id}-${i}`} tile={tile} size="small" />
              ))}
            </div>
            {winningHandInfo.agariTile && (
                <p className="text-sm text-center">和了牌: <TileDisplay tile={winningHandInfo.agariTile} size="small" inline={true} /></p>
            )}

            {score.yakuList.length > 0 && (
              <div className="mt-4">
                <h4 className="text-md font-semibold mb-1 text-yellow-400">役一覧:</h4>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {score.yakuList.map((yakuItem, i) => (
                    <li key={i}>{yakuItem.yaku.name} ({yakuItem.han}飜)</li>
                  ))}
                </ul>
              </div>
            )}
             <p className="text-sm mt-2 text-center">合計: {score.han}飜 {score.fu}符</p>
             <p className="text-lg font-bold mt-1 text-center text-yellow-300">{getScoreNameAndPayments(score, winner === 'player' || (winner === 'cpu' && gameState.dealer === 'cpu')).totalPointsText}</p>
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
