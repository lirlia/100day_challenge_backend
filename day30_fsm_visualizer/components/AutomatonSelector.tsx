'use client';

import React from 'react';
import { useAutomatonStore, AutomatonDefinition } from '../lib/store';
import { nanoid } from 'nanoid'; // 簡単なID生成のため

// スタイル定義 (DefinitionFormから流用・調整)
const btnStyle = "px-3 py-1 bg-white border-2 border-black text-black font-bold hover:bg-gray-200 active:translate-y-px active:shadow-none shadow-[3px_3px_0px_rgba(0,0,0,1)] transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed";
const inputStyle = "px-2 py-1 bg-white border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm w-full";
const sectionStyle = "mb-4 p-3 border-2 border-black bg-gray-100 shadow-[4px_4px_0px_rgba(0,0,0,1)]";

// 新規オートマトンのテンプレート
const createNewAutomaton = (): AutomatonDefinition => ({
    id: nanoid(10), // nanoid でユニークID生成
    name: 'New Automaton',
    alphabet: ['a', 'b'],
    states: [],
    transitions: [],
    startStateId: null,
});

export default function AutomatonSelector() {
    const {
        automata,
        activeAutomatonId,
        setActiveAutomaton,
        saveAutomaton, // save を使う（persistは裏で動くが、明示的な追加操作として）
        deleteAutomaton,
    } = useAutomatonStore();

    const handleNewAutomaton = () => {
        const newAutomaton = createNewAutomaton();
        saveAutomaton(newAutomaton); // ストアに追加＆アクティブ化
        // setActiveAutomaton(newAutomaton.id); // saveAutomaton内でアクティブ化される想定
    };

    const handleDeleteAutomaton = () => {
        if (activeAutomatonId && window.confirm(`Are you sure you want to delete '${automata[activeAutomatonId]?.name}'?`)) {
            deleteAutomaton(activeAutomatonId);
        }
    };

    const automatonList = Object.values(automata);

    return (
        <div className={sectionStyle}>
            <div className="flex items-center gap-2 mb-2">
                <select
                    value={activeAutomatonId || ''}
                    onChange={(e) => setActiveAutomaton(e.target.value || null)}
                    className={`${inputStyle} flex-grow`}
                    aria-label="Select Automaton"
                >
                    <option value="" disabled={!activeAutomatonId}>-- Select Automaton --</option>
                    {automatonList.map((a) => (
                        <option key={a.id} value={a.id}>
                            {a.name}
                        </option>
                    ))}
                    {automatonList.length === 0 && <option value="" disabled>No saved automata</option>}
                </select>
            </div>
            <div className="flex items-center gap-2 justify-between">
                 <button onClick={handleNewAutomaton} className={btnStyle}>
                    New
                </button>
                 {/* 保存は自動で行われる想定のため、明示的なボタンは一旦省略 */}
                <button
                    onClick={handleDeleteAutomaton}
                    className={`${btnStyle} bg-red-400 hover:bg-red-500`}
                    disabled={!activeAutomatonId || automatonList.length <= 1} // 最後の1つは消せないようにする
                    title={automatonList.length <= 1 ? "Cannot delete the last automaton" : "Delete Selected Automaton"}
                >
                    Delete
                </button>
            </div>
        </div>
    );
}
