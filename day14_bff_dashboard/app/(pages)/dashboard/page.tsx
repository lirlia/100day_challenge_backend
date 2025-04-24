'use client'; // This component needs state and interaction

import { useState, useEffect } from 'react';

// Define the structure of the dashboard data based on the BFF API response
interface DashboardData {
  profile: {
    id: number;
    name: string;
    email: string;
    bio?: string;
  } | null;
  activities: {
    id: number;
    action: string;
    timestamp: string;
  }[] | null;
  notifications: {
    id: number;
    title: string;
    content: string;
    publishedAt: string;
  }[] | null;
  recommendations: {
    id: number;
    itemName: string;
    imageUrl: string;
    description?: string;
  }[] | null;
}

export default function DashboardPage() {
  const [selectedUserId, setSelectedUserId] = useState<number>(1); // Default to user 1
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/bff/dashboard?userId=${selectedUserId}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: DashboardData = await response.json();
        setDashboardData(data);
      } catch (e: any) {
        console.error("Failed to fetch dashboard data:", e);
        setError(e.message || 'Failed to load data');
        setDashboardData(null); // Clear data on error
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [selectedUserId]); // Refetch when selectedUserId changes

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>

      {/* User Selector */}
      <div className="mb-4">
        <span className="mr-2">Select User:</span>
        <button
          onClick={() => setSelectedUserId(1)}
          className={`px-3 py-1 rounded mr-2 ${selectedUserId === 1 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
        >
          User 1
        </button>
        <button
          onClick={() => setSelectedUserId(2)}
          className={`px-3 py-1 rounded ${selectedUserId === 2 ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
        >
          User 2
        </button>
      </div>

      {/* Data Display */}
      {loading && <p>Loading dashboard...</p>}
      {error && <p className="text-red-500">Error: {error}</p>}
      {dashboardData && !loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Profile Section */}
          <section className="bg-white p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-2">Profile</h2>
            {dashboardData.profile ? (
              <div>
                <p><strong>ID:</strong> {dashboardData.profile.id}</p>
                <p><strong>Name:</strong> {dashboardData.profile.name}</p>
                <p><strong>Email:</strong> {dashboardData.profile.email}</p>
                <p><strong>Bio:</strong> {dashboardData.profile.bio || 'N/A'}</p>
              </div>
            ) : (
              <p>Profile data not available.</p>
            )}
          </section>

          {/* Activities Section */}
          <section className="bg-white p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-2">Recent Activities</h2>
            {dashboardData.activities && dashboardData.activities.length > 0 ? (
              <ul className="list-disc pl-5">
                {dashboardData.activities.map(activity => (
                  <li key={activity.id}>{activity.action} ({new Date(activity.timestamp).toLocaleString()})</li>
                ))}
              </ul>
            ) : (
              <p>No recent activities.</p>
            )}
          </section>

          {/* Notifications Section */}
          <section className="bg-white p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-2">Notifications</h2>
            {dashboardData.notifications && dashboardData.notifications.length > 0 ? (
               <ul className="space-y-2">
                 {dashboardData.notifications.map(notification => (
                   <li key={notification.id} className="border-b pb-1">
                     <p className="font-medium">{notification.title}</p>
                     <p className="text-sm text-gray-600">{notification.content}</p>
                   </li>
                 ))}
               </ul>
            ) : (
              <p>No notifications.</p>
            )}
          </section>

          {/* Recommendations Section */}
          <section className="bg-white p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-2">Recommendations</h2>
            {dashboardData.recommendations && dashboardData.recommendations.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {dashboardData.recommendations.map(rec => (
                  <div key={rec.id} className="border rounded p-2 text-center">
                    <img src={rec.imageUrl} alt={rec.itemName} className="w-full h-24 object-cover mb-1 rounded"/>
                    <p className="font-medium">{rec.itemName}</p>
                    <p className="text-sm text-gray-600">{rec.description || ''}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p>No recommendations available.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
