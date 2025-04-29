import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log(`Start seeding ...`);

  // Create Users
  const user1 = await prisma.user.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: "Alice",
    },
  });
  const user2 = await prisma.user.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2,
      name: "Bob",
    },
  });
  console.log(`Created users: ${user1.name}, ${user2.name}`);

  // Create Facilities
  const facility1 = await prisma.facility.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: "Meeting Room A",
      description: "For small meetings (max 4 people)",
      capacity: 4,
      availableStartTime: "09:00",
      availableEndTime: "18:00",
    },
  });
  const facility2 = await prisma.facility.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2,
      name: "Event Hall",
      description: "Large hall for events",
      capacity: 100,
      // availableStartTime/EndTime が null の場合は終日
    },
  });
  console.log(
    `Created facilities: ${facility1.name}, ${facility2.name}`,
  );

  console.log(`Seeding finished.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
