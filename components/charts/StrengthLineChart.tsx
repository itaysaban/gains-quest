import { View } from 'react-native';
import Svg, { Line, Circle, Polyline } from 'react-native-svg';
import { useTheme, spacing } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import { formatShortDate } from '@/lib/utils/date';

export interface ChartPoint {
  date: string; // ISO
  value: number;
}

const CHART_HEIGHT = 200;
const PADDING = 24;

export function StrengthLineChart({ points, unit = 'kg' }: { points: ChartPoint[]; unit?: string }) {
  const theme = useTheme();

  if (points.length === 0) {
    return (
      <View style={{ height: CHART_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
        <Text color="muted">Log a few sets to see your progression here.</Text>
      </View>
    );
  }

  const values = points.map((p) => p.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue || 1;

  return (
    <View style={{ gap: spacing.xs }}>
      <ChartSvg points={points} minValue={minValue} valueRange={valueRange} theme={theme} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" color="muted">
          {formatShortDate(points[0].date)}
        </Text>
        <Text variant="caption" weight="700">
          Best: {Math.round(maxValue * 10) / 10}
          {unit}
        </Text>
        <Text variant="caption" color="muted">
          {formatShortDate(points[points.length - 1].date)}
        </Text>
      </View>
    </View>
  );
}

function ChartSvg({
  points,
  minValue,
  valueRange,
  theme,
}: {
  points: ChartPoint[];
  minValue: number;
  valueRange: number;
  theme: ReturnType<typeof useTheme>;
}) {
  // width is resolved responsively via viewBox + preserveAspectRatio="none"
  const viewWidth = 320;
  const usableWidth = viewWidth - PADDING * 2;
  const usableHeight = CHART_HEIGHT - PADDING * 2;

  const coords = points.map((p, i) => {
    const x = points.length === 1 ? viewWidth / 2 : PADDING + (i / (points.length - 1)) * usableWidth;
    const y = PADDING + usableHeight - ((p.value - minValue) / valueRange) * usableHeight;
    return { x, y };
  });

  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(' ');

  return (
    <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${viewWidth} ${CHART_HEIGHT}`} preserveAspectRatio="none">
      <Line x1={PADDING} y1={CHART_HEIGHT - PADDING} x2={viewWidth - PADDING} y2={CHART_HEIGHT - PADDING} stroke={theme.border} strokeWidth={1} />
      <Polyline points={polylinePoints} fill="none" stroke={theme.primary} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((c, i) => (
        <Circle key={i} cx={c.x} cy={c.y} r={4} fill={theme.primary} />
      ))}
    </Svg>
  );
}
