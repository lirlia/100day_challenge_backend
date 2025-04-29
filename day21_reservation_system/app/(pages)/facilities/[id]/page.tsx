'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Calendar, dateFnsLocalizer, Event as CalendarEvent } from 'react-big-calendar';
import { format } from 'date-fns/format';
import { parse } from 'date-fns/parse';
import { startOfWeek } from 'date-fns/startOfWeek';
import { getDay } from 'date-fns/getDay';
import { enUS } from 'date-fns/locale/en-US';
import { Facility, Reservation, User } from '@prisma/client'; // Assuming types are available
import { useUserStore } from '@/lib/store/userStore';

// Setup the localizer by providing the moment Object
// to the correct localizer.
const locales = {
  'en-US': enUS,
};
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

// Type extending Reservation with User and Facility details for calendar display
interface ReservationWithDetails extends Omit<Reservation, 'startTime' | 'endTime'> {
    id: number;
    start: Date;
    end: Date;
    title: string; // Display title for calendar event
    user: Pick<User, 'id' | 'name'>;
    facility: Pick<Facility, 'id' | 'name'>;
    allDay?: boolean;
}

const FacilityDetailPage = () => {
  const params = useParams();
  const router = useRouter();
  const id = params.id ? parseInt(params.id as string, 10) : null;
  const { currentUser } = useUserStore();

  const [facility, setFacility] = useState<Facility | null>(null);
  const [reservations, setReservations] = useState<ReservationWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calendarDate, setCalendarDate] = useState(new Date()); // To control calendar view

  const fetchFacilityAndReservations = useCallback(async (facilityId: number, start: Date, end: Date) => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch facility details
      const facilityRes = await fetch(`/api/facilities/${facilityId}`);
      if (!facilityRes.ok) {
        if (facilityRes.status === 404) throw new Error('Facility not found');
        throw new Error('Failed to fetch facility details');
      }
      const facilityData = await facilityRes.json();
      setFacility(facilityData);

      // Fetch reservations for the current view range
      const startISO = start.toISOString();
      const endISO = end.toISOString();
      const reservationsRes = await fetch(
        `/api/reservations?facilityId=${facilityId}&start=${startISO}&end=${endISO}`,
      );
      if (!reservationsRes.ok) {
        throw new Error('Failed to fetch reservations');
      }

      // Define the expected shape of the API response
      type ReservationApiResponse = (Reservation & {
        user: Pick<User, 'id' | 'name'>;
        facility: Pick<Facility, 'id' | 'name'>;
        // Ensure startTime and endTime are strings from JSON
        startTime: string;
        endTime: string;
      })[];

      const reservationsData: ReservationApiResponse = await reservationsRes.json();

      // Convert fetched reservations to CalendarEvent format
      const formattedReservations: ReservationWithDetails[] = reservationsData.map(r => ({
        // Spread all properties from the original reservation, including id
        ...r,
        // Convert date strings to Date objects
        start: new Date(r.startTime),
        end: new Date(r.endTime),
        // Create a title for the calendar event
        title: `Reserved by ${r.user?.name || 'Unknown'}`,
      }));
      setReservations(formattedReservations);

    } catch (err: any) {
      setError(err.message || 'An unknown error occurred');
      setFacility(null);
      setReservations([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (id) {
      // Initial fetch based on current month
      const startOfMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
      const endOfMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0, 23, 59, 59);
      fetchFacilityAndReservations(id, startOfMonth, endOfMonth);
    }
  }, [id, fetchFacilityAndReservations, calendarDate]); // Refetch when id or viewed date changes

  const handleSelectSlot = useCallback(
    async ({ start, end }: { start: Date; end: Date }) => {
      if (!currentUser) {
        alert('Please select a user from the header first.');
        return;
      }
      if (!facility) return;

      const title = window.prompt('Confirm reservation? (Click OK to book)');
      if (title === null) return; // User cancelled

      setError(null);
      try {
        const response = await fetch('/api/reservations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            facilityId: facility.id,
            userId: currentUser.id,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create reservation');
        }

        // Refetch reservations for the current view to show the new one
        const viewInfo = getCurrentViewRange(calendarDate); // Helper needed or use state
        if (id) {
             await fetchFacilityAndReservations(id, viewInfo.start, viewInfo.end);
        }

      } catch (err: any) {
        setError(err.message || 'An unknown error occurred during booking');
        alert(`Booking failed: ${err.message}`);
      }
    },
    [currentUser, facility, fetchFacilityAndReservations, id, calendarDate],
  );

 const handleSelectEvent = useCallback((event: ReservationWithDetails) => {
    // Optional: Show details or allow cancellation if current user matches
    const details = `Reservation Details:\nFacility: ${event.facility.name}\nUser: ${event.user.name}\nTime: ${format(event.start, 'Pp')} - ${format(event.end, 'Pp')}`;
    alert(details);
    // Implement cancellation logic here if needed
 }, []);

 const handleNavigate = useCallback((newDate: Date) => {
    setCalendarDate(newDate);
    // fetchFacilityAndReservations will be called by useEffect
  }, []);

 // Helper to get current view range (simplistic example)
 const getCurrentViewRange = (date: Date) => {
     // This needs refinement based on the actual calendar view (month, week, day)
     // For now, just return the month range again for refetching
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
    return { start: startOfMonth, end: endOfMonth };
 }

 if (isLoading) return <p>Loading facility details...</p>;
  if (error && !facility) return <p className="text-red-500">Error: {error}</p>; // Show error if facility couldn't load
  if (!facility) return <p>Facility not found.</p>; // Should be handled by error state generally


  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">{facility.name}</h1>
      <p className="text-gray-700 mb-1">{facility.description}</p>
      <p className="text-sm text-gray-500 mb-4">
         Capacity: {facility.capacity ?? 'N/A'} | Availability: {facility.availableStartTime ?? 'Any'} - {facility.availableEndTime ?? 'Any'}
      </p>

      {error && <p className="text-red-500 mb-4">Error fetching/updating reservations: {error}</p>}

      <div className="h-[600px] bg-white p-4 rounded shadow">
         <Calendar
            localizer={localizer}
            events={reservations}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '100%' }}
            selectable // Allow selecting time slots
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            onNavigate={handleNavigate} // Handle view changes
            date={calendarDate} // Control the displayed date
            // Consider adding min/max times based on facility availability
            // min={...} max={...}
            defaultView="week" // Default to week view
        />
      </div>
    </div>
  );
};

export default FacilityDetailPage;
