// Hand-written to match supabase/migrations/*.sql.
// Once you have a live Supabase project, regenerate the authoritative version with:
//   npx supabase gen types typescript --project-id <id> > types/database.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UnitPreference = 'kg' | 'lb';
export type ExerciseCategory = 'push' | 'pull' | 'legs' | 'core' | 'cardio';
export type EquipmentType = 'barbell' | 'dumbbell' | 'machine' | 'bodyweight' | 'cable' | 'band';
export type TrackingType = 'weight_reps' | 'time' | 'distance' | 'bodyweight_reps' | 'distance_duration';
export type SessionStatus = 'in_progress' | 'completed' | 'discarded';
export type SetType = 'warmup' | 'working' | 'drop' | 'failure';
export type PrRecordType = 'max_weight' | 'max_reps_at_weight' | 'est_1rm' | 'session_volume' | 'best_set_volume';
export type MeasurementType = 'bodyweight' | 'body_fat_pct' | 'circumference';
export type PointSource = 'base' | 'volume' | 'cardio' | 'pr' | 'routine' | 'achievement';
// M3 Epic 3 Story 3.1: replaced the old 4-category set with the PRD's v1.0 categories.
export type BadgeCategory = 'onboarding' | 'cardio' | 'consistency' | 'volume' | 'social' | 'progression' | 'variety';
export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';

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
          progression_upper_increment_kg: number;
          progression_lower_increment_kg: number;
          progression_deload_pct: number;
          onboarding_completed_at: string | null;
          leaderboard_opt_out: boolean;
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
          progression_upper_increment_kg?: number;
          progression_lower_increment_kg?: number;
          progression_deload_pct?: number;
          onboarding_completed_at?: string | null;
          leaderboard_opt_out?: boolean;
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
          folder: string | null;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        },
        { user_id: string; name: string; description?: string | null; folder?: string | null; is_archived?: boolean }
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
          note: string | null;
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
          note?: string | null;
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
          workout_type: string | null;
          local_date: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          user_id: string;
          routine_id?: string | null;
          name?: string | null;
          status?: SessionStatus;
          notes?: string | null;
          workout_type?: string | null;
          local_date?: string | null;
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
          target_reps_min: number | null;
          target_reps_max: number | null;
          created_at: string;
        },
        {
          session_id: string;
          exercise_id: string;
          order_index?: number;
          superset_group_id?: string | null;
          rest_seconds?: number | null;
          target_reps_min?: number | null;
          target_reps_max?: number | null;
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
          e1rm_kg: number | null;
          completed_at: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string; // client-generated for optimistic writes; server default applies if omitted
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
      exercise_current_best: ReadOnlyTable<{
        user_id: string;
        exercise_id: string;
        best_weight: number | null;
        best_weight_reps: number | null;
        best_weight_logged_set_id: string | null;
        best_weight_achieved_at: string | null;
        best_est_1rm: number | null;
        best_est_1rm_weight: number | null;
        best_est_1rm_reps: number | null;
        best_est_1rm_logged_set_id: string | null;
        best_est_1rm_achieved_at: string | null;
        best_set_weight: number | null;
        best_set_reps: number | null;
        best_set_volume: number | null;
        best_set_logged_set_id: string | null;
        best_set_achieved_at: string | null;
        last_session_exercise_id: string | null;
        last_session_completed_at: string | null;
        updated_at: string;
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
      point_ledger: ReadOnlyTable<{
        id: string;
        user_id: string;
        source: PointSource;
        session_id: string | null;
        achievement_id: string | null;
        points: number;
        season_id: string;
        // True when this session had an implausible single-session load jump (>40% over any prior
        // session's max for that exercise) — accepted and awarded in full, just excluded from M4
        // leaderboard ranking pending review. Not yet consumed anywhere (leaderboards are M4).
        excluded_from_ranking: boolean;
        created_at: string;
      }>;
      // M3 Epic 2 Story 2.5 (redesign): a record of actual pause periods, queried fresh via
      // fn_pause_days_used_this_quarter rather than a stored/mutated counter. Not read directly by
      // the client — server functions only.
      pause_periods: ReadOnlyTable<{
        id: string;
        user_id: string;
        started_at: string;
        ended_at: string;
        created_at: string;
      }>;
      // M4 Story 1: a friendship is one row, 'accepted' — no separate mutable "friends" table.
      // Written only by the fn_send_friend_request/fn_respond_friend_request/fn_remove_friend
      // functions below; the client reads it (own rows only) mostly through fn_list_friends/
      // fn_pending_friend_requests rather than querying this table directly.
      friend_requests: ReadOnlyTable<{
        id: string;
        requester_id: string;
        addressee_id: string;
        status: FriendRequestStatus;
        created_at: string;
        responded_at: string | null;
      }>;
      streaks: ReadOnlyTable<{
        user_id: string;
        current_streak_days: number;
        longest_streak_days: number;
        last_workout_date: string | null;
        // M3 Epic 2 Story 2.2: renamed from streak_freezes_available (was uncapped/defaulted to 1;
        // now capped at 2, earned every 7 streak-days) — not read anywhere in the client yet.
        freezes_banked: number;
        streak_freeze_used_dates: string[];
        // M3 Epic 2 Story 2.1: this week's consumed rest-allowance days, and the ISO week-start date
        // it's counted against. rest_allowance itself is never stored — derived on the server as
        // 7 - profiles.weekly_goal_days.
        rest_used_this_week: number;
        rest_week_start: string | null;
        // M3 Epic 2 Story 2.5.
        paused_until: string | null;
        pause_started_at: string | null;
        pause_days_used_this_quarter: number;
        pause_quarter_start: string | null;
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
        points: number;
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
          points_earned: number;
          prs: { exercise_id: string; exercise_name: string; record_type: PrRecordType; value: number }[];
          new_badges: { code: string; name: string; icon: string; category: BadgeCategory }[];
        };
      };
      fn_duplicate_routine: {
        Args: { p_routine_id: string; p_new_name?: string | null };
        Returns: string;
      };
      fn_delete_completed_session: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
      fn_recalculate_session_points: {
        Args: { p_session_id: string };
        Returns: number;
      };
      fn_enable_pause_mode: {
        Args: { p_days: number };
        Returns: { paused_until: string; days_granted: number; days_remaining_this_quarter: number };
      };
      fn_pause_days_used_this_quarter: {
        Args: { p_user_id: string };
        Returns: number;
      };
      fn_cancel_pause_mode: {
        Args: Record<string, never>;
        Returns: { days_refunded: number; days_used: number };
      };
      fn_badge_progress: {
        Args: { p_user_id: string };
        Returns: { badge_id: string; current_value: number | null }[];
      };
      fn_lifetime_stats: {
        Args: { p_user_id: string };
        Returns: {
          total_gp: number;
          sessions: number;
          volume_kg: number;
          prs: number;
          badges_unlocked: number;
          badges_total: number;
          // M4 Story 2: the caller's current-season global rank, or null with no season_id GP yet
          // this month — never a fabricated number.
          season_rank: number | null;
        };
      };
      fn_search_users: {
        Args: { p_query: string };
        Returns: { id: string; display_name: string | null; avatar_url: string | null; relationship: FriendRequestStatus | 'none' }[];
      };
      fn_send_friend_request: {
        Args: { p_addressee_id: string };
        Returns: {
          id: string;
          requester_id: string;
          addressee_id: string;
          status: FriendRequestStatus;
          created_at: string;
          responded_at: string | null;
        };
      };
      fn_respond_friend_request: {
        Args: { p_request_id: string; p_accept: boolean };
        Returns: {
          id: string;
          requester_id: string;
          addressee_id: string;
          status: FriendRequestStatus;
          created_at: string;
          responded_at: string | null;
        };
      };
      fn_remove_friend: {
        Args: { p_friend_id: string };
        Returns: undefined;
      };
      fn_list_friends: {
        Args: { p_user_id: string };
        Returns: { id: string; display_name: string | null; avatar_url: string | null; friends_since: string | null }[];
      };
      fn_pending_friend_requests: {
        Args: { p_user_id: string };
        Returns: { id: string; from_user_id: string; display_name: string | null; avatar_url: string | null; created_at: string }[];
      };
      fn_leaderboard: {
        Args: { p_scope: 'global' | 'friends' };
        Returns: {
          rank: number;
          user_id: string;
          display_name: string | null;
          avatar_url: string | null;
          season_gp: number;
          is_self: boolean;
          tier_number: number | null;
          tier_size: number | null;
        }[];
      };
      fn_ensure_seasons_archived: {
        Args: Record<string, never>;
        Returns: number;
      };
      fn_season_standings: {
        Args: { p_season_id: string };
        Returns: {
          rank: number;
          user_id: string;
          display_name: string | null;
          avatar_url: string | null;
          season_gp: number;
          is_self: boolean;
          tier_number: number;
          tier_size: number;
        }[];
      };
      fn_my_seasons: {
        Args: Record<string, never>;
        Returns: { season_id: string; rank: number; tier_number: number; season_gp: number }[];
      };
      fn_friend_feed: {
        Args: { p_limit?: number; p_before?: string | null };
        Returns: {
          id: string;
          user_id: string;
          display_name: string | null;
          avatar_url: string | null;
          event_type: 'session_completed' | 'pr_set' | 'badge_unlocked';
          // Deliberately activity-shape only per PRD §6.5 — never weight/volume numbers.
          metadata: Record<string, unknown>;
          badge_code: string | null;
          badge_name: string | null;
          badge_icon: string | null;
          created_at: string;
          reaction_count: number;
          reacted_by_me: boolean;
        }[];
      };
      fn_toggle_reaction: {
        Args: { p_feed_event_id: string };
        Returns: boolean;
      };
      fn_update_session_feed_privacy: {
        Args: { p_session_id: string; p_include_weights: boolean };
        Returns: undefined;
      };
      fn_active_challenges: {
        Args: { p_user_id: string };
        Returns: {
          id: string;
          code: string;
          name: string;
          description: string;
          metric: 'sessions_completed' | 'new_prs' | 'total_sets';
          target_value: number;
          progress_value: number;
          status: 'active' | 'ready_to_claim' | 'completed';
          points: number;
          period_end: string;
        }[];
      };
      fn_claim_challenge: {
        Args: { p_user_challenge_id: string };
        Returns: undefined;
      };
      fn_dev_reset_challenges: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
