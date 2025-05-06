// Define the structure of a single note
export interface Note {
  time: number; // Time in seconds (or beats) from the start of the song
  lane: number; // Which lane the note appears in (e.g., 1-3 for Easy, 1-6 for Hard)
  // Optional properties like type (tap, hold), duration, etc. can be added later
  type?: 'single' | 'hold';
  duration?: number;
}
