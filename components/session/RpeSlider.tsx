import { View } from 'react-native';
import Slider from '@react-native-community/slider';
import { useTheme, spacing } from '@/lib/theme';
import { Text } from '@/components/ui/Text';

export function RpeSlider({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const theme = useTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="label" color="muted" weight="600">
          RPE (OPTIONAL)
        </Text>
        <Text variant="label" color="primary" weight="700">
          {value ?? '—'}
        </Text>
      </View>
      <Slider
        minimumValue={0}
        maximumValue={10}
        step={0.5}
        value={value ?? 0}
        onSlidingComplete={(v) => onChange(v === 0 ? null : v)}
        minimumTrackTintColor={theme.primary}
        maximumTrackTintColor={theme.surfaceAlt}
        thumbTintColor={theme.primary}
      />
    </View>
  );
}
