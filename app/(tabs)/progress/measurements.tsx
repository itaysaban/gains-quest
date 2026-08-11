import { useMemo, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { StrengthLineChart } from '@/components/charts/StrengthLineChart';
import { useBodyMeasurements, useAddBodyMeasurement } from '@/hooks/useBodyMeasurements';
import { useTheme, spacing, radius } from '@/lib/theme';
import { formatShortDate } from '@/lib/utils/date';
import type { MeasurementType } from '@/types/database.types';

const TYPES: { value: MeasurementType; label: string; unit: string }[] = [
  { value: 'bodyweight', label: 'Bodyweight', unit: 'kg' },
  { value: 'body_fat_pct', label: 'Body Fat %', unit: '%' },
  { value: 'circumference', label: 'Circumference', unit: 'cm' },
];

export default function BodyMeasurements() {
  const theme = useTheme();
  const [type, setType] = useState<MeasurementType>('bodyweight');
  const [subType, setSubType] = useState('waist');
  const [value, setValue] = useState('');
  const { data: measurements } = useBodyMeasurements(type);
  const addMeasurement = useAddBodyMeasurement();

  const activeType = TYPES.find((t) => t.value === type)!;
  const points = useMemo(
    () => (measurements ?? []).map((m) => ({ date: m.recorded_at, value: m.value })),
    [measurements],
  );

  async function handleAdd() {
    if (!value) return;
    await addMeasurement.mutateAsync({
      measurementType: type,
      subType: type === 'circumference' ? subType : null,
      value: Number(value),
      unit: activeType.unit,
    });
    setValue('');
  }

  return (
    <Screen scroll>
      <View style={{ gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          {TYPES.map((t) => {
            const active = t.value === type;
            return (
              <Pressable
                key={t.value}
                onPress={() => setType(t.value)}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.full,
                  backgroundColor: active ? theme.primary : theme.surfaceAlt,
                }}
              >
                <Text variant="caption" weight="600" style={{ color: active ? '#FFF' : theme.text }}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Card>
          <StrengthLineChart points={points} unit={activeType.unit} />
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <Text variant="subtitle">Log a measurement</Text>
          {type === 'circumference' ? (
            <TextField label="Location" value={subType} onChangeText={setSubType} placeholder="e.g. waist" />
          ) : null}
          <TextField label={`Value (${activeType.unit})`} value={value} onChangeText={setValue} keyboardType="decimal-pad" />
          <Button label="Add Entry" onPress={handleAdd} loading={addMeasurement.isPending} fullWidth />
        </Card>

        <View style={{ gap: spacing.xs }}>
          {(measurements ?? [])
            .slice()
            .reverse()
            .slice(0, 10)
            .map((m) => (
              <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }}>
                <Text color="muted">{formatShortDate(m.recorded_at)}</Text>
                <Text weight="600">
                  {m.value}
                  {m.unit} {m.sub_type ? `(${m.sub_type})` : ''}
                </Text>
              </View>
            ))}
        </View>
      </View>
    </Screen>
  );
}
