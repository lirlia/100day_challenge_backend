'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { PrismaClient } from '@/app/generated/prisma';
import Link from 'next/link';
import RepoCreateForm from '@/components/RepoCreateForm';

type User = {
  id: number;
  name: string;
  createdAt: string;
};

const prisma = new PrismaClient();

async function getRepositories() {
  try {
    const repositories = await prisma.repository.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
    return repositories;
  } finally {
    await prisma.$disconnect();
  }
}

export default async function HomePage() {
  const repositories = await getRepositories();

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Repositories</h1>

      <RepoCreateForm />

      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-2">Existing Repositories</h2>
        {repositories.length === 0 ? (
          <p className="text-gray-500">No repositories yet.</p>
        ) : (
          <ul className="space-y-2">
            {repositories.map((repo) => (
              <li key={repo.id} className="border p-3 rounded hover:bg-gray-50">
                <Link href={`/repos/${repo.name}`}>
                  <span className="font-medium text-blue-600 hover:underline">{repo.name}</span>
                </Link>
                <p className="text-sm text-gray-600 mt-1">Created: {repo.createdAt.toLocaleDateString()}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
