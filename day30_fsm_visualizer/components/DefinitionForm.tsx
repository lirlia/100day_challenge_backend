'use client';

import React, { useState, useEffect } from 'react';
import { useAutomatonStore } from '../lib/store';
import { XYPosition } from 'reactflow';

// ブルータリズム風のボタンスタイル
const btnStyle = "px-3 py-1 bg-white border-2 border-black text-black font-bold hover:bg-gray-200 active:translate-y-px active:shadow-none shadow-[3px_3px_0px_rgba(0,0,0,1)] transition-all text-sm";
const inputStyle = "px-2 py-1 bg-white border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm w-full";
const labelStyle = "block text-sm font-bold mb-1";
const sectionStyle = "mb-6 p-3 border-2 border-black bg-gray-100 shadow-[4px_4px_0px_rgba(0,0,0,1)]";
const itemStyle = "flex justify-between items-center p-1 border-b border-dashed border-gray-600 last:border-b-0";

export default function DefinitionForm() {
  const {
    automata,
    activeAutomatonId,
    renameAutomaton,
    setAlphabet,
    addState,
    updateState,
    deleteState,
    addTransition,
    deleteTransition,
    setStartState,
    setAcceptingState,
  } = useAutomatonStore();

  const activeAutomaton = activeAutomatonId ? automata[activeAutomatonId] : null;

  // 状態追加用ローカルステート
  const [newStateLabel, setNewStateLabel] = useState('');

  // 遷移追加用ローカルステート
  const [fromState, setFromState] = useState('');
  const [toState, setToState] = useState('');
  const [inputChar, setInputChar] = useState('');

  // 初回レンダリング時やアクティブオートマトン変更時にフォームをリセット
  useEffect(() => {
    // activeAutomaton が存在する場合のみフォームのデフォルト値を設定
    if (activeAutomaton) {
      if (activeAutomaton.states?.length > 0) {
        setFromState(activeAutomaton.states[0].id);
        setToState(activeAutomaton.states[0].id);
      } else {
          setFromState(''); // 状態がない場合はリセット
          setToState('');
      }
      if (activeAutomaton.alphabet?.length > 0) {
        setInputChar(activeAutomaton.alphabet[0]);
      } else {
          setInputChar(''); // アルファベットがない場合はリセット
      }
    }
  }, [activeAutomatonId, activeAutomaton]); // activeAutomaton も依存配列に追加

  if (!activeAutomaton) {
    return <div className={sectionStyle}>No automaton selected or loaded.</div>;
  }

  const handleAddState = () => {
    if (!newStateLabel.trim()) return;
    // 適当な初期位置を設定
    const position: XYPosition = { x: Math.random() * 200 + 50, y: Math.random() * 200 + 50 };
    addState({ label: newStateLabel, isAccepting: false, position });
    setNewStateLabel('');
  };

  const handleAddTransition = () => {
    if (!fromState || !toState || !inputChar) return;
    // アルファベットに含まれるかチェック
    if (!activeAutomaton.alphabet.includes(inputChar)) {
        alert(`Input '${inputChar}' is not in the alphabet [${activeAutomaton.alphabet.join(', ')}]`);
        return;
    }
    addTransition({ fromStateId: fromState, toStateId: toState, input: inputChar });
    // フォームはリセットしない方が連続入力しやすいかも？
  };

  return (
    <div className="space-y-4">
      {/* Automaton Name */}
      <div className={sectionStyle}>
        <label htmlFor="automatonName" className={labelStyle}>Automaton Name</label>
        <input
          id="automatonName"
          type="text"
          value={activeAutomaton.name}
          onChange={(e) => renameAutomaton(e.target.value)}
          className={inputStyle}
          placeholder="Enter automaton name"
        />
      </div>

      {/* Alphabet */}
      <div className={sectionStyle}>
        <label htmlFor="alphabet" className={labelStyle}>Alphabet (comma-separated)</label>
        <input
          id="alphabet"
          type="text"
          value={activeAutomaton.alphabet.join(', ')}
          onChange={(e) => {
             // カンマで区切り、前後の空白を削除、空文字を除外
            const newAlphabet = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
            setAlphabet(newAlphabet);
          }}
          className={inputStyle}
          placeholder="e.g., a, b, 0, 1"
        />
      </div>

      {/* States */}
      <div className={sectionStyle}>
        <h3 className={`${labelStyle} border-b border-black mb-2 pb-1`}>States</h3>
        <div className="max-h-40 overflow-y-auto mb-2 text-sm pr-1">
          {activeAutomaton.states.map((state) => (
            <div key={state.id} className={itemStyle}>
                <input
                   type="text"
                   value={state.label}
                   onChange={(e) => updateState(state.id, { label: e.target.value })}
                   className={`${inputStyle} w-1/3 mr-1`}
                   placeholder="State label"
                />
              <div>
                <button
                  onClick={() => setStartState(state.id)}
                  className={`${btnStyle} ${activeAutomaton.startStateId === state.id ? 'bg-green-300' : ''} mr-1`} // 緑背景で開始状態を示す
                  title="Set as Start State"
                >
                  S
                </button>
                <button
                  onClick={() => setAcceptingState(state.id, !state.isAccepting)}
                  className={`${btnStyle} ${state.isAccepting ? 'bg-blue-300' : ''} mr-1`} // 青背景で受理状態を示す
                  title="Toggle Accepting State"
                >
                  A
                </button>
                <button onClick={() => deleteState(state.id)} className={`${btnStyle} bg-red-400 hover:bg-red-500`} title="Delete State">
                  X
                </button>
              </div>
            </div>
          ))}
          {activeAutomaton.states.length === 0 && <p className="text-xs text-gray-500">No states defined.</p>}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newStateLabel}
            onChange={(e) => setNewStateLabel(e.target.value)}
            placeholder="New state label"
            className={inputStyle}
          />
          <button onClick={handleAddState} className={btnStyle}>Add State</button>
        </div>
      </div>

      {/* Transitions */}
      <div className={sectionStyle}>
        <h3 className={`${labelStyle} border-b border-black mb-2 pb-1`}>Transitions</h3>
         <div className="max-h-40 overflow-y-auto mb-2 text-sm pr-1">
          {activeAutomaton.transitions.map((t) => {
            const from = activeAutomaton.states.find(s => s.id === t.fromStateId)?.label || '??';
            const to = activeAutomaton.states.find(s => s.id === t.toStateId)?.label || '??';
            return (
              <div key={t.id} className={itemStyle}>
                <span>{`${from} --(${t.input})--> ${to}`}</span>
                <button onClick={() => deleteTransition(t.id)} className={`${btnStyle} bg-red-400 hover:bg-red-500`} title="Delete Transition">
                  X
                </button>
              </div>
            );
          })}
          {activeAutomaton.transitions.length === 0 && <p className="text-xs text-gray-500">No transitions defined.</p>}
        </div>
        <div className="grid grid-cols-3 gap-2 items-end">
          <div>
            <label htmlFor="fromState" className={labelStyle}>From</label>
            <select id="fromState" value={fromState} onChange={e => setFromState(e.target.value)} className={inputStyle}>
              {activeAutomaton.states.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
           <div>
            <label htmlFor="inputChar" className={labelStyle}>Input</label>
            <select id="inputChar" value={inputChar} onChange={e => setInputChar(e.target.value)} className={inputStyle}>
               {activeAutomaton.alphabet.map(char => <option key={char} value={char}>{char}</option>)}
                {activeAutomaton.alphabet.length === 0 && <option value="" disabled>Define Alphabet</option>}
            </select>
          </div>
          <div>
            <label htmlFor="toState" className={labelStyle}>To</label>
            <select id="toState" value={toState} onChange={e => setToState(e.target.value)} className={inputStyle}>
              {activeAutomaton.states.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="col-span-3">
             <button onClick={handleAddTransition} className={`${btnStyle} w-full mt-1`} disabled={activeAutomaton.states.length === 0 || activeAutomaton.alphabet.length === 0}>Add Transition</button>
          </div>
        </div>
      </div>
    </div>
  );
}
