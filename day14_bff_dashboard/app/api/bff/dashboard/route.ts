import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  try {
    const [profileRes, activitiesRes, notificationsRes, recommendationsRes] = await Promise.all([
      fetch(`${req.nextUrl.origin}/api/core/profile/${userId}`),
      fetch(`${req.nextUrl.origin}/api/core/activities/${userId}`),
      fetch(`${req.nextUrl.origin}/api/core/notifications`),
      fetch(`${req.nextUrl.origin}/api/core/recommendations/${userId}`),
    ]);

    const profile = await profileRes.json();
    const activities = await activitiesRes.json();
    const notifications = await notificationsRes.json();
    const recommendations = await recommendationsRes.json();

    if (profileRes.status !== 200) {
      return NextResponse.json({ error: 'Failed to fetch mandatory data (e.g., profile)' }, { status: 500 });
    }

    return NextResponse.json({
      profile,
      activities: activitiesRes.status === 200 ? activities : null,
      notifications: notificationsRes.status === 200 ? notifications : null,
      recommendations: recommendationsRes.status === 200 ? recommendations : null,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
