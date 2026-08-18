import { View, TextInput, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import type { UnitPreference } from '@/types/database.types';

interface Props {
  label: string;
  value: number | null;
  step: number;
  onChange: (value: number | null) => void;
  decimals?: number;
  /** Purely for the label suffix (e.g. "WEIGHT (LB)") — value/onChange are passed and returned in
   * whatever unit the caller already converted to/from; this component does no conversion itself.
   * Conversion lives once, at the data boundary, in lib/utils/units.ts (see DraftSetRow.tsx). */
  unit?: UnitPreference;
}

export function SetInputAdjuster({ label, value, step, onChange, decimals = 0, unit }: Props) {
  const theme = useTheme();

  function adjust(delta: number) {
    Haptics.selectionAsync().catch(() => {});
    const next = Math.max(0, (value ?? 0) + delta);
    onChange(Number(next.toFixed(decimals)));
  }

  return (
    <View style={{ alignItems: 'center', gap: spacing.xs }}>
      <Text variant="label" color="muted" weight="600">
        {label.toUpperCase()}
        {unit ? ` (${unit.toUpperCase()})` : ''}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <Pressable
          onPress={() => adjust(-step)}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          style={{
            width: 32,
            height: 32,
            borderRadius: radius.sm,
            backgroundColor: theme.cardInset,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="remove" size={18} color={theme.text} />
        </Pressable>
        <TextInput
          value={value == null ? '' : String(value)}
          onChangeText={(text) => {
            const num = Number(text.replace(/[^0-9.]/g, ''));
            onChange(text === '' ? null : Number.isNaN(num) ? null : num);
          }}
          keyboardType="decimal-pad"
          style={{
            minWidth: 56,
            textAlign: 'center',
            fontSize: 18,
            fontWeight: '700',
            color: theme.text,
            paddingVertical: spacing.xs,
          }}
        />
        <Pressable
          onPress={() => adjust(step)}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          style={{
            width: 32,
            height: 32,
            borderRadius: radius.sm,
            backgroundColor: theme.cardInset,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="add" size={18} color={theme.text} />
        </Pressable>
      </View>
    </View>
  );
}
