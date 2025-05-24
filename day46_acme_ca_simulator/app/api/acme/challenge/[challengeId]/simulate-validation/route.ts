import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export async function PUT(
  req: NextRequest,
  { params }: { params: { challengeId: string } },
) {
  const awaitedParams = await params;
  const { challengeId } = awaitedParams;

  if (!challengeId) {
    return NextResponse.json(
      { type: "urn:ietf:params:acme:error:malformed", detail: "Challenge ID missing" },
      { status: 400 },
    );
  }

  try {
    const challenge = db
      .prepare("SELECT * FROM AcmeChallenges WHERE id = ?")
      .get(challengeId);

    if (!challenge) {
      return NextResponse.json(
        { type: "urn:ietf:params:acme:error:malformed", detail: "Challenge not found" },
        { status: 404 },
      );
    }

    const body = await req.json();
    const keyAuthorizationFromClient = body.keyAuthorization;

    if (!keyAuthorizationFromClient || typeof keyAuthorizationFromClient !== 'string') {
      return NextResponse.json(
        { type: "urn:ietf:params:acme:error:malformed", detail: "Missing or invalid keyAuthorization in request body" },
        { status: 400 },
      );
    }

    const validationPayload = keyAuthorizationFromClient;

    db.prepare(
      "UPDATE AcmeChallenges SET validationPayload = ? WHERE id = ?",
    ).run(validationPayload, challengeId);

    console.log(
      `Updated validationPayload for challenge ${challengeId}: ${validationPayload}`,
    );

    return NextResponse.json({
      message: "Validation payload simulated successfully. The server will now attempt to validate this challenge when requested.",
      challengeId,
      simulatedPayload: validationPayload,
    });
  } catch (error) {
    console.error("Error simulating challenge validation:", error);
    return NextResponse.json(
      {
        type: "urn:ietf:params:acme:error:serverInternal",
        detail: "Failed to simulate challenge validation",
      },
      { status: 500 },
    );
  }
}
