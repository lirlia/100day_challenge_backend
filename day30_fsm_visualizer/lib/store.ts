import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Node, Edge, XYPosition } from 'reactflow';
import { nanoid } from 'nanoid'; // ID生成に使用

// データ構造の定義
export interface AutomatonState {
  id: string;
  label: string;
  isAccepting: boolean;
  position: XYPosition; // React Flow 用の位置情報
}

export interface AutomatonTransition {
  id: string;
  fromStateId: string;
  toStateId: string;
  input: string;
}

export interface AutomatonDefinition {
  id: string; // cuid() or similar
  name: string;
  alphabet: string[];
  states: AutomatonState[];
  transitions: AutomatonTransition[];
  startStateId: string | null;
}

// サンプルデータ: 文字列 "abb" を受理するDFA
const sampleAutomaton: AutomatonDefinition = {
  id: 'sample_abb_dfa',
  name: 'Sample DFA (accepts "abb")',
  alphabet: ['a', 'b'],
  states: [
    { id: 'q0', label: 'q0', isAccepting: false, position: { x: 50, y: 150 } },
    { id: 'q1', label: 'q1', isAccepting: false, position: { x: 250, y: 150 } },
    { id: 'q2', label: 'q2', isAccepting: false, position: { x: 450, y: 150 } },
    { id: 'q3', label: 'q3', isAccepting: true, position: { x: 650, y: 150 } },
    { id: 'q_trap', label: 'trap', isAccepting: false, position: { x: 450, y: 300 } }, // トラップ状態
  ],
  transitions: [
    // q0
    { id: 't_q0_a', fromStateId: 'q0', toStateId: 'q1', input: 'a' },
    { id: 't_q0_b', fromStateId: 'q0', toStateId: 'q_trap', input: 'b' },
    // q1
    { id: 't_q1_a', fromStateId: 'q1', toStateId: 'q_trap', input: 'a' },
    { id: 't_q1_b', fromStateId: 'q1', toStateId: 'q2', input: 'b' },
    // q2
    { id: 't_q2_a', fromStateId: 'q2', toStateId: 'q_trap', input: 'a' },
    { id: 't_q2_b', fromStateId: 'q2', toStateId: 'q3', input: 'b' },
    // q3 (受理状態)
    { id: 't_q3_a', fromStateId: 'q3', toStateId: 'q_trap', input: 'a' },
    { id: 't_q3_b', fromStateId: 'q3', toStateId: 'q_trap', input: 'b' },
    // q_trap
    { id: 't_qt_a', fromStateId: 'q_trap', toStateId: 'q_trap', input: 'a' },
    { id: 't_qt_b', fromStateId: 'q_trap', toStateId: 'q_trap', input: 'b' },
  ],
  startStateId: 'q0',
};

// シミュレーション結果の型
type SimulationResult = 'Accepted' | 'Rejected' | 'Running' | 'Idle' | 'Error: No Start State' | 'Error: Invalid Input';

// Zustand ストアの型定義 (シミュレーション関連を追加)
interface AutomatonStore {
  automata: { [id: string]: AutomatonDefinition };
  activeAutomatonId: string | null;

  // --- オートマトン定義アクション (既存) ---
  loadInitialData: () => void;
  saveAutomaton: (definition: AutomatonDefinition) => void;
  deleteAutomaton: (id: string) => void;
  setActiveAutomaton: (id: string | null) => void;
  updateActiveAutomaton: (updates: Partial<Omit<AutomatonDefinition, 'id'>>) => void;
  addState: (stateData: Omit<AutomatonState, 'id'>) => void;
  updateState: (stateId: string, updates: Partial<AutomatonState>) => void;
  deleteState: (stateId: string) => void;
  addTransition: (transitionData: Omit<AutomatonTransition, 'id'>) => void;
  updateTransition: (transitionId: string, updates: Partial<AutomatonTransition>) => void;
  deleteTransition: (transitionId: string) => void;
  setStartState: (stateId: string | null) => void;
  setAcceptingState: (stateId: string, isAccepting: boolean) => void;
  setAlphabet: (alphabet: string[]) => void;
  renameAutomaton: (name: string) => void;

  // --- シミュレーション状態 ---
  simulationInput: string;
  simulationCurrentStep: number; // 入力文字列の現在のインデックス
  simulationCurrentStateId: string | null; // シミュレーション中の現在の状態ID
  simulationResult: SimulationResult;
  simulationPath: string[]; // 辿った状態IDの履歴
  highlightedStateId: string | null; // グラフでハイライトする状態ID
  highlightedEdgeId: string | null; // グラフでハイライトする遷移ID

  // --- シミュレーションアクション ---
  setSimulationInput: (input: string) => void;
  resetSimulation: () => void;
  stepSimulation: () => boolean; // 1ステップ進める。シミュレーション終了ならtrueを返す
  runSimulation: () => void; // 最後まで実行する
}

// ローカルストレージに保存する際の名前
const STORAGE_KEY = 'fsm-visualizer-automata';

// Zustand ストアの実装 (シミュレーション関連を追加)
export const useAutomatonStore = create<AutomatonStore>()(
  persist(
    (set, get) => ({
      // --- 既存の状態とアクション ---
      automata: {}, // 初期状態は空
      activeAutomatonId: null,
      loadInitialData: () => {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
          try {
            const parsed = JSON.parse(storedData);
            // 状態 ('state') がオブジェクトであることを確認
            if (parsed && typeof parsed.state === 'object' && parsed.state.automata) {
               // 以前の persist ミドルウェアの形式に合わせた読み込み
              const loadedAutomata = parsed.state.automata as { [id: string]: AutomatonDefinition };
              const firstAutomatonId = Object.keys(loadedAutomata)[0] || null;
              set({ automata: loadedAutomata, activeAutomatonId: firstAutomatonId });
              console.log('Loaded automata from localStorage:', loadedAutomata);
            } else {
              console.warn('Invalid data structure in localStorage. Using sample data.');
              set({ automata: { [sampleAutomaton.id]: sampleAutomaton }, activeAutomatonId: sampleAutomaton.id });
            }
          } catch (error) {
            console.error('Failed to parse localStorage data:', error, 'Using sample data.');
            set({ automata: { [sampleAutomaton.id]: sampleAutomaton }, activeAutomatonId: sampleAutomaton.id });
          }
        } else {
          console.log('No data in localStorage. Loading sample automaton.');
          set({ automata: { [sampleAutomaton.id]: sampleAutomaton }, activeAutomatonId: sampleAutomaton.id });
        }
      },
      saveAutomaton: (definition) => {
        set((state) => ({
          automata: {
            ...state.automata,
            [definition.id]: definition,
          },
          activeAutomatonId: definition.id, // 保存したらアクティブにする
        }));
        console.log('Saved automaton:', definition.id);
      },
      deleteAutomaton: (id) => {
        set((state) => {
          const newAutomata = { ...state.automata };
          delete newAutomata[id];
          const remainingIds = Object.keys(newAutomata);
          const newActiveId = state.activeAutomatonId === id
            ? (remainingIds[0] || null) // 削除したものがアクティブなら最初のをアクティブに
            : state.activeAutomatonId; // そうでなければそのまま
          return { automata: newAutomata, activeAutomatonId: newActiveId };
        });
        console.log('Deleted automaton:', id);
      },
      setActiveAutomaton: (id) => {
         set({ activeAutomatonId: id });
         console.log('Set active automaton:', id);
      },
      updateActiveAutomaton: (updates) => {
        set((state) => {
          if (!state.activeAutomatonId || !state.automata[state.activeAutomatonId]) return state;
          const updatedAutomaton = {
            ...state.automata[state.activeAutomatonId],
            ...updates,
          };
          return {
            automata: {
              ...state.automata,
              [state.activeAutomatonId]: updatedAutomaton,
            },
          };
        });
      },
      addState: (stateData) => {
        set((state) => {
            if (!state.activeAutomatonId || !state.automata[state.activeAutomatonId]) return state;
            const newStateId = `s_${Date.now()}`; // 簡単なID生成
            const newState: AutomatonState = { ...stateData, id: newStateId };
            const currentAutomaton = state.automata[state.activeAutomatonId];
            const updatedAutomaton = {
                ...currentAutomaton,
                states: [...currentAutomaton.states, newState],
            };
            return {
                automata: {
                    ...state.automata,
                    [state.activeAutomatonId]: updatedAutomaton,
                },
            };
        });
      },
      updateState: (stateId, updates) => {
        set((state) => {
            if (!state.activeAutomatonId || !state.automata[state.activeAutomatonId]) return state;
            const currentAutomaton = state.automata[state.activeAutomatonId];
            const updatedStates = currentAutomaton.states.map(s =>
                s.id === stateId ? { ...s, ...updates } : s
            );
            const updatedAutomaton = { ...currentAutomaton, states: updatedStates };
             // 開始状態や受理状態がIDで参照されている場合、整合性を保つ必要があればここで調整
            return {
                automata: { ...state.automata, [state.activeAutomatonId]: updatedAutomaton },
            };
        });
      },
      deleteState: (stateId) => {
          set((state) => {
              if (!state.activeAutomatonId || !state.automata[state.activeAutomatonId]) return state;
              const currentAutomaton = state.automata[state.activeAutomatonId];

              // 削除対象の状態を除外
              const remainingStates = currentAutomaton.states.filter(s => s.id !== stateId);

              // 削除対象の状態を参照している遷移を除外
              const remainingTransitions = currentAutomaton.transitions.filter(
                  t => t.fromStateId !== stateId && t.toStateId !== stateId
              );

              // 開始状態が削除された場合は null にする
              const newStartStateId = currentAutomaton.startStateId === stateId
                  ? null
                  : currentAutomaton.startStateId;

              const updatedAutomaton = {
                  ...currentAutomaton,
                  states: remainingStates,
                  transitions: remainingTransitions,
                  startStateId: newStartStateId,
              };

              return {
                  automata: { ...state.automata, [state.activeAutomatonId]: updatedAutomaton },
              };
          });
      },
      addTransition: (transitionData) => {
         set((state) => {
            if (!state.activeAutomatonId || !state.automata[state.activeAutomatonId]) return state;
            const newTransitionId = `t_${Date.now()}`; // 簡単なID生成
            const newTransition: AutomatonTransition = { ...transitionData, id: newTransitionId };
           const currentAutomaton = state.automata[state.activeAutomatonId];

            // DFA制約チェック: 同じ状態からの同じ入力に対する遷移が既に存在しないか確認
            const existingTransition = currentAutomaton.transitions.find(
              t => t.fromStateId === newTransition.fromStateId && t.input === newTransition.input
            );
            if (existingTransition) {
                console.warn(`DFA Violation: Transition from ${newTransition.fromStateId} with input '${newTransition.input}' already exists.`);
                // エラー表示や処理中断などが必要な場合
                return state; // 更新しない
            }

            const updatedAutomaton = {
                ...currentAutomaton,
                transitions: [...currentAutomaton.transitions, newTransition],
            };
            return {
                automata: {
                    ...state.automata,
                    [state.activeAutomatonId]: updatedAutomaton,
                },
            };
         });
       },
      updateTransition: (transitionId, updates) => {
        set((state) => {
            if (!state.activeAutomatonId || !state.automata[state.activeAutomatonId]) return state;
            const currentAutomaton = state.automata[state.activeAutomatonId];
            const updatedTransitions = currentAutomaton.transitions.map(t =>
                t.id === transitionId ? { ...t, ...updates } : t
            );
             // DFA制約の再チェックが必要な場合あり (input や fromStateId が変更された場合)
             // ここでは単純な更新のみとする
            const updatedAutomaton = { ...currentAutomaton, transitions: updatedTransitions };
            return {
                automata: { ...state.automata, [state.activeAutomatonId]: updatedAutomaton },
            };
        });
      },
      deleteTransition: (transitionId) => {
         set((state) => {
            if (!state.activeAutomatonId || !state.automata[state.activeAutomatonId]) return state;
            const currentAutomaton = state.automata[state.activeAutomatonId];
            const updatedTransitions = currentAutomaton.transitions.filter(t => t.id !== transitionId);
            const updatedAutomaton = { ...currentAutomaton, transitions: updatedTransitions };
            return {
                automata: { ...state.automata, [state.activeAutomatonId]: updatedAutomaton },
            };
         });
      },
      setStartState: (stateId) => {
        set((state) => {
            if (!state.activeAutomatonId || !state.automata[state.activeAutomatonId]) return state;
            const currentAutomaton = state.automata[state.activeAutomatonId];
            // 指定された stateId が実際に存在するか確認してもよい
            const updatedAutomaton = { ...currentAutomaton, startStateId: stateId };
            return {
                automata: { ...state.automata, [state.activeAutomatonId]: updatedAutomaton },
            };
        });
      },
      setAcceptingState: (stateId, isAccepting) => {
         get().updateState(stateId, { isAccepting }); // 既存の updateState を利用
      },
      setAlphabet: (alphabet) => {
        set((state) => {
            if (!state.activeAutomatonId || !state.automata[state.activeAutomatonId]) return state;
            const currentAutomaton = state.automata[state.activeAutomatonId];
             // アルファベット変更時に既存の遷移の input が無効にならないかチェックするロジックを追加可能
            const updatedAutomaton = { ...currentAutomaton, alphabet };
            return {
                automata: { ...state.automata, [state.activeAutomatonId]: updatedAutomaton },
            };
        });
      },
      renameAutomaton: (name) => {
        get().updateActiveAutomaton({ name }); // 既存の updateActiveAutomaton を利用
      },

      // --- シミュレーション状態の初期値 ---
      simulationInput: '',
      simulationCurrentStep: 0,
      simulationCurrentStateId: null,
      simulationResult: 'Idle',
      simulationPath: [],
      highlightedStateId: null,
      highlightedEdgeId: null,

      // --- シミュレーションアクションの実装 ---
      setSimulationInput: (input) => set({ simulationInput: input, simulationResult: 'Idle', simulationCurrentStep: 0, simulationCurrentStateId: null, highlightedStateId: null, highlightedEdgeId: null, simulationPath: [] }),

      resetSimulation: () => {
        const { activeAutomatonId, automata } = get();
        const startStateId = activeAutomatonId ? automata[activeAutomatonId]?.startStateId : null;
        set({
          simulationCurrentStep: 0,
          simulationCurrentStateId: startStateId,
          simulationResult: 'Idle',
          simulationPath: startStateId ? [startStateId] : [],
          highlightedStateId: startStateId, // 開始状態をハイライト
          highlightedEdgeId: null,
        });
      },

      stepSimulation: () => {
        const {
          activeAutomatonId,
          automata,
          simulationInput,
          simulationCurrentStep,
          simulationCurrentStateId,
        } = get();

        if (!activeAutomatonId || !automata[activeAutomatonId]) return true; // オートマトンがない
        const automaton = automata[activeAutomatonId];

        // 開始状態がない場合
        if (!automaton.startStateId) {
          set({ simulationResult: 'Error: No Start State', highlightedStateId: null, highlightedEdgeId: null });
          return true;
        }

        // 最初のステップの場合、状態を初期化
        let currentStateId = simulationCurrentStateId;
        if (simulationCurrentStep === 0 && currentStateId === null) {
            currentStateId = automaton.startStateId;
            set({
                simulationCurrentStateId: currentStateId,
                simulationPath: [currentStateId],
                highlightedStateId: currentStateId,
                highlightedEdgeId: null,
                simulationResult: 'Running'
            });
        } else if (!currentStateId) {
            // 開始状態以外で current state が null は想定外
            get().resetSimulation();
            return true;
        }

        // 入力文字列の最後まで到達した場合
        if (simulationCurrentStep >= simulationInput.length) {
          const finalState = automaton.states.find(s => s.id === currentStateId);
          const result: SimulationResult = finalState?.isAccepting ? 'Accepted' : 'Rejected';
          set({ simulationResult: result, highlightedEdgeId: null }); // 最後はエッジハイライト解除
          return true; // 終了
        }

        const currentInputChar = simulationInput[simulationCurrentStep];

        // アルファベットに含まれない文字の場合
        if (!automaton.alphabet.includes(currentInputChar)) {
          set({ simulationResult: 'Error: Invalid Input', highlightedStateId: currentStateId, highlightedEdgeId: null });
          return true; // 終了
        }

        // 遷移を探す
        const transition = automaton.transitions.find(
          (t) => t.fromStateId === currentStateId && t.input === currentInputChar
        );

        // 遷移が見つからない場合 (DFAでは通常トラップ状態へ行くが、定義されていなければ拒否)
        if (!transition) {
          set({ simulationResult: 'Rejected', highlightedEdgeId: null }); // トラップ遷移がない場合はここで終了
          return true; // 終了
        }

        // 遷移が見つかった場合：状態を更新
        const nextStateId = transition.toStateId;
        set((state) => ({
          simulationCurrentStep: state.simulationCurrentStep + 1,
          simulationCurrentStateId: nextStateId,
          simulationPath: [...state.simulationPath, nextStateId],
          highlightedStateId: nextStateId, // 次の状態をハイライト
          highlightedEdgeId: transition.id, // 遷移エッジをハイライト
          simulationResult: 'Running',
        }));

        return false; // まだ続く
      },

      runSimulation: () => {
        get().resetSimulation(); // まずリセット
        set({ simulationResult: 'Running' });

        // ステップ実行を終了するまで繰り返す
        const runStep = () => {
            const isFinished = get().stepSimulation();
            if (!isFinished && get().simulationResult === 'Running') {
                // 少し遅延を入れて実行 (なくても良いが、UI更新を見せるなら)
                setTimeout(runStep, 50); // 50msごとにステップ
            }
        };
        // 最初のステップを開始状態設定後に行うため少し待つ
        setTimeout(runStep, 10);
      },

    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // シミュレーション状態は永続化しない
      partialize: (state) => ({
        automata: state.automata,
        activeAutomatonId: state.activeAutomatonId,
      }),
    }
  )
);

// 初期データのロードをアプリのどこか（例: ルートレイアウトやページ）で一度だけ呼び出す
