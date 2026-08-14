import { View } from 'react-native';
import Svg, { Line, Circle, Polyline } from 'react-native-svg';
import { useTheme, spacing } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import { formatShortDate } from '@/lib/utils/date';

export interface ChartPoint {
  date: string; // ISO
  value: number;
}

export interface SecondarySeries {
  points: ChartPoint[];
  label: string;
  unit?: string;
}

const CHART_HEIGHT = 200;
const PADDING = 24;

/** Optional secondarySeries renders a second line on its own independent y-scale (volume and e1RM have
 * very different magnitudes) in a muted color, with a small legend — used to show e1RM + volume
 * simultaneously on the exercise history screen rather than only as a metric toggle. */
export function StrengthLineChart({
  points,
  unit = 'kg',
  secondarySeries,
}: {
  points: ChartPoint[];
  unit?: string;
  secondarySeries?: SecondarySeries;
}) {
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

  const secondaryValues = secondarySeries?.points.map((p) => p.value) ?? [];
  const secondaryMin = secondaryValues.length ? Math.min(...secondaryValues) : 0;
  const secondaryMax = secondaryValues.length ? Math.max(...secondaryValues) : 1;
  const secondaryRange = secondaryMax - secondaryMin || 1;

  return (
    <View style={{ gap: spacing.xs }}>
      {secondarySeries ? (
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Legend color={theme.primary} label="Est. 1RM" />
          <Legend color={theme.textMuted} label={secondarySeries.label} />
        </View>
      ) : null}
      <ChartSvg
        points={points}
        minValue={minValue}
        valueRange={valueRange}
        secondaryPoints={secondarySeries?.points}
        secondaryMin={secondaryMin}
        secondaryRange={secondaryRange}
        theme={theme}
      />
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

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: color }} />
      <Text variant="label" color="muted">
        {label}
      </Text>
    </View>
  );
}

function toCoords(points: ChartPoint[], min: number, range: number, viewWidth: number, usableWidth: number, usableHeight: number) {
  return points.map((p, i) => {
    const x = points.length === 1 ? viewWidth / 2 : PADDING + (i / (points.length - 1)) * usableWidth;
    const y = PADDING + usableHeight - ((p.value - min) / range) * usableHeight;
    return { x, y };
  });
}

function ChartSvg({
  points,
  minValue,
  valueRange,
  secondaryPoints,
  secondaryMin,
  secondaryRange,
  theme,
}: {
  points: ChartPoint[];
  minValue: number;
  valueRange: number;
  secondaryPoints?: ChartPoint[];
  secondaryMin: number;
  secondaryRange: number;
  theme: ReturnType<typeof useTheme>;
}) {
  // width is resolved responsively via viewBox + preserveAspectRatio="none"
  const viewWidth = 320;
  const usableWidth = viewWidth - PADDING * 2;
  const usableHeight = CHART_HEIGHT - PADDING * 2;

  const coords = toCoords(points, minValue, valueRange, viewWidth, usableWidth, usableHeight);
  const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(' ');

  const secondaryCoords = secondaryPoints?.length
    ? toCoords(secondaryPoints, secondaryMin, secondaryRange, viewWidth, usableWidth, usableHeight)
    : null;
  const secondaryPolylinePoints = secondaryCoords?.map((c) => `${c.x},${c.y}`).join(' ');

  return (
    <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${viewWidth} ${CHART_HEIGHT}`} preserveAspectRatio="none">
      <Line x1={PADDING} y1={CHART_HEIGHT - PADDING} x2={viewWidth - PADDING} y2={CHART_HEIGHT - PADDING} stroke={theme.border} strokeWidth={1} />
      {secondaryPolylinePoints ? (
        <Polyline points={secondaryPolylinePoints} fill="none" stroke={theme.textMuted} strokeWidth={2} strokeDasharray="4,3" strokeLinejoin="round" strokeLinecap="round" />
      ) : null}
      <Polyline points={polylinePoints} fill="none" stroke={theme.primary} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((c, i) => (
        <Circle key={i} cx={c.x} cy={c.y} r={4} fill={theme.primary} />
      ))}
    </Svg>
  );
}
