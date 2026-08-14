import { useEffect, useState } from 'react';
import { View, Pressable, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useRoutineSchedule, useUpsertSchedule } from '@/hooks/useRoutines';
import { useTheme, spacing, radius } from '@/lib/theme';

const DAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

export default function RoutineSchedule() {
  const { routineId } = useLocalSearchParams<{ routineId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { data: existingSchedule } = useRoutineSchedule(routineId);
  const upsertSchedule = useUpsertSchedule();

  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [notify, setNotify] = useState(true);

  useEffect(() => {
    if (existingSchedule?.days_of_week) setSelectedDays(existingSchedule.days_of_week);
    if (existingSchedule) setNotify(existingSchedule.notify);
  }, [existingSchedule]);

  function toggleDay(day: number) {
    setSelectedDays((cur) => (cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day]));
  }

  async function handleSave() {
    await upsertSchedule.mutateAsync({
      id: existingSchedule?.id,
      mode: 'days_of_week',
      days_of_week: selectedDays,
      rotation_routine_ids: [routineId!],
      notify,
      notify_time: '08:00',
    });
    router.back();
  }

  return (
    <Screen scroll>
      <View style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.xs }}>
          <Text variant="subtitle">Repeat on</Text>
          <Text color="muted" variant="caption">
            This routine will appear on Home's "Today's Plan" on the days you select.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {DAYS.map((day) => {
            const active = selectedDays.includes(day.value);
            return (
              <Pressable
                key={day.value}
                onPress={() => toggleDay(day.value)}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: radius.full,
                  backgroundColor: active ? theme.primary : theme.surfaceAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text weight="600" style={{ color: active ? '#FFF' : theme.text }}>
                  {day.label[0]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text weight="600">Reminder notification</Text>
          <Switch value={notify} onValueChange={setNotify} />
        </View>

        <Button label="Save Schedule" onPress={handleSave} loading={upsertSchedule.isPending} fullWidth />
      </View>
    </Screen>
  );
}
