import { View } from 'react-native';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';

export interface BarDatum {
  label: string;
  value: number;
}

/** Simple horizontal bar chart — flex-width bars, no SVG needed. Highlights the lowest-volume
 * (under-trained) group per PRD 4.4's "volume & frequency dashboard". */
export function VolumeBarChart({ data }: { data: BarDatum[] }) {
  const theme = useTheme();
  if (data.length === 0) return <Text color="muted">No volume logged in this period yet.</Text>;

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const minValue = Math.min(...data.map((d) => d.value));

  return (
    <View style={{ gap: spacing.sm }}>
      {data.map((d) => (
        <View key={d.label} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" weight="600" style={{ textTransform: 'capitalize' }}>
              {d.label} {d.value === minValue && d.value < maxValue * 0.5 ? '⚠️' : ''}
            </Text>
            <Text variant="caption" color="muted">
              {Math.round(d.value)}kg
            </Text>
          </View>
          <View style={{ height: 10, borderRadius: radius.full, backgroundColor: theme.surfaceAlt, overflow: 'hidden' }}>
            <View
              style={{
                height: '100%',
                width: `${Math.max(3, (d.value / maxValue) * 100)}%`,
                backgroundColor: theme.primary,
                borderRadius: radius.full,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
