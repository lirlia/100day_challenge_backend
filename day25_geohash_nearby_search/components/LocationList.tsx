import prisma from '@/lib/db'; // デフォルトインポートに変更
import type { Location } from '@prisma/client'; // インポート元を修正

async function getLocations(): Promise<Location[]> {
  // APIを介さず直接DBアクセス (Server Component の利点)
  try {
    const locations = await prisma.location.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 100, // 大量データの場合に備えて制限
    });
    return locations;
  } catch (error) {
    console.error("Failed to fetch locations:", error);
    return []; // エラー時は空配列を返す
  }
}

export default async function LocationList() {
  const locations = await getLocations();

  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold mb-4">Registered Locations</h2>
      {locations.length === 0 ? (
        <p className="text-gray-500">No locations registered yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border rounded-lg shadow-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Latitude</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Longitude</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Geohash (9)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {locations.map((location) => (
                <tr key={location.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{location.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{location.latitude}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{location.longitude}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">{location.geohash}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(location.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
