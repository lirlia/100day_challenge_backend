'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Calendar,
  dateFnsLocalizer,
  Event as CalendarEvent,
  View,
  Views,
  NavigateAction,
  DateRange
} from 'react-big-calendar'; // Import necessary types
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
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [viewRange, setViewRange] = useState<DateRange | null>(null);

  const fetchFacilityAndReservations = useCallback(async (facilityId: number, start: Date, end: Date) => {
    setIsLoading(true);
    setError(null);
    console.log(`Fetching reservations for facility ${facilityId} from ${start.toISOString()} to ${end.toISOString()}`);
    try {
      // Fetch facility details
      const facilityRes = await fetch(`/api/facilities/${facilityId}`);
      if (!facilityRes.ok) {
        if (facilityRes.status === 404) throw new Error('Facility not found');
        throw new Error('Failed to fetch facility details');
      }
      const facilityData = await facilityRes.json();
      setFacility(facilityData);

      // Fetch reservations using the provided start and end dates
      const startISO = start.toISOString();
      // Adjust end date to ensure it includes the whole last day for API query if needed
      const adjustedEnd = new Date(end); // Create a copy
      // If range.end is the start of the last day (e.g., midnight), add 24 hours minus 1ms, or ensure API handles inclusivity correctly.
      // For simplicity, let's assume the API query is inclusive or slightly adjusted.
      // Example: If range.end is May 3 00:00, we might need May 3 23:59:59 for the query.
      // Let's pass the end date as is for now, assuming API logic or slight range overlap handles it.
      const endISO = adjustedEnd.toISOString();

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
       console.log('Received reservations data:', reservationsData);

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
       console.log('Formatted reservations for calendar:', formattedReservations);
       setReservations(formattedReservations);

    } catch (err: any) {
      setError(err.message || 'An unknown error occurred');
      setFacility(null); // Clear facility on error too
      setReservations([]);
    } finally {
      setIsLoading(false);
    }
  }, []); // Removed facility from dependencies as it's fetched inside

  // useEffect to set initial viewRange on mount
  useEffect(() => {
    // Calculate initial range based on defaultView ('week') and calendarDate
    const startOfWeekDate = startOfWeek(calendarDate, { locale: locales['en-US'] });
    const endOfWeekDate = new Date(startOfWeekDate);
    endOfWeekDate.setDate(endOfWeekDate.getDate() + 6); // Week view = 7 days
    endOfWeekDate.setHours(23, 59, 59, 999); // End of the last day

    console.log("Setting initial view range:", { start: startOfWeekDate, end: endOfWeekDate });
    setViewRange({ start: startOfWeekDate, end: endOfWeekDate });
  }, []); // Empty dependency array ensures this runs only once on mount

  // useEffect now depends on viewRange
  useEffect(() => {
    if (id && viewRange?.start && viewRange?.end) {
        console.log("viewRange changed, triggering fetch:", viewRange); // Add log
        const startDate = viewRange.start instanceof Date ? viewRange.start : new Date(viewRange.start);
        const endDate = viewRange.end instanceof Date ? viewRange.end : new Date(viewRange.end);
        // Add a small buffer to the end date for queries if necessary (e.g., end of day)
        const queryEndDate = new Date(endDate);
        if (queryEndDate.getHours() === 0 && queryEndDate.getMinutes() === 0) {
             queryEndDate.setHours(23, 59, 59, 999); // Set to end of day if it's midnight
        }
        fetchFacilityAndReservations(id, startDate, queryEndDate);
    } else {
        console.log("Skipping fetch: id or viewRange missing/invalid", { id, viewRange }); // Add log
    }
  }, [id, viewRange, fetchFacilityAndReservations]);

  // Callback for when the calendar's view range changes
  const handleRangeChange = useCallback((range: DateRange | { start: Date, end: Date } | Date[]) => {
      console.log("Range changed:", range);
      // RBC might return an array for month view, object for week/day
      let startDate: Date;
      let endDate: Date;
      if (Array.isArray(range)) {
          // Handle array (likely month view, take first and last day)
          startDate = range[0];
          endDate = range[range.length - 1];
          // Set end date to the very end of the day for inclusive query range
          endDate.setHours(23, 59, 59, 999);
      } else if (range && 'start' in range && 'end' in range) {
          // Handle object {start, end} (likely week/day view)
          startDate = range.start;
          endDate = range.end;
          // For week/day view, endDate might be the start of the next day/slot
          // Adjust if needed, e.g., subtract 1ms or set to end of day
          // Let's assume for now range.end is suitable or API handles it
      } else {
          console.error("Invalid range received from onRangeChange", range);
          // Fallback to current week
          const today = new Date();
          startDate = startOfWeek(today, { locale: locales['en-US'] });
          endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + 6);
          endDate.setHours(23, 59, 59, 999);
      }
       setViewRange({ start: startDate, end: endDate });
  }, []);

  // handleSelectSlot, handleSelectEvent - keep modifications from previous steps
  const handleSelectSlot = useCallback(
    async ({ start, end }: { start: Date; end: Date }) => {
      if (!currentUser) {
        alert('Please select a user from the header first.');
        return;
      }
      if (!facility) return;

      // Confirmation prompt removed

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

        // --- Start Modification ---
        // Get the newly created reservation from the response
        const newReservation: Reservation = await response.json(); // Assuming API returns the created Reservation object

        // Format the new reservation for the calendar
        const formattedNewReservation: ReservationWithDetails = {
          // Spread the basic reservation properties (id, facilityId, userId, createdAt, updatedAt)
          ...newReservation,
           // Convert dates - Assuming API returns ISO strings
          start: new Date(newReservation.startTime),
          end: new Date(newReservation.endTime),
          // Create title (API response doesn't include user name, use currentUser)
          title: `Reserved by ${currentUser.name}`,
          // Add user/facility details from current context
          user: { id: currentUser.id, name: currentUser.name },
          facility: { id: facility.id, name: facility.name },
        };

        // Add the new reservation to the existing state without refetching all
        setReservations(prevReservations => [...prevReservations, formattedNewReservation]);
        // --- End Modification ---

      } catch (err: any) {
        setError(err.message || 'An unknown error occurred during booking');
        alert(`Booking failed: ${err.message}`);
      }
    },
    [currentUser, facility, id, calendarDate], // Keep necessary dependencies
  );

 const handleSelectEvent = useCallback((event: ReservationWithDetails) => {
    // Optional: Show details or allow cancellation if current user matches
    const details = `Reservation Details:\nFacility: ${event.facility.name}\nUser: ${event.user.name}\nTime: ${format(event.start, 'Pp')} - ${format(event.end, 'Pp')}`;
    alert(details);
    // Implement cancellation logic here if needed
 }, []);

 // handleNavigate only updates the central date, range change handles fetch
 const handleNavigate = useCallback((newDate: Date, view: View, action: NavigateAction) => {
    console.log("Navigating to date:", newDate, "View:", view, "Action:", action);
    setCalendarDate(newDate);
    // Data fetching is now triggered by onRangeChange -> useEffect
  }, []);

  // Function to determine event style based on user ID
  const eventPropGetter = useCallback(
    (event: ReservationWithDetails, start: Date, end: Date, isSelected: boolean) => {
      let newStyle: React.CSSProperties = {
        backgroundColor: "#3174ad", // Default blue
        color: "white",
        borderRadius: "5px",
        border: "none",
        display: "block"
      };

      if (event.user?.id === 1) { // Alice
        newStyle.backgroundColor = "#2a9d8f"; // Teal color for Alice
      } else if (event.user?.id === 2) { // Bob
        newStyle.backgroundColor = "#e76f51"; // Orange-red color for Bob
      }
      // Add more conditions for other users if needed

      return {
        style: newStyle
      };
    },
    [] // No dependencies needed if colors are static
  );

  // Adjusted loading condition
  if (isLoading && !reservations.length) { // Simpler check: Show loading if actively fetching and no reservations yet
      return <p>Loading calendar data...</p>;
  }
  if (error && !facility) return <p className="text-red-500">Error: {error}</p>;
  if (!id) return <p>Facility ID missing.</p>; // Added check for ID presence
  if (!facility && !isLoading) return <p>Facility not found.</p>; // Show not found only if not loading

  return (
    <div>
      {facility ? (
         <>
            <h1 className="text-2xl font-bold mb-2">{facility.name}</h1>
            <p className="text-gray-700 mb-1">{facility.description}</p>
            <p className="text-sm text-gray-500 mb-4">
               Capacity: {facility.capacity ?? 'N/A'} | Availability: {facility.availableStartTime ?? 'Any'} - {facility.availableEndTime ?? 'Any'}
            </p>
         </>
       ) : (
          // Show placeholder or loading for facility details if needed
          <h1 className="text-2xl font-bold mb-2">Loading Facility...</h1>
       )}

       {error && <p className="text-red-500 mb-4">Error loading reservations: {error}</p>}

      <div className="h-[600px] bg-white p-4 rounded shadow">
         <Calendar
            localizer={localizer}
            events={reservations}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '100%' }}
            selectable
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            onNavigate={handleNavigate}
            date={calendarDate} // Central date for navigation
            // Add onRangeChange handler
            onRangeChange={handleRangeChange}
            // Set default view and ensure it's consistent
            defaultView={Views.WEEK} // Explicitly use Views enum
            views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]} // Define available views
            // Add key to force re-render on ID change if necessary, though useEffect handles data fetch
            key={id}
            // Add the eventPropGetter
            eventPropGetter={eventPropGetter}
        />
      </div>
    </div>
  );
};

export default FacilityDetailPage;
