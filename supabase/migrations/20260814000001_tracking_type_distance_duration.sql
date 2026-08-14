-- New tracking type for pace-based cardio (running/rowing/cycling): captures distance AND time
-- together per set so pace/speed can be derived, unlike the existing 'distance' or 'time' types alone.
-- Kept in its own migration: adding an enum value must commit before it can be referenced elsewhere.
alter type public.tracking_type add value 'distance_duration';
