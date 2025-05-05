"use client"; // B-Tree の状態と操作はクライアントサイドで管理

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { BTree, BTreeNode, AnimationStep } from '@/lib/btree';
import BTreeView from '@/components/BTreeView';

const TREE_DEGREE = 3; // B-Tree の次数 (t)
const ANIMATION_SPEED_MS = 700; // アニメーションのステップ間隔 (ミリ秒)
// 3階層になるように調整した初期データ
const INITIAL_DATA = [10, 20, 30, 40, 50, 60, 70, 80, 5, 15, 25, 90, 3, 35, 45, 55, 65, 75, 85, 48, 1];

export default function Home() {
  const [tree] = useState(() => new BTree(TREE_DEGREE)); // BTreeインスタンス (状態変更しないのでRefでも良いが、簡単のためState)
  const [inputValue, setInputValue] = useState('');
  const [steps, setSteps] = useState<AnimationStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  const [displayedTree, setDisplayedTree] = useState<BTreeNode | null>(null);
  const [currentDescription, setCurrentDescription] = useState<string>("初期化中..."); // 日本語化
  const [currentExplanation, setCurrentExplanation] = useState<string | undefined>(undefined);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isOperating, setIsOperating] = useState<boolean>(false); // 操作実行中フラグ

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null); // ログコンテナ用 Ref
  const logItemRefs = useRef<Array<HTMLLIElement | null>>([]); // ログ項目用 Ref 配列

  // 初期データ投入用の useEffect
  useEffect(() => {
    let isMounted = true;
    const initializeTree = async () => {
      setIsOperating(true); // 初期化中フラグ
      for (const value of INITIAL_DATA) {
        if (!isMounted) return; // アンマウントされたら中断
        // insert自体はステップを生成するが、ここではステップを保存・再生しない
        await tree.insert(value);
      }
      tree.clearSteps(); // 初期投入のステップはクリア
      if (isMounted) {
          setDisplayedTree(tree.cloneTree());
          setCurrentDescription("ツリーを初期化しました。値を入力するかアニメーションを操作してください。"); // 日本語化
          setIsOperating(false);
      }
    };

    initializeTree();

    return () => {
        isMounted = false; // コンポーネントアンマウント時にフラグ設定
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]); // treeインスタンスは不変なので初回のみ実行

  // アニメーションステップを再生する関数
  const playStep = useCallback((index: number) => {
    if (index >= 0 && index < steps.length) {
      const step = steps[index];
      setDisplayedTree(step.treeState);
      setCurrentStepIndex(index);
      setCurrentExplanation(step.explanation);

      // Scroll log item into view
      logItemRefs.current[index]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });

    }
     else if (index >= steps.length) {
        setIsPlaying(false); // 再生終了
         // 最終状態を確定
        if (steps.length > 0) {
             const lastIndex = steps.length - 1;
             setDisplayedTree(steps[lastIndex].treeState);
             setCurrentStepIndex(lastIndex);
             logItemRefs.current[lastIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
             const lastStep = steps[lastIndex];
             setCurrentExplanation(lastStep?.explanation);
        } else {
             setDisplayedTree(tree.cloneTree()); // 操作がない場合、現在の木を表示
             setCurrentStepIndex(-1);
             setCurrentExplanation("操作を選択するか、アニメーションを開始してください。");
        }
    }
     else if (index === -1) {
         // Initial state before step 0
         setDisplayedTree(tree.root ? tree.cloneTree() : null);
         setCurrentStepIndex(-1);
         setCurrentExplanation("操作を選択するか、アニメーションを開始してください。");
     }
  }, [steps, tree]);

  // アニメーションの再生/一時停止制御
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentStepIndex(prevIndex => {
          const nextIndex = prevIndex + 1;
          if (nextIndex >= steps.length) {
            clearInterval(intervalRef.current!); // 終端に達したら停止
            setIsPlaying(false);
            return steps.length -1; // 最後のステップに留まる
          }
          playStep(nextIndex);
          return nextIndex;
        });
      }, ANIMATION_SPEED_MS);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
    // クリーンアップ関数
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, steps.length, playStep]);

  // 操作実行後の処理
  const handleOperationComplete = useCallback(() => {
    const newSteps = tree.animationSteps;
    setSteps(newSteps);
    logItemRefs.current = logItemRefs.current.slice(0, newSteps.length); // Ref 配列のサイズ調整
    setCurrentStepIndex(-1); // アニメーションは最初から再生

    // ★ アニメーション開始前の初期状態を表示する
    //    (操作前の状態を保持していないため、擬似的にリセットした現在のツリー状態を表示)
    let initialTreeStateForDisplay = tree.root ? tree.cloneTree() : null;
    if (initialTreeStateForDisplay) {
        // BTreeNodeクラスのメソッドを直接呼べないのでヘルパー関数を使う
        const traverseAndReset = (node: BTreeNode | null) => {
            if (!node) return;
            node.resetAnimationState(); // 各ノードのアニメーション状態をリセット
            if (!node.isLeaf) {
                node.children.forEach(traverseAndReset);
            }
        }
        traverseAndReset(initialTreeStateForDisplay);
    }
    setDisplayedTree(initialTreeStateForDisplay);

    setIsOperating(false); // 操作ロジック自体は完了

    // ★ ステップが生成されていたら、自動再生を開始する
    if (newSteps.length > 0) {
        setCurrentDescription("操作完了。アニメーションを再生します...");
        // setTimeout を使い、state更新が描画に反映されるのを待ってから再生開始
        setTimeout(() => {
            if (steps.length > 0) { // Check steps again in case of race condition
                playStep(0); // 最初のステップ状態を表示
                setIsPlaying(true); // アニメーション再生開始
            } else {
                 setIsPlaying(false); // ステップがない場合は再生しない
            }
        }, 100); // 少し待機時間を設ける
    } else {
        setCurrentDescription("操作の結果、ステップは生成されませんでした。現在のツリー状態を表示しています。");
        setIsPlaying(false); // 再生するものがない
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]); // playStep を依存配列から削除 (setTimeout内で直接呼ぶため)

  const handleInsert = useCallback(async () => {
    const value = parseInt(inputValue, 10);
    if (isNaN(value) || isOperating) return;
    setIsOperating(true);
    setCurrentDescription(`${value} を挿入中...`); // 日本語化
    setInputValue('');
    setIsPlaying(false);
    try {
        await tree.insert(value);
    } catch(e) {
        console.error("Insert failed:", e);
        setCurrentDescription(`挿入エラー: ${e instanceof Error ? e.message : String(e)}`); // 日本語化
    } finally {
        handleOperationComplete();
    }
  }, [inputValue, isOperating, tree, handleOperationComplete]);

  const handleSearch = useCallback(async () => {
    const value = parseInt(inputValue, 10);
    if (isNaN(value) || isOperating) return;
    setIsOperating(true);
    setCurrentDescription(`${value} を検索中...`); // 日本語化
    setInputValue('');
     setIsPlaying(false);
    try {
        await tree.search(value);
    } catch(e) {
        console.error("Search failed:", e);
        setCurrentDescription(`検索エラー: ${e instanceof Error ? e.message : String(e)}`); // 日本語化
    } finally {
        handleOperationComplete();
    }
  }, [inputValue, isOperating, tree, handleOperationComplete]);

  const handleDelete = useCallback(async () => {
    const value = parseInt(inputValue, 10);
    if (isNaN(value) || isOperating) return;
     setIsOperating(true);
    setCurrentDescription(`${value} を削除中...`); // 日本語化
    setInputValue('');
     setIsPlaying(false);
    try {
        await tree.delete(value);
    } catch(e) {
        console.error("Delete failed:", e);
         setCurrentDescription(`削除エラー: ${e instanceof Error ? e.message : String(e)}`); // 日本語化
    } finally {
        handleOperationComplete();
    }
  }, [inputValue, isOperating, tree, handleOperationComplete]);

   // --- Animation Control Handlers ---
  const handlePlayPause = () => {
      if (steps.length === 0) return;
      if (currentStepIndex >= steps.length - 1) {
          // Ended or at last step, restart from beginning
          playStep(0);
          setIsPlaying(true);
      } else {
          setIsPlaying(!isPlaying);
      }
  };

  const handleNextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      setIsPlaying(false);
      playStep(currentStepIndex + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      setIsPlaying(false);
      playStep(currentStepIndex - 1);
    } else if (currentStepIndex === 0) {
        // Go back to initial state before step 0
        setIsPlaying(false);
        playStep(-1); // Use playStep to handle initial state
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStepIndex(-1);
    setSteps([]);
    logItemRefs.current = []; // Ref 配列もクリア
    setDisplayedTree(tree.root ? tree.cloneTree() : null);
    setCurrentDescription("アニメーションをリセットしました。現在のツリー状態を表示しています。"); // 日本語化
    setCurrentExplanation("アニメーションをリセットしました。");
  };

  // Log クリックハンドラ
  const handleLogItemClick = (index: number) => {
      if (isOperating) return; // 操作中はジャンプしない
      setIsPlaying(false); // クリックしたら再生停止
      playStep(index);
  };

  // 初期表示用に現在のツリー状態を設定
  useEffect(() => {
    if (currentStepIndex === -1 && steps.length === 0) { // ステップがない初期状態のみ
      setDisplayedTree(tree.cloneTree());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]); // currentStepIndex を削除、steps.length を追加

  return (
    <div className="flex flex-col lg:flex-row w-full max-w-7xl gap-4 mt-4 flex-1">
      {/* Left Panel: Tree View */}
      <div className="flex-1 lg:flex-[1] bg-white rounded-lg shadow overflow-hidden border border-gray-200">
        <BTreeView node={displayedTree} />
      </div>

      {/* Right Panel: Controls and Logs */}
      <div className="lg:flex-[1] flex flex-col gap-4">
        {/* Input & Operation Buttons */}
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <h3 className="text-lg font-semibold mb-2 text-gray-700">操作</h3>
          <div className="flex flex-col sm:flex-row gap-2 items-center">
            <input
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="数値を入力"
              className="border border-gray-300 rounded px-2 py-1 text-sm flex-grow disabled:bg-gray-100"
              disabled={isOperating}
            />
            <div className="flex gap-2 flex-wrap justify-center sm:justify-end">
                <button
                  onClick={handleInsert}
                  disabled={isOperating || !inputValue}
                  className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50 transition-colors"
                >
                  挿入
                </button>
                <button
                  onClick={handleSearch}
                  disabled={isOperating || !inputValue}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50 transition-colors"
                >
                  検索
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isOperating || !inputValue}
                  className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50 transition-colors"
                >
                  削除
                </button>
            </div>
          </div>
        </div>

        {/* Animation Controls */}
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <h3 className="text-lg font-semibold mb-2 text-gray-700">アニメーション制御</h3>
            <div className="flex justify-center items-center gap-2 flex-wrap">
                <button
                  onClick={handleReset}
                  disabled={steps.length === 0 || isOperating}
                  className="px-3 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300 disabled:opacity-50 transition-colors"
                >
                  リセット
                </button>
                <button
                  onClick={handlePrevStep}
                  disabled={currentStepIndex <= 0 || isOperating}
                  className="px-3 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300 disabled:opacity-50 transition-colors"
                >
                  &lt;&lt; 前へ
                </button>
                <button
                  onClick={handlePlayPause}
                  disabled={steps.length === 0 || isOperating}
                  className={`px-3 py-1 rounded text-sm text-white disabled:opacity-50 transition-colors ${isPlaying ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-indigo-500 hover:bg-indigo-600'}`}
                >
                  {isPlaying ? '一時停止' : (currentStepIndex >= steps.length - 1 ? '再再生' : '再生')}
                </button>
                <button
                  onClick={handleNextStep}
                  disabled={currentStepIndex >= steps.length - 1 || isOperating}
                  className="px-3 py-1 rounded text-sm bg-gray-200 hover:bg-gray-300 disabled:opacity-50 transition-colors"
                >
                  次へ &gt;&gt;
                </button>
            </div>
        </div>

        {/* Status/Log Area */}
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200 flex-1 flex flex-col min-h-[200px] max-h-[calc(100vh-300px)]">
          <h3 className="text-lg font-semibold mb-2 text-gray-700">ステータス / ログ</h3>
          <p className="text-sm text-gray-600 mb-3 min-h-[1.5em]"> {/* Min height for stability */}
              {currentStepIndex >= 0 && currentStepIndex < steps.length ? steps[currentStepIndex].description : currentDescription}
          </p>
          <div
              ref={logContainerRef} // Ref 適用
              className="h-96 overflow-y-auto border-t border-gray-200 pt-2 text-xs"
          >
            <ol className="list-decimal list-inside space-y-1">
              {steps.map((step, index) => (
                <li
                  key={index}
                  ref={(el: HTMLLIElement | null) => { logItemRefs.current[index] = el; }}
                  onClick={() => handleLogItemClick(index)}
                  className={`cursor-pointer p-1 rounded transition-colors ${ currentStepIndex === index ? 'bg-blue-100 text-blue-800 font-semibold' : 'hover:bg-gray-100' }`}
                >
                   <span className="font-bold mr-1">[{index + 1}]</span> {step.description}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* ★ NEW: Explanation Area */}
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <h3 className="text-lg font-semibold mb-2 text-gray-700">解説</h3>
          <div className="text-sm text-gray-800 min-h-[4em] prose prose-sm max-w-none">
              {currentExplanation || (currentStepIndex === -1 ? "操作を選択するか、アニメーションを開始してください。" : "このステップの解説はありません。")}
          </div>
        </div>

      </div>
    </div>
  );
}
