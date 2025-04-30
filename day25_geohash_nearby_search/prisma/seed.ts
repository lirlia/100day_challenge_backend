import { PrismaClient } from '@prisma/client';
import ngeohash from 'ngeohash';

const prisma = new PrismaClient();

const GEOHASH_PRECISION = 9;
const NUM_LOCATIONS = 100;

// Sample Japanese place names (cities, landmarks)
const placeNames = [
  'Tokyo Tower', 'Kinkaku-ji Temple', 'Fushimi Inari Shrine', 'Mount Fuji', 'Osaka Castle',
  'Dotonbori', 'Hiroshima Peace Memorial Park', 'Itsukushima Shrine', 'Himeji Castle',
  'Senso-ji Temple', 'Shibuya Crossing', 'Tsukiji Outer Market', 'Gion District', 'Arashiyama Bamboo Grove',
  'Kenrokuen Garden', 'Nara Park', 'Todai-ji Temple', 'Hakone Open-Air Museum', 'Sapporo Snow Festival Site',
  'Otaru Canal', 'Matsumoto Castle', 'Nagoya Castle', 'Kanazawa Station', 'Kumamoto Castle',
  'Beppu Hells', 'Yakushima Island', 'Okinawa Churaumi Aquarium', 'Shuri Castle Site', 'Nikko Toshogu Shrine',
  'Kamakura Great Buddha', 'Enoshima Island', 'Yokohama Chinatown', 'Minato Mirai 21', 'Kobe Harborland',
  'Akihabara Electric Town', 'Ueno Park', 'Imperial Palace East Garden', 'Meiji Jingu Shrine', 'Shinjuku Gyoen National Garden',
  'Hakodate Morning Market', 'Goryokaku Park', 'Jigokudani Monkey Park', 'Takayama Old Town', 'Shirakawa-go Village',
  'Ise Grand Shrine', 'Naoshima Art Island', 'Adachi Museum of Art', 'Dogo Onsen', 'Aso Caldera',
  // Add more names if needed to reach 100 unique names, or allow reuse
  'Fukuoka Tower', 'Nagasaki Peace Park', 'Glover Garden', 'Kagoshima Sakurajima Ferry Terminal', 'Sendai Station',
  'Zuihoden Mausoleum', 'Miyajima Ropeway', 'Okayama Korakuen Garden', 'Kurashiki Bikan Historical Quarter', 'Tottori Sand Dunes',
  'Shimane Art Museum', 'Izumo Taisha Grand Shrine', 'Yamaguchi Rurikoji Temple', 'Akiyoshido Cave', 'Wakayama Castle',
  'Koyasan Okunoin Cemetery', 'Biwako Lake', 'Hikone Castle', 'Gifu Castle', 'Toyama Glass Art Museum',
  'Niigata Bandai Bridge', 'Fukushima Tsuruga Castle', 'Akita Kanto Festival Site', 'Aomori Nebuta Museum WA RASSE', 'Iwate Hiraizumi Chuson-ji Temple',
  'Yamagata Yamadera Temple', 'Morioka Station', 'Chiba Port Tower', 'Saitama Super Arena', 'Gunma Kusatsu Onsen',
  'Tochigi Kegon Falls', 'Ibaraki Kairakuen Garden', 'Yamanashi Fuji-Q Highland', 'Shizuoka Miho no Matsubara', 'Nagano Zenko-ji Temple',
  'Aichi Toyota Commemorative Museum', 'Mie Nabana no Sato', 'Kyoto Imperial Palace', 'Hyogo Awaji Yumebutai', 'Nara Kasuga Taisha Shrine',
  'Osaka Universal Studios Japan', 'Ehime Matsuyama Castle', 'Kochi Katsurahama Beach', 'Tokushima Awa Odori Kaikan', 'Kagawa Ritsurin Garden',
  'Saga Yoshinogari Historical Park', 'Oita Yufuin Floral Village', 'Miyazaki Takachiho Gorge',
];

async function main() {
  console.log(`Start seeding ${NUM_LOCATIONS} locations ...`);

  const locationData = [];

  for (let i = 1; i <= NUM_LOCATIONS; i++) {
    const latitude = Math.random() * (45.5 - 24.0) + 24.0;
    const longitude = Math.random() * (145.8 - 122.9) + 122.9;
    // Pick a name, reuse if list is shorter than NUM_LOCATIONS
    const name = placeNames[(i - 1) % placeNames.length];
    const geohash = ngeohash.encode(latitude, longitude, GEOHASH_PRECISION);

    locationData.push({
      name,
      latitude,
      longitude,
      geohash,
    });
  }

  // Delete existing locations first to avoid duplicates if run multiple times
  // Also delete User data from template if it exists
  try {
    await prisma.location.deleteMany({});
    console.log('Deleted existing locations.');
    // Attempt to delete User, ignore if table doesn't exist
    await prisma.user.deleteMany({}).catch(() => console.log('User table not found, skipping deletion.'));
  } catch (e) {
     console.error('Error deleting existing data:', e);
     // Continue seeding even if deletion fails?
  }

  console.log(`Creating ${locationData.length} new locations...`);
  const result = await prisma.location.createMany({
    data: locationData,
  });

  console.log(`Seeding finished. Created ${result.count} locations.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
