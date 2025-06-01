import { NextResponse } from 'next/server';
import { getGame, saveGame } from '@/lib/mahjong/game_store';
import { GameAction, PlayerID, processAction, GameState, ActionType } from '@/lib/mahjong/game_state';
import { Tile } from '@/lib/mahjong/tiles';

// 共通エラーレスポンス
function errorResponse(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { gameId, playerId, action } = body as {
      gameId: string;
      playerId: PlayerID;
      action: GameAction; // GameAction には tile や tileToDiscard などが含まれる
    };

    if (!gameId || !playerId || !action || !action.type) {
      return errorResponse('Invalid request body: gameId, playerId, and action (with type) are required.');
    }

    let currentGame = getGame(gameId);
    if (!currentGame) {
      return errorResponse('Game not found.', 404);
    }

    console.log(`[Game Action] GameID: ${gameId}, Player: ${playerId}, Action: ${action.type}`);
    if (action.tile) console.log(`  Tile: ${action.tile.id}`);
    if (action.tileToDiscard) console.log(`  TileToDiscard: ${action.tileToDiscard.id}`);
    if (action.meldType) console.log(`  MeldType: ${action.meldType}`);
    if (action.targetTile) console.log(`  TargetTile: ${action.targetTile.id}`);


    // プレイヤーのターンかどうかの基本的なチェック
    if (currentGame.currentTurn !== playerId && action.type !== ActionType.Ron && !(action.type === ActionType.Kan && action.meldType === 'daiminkan') && action.type !== ActionType.Pon) {
        // ロン、大明槓、ポン以外は自分のターンでないとアクション不可
        if(currentGame.phase !== 'ROUND_ENDED' && currentGame.phase !== 'GAME_OVER'){
             console.warn(`Action from wrong player. Expected: ${currentGame.currentTurn}, Got: ${playerId}, Action: ${action.type}`);
            // return errorResponse(`Not your turn. Current turn: ${currentGame.currentTurn}`, 403);
            // クライアント側での制御を信じ、一旦許容して進める。ただし警告は出す。
        }
    }

    // action.tile などが存在する場合、それが本当に Tile 型のオブジェクトか簡易チェック
    // (クライアントから文字列などで送られてくる可能性を考慮)
    if (action.tile && (typeof action.tile !== 'object' || !action.tile.id || !action.tile.suit || action.tile.value === undefined)) {
        return errorResponse('Invalid tile object in action.');
    }
    if (action.tileToDiscard && (typeof action.tileToDiscard !== 'object' || !action.tileToDiscard.id || !action.tileToDiscard.suit || action.tileToDiscard.value === undefined)) {
        return errorResponse('Invalid tileToDiscard object in action.');
    }
     if (action.targetTile && (typeof action.targetTile !== 'object' || !action.targetTile.id || !action.targetTile.suit || action.targetTile.value === undefined)) {
        return errorResponse('Invalid targetTile object in action.');
    }


    const updatedGameState = processAction(currentGame, playerId, action);
    saveGame(updatedGameState);

    console.log('[Game Action Response]', updatedGameState.lastActionMessage);
    // console.log('Updated Game State:', JSON.stringify(updatedGameState, null, 2));

    return NextResponse.json(updatedGameState);

  } catch (e: any) {
    console.error('[Game Action Error]', e);
    return errorResponse(e.message || 'An unexpected error occurred.', 500);
  }
}
