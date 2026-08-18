import { useState } from 'react';
import { View, Pressable, TextInput } from 'react-native';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import type { RoutineExerciseWithDetails } from '@/types/domain';

interface Props {
  item: RoutineExerciseWithDetails;
  isSupersetLinked: boolean;
  supersetLabel?: string;
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

/** Routine Builder's exercise card — design handoff §5 / PRD §6.1.2. Sets/Reps/Rest are 3 inset
 * fields in a row, committed on blur (not per-keystroke, see the note below) — matches §9's edge
 * case (clearing a field and navigating away reverts to the last saved value, never persists empty).
 * Supersets get a 3px accent left rail + mono "SUPERSET A/B/…" label instead of the mockup's own
 * separate grouping wrapper — same visual, computed from group order here. */
export function RoutineExerciseRow({ item, isSupersetLinked, supersetLabel, onDrag, onRemove, onToggleSuperset, onPatch }: Props) {
  const theme = useTheme();
  const [noteExpanded, setNoteExpanded] = useState(!!item.note);

  // Local drafts, committed on blur — not on every keystroke. See history: wiring value straight to
  // item.* with no local echo meant every keystroke's round trip had to land before the input stopped
  // snapping back, visible as digits flashing away while typing, worst on fast multi-digit entry.
  const [draftSets, setDraftSets] = useState(item.target_sets != null ? String(item.target_sets) : '');
  const [draftReps, setDraftReps] = useState(item.target_reps_max != null ? String(item.target_reps_max) : '');
  const [draftRest, setDraftRest] = useState(item.rest_seconds != null ? String(item.rest_seconds) : '');
  const [draftNote, setDraftNote] = useState(item.note ?? '');

  const card = (
    <View style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.md, gap: 11 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Pressable onPressIn={onDrag} hitSlop={8}>
          <Text style={{ fontSize: 14, color: theme.textFaint }}>⠿</Text>
        </Pressable>
        <Text font="body" weight="700" size={16} style={{ flex: 1, lineHeight: 18 }}>
          {item.exercise.name}
        </Text>
        <Pressable onPress={onRemove} hitSlop={8}>
          <Text style={{ fontSize: 15, color: theme.textMuted }}>⋯</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <InsetField
          label="Sets"
          value={draftSets}
          onChangeText={setDraftSets}
          onBlur={() => {
            if (!draftSets) {
              setDraftSets(item.target_sets != null ? String(item.target_sets) : '');
              return;
            }
            onPatch({ target_sets: Number(draftSets) });
          }}
        />
        <InsetField
          label="Reps"
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
        <InsetField
          label="Rest"
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

      <Pressable onPress={onToggleSuperset}>
        <Text font="body" weight="600" size={12} color="primary">
          {isSupersetLinked ? '🔗 Linked as superset with previous' : '🔗 Link as superset with previous'}
        </Text>
      </Pressable>

      {noteExpanded ? (
        <TextInput
          value={draftNote}
          onChangeText={setDraftNote}
          onBlur={() => onPatch({ note: draftNote || null })}
          placeholder="e.g. grip width, tempo cue"
          placeholderTextColor={theme.textMuted}
          style={{ fontSize: 12, color: theme.textMuted }}
        />
      ) : (
        <Pressable onPress={() => setNoteExpanded(true)}>
          <Text font="body" size={12} color="muted">
            + Add note
          </Text>
        </Pressable>
      )}
    </View>
  );

  if (!isSupersetLinked && !supersetLabel) return card;

  return (
    <View style={{ borderLeftWidth: 3, borderLeftColor: theme.primary, borderRadius: 4, paddingLeft: spacing.sm, gap: spacing.xs }}>
      {supersetLabel ? (
        <Text font="mono" size={10} style={{ color: theme.gradientFrom, letterSpacing: 1.5 }}>
          {supersetLabel}
        </Text>
      ) : null}
      {card}
    </View>
  );
}

function InsetField({
  label,
  value,
  placeholder,
  onChangeText,
  onBlur,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChangeText: (v: string) => void;
  onBlur: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.cardInset, borderRadius: radius.md, padding: spacing.sm, gap: 4 }}>
      <Text font="body" weight="600" size={10} color="muted">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        keyboardType="number-pad"
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        style={{ fontFamily: 'Barlow_700Bold', fontSize: 15, color: theme.text, padding: 0 }}
      />
    </View>
  );
}
