import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { parseISO } from "date-fns";

const reservationSchema = z.object({
  facilityId: z.number().int().positive(),
  userId: z.number().int().positive(),
  startTime: z.string().datetime(), // ISO 8601 format
  endTime: z.string().datetime(), // ISO 8601 format
});

// GET /api/reservations?facilityId=...&start=...&end=...
// GET /api/reservations?userId=...
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const facilityId = searchParams.get("facilityId");
  const userId = searchParams.get("userId");
  const start = searchParams.get("start"); // Expected ISO string
  const end = searchParams.get("end"); // Expected ISO string

  try {
    let reservations;
    if (facilityId && start && end) {
      // Fetch reservations for a specific facility within a time range (for calendar view)
      const facilityIdNum = parseInt(facilityId, 10);
      if (isNaN(facilityIdNum)) {
        return NextResponse.json(
          { error: "Invalid facilityId format" },
          { status: 400 },
        );
      }
      try {
        const startDate = parseISO(start);
        const endDate = parseISO(end);

        reservations = await prisma.reservation.findMany({
          where: {
            facilityId: facilityIdNum,
            // Check for reservations that overlap with the given time range [start, end]
            // Overlap conditions:
            // 1. Reservation starts within the range
            // 2. Reservation ends within the range
            // 3. Reservation starts before the range and ends after the range
            OR: [
              {
                startTime: {
                  gte: startDate,
                  lt: endDate, // Use lt for end-exclusive range common in calendars
                },
              },
              {
                endTime: {
                  gt: startDate, // Use gt for start-exclusive range
                  lte: endDate,
                },
              },
              {
                startTime: {
                  lte: startDate,
                },
                endTime: {
                  gte: endDate,
                },
              },
            ],
          },
          include: {
            user: { select: { id: true, name: true } }, // Include user info
            facility: { select: { id: true, name: true } }, // Include facility info
          },
        });
      } catch (e) {
        return NextResponse.json(
          { error: "Invalid date format for start or end" },
          { status: 400 },
        );
      }
    } else if (userId) {
      // Fetch reservations for a specific user (for 'My Reservations' view)
      const userIdNum = parseInt(userId, 10);
      if (isNaN(userIdNum)) {
        return NextResponse.json(
          { error: "Invalid userId format" },
          { status: 400 },
        );
      }
      reservations = await prisma.reservation.findMany({
        where: {
          userId: userIdNum,
        },
        include: {
          facility: { select: { id: true, name: true } }, // Include facility info
        },
        orderBy: {
          startTime: "asc",
        },
      });
    } else {
      // Basic fetch all (optional, might need pagination in real app)
      reservations = await prisma.reservation.findMany({
        include: {
          user: { select: { id: true, name: true } },
          facility: { select: { id: true, name: true } },
        },
      });
    }
    return NextResponse.json(reservations);
  } catch (error) {
    console.error("Error fetching reservations:", error);
    return NextResponse.json(
      { error: "Failed to fetch reservations" },
      { status: 500 },
    );
  }
}

// POST /api/reservations
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = reservationSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validation.error.errors },
        { status: 400 },
      );
    }

    const { facilityId, userId, startTime, endTime } = validation.data;
    const startDateTime = parseISO(startTime);
    const endDateTime = parseISO(endTime);

    // --- Validation Logic ---
    // 1. End time must be after start time
    if (endDateTime <= startDateTime) {
      return NextResponse.json(
        { error: "End time must be after start time" },
        { status: 400 },
      );
    }

    // 2. Check against facility's available time (if defined)
    const facility = await prisma.facility.findUnique({
      where: { id: facilityId },
    });
    if (!facility) {
      return NextResponse.json(
        { error: "Facility not found" },
        { status: 404 },
      );
    }
    // TODO: Implement available time check based on facility.availableStartTime/EndTime and startDateTime/endDateTime time part

    // 3. Check for overlapping reservations for the same facility
    const overlappingReservations = await prisma.reservation.findMany({
      where: {
        facilityId: facilityId,
        // Find existing reservations where:
        // (existing.startTime < new.endTime) AND (existing.endTime > new.startTime)
        startTime: {
          lt: endDateTime,
        },
        endTime: {
          gt: startDateTime,
        },
      },
    });

    if (overlappingReservations.length > 0) {
      return NextResponse.json(
        { error: "Time slot already booked" },
        { status: 409 }, // Conflict
      );
    }
    // --- End Validation Logic ---

    // Create reservation if validation passes
    const newReservation = await prisma.reservation.create({
      data: {
        facilityId,
        userId,
        startTime: startDateTime,
        endTime: endDateTime,
      },
    });

    return NextResponse.json(newReservation, { status: 201 });
  } catch (error) {
    // Handle potential ZodError or other errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 },
      );
    }
    console.error("Error creating reservation:", error);
    return NextResponse.json(
      { error: "Failed to create reservation" },
      { status: 500 },
    );
  }
}
