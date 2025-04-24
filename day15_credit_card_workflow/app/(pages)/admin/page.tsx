'use client';

import { useState, useEffect, FormEvent } from 'react';
// Correct import path for Prisma types
import { CreditCardApplication, ApplicationHistory, ApplicationStatus } from '../../generated/prisma';
import { getAllowedActions, ActionName } from '@/app/_lib/stateMachine';

// --- 日本語表示マッピング ---
const statusDisplayNames: Record<ApplicationStatus, string> = {
  [ApplicationStatus.APPLIED]: '申込受付',
  [ApplicationStatus.SCREENING]: '初期審査中',
  [ApplicationStatus.IDENTITY_VERIFICATION_PENDING]: '本人確認待ち',
  [ApplicationStatus.CREDIT_CHECK]: '信用情報照会中',
  [ApplicationStatus.MANUAL_REVIEW]: '手動審査中',
  [ApplicationStatus.APPROVED]: '承認済み',
  [ApplicationStatus.CARD_ISSUING]: 'カード発行準備中',
  [ApplicationStatus.CARD_SHIPPED]: 'カード発送済み',
  [ApplicationStatus.ACTIVE]: '有効化済み',
  [ApplicationStatus.REJECTED]: '否決済み',
  [ApplicationStatus.CANCELLED]: '申込キャンセル',
};

const actionDisplayNames: Record<ActionName, string> = {
  SubmitApplication: '申請提出',
  StartScreening: '初期審査開始',
  RequestIdentityVerification: '本人確認要求',
  CompleteIdentityVerification: '本人確認完了',
  FailIdentityVerification: '本人確認失敗',
  StartCreditCheck: '信用情報照会開始',
  PassCreditCheck: '信用情報照会OK',
  RequireManualReview: '手動審査へ移行',
  FailCreditCheck: '信用情報照会NG',
  ApproveManually: '手動承認',
  RejectManually: '手動否決',
  StartCardIssuing: 'カード発行開始',
  CompleteCardIssuing: '発行準備完了',
  ActivateCard: 'カード有効化',
  CancelApplication: '申込キャンセル',
  RejectScreening: '初期審査否決',
  BackToScreening: '初期審査へ差戻し',
};
// ---------------------------

type ApplicationWithHistory = CreditCardApplication & {
  histories: ApplicationHistory[];
};

export default function AdminPage() {
  // State declarations
  const [applications, setApplications] = useState<CreditCardApplication[]>([]);
  const [selectedApplication, setSelectedApplication] = useState<ApplicationWithHistory | null>(null);
  const [newAppName, setNewAppName] = useState('');
  const [newAppEmail, setNewAppEmail] = useState('');
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allowedActions, setAllowedActions] = useState<ActionName[]>([]);
  const [actionNotes, setActionNotes] = useState(''); // For adding notes during transition

  // Fetch application list on initial load and after updates
  useEffect(() => {
    fetchApplications();
  }, []);

  // Fetch details and allowed actions when an application is selected
  useEffect(() => {
    if (selectedApplication?.id) {
      fetchApplicationDetail(selectedApplication.id);
      setAllowedActions(getAllowedActions(selectedApplication.status));
    } else {
      setAllowedActions([]);
    }
  }, [selectedApplication?.id, selectedApplication?.status]); // Re-run if ID or status changes

  // --- API Fetching Functions ---
  const fetchApplications = async () => {
    setIsLoadingList(true);
    setError(null);
    try {
      const res = await fetch('/api/applications');
      if (!res.ok) throw new Error('Failed to fetch applications');
      const data: CreditCardApplication[] = await res.json();
      setApplications(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoadingList(false);
    }
  };

  const fetchApplicationDetail = async (id: string) => {
    setIsLoadingDetail(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${id}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error(`Application with ID ${id} not found.`);
        throw new Error('Failed to fetch application details');
      }
      const data: ApplicationWithHistory = await res.json();
      setSelectedApplication(data);
      // Update allowed actions based on the fetched status
      setAllowedActions(getAllowedActions(data.status));
    } catch (err: any) {
      setError(err.message);
      setSelectedApplication(null); // Clear selection on error
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // --- Event Handlers ---
  const handleCreateApplication = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newAppName || !newAppEmail) {
      setError("Name and Email are required.");
      return;
    }
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicantName: newAppName, applicantEmail: newAppEmail }),
      });
      if (!res.ok) {
        const errorData = await res.text();
        throw new Error(`Failed to create application: ${res.status} ${errorData}`);
      }
      setNewAppName('');
      setNewAppEmail('');
      fetchApplications(); // Refresh list
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSelectApplication = (app: CreditCardApplication) => {
    // If clicking the same one, fetch details anyway to ensure data freshness
    fetchApplicationDetail(app.id);
    // Optimistically set basic info while details load
    setSelectedApplication({ ...app, histories: selectedApplication?.id === app.id ? selectedApplication.histories : [] });
  };

  const handlePerformAction = async (action: ActionName) => {
    if (!selectedApplication) return;
    setError(null);
    setIsLoadingDetail(true); // Indicate loading during action
    try {
      const res = await fetch(`/api/applications/${selectedApplication.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, notes: actionNotes }),
        }
      );
      if (!res.ok) {
        const errorData = await res.text();
        throw new Error(`Action '${action}' failed: ${res.status} ${errorData}`);
      }
      // Success: Fetch updated details to reflect the new state
      await fetchApplicationDetail(selectedApplication.id);
      setActionNotes(''); // Clear notes field
      // Also refresh the main list in case status changed
      await fetchApplications();
    } catch (err: any) {
      setError(err.message);
    } finally {
      // Keep loading state until fetchApplicationDetail finishes in success/error cases
    }
  };

  // --- Rendering --- //
  return (
    <div className="flex flex-grow bg-gray-100">
      {/* Left Pane */}
      <div className="w-1/2 p-4 border-r border-gray-300 overflow-y-auto">
        <h1 className="text-2xl font-bold mb-4">Day15 - Credit Card Applications</h1>

        {/* Create New Application Form */}
        <div className="mb-6 p-4 bg-white rounded shadow">
          <form onSubmit={handleCreateApplication} className="space-y-2">
            <div>
              <label htmlFor="appName" className="block text-sm font-medium text-gray-700">Applicant Name:</label>
              <input
                type="text"
                id="appName"
                value={newAppName}
                onChange={(e) => setNewAppName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                required
              />
            </div>
            <div>
              <label htmlFor="appEmail" className="block text-sm font-medium text-gray-700">Applicant Email:</label>
              <input
                type="email"
                id="appEmail"
                value={newAppEmail}
                onChange={(e) => setNewAppEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                required
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Create
            </button>
          </form>
        </div>

        {/* Application List */}
        <div className="mb-6 p-4 bg-white rounded shadow">
          <h2 className="text-xl font-semibold mb-2">Applications</h2>
          {isLoadingList && <p>Loading applications...</p>}
          {error && <p className="text-red-500">Error: {error}</p>}
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Applicant</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {applications.map((app) => (
                <tr key={app.id} className={`${selectedApplication?.id === app.id ? 'bg-blue-50' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate" title={app.id}>{app.id.substring(0, 8)}...</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{app.applicantName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{statusDisplayNames[app.status]}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleSelectApplication(app)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      {selectedApplication?.id === app.id ? 'Selected' : 'View Details'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Selected Application Details & Actions */}
        {selectedApplication && (
          <div className="p-4 bg-white rounded shadow">
            <h2 className="text-xl font-semibold mb-2">Details (ID: {selectedApplication.id.substring(0, 8)}...)</h2>
            {isLoadingDetail && <p>Loading details...</p>}
            <p><strong>Applicant:</strong> {selectedApplication.applicantName} ({selectedApplication.applicantEmail})</p>
            <p><strong>Status:</strong> <span className="font-semibold">{statusDisplayNames[selectedApplication.status]}</span></p>
            <p><strong>Created:</strong> {new Date(selectedApplication.createdAt).toLocaleString()}</p>
            <p><strong>Updated:</strong> {new Date(selectedApplication.updatedAt).toLocaleString()}</p>

            {/* Action Buttons */}
            <div className="mt-4">
              <h3 className="text-lg font-semibold mb-2">Perform Action:</h3>
              {allowedActions.length > 0 ? (
                <div className="space-y-2">
                  <textarea
                    placeholder="Add optional notes for this transition..."
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    rows={2}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    {allowedActions.map(action => (
                      <button
                        key={action}
                        onClick={() => handlePerformAction(action)}
                        className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        disabled={isLoadingDetail}
                      >
                        {actionDisplayNames[action]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-gray-500">No actions available for the current status.</p>
              )}
            </div>

            {/* History */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2">History</h3>
              <ul className="list-disc pl-5 space-y-1 text-sm text-gray-600">
                {selectedApplication.histories?.sort((a: ApplicationHistory, b: ApplicationHistory) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) // Sort desc for display, specify types
                  .map((history: ApplicationHistory) => ( // Specify type for map parameter
                    <li key={history.id}>
                      {new Date(history.timestamp).toLocaleString()}:
                      Status changed from <strong>{history.fromStatus ? statusDisplayNames[history.fromStatus] : '初期状態'}</strong> to <strong>{statusDisplayNames[history.toStatus]}</strong>
                      {history.notes && <span className="italic"> (Notes: {history.notes})</span>}
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Right Pane - Workflow Visualization */}
      <div className="w-1/2 p-4 overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Workflow Status</h2>
        <WorkflowVisualizer currentStatus={selectedApplication?.status} />
      </div>
    </div>
  );
}

// --- Workflow Visualization Component (Simple) ---
interface WorkflowVisualizerProps {
  currentStatus: ApplicationStatus | undefined;
}

const WorkflowVisualizer: React.FC<WorkflowVisualizerProps> = ({ currentStatus }) => {
  // Define the states and their rough layout order/grouping
  const statusOrder: ApplicationStatus[] = [
    ApplicationStatus.APPLIED,
    ApplicationStatus.SCREENING,
    ApplicationStatus.IDENTITY_VERIFICATION_PENDING,
    ApplicationStatus.CREDIT_CHECK,
    ApplicationStatus.MANUAL_REVIEW,
    ApplicationStatus.APPROVED,
    ApplicationStatus.CARD_ISSUING,
    ApplicationStatus.CARD_SHIPPED,
    ApplicationStatus.ACTIVE,
    // Off-path states
    ApplicationStatus.REJECTED,
    ApplicationStatus.CANCELLED,
  ];

  // Simple visualization: Highlight the current status in a list/grid
  // More complex visualization would involve drawing boxes and arrows with relative positioning or SVG/Canvas
  return (
    <div className="p-4 bg-white rounded shadow">
      <p className="mb-2 text-sm text-gray-600">Current: <strong className="text-blue-700">{currentStatus ? statusDisplayNames[currentStatus] : 'N/A'}</strong></p>
      <div className="space-y-2">
        {statusOrder.map(status => (
          <div
            key={status}
            className={`p-2 border rounded ${currentStatus === status
              ? 'bg-blue-500 text-white border-blue-600 ring-2 ring-blue-300'
              : 'bg-gray-100 border-gray-300 text-gray-700'
              }`}
          >
            {statusDisplayNames[status]}
          </div>
        ))}
        {/* Add simple arrows/lines using CSS borders or pseudo-elements if needed for basic flow indication */}
      </div>
      <p className="mt-4 text-xs text-gray-500">Note: This is a simplified visualization showing the current status highlighted among all possible states.</p>
    </div>
  );
};
