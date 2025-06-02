const { ReversiEngine } = require('./lib/reversi-engine.ts');

// ReversiEngineの基本動作テスト
console.log('🔬 ReversiEngine テストを開始します...\n');

try {
  const engine = new ReversiEngine();
  const initialState = engine.getGameState();

  console.log('✅ 初期状態確認:');
  console.log(`  現在のプレイヤー: ${initialState.currentPlayer}`);
  console.log(`  黒石の数: ${initialState.blackCount}`);
  console.log(`  白石の数: ${initialState.whiteCount}`);
  console.log(`  有効な手の数: ${initialState.validMoves.length}`);
  console.log(`  有効な手: ${JSON.stringify(initialState.validMoves)}`);

  // 盤面の表示
  console.log('\n📋 初期盤面:');
  for (let row = 0; row < 8; row++) {
    let rowStr = '';
    for (let col = 0; col < 8; col++) {
      const cell = initialState.board[row][col];
      if (cell === 'black') rowStr += '⚫';
      else if (cell === 'white') rowStr += '⚪';
      else rowStr += '⬜';
    }
    console.log(`  ${rowStr} ${row}`);
  }
  console.log('  01234567');

  // 有効な手があるかテスト
  if (initialState.validMoves.length > 0) {
    console.log('\n✅ 有効な手が見つかりました！');

    // 最初の有効な手を実行
    const firstMove = initialState.validMoves[0];
    console.log(`\n🎯 手を実行: (${firstMove.row}, ${firstMove.col})`);

    const success = engine.makeMove(firstMove.row, firstMove.col, 'black');
    if (success) {
      const newState = engine.getGameState();
      console.log('✅ 手の実行に成功！');
      console.log(`  黒石の数: ${newState.blackCount}`);
      console.log(`  白石の数: ${newState.whiteCount}`);
      console.log(`  現在のプレイヤー: ${newState.currentPlayer}`);
    } else {
      console.log('❌ 手の実行に失敗');
    }
  } else {
    console.log('❌ 有効な手が見つかりません');
  }

  console.log('\n🎉 テスト完了！');

} catch (error) {
  console.error('❌ テスト中にエラーが発生しました:', error.message);
  console.error(error.stack);
}
