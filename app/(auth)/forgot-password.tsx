import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth/AuthProvider';
import { spacing } from '@/lib/theme';

export default function ForgotPassword() {
  const { sendPasswordReset, sendMagicLink } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    setError(null);
    setInfo(null);
    setLoading(true);
    const { error } = await sendPasswordReset(email.trim());
    setLoading(false);
    if (error) setError(error);
    else setInfo('Password reset email sent — check your inbox.');
  }

  async function handleMagicLink() {
    setError(null);
    setInfo(null);
    setLoading(true);
    const { error } = await sendMagicLink(email.trim());
    setLoading(false);
    if (error) setError(error);
    else setInfo('Magic sign-in link sent — check your inbox.');
  }

  return (
    <Screen scroll>
      <View style={{ gap: spacing.lg, marginTop: spacing.xxl }}>
        <View style={{ gap: spacing.xs }}>
          <Text variant="title">Reset access</Text>
          <Text color="muted">We'll email you a reset link, or a one-tap magic sign-in link.</Text>
        </View>

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
        />

        {error ? <Text color="danger">{error}</Text> : null}
        {info ? <Text color="success">{info}</Text> : null}

        <Button label="Send Reset Email" onPress={handleReset} loading={loading} fullWidth disabled={!email} />
        <Button label="Send Magic Link" variant="secondary" onPress={handleMagicLink} fullWidth disabled={!email} />

        <Text color="primary" weight="600" style={{ textAlign: 'center' }} onPress={() => router.back()}>
          Back to log in
        </Text>
      </View>
    </Screen>
  );
}
