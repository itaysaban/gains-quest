import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import type { RoutineExerciseWithDetails } from '@/types/domain';

interface Props {
  item: RoutineExerciseWithDetails;
  isSupersetLinked: boolean;
  onDrag: () => void;
  onRemove: () => void;
  onToggleSuperset: () => void;
  onPatch: (
    patch: Partial<{
      target_sets: number | null;
      target_reps_min: number | null;
      target_reps_max: number | null;
      rest_seconds: number | null;
      note: string | null;
    }>,
  ) => void;
}

export function RoutineExerciseRow({ item, isSupersetLinked, onDrag, onRemove, onToggleSuperset, onPatch }: Props) {
  const theme = useTheme();
  const [noteExpanded, setNoteExpanded] = useState(!!item.note);

  // Local drafts, committed on blur — not on every keystroke. Sets/Reps/Rest/Note previously called
  // onPatch() straight from onChangeText, which fires a network write on every character typed; since
  // the field's `value` was wired directly to `item.*` (no local echo) and nothing updated it
  // optimistically, each keystroke's round trip had to land before the input stopped snapping back to
  // its old value — visible as digits flashing away while typing, worst on fast multi-digit entry.
  const [draftSets, setDraftSets] = useState(item.target_sets != null ? String(item.target_sets) : '');
  const [draftReps, setDraftReps] = useState(item.target_reps_max != null ? String(item.target_reps_max) : '');
  const [draftRest, setDraftRest] = useState(item.rest_seconds != null ? String(item.rest_seconds) : '');
  const [draftNote, setDraftNote] = useState(item.note ?? '');

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.surface,
        borderRadius: radius.md,
        marginBottom: spacing.sm,
        borderLeftWidth: isSupersetLinked ? 4 : 0,
        borderLeftColor: theme.primary,
        borderWidth: 1,
        borderColor: theme.border,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <Pressable onPressIn={onDrag} hitSlop={8}>
        <Ionicons name="reorder-three" size={22} color={theme.textMuted} />
      </Pressable>

      <View style={{ flex: 1, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text weight="600">{item.exercise.name}</Text>
          <Pressable onPress={onRemove} hitSlop={8}>
            <Ionicons name="close-circle-outline" size={20} color={theme.textMuted} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TextField
              label="Sets"
              keyboardType="number-pad"
              value={draftSets}
              onChangeText={setDraftSets}
              onBlur={() => {
                // Erased without typing a replacement — revert to the last saved value instead of
                // wiping a planned target (PRD §9 edge case). Nothing to persist, so no onPatch call.
                if (!draftSets) {
                  setDraftSets(item.target_sets != null ? String(item.target_sets) : '');
                  return;
                }
                onPatch({ target_sets: Number(draftSets) });
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Reps"
              keyboardType="number-pad"
              placeholder="e.g. 8"
              value={draftReps}
              onChangeText={setDraftReps}
              onBlur={() => {
                if (!draftReps) {
                  setDraftReps(item.target_reps_max != null ? String(item.target_reps_max) : '');
                  return;
                }
                onPatch({ target_reps_min: Number(draftReps), target_reps_max: Number(draftReps) });
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Rest (s)"
              keyboardType="number-pad"
              value={draftRest}
              onChangeText={setDraftRest}
              onBlur={() => {
                if (!draftRest) {
                  setDraftRest(item.rest_seconds != null ? String(item.rest_seconds) : '');
                  return;
                }
                onPatch({ rest_seconds: Number(draftRest) });
              }}
            />
          </View>
        </View>

        <Pressable onPress={onToggleSuperset} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name={isSupersetLinked ? 'link' : 'link-outline'} size={16} color={theme.primary} />
          <Text variant="caption" color="primary" weight="600">
            {isSupersetLinked ? 'Linked as superset with previous' : 'Link as superset with previous'}
          </Text>
        </Pressable>

        {noteExpanded ? (
          <TextField
            label="Note"
            placeholder="e.g. grip width, tempo cue"
            value={draftNote}
            onChangeText={setDraftNote}
            onBlur={() => onPatch({ note: draftNote || null })}
          />
        ) : (
          <Pressable onPress={() => setNoteExpanded(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="add-circle-outline" size={16} color={theme.textMuted} />
            <Text variant="caption" color="muted" weight="600">
              Add note
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
