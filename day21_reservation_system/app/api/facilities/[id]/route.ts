import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface Params {
  params: {
    id: string;
  };
}

export async function GET(
  request: NextRequest,
  context: { params: { id: string } },
) {
  const params = await context.params;
  const id = parseInt(params.id, 10);

  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const facility = await prisma.facility.findUnique({
      where: { id },
    });
    if (!facility) {
      return NextResponse.json({ error: "Facility not found" }, { status: 404 });
    }
    return NextResponse.json(facility);
  } catch (error) {
    console.error(`Error fetching facility ${id}:`, error);
    return NextResponse.json(
      { error: "Failed to fetch facility" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: { id: string } },
) {
  const params = await context.params;
  const id = parseInt(params.id, 10);

  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { name, description, capacity, availableStartTime, availableEndTime } =
      body;

    // Check if facility exists before updating
    const existingFacility = await prisma.facility.findUnique({
      where: { id },
    });
    if (!existingFacility) {
      return NextResponse.json({ error: "Facility not found" }, { status: 404 });
    }

    const updatedFacility = await prisma.facility.update({
      where: { id },
      data: {
        name,
        description,
        capacity,
        availableStartTime,
        availableEndTime,
      },
    });
    return NextResponse.json(updatedFacility);
  } catch (error) {
    console.error(`Error updating facility ${id}:`, error);
    return NextResponse.json(
      { error: "Failed to update facility" },
      { status: 500 },
    );
  }
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
    // Check if facility exists before deleting
    const existingFacility = await prisma.facility.findUnique({
      where: { id },
    });
    if (!existingFacility) {
      return NextResponse.json({ error: "Facility not found" }, { status: 404 });
    }

    await prisma.facility.delete({
      where: { id },
    });
    return new NextResponse(null, { status: 204 }); // No Content
  } catch (error) {
    console.error(`Error deleting facility ${id}:`, error);
    // Check for constraint violation (e.g., reservations exist)
    if (
      error instanceof Error &&
      (error as any).code === "P2003" // Foreign key constraint failed
    ) {
      return NextResponse.json(
        { error: "Cannot delete facility with existing reservations" },
        { status: 409 }, // Conflict
      );
    }
    return NextResponse.json(
      { error: "Failed to delete facility" },
      { status: 500 },
    );
  }
}
