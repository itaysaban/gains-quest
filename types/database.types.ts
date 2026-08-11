// Hand-written to match supabase/migrations/*.sql.
// Once you have a live Supabase project, regenerate the authoritative version with:
//   npx supabase gen types typescript --project-id <id> > types/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UnitPreference = 'kg' | 'lb';
export type ExerciseCategory = 'push' | 'pull' | 'legs' | 'core' | 'cardio';
export type EquipmentType = 'barbell' | 'dumbbell' | 'machine' | 'bodyweight' | 'cable' | 'band';
export type TrackingType = 'weight_reps' | 'time' | 'distance' | 'bodyweight_reps';
export type SessionStatus = 'in_progress' | 'completed' | 'discarded';
export type SetType = 'warmup' | 'working' | 'drop' | 'failure';
export type PrRecordType = 'max_weight' | 'max_reps_at_weight' | 'est_1rm' | 'session_volume';
export type MeasurementType = 'bodyweight' | 'body_fat_pct' | 'circumference';
export type XpEventType = 'set_logged' | 'session_completed' | 'streak_bonus' | 'badge_unlocked';
export type BadgeCategory = 'strength' | 'consistency' | 'exploration' | 'volume';

export interface CustomFieldDef {
  key: string;
  label: string;
  type: 'text' | 'number';
}

// Tables whose rows are only ever written by SECURITY DEFINER Postgres functions (see
// supabase/migrations/20260811000008_functions_triggers.sql) — RLS blocks direct client writes at
// runtime. Insert/Update are still typed as Partial<Row> (not `never`) because `never` breaks
// supabase-js's structural GenericSchema constraint and silently degrades every query builder to `never`.
type ReadOnlyTable<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

type WritableTable<Row, Insert, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: WritableTable<
        {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          unit_preference: UnitPreference;
          weekly_goal_days: number;
          timezone: string;
          created_at: string;
          updated_at: string;
        },
        {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          unit_preference?: UnitPreference;
          weekly_goal_days?: number;
          timezone?: string;
        }
      >;
      exercises: WritableTable<
        {
          id: string;
          user_id: string | null;
          name: string;
          category: ExerciseCategory;
          muscle_groups: string[];
          equipment: EquipmentType;
          tracking_type: TrackingType;
          is_favorite: boolean;
          is_archived: boolean;
          is_system: boolean;
          custom_fields: CustomFieldDef[];
          notes: string | null;
          photo_url: string | null;
          source_exercise_id: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          user_id: string;
          name: string;
          category: ExerciseCategory;
          equipment: EquipmentType;
          tracking_type?: TrackingType;
          muscle_groups?: string[];
          is_favorite?: boolean;
          is_archived?: boolean;
          custom_fields?: CustomFieldDef[];
          notes?: string | null;
          photo_url?: string | null;
          source_exercise_id?: string | null;
        }
      >;
      routines: WritableTable<
        {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        },
        { user_id: string; name: string; description?: string | null; is_archived?: boolean }
      >;
      routine_exercises: WritableTable<
        {
          id: string;
          routine_id: string;
          user_id: string;
          exercise_id: string;
          order_index: number;
          superset_group_id: string | null;
          target_sets: number | null;
          target_reps_min: number | null;
          target_reps_max: number | null;
          target_weight: number | null;
          rest_seconds: number | null;
          created_at: string;
        },
        {
          routine_id: string;
          exercise_id: string;
          order_index?: number;
          superset_group_id?: string | null;
          target_sets?: number | null;
          target_reps_min?: number | null;
          target_reps_max?: number | null;
          target_weight?: number | null;
          rest_seconds?: number | null;
        }
      >;
      routine_schedules: WritableTable<
        {
          id: string;
          user_id: string;
          mode: 'days_of_week' | 'rotation';
          days_of_week: number[] | null;
          rotation_routine_ids: string[] | null;
          rotation_anchor_date: string | null;
          notify: boolean;
          notify_time: string;
          created_at: string;
        },
        {
          user_id: string;
          mode: 'days_of_week' | 'rotation';
          days_of_week?: number[] | null;
          rotation_routine_ids?: string[] | null;
          rotation_anchor_date?: string | null;
          notify?: boolean;
          notify_time?: string;
        }
      >;
      workout_sessions: WritableTable<
        {
          id: string;
          user_id: string;
          routine_id: string | null;
          name: string | null;
          status: SessionStatus;
          started_at: string;
          ended_at: string | null;
          paused_duration_seconds: number;
          notes: string | null;
          total_volume: number;
          total_sets: number;
          xp_earned: number;
          created_at: string;
          updated_at: string;
        },
        {
          user_id: string;
          routine_id?: string | null;
          name?: string | null;
          status?: SessionStatus;
          notes?: string | null;
        }
      >;
      session_exercises: WritableTable<
        {
          id: string;
          session_id: string;
          user_id: string;
          exercise_id: string;
          order_index: number;
          superset_group_id: string | null;
          rest_seconds: number | null;
          created_at: string;
        },
        {
          session_id: string;
          exercise_id: string;
          order_index?: number;
          superset_group_id?: string | null;
          rest_seconds?: number | null;
        }
      >;
      logged_sets: WritableTable<
        {
          id: string;
          session_exercise_id: string;
          user_id: string;
          set_index: number;
          set_type: SetType;
          weight: number | null;
          reps: number | null;
          time_seconds: number | null;
          distance_meters: number | null;
          rpe: number | null;
          rir: number | null;
          is_pr: boolean;
          completed_at: string;
          created_at: string;
          updated_at: string;
        },
        {
          session_exercise_id: string;
          set_index?: number;
          set_type?: SetType;
          weight?: number | null;
          reps?: number | null;
          time_seconds?: number | null;
          distance_meters?: number | null;
          rpe?: number | null;
          rir?: number | null;
          completed_at?: string;
        }
      >;
      personal_records: ReadOnlyTable<{
        id: string;
        user_id: string;
        exercise_id: string;
        record_type: PrRecordType;
        value: number;
        context: Json;
        logged_set_id: string | null;
        session_id: string | null;
        achieved_at: string;
        created_at: string;
      }>;
      body_measurements: WritableTable<
        {
          id: string;
          user_id: string;
          measurement_type: MeasurementType;
          sub_type: string | null;
          value: number;
          unit: string;
          recorded_at: string;
          notes: string | null;
          created_at: string;
        },
        {
          user_id: string;
          measurement_type: MeasurementType;
          value: number;
          unit: string;
          sub_type?: string | null;
          recorded_at?: string;
          notes?: string | null;
        }
      >;
      xp_events: ReadOnlyTable<{
        id: string;
        user_id: string;
        session_id: string | null;
        logged_set_id: string | null;
        event_type: XpEventType;
        xp_amount: number;
        metadata: Json;
        created_at: string;
      }>;
      level_thresholds: ReadOnlyTable<{ level: number; xp_required: number }>;
      user_levels: ReadOnlyTable<{
        user_id: string;
        total_xp: number;
        current_level: number;
        xp_into_level: number;
        xp_for_next_level: number;
        updated_at: string;
      }>;
      streaks: ReadOnlyTable<{
        user_id: string;
        current_streak_days: number;
        longest_streak_days: number;
        last_workout_date: string | null;
        streak_freezes_available: number;
        streak_freeze_used_dates: string[];
        updated_at: string;
      }>;
      badges: ReadOnlyTable<{
        id: string;
        code: string;
        name: string;
        description: string;
        category: BadgeCategory;
        icon: string;
        criteria: Json;
        created_at: string;
      }>;
      user_badges: WritableTable<
        {
          id: string;
          user_id: string;
          badge_id: string;
          unlocked_at: string;
          seen: boolean;
        },
        { user_id: string; badge_id: string; seen?: boolean },
        { seen?: boolean }
      >;
      notification_preferences: WritableTable<
        {
          user_id: string;
          rest_timer_enabled: boolean;
          routine_reminders_enabled: boolean;
          streak_warnings_enabled: boolean;
          quiet_hours_start: string | null;
          quiet_hours_end: string | null;
          updated_at: string;
        },
        {
          user_id: string;
          rest_timer_enabled?: boolean;
          routine_reminders_enabled?: boolean;
          streak_warnings_enabled?: boolean;
          quiet_hours_start?: string | null;
          quiet_hours_end?: string | null;
        }
      >;
      push_tokens: WritableTable<
        {
          id: string;
          user_id: string;
          expo_push_token: string;
          device_info: string | null;
          updated_at: string;
        },
        { user_id: string; expo_push_token: string; device_info?: string | null }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      fn_complete_session: {
        Args: { p_session_id: string };
        Returns: {
          session_id: string;
          duration_seconds: number;
          total_volume: number;
          total_sets: number;
          xp_earned: number;
          leveled_up: boolean;
          new_level: number;
          prs: { exercise_id: string; exercise_name: string; record_type: PrRecordType; value: number }[];
          new_badges: { code: string; name: string; icon: string; category: BadgeCategory }[];
        };
      };
      fn_duplicate_routine: {
        Args: { p_routine_id: string; p_new_name?: string | null };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
