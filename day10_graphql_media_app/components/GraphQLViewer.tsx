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

      {requestQuery && (
        <div className="mb-6">
          <h4 className="text-md font-medium mb-2 text-blue-300">Request Query:</h4>
          <pre className="bg-gray-700 p-3 rounded overflow-x-auto whitespace-pre-wrap break-words">
            {requestQuery}
          </pre>
        </div>
      )}

      {responseJson && (
        <div>
          <h4 className="text-md font-medium mb-2 text-green-300">Response JSON:</h4>
          <pre className="bg-gray-700 p-3 rounded overflow-x-auto whitespace-pre-wrap break-words">
            {JSON.stringify(responseJson, null, 2)}
          </pre>
        </div>
      )}

      {error && (
        <div>
          <h4 className="text-md font-medium mb-2 text-red-400">Error:</h4>
          <pre className="bg-gray-700 p-3 rounded overflow-x-auto whitespace-pre-wrap break-words text-red-300">
            {error}
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
