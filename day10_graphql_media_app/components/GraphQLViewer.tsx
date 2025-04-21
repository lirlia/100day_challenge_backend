"use client";

import React from 'react';

interface GraphQLViewerProps {
  requestQuery?: string | null;
  responseJson?: any | null;
  error?: string | null;
}

const GraphQLViewer: React.FC<GraphQLViewerProps> = ({ requestQuery, responseJson, error }) => {
  return (
    <div className="bg-gray-800 text-white p-4 rounded-lg shadow-md h-full overflow-auto text-sm font-mono">
      <h3 className="text-lg font-semibold border-b border-gray-600 pb-2 mb-4 text-gray-300">GraphQL Communication</h3>

      <div>
        <h3 className="text-md font-medium mb-2 text-blue-300">Request Query:</h3>
        {requestQuery ? (
          <pre className="bg-gray-900 p-3 rounded overflow-x-auto whitespace-pre-wrap break-words">
            <code className="text-xs">{requestQuery}</code>
          </pre>
        ) : (
          <p className="text-gray-500 italic text-sm">No request sent yet.</p>
        )}
      </div>

      <div>
        <h3 className="text-md font-medium mb-2 text-green-300">Response JSON:</h3>
        {responseJson ? (
          <pre className="bg-gray-900 p-3 rounded overflow-x-auto whitespace-pre-wrap break-words">
            <code className="text-xs">{JSON.stringify(responseJson, null, 2)}</code>
          </pre>
        ) : (
          <p className="text-gray-500 italic text-sm">No response received yet.</p>
        )}
      </div>

      {error && (
        <div>
          <h3 className="text-md font-medium mb-2 text-red-400">Error:</h3>
          <pre className="bg-red-900 bg-opacity-30 text-red-300 p-3 rounded overflow-x-auto whitespace-pre-wrap break-words">
            <code className="text-sm">{error}</code>
          </pre>
        </div>
      )}

      {!requestQuery && !responseJson && !error && (
        <p className="text-gray-400">No GraphQL activity yet.</p>
      )}
    </div>
  );
};

export default GraphQLViewer;
