'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { OriginContent } from '@/app/_lib/types';
import NeumorphicCard from '@/components/ui/NeumorphicCard';
import NeumorphicButton from '@/components/ui/NeumorphicButton';
import NeumorphicInput, { NeumorphicTextarea, NeumorphicSelect } from '@/components/ui/NeumorphicFormControls';

interface OriginContentsManagerProps {
  onContentsChanged: () => void; // Callback to notify parent of changes
}

export default function OriginContentsManager({ onContentsChanged }: OriginContentsManagerProps) {
  const [contents, setContents] = useState<OriginContent[]>([]);
  const [newContentId, setNewContentId] = useState('');
  const [newData, setNewData] = useState('');
  const [newContentType, setNewContentType] = useState('text/html');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/origin-contents');
      if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
      const data = await response.json();
      setContents(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContents();
  }, [fetchContents]);

  const handleAddContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContentId.trim() || !newData.trim() || !newContentType.trim()) {
      setError("All fields are required.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/origin-contents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_id: newContentId, data: newData, content_type: newContentType }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.details || `Failed to add content: ${response.statusText}`);
      }
      setNewContentId('');
      setNewData('');
      await fetchContents();
      onContentsChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteContent = async (contentId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/origin-contents?content_id=${encodeURIComponent(contentId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.details || `Failed to delete content: ${response.statusText}`);
      }
      await fetchContents();
      onContentsChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <NeumorphicCard className="space-y-6">
      <h2 className="text-2xl font-semibold text-neumorphism-accent">Origin Contents Management</h2>

      <form onSubmit={handleAddContent} className="space-y-4">
        <div>
          <label htmlFor="contentId" className="block text-sm font-medium text-neumorphism-soft-text mb-1">Content ID</label>
          <NeumorphicInput
            id="contentId"
            type="text"
            value={newContentId}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewContentId(e.target.value)}
            placeholder="e.g., /home, /about/team.html, image.jpg"
            required
          />
        </div>
        <div>
          <label htmlFor="contentType" className="block text-sm font-medium text-neumorphism-soft-text mb-1">Content Type</label>
          <NeumorphicSelect
            id="contentType"
            value={newContentType}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewContentType(e.target.value)}
            required
          >
            <option value="text/html">text/html</option>
            <option value="application/json">application/json</option>
            <option value="image/jpeg">image/jpeg (Picsum URL)</option>
            <option value="image/png">image/png (Picsum URL)</option>
            <option value="text/plain">text/plain</option>
          </NeumorphicSelect>
        </div>
        <div>
          <label htmlFor="data" className="block text-sm font-medium text-neumorphism-soft-text mb-1">
            Data / URL (for images, use full Picsum URL e.g. https://picsum.photos/200)
          </label>
          <NeumorphicTextarea
            id="data"
            value={newData}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewData(e.target.value)}
            rows={4}
            placeholder="Enter HTML content, JSON data, or a Picsum URL..."
            required
          />
        </div>
        <NeumorphicButton type="submit" variant="accent" disabled={isLoading}>
          {isLoading ? 'Adding...' : 'Add Content'}
        </NeumorphicButton>
      </form>

      {error && <p className="text-red-500 text-sm">Error: {error}</p>}

      <div className="mt-6">
        <h3 className="text-xl font-semibold mb-3">Registered Contents</h3>
        {isLoading && contents.length === 0 && <p>Loading contents...</p>}
        {!isLoading && contents.length === 0 && <p className="text-neumorphism-soft-text">No origin contents registered yet.</p>}
        {contents.length > 0 && (
          <ul className="space-y-3">
            {contents.map((content) => (
              <li key={content.id} className="p-3 bg-neumorphism-bg shadow-neumorphism-concave dark:bg-neumorphism-bg-dark dark:shadow-neumorphism-concave-dark rounded-neumorphism flex justify-between items-center">
                <div>
                  <p className="font-medium">ID: {content.content_id}</p>
                  <p className="text-xs text-neumorphism-soft-text">Type: {content.content_type}</p>
                  <p className="text-xs text-neumorphism-soft-text truncate max-w-xs md:max-w-md lg:max-w-lg">Data: {content.data.length > 100 ? `${content.data.substring(0,100)}...` : content.data}</p>
                </div>
                <NeumorphicButton
                  variant="danger"
                  size="sm"
                  onClick={() => handleDeleteContent(content.content_id)}
                  disabled={isLoading}
                >
                  Delete
                </NeumorphicButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </NeumorphicCard>
  );
}
