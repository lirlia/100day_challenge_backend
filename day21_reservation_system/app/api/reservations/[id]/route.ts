import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface Params {
  params: {
    id: string;
  };
}

export async function DELETE(
  request: NextRequest,
  context: { params: { id: string } },
) {
  const params = await context.params;
  const id = parseInt(params.id, 10);

  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  try {
    // Check if reservation exists before deleting
    const existingReservation = await prisma.reservation.findUnique({
      where: { id },
    });
    if (!existingReservation) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 },
      );
    }

    // Optional: Add authorization check here to ensure the user deleting
    // the reservation is the one who made it or an admin.
    // For now, allow any deletion.

    await prisma.reservation.delete({
      where: { id },
    });
    return new NextResponse(null, { status: 204 }); // No Content
  } catch (error) {
    console.error(`Error deleting reservation ${id}:`, error);
    return NextResponse.json(
      { error: "Failed to delete reservation" },
      { status: 500 },
    );
  }
}
