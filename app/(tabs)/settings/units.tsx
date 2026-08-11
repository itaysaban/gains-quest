import { View, Pressable } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useProfile, useUpdateProfile } from '@/hooks/useProfile';
import { useTheme, spacing, radius } from '@/lib/theme';
import type { UnitPreference } from '@/types/database.types';

const OPTIONS: { value: UnitPreference; label: string }[] = [
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'lb', label: 'Pounds (lb)' },
];

export default function UnitsSettings() {
  const theme = useTheme();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();

  return (
    <Screen scroll>
      <View style={{ gap: spacing.sm }}>
        <Text color="muted">Applies globally. Weight is always stored precisely — this only changes how it's displayed and entered.</Text>
        {OPTIONS.map((opt) => {
          const active = profile?.unit_preference === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => updateProfile.mutate({ unit_preference: opt.value })}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: spacing.md,
                borderRadius: radius.md,
                backgroundColor: active ? theme.primaryMuted : theme.surface,
                borderWidth: 1,
                borderColor: active ? theme.primary : theme.border,
              }}
            >
              <Text weight="600">{opt.label}</Text>
              {active ? <Text color="primary">✓</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
