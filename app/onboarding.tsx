import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useProfile, useUpdateProfile } from '@/hooks/useProfile';
import { useTheme, spacing, radius } from '@/lib/theme';
import type { UnitPreference } from '@/types/database.types';

const UNIT_OPTIONS: { value: UnitPreference; label: string }[] = [
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'lb', label: 'Pounds (lb)' },
];

/** M5 (Polish), Story 1: Onboarding — PRD §10 exit criterion "new-user activation path completes
 * with no dead ends". No Figma frame exists for this (§7.1 only reviewed Home/Add Workout/
 * Achievements/Leaderboard), so this is a lean, 3-step, skippable flow rather than a designed
 * mockup translated 1:1 — confirm the two profile settings that already exist with sensible
 * defaults (unit_preference, weekly_goal_days — which already drives rest_allowance), then route
 * straight into whichever of Add Workout's two already-built entry points (routine builder / quick
 * start) the user picks. Gated by app/_layout.tsx via profiles.onboarding_completed_at — every
 * branch here ends by setting that flag so a user can never get stuck here. */
export default function Onboarding() {
  const router = useRouter();
  const theme = useTheme();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const [step, setStep] = useState(0);

  async function finish(destination: '/(tabs)/home' | '/(tabs)/add-workout' | '/(tabs)/add-workout/routines/new') {
    await updateProfile.mutateAsync({ onboarding_completed_at: new Date().toISOString() });
    router.replace(destination);
  }

  return (
    <Screen scroll>
      <View style={{ flex: 1, justifyContent: 'space-between', minHeight: '90%', paddingTop: spacing.xxl, gap: spacing.xl }}>
        {step === 0 ? (
          <View style={{ gap: spacing.md }}>
            <Text style={{ fontSize: 40 }}>🏋️</Text>
            <Text variant="title">Welcome to GainQuest</Text>
            <Text color="muted">
              Build a routine, log a session, and watch every rep get compared to your last one automatically. The
              game is a scoreboard for progress you&apos;re already making.
            </Text>
          </View>
        ) : step === 1 ? (
          <View style={{ gap: spacing.lg }}>
            <View style={{ gap: spacing.xs }}>
              <Text variant="title">Quick setup</Text>
              <Text color="muted">You can change either of these later in Settings.</Text>
            </View>

            <View style={{ gap: spacing.sm }}>
              <Text weight="600">Units</Text>
              {UNIT_OPTIONS.map((opt) => {
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

            <View style={{ gap: spacing.sm }}>
              <Text weight="600">Training days per week</Text>
              <Text color="muted">This drives your streak and quest targets.</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => {
                  const active = profile?.weekly_goal_days === n;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => updateProfile.mutate({ weekly_goal_days: n })}
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: radius.full,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: active ? theme.primary : theme.surfaceAlt,
                      }}
                    >
                      <Text weight="700" style={{ color: active ? '#FFF' : theme.text }}>
                        {n}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            <Text style={{ fontSize: 40 }}>🚀</Text>
            <Text variant="title">Let&apos;s get moving</Text>
            <Text color="muted">Start with a structured routine, or jump straight into a workout.</Text>
          </View>
        )}

        <View style={{ gap: spacing.sm }}>
          {step === 0 ? (
            <Button label="Get started" onPress={() => setStep(1)} fullWidth />
          ) : step === 1 ? (
            <>
              <Button label="Continue" onPress={() => setStep(2)} fullWidth />
              <Button label="Skip for now" variant="ghost" onPress={() => finish('/(tabs)/home')} fullWidth />
            </>
          ) : (
            <>
              <Button
                label="Build a routine"
                onPress={() => finish('/(tabs)/add-workout/routines/new')}
                loading={updateProfile.isPending}
                fullWidth
              />
              <Button
                label="Quick start a workout"
                variant="secondary"
                onPress={() => finish('/(tabs)/add-workout')}
                loading={updateProfile.isPending}
                fullWidth
              />
              <Button label="Skip for now" variant="ghost" onPress={() => finish('/(tabs)/home')} fullWidth />
            </>
          )}
        </View>
      </View>
    </Screen>
  );
}
