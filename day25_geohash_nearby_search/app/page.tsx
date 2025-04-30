import LocationForm from "@/components/LocationForm";
import NearbySearch from "@/components/NearbySearch";

export default function Home() {
  return (
    <main className="container mx-auto p-4 md:p-8">
      <h1 className="text-3xl font-bold mb-8 text-center text-gray-800">
        Day 25 - Geohash Nearby Search API
      </h1>

      <LocationForm />

      <NearbySearch />

    </main>
  );
}
