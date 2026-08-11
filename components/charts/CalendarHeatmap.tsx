import { View, Pressable } from 'react-native';
import { startOfWeek, addDays, addWeeks, format } from 'date-fns';
import { useTheme, spacing } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import { isoDateOnly } from '@/lib/utils/date';

const CELL_SIZE = 14;
const CELL_GAP = 4;
const WEEKS_TO_SHOW = 14;

/** GitHub-style activity heatmap: activityByDate maps 'yyyy-MM-dd' -> session count that day. */
export function CalendarHeatmap({
  activityByDate,
  onDayPress,
}: {
  activityByDate: Record<string, number>;
  onDayPress?: (date: string) => void;
}) {
  const theme = useTheme();
  const today = new Date();
  const gridStart = startOfWeek(addWeeks(today, -(WEEKS_TO_SHOW - 1)));

  const weeks = Array.from({ length: WEEKS_TO_SHOW }, (_, weekIdx) =>
    Array.from({ length: 7 }, (_, dayIdx) => addDays(gridStart, weekIdx * 7 + dayIdx)),
  );

  function colorFor(count: number) {
    if (count <= 0) return theme.surfaceAlt;
    if (count === 1) return theme.primaryMuted;
    if (count === 2) return theme.primary;
    return theme.streak;
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', gap: CELL_GAP }}>
        {weeks.map((week, weekIdx) => (
          <View key={weekIdx} style={{ gap: CELL_GAP }}>
            {week.map((date, dayIdx) => {
              const key = isoDateOnly(date);
              const count = activityByDate[key] ?? 0;
              const isFuture = date > today;
              return (
                <Pressable
                  key={dayIdx}
                  disabled={isFuture || !onDayPress}
                  onPress={() => onDayPress?.(key)}
                  style={{
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                    borderRadius: 3,
                    backgroundColor: isFuture ? 'transparent' : colorFor(count),
                  }}
                />
              );
            })}
          </View>
        ))}
      </View>
      <Text variant="caption" color="muted">
        {format(gridStart, 'MMM d')} – {format(today, 'MMM d')}
      </Text>
    </View>
  );
}
