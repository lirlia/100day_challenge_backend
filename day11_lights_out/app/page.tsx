// 'use client'; // page.tsx は Server Component のままで良い

// import { useState, useEffect } from 'react'; // 不要
// import Image from 'next/image'; // 不要
import GameClient from './_components/GameClient';

// type User = { ... }; // 不要

export default function Home() {
  // const [users, setUsers] = useState<User[]>([]); // 不要
  // const [name, setName] = useState(''); // 不要
  // const [loading, setLoading] = useState(true); // 不要
  // const [error, setError] = useState(''); // 不要

  // fetchUsers, createUser, useEffect なども不要

  return (
    <main className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4 text-center">Lights Out Game</h1>
      <GameClient />
    </main>
  );
}
