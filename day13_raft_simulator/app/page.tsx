'use client';

import React from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { RaftProvider } from '@/context/RaftContext';
import Board from '@/components/Board';
import ControlPanel from '@/components/ControlPanel';
import EventLog from '@/components/EventLog';

export default function Home() {
  return (
    <RaftProvider>
      <DndProvider backend={HTML5Backend}>
        <main className="flex flex-col md:flex-row min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 space-y-4 md:space-y-0 md:space-x-4">
          <div className="w-full md:w-1/2 flex flex-col space-y-4">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
              <ControlPanel />
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow flex-1 flex flex-col">
              <EventLog />
            </div>
          </div>
          <div className="w-full md:w-1/2 md:h-auto bg-white dark:bg-gray-800 p-4 rounded-lg shadow overflow-hidden flex">
            <Board />
          </div>
        </main>
      </DndProvider>
    </RaftProvider>
  );
}
