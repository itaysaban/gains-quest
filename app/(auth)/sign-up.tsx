import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth/AuthProvider';
import { spacing } from '@/lib/theme';

export default function SignUp() {
  const { signUpWithPassword } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    setError(null);
    setInfo(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const { error } = await signUpWithPassword(email.trim(), password);
    setLoading(false);
    if (error) {
      setError(error);
    } else {
      setInfo('Check your email to confirm your account, then log in.');
    }
  }

  return (
    <Screen scroll>
      <View style={{ gap: spacing.lg, marginTop: spacing.xxl }}>
        <View style={{ gap: spacing.xs }}>
          <Text variant="title">Create your account</Text>
          <Text color="muted">Start building your own exercise library today.</Text>
        </View>

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          placeholder="you@example.com"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="At least 8 characters"
        />
        <TextField
          label="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          placeholder="••••••••"
        />

        {error ? <Text color="danger">{error}</Text> : null}
        {info ? <Text color="success">{info}</Text> : null}

        <Button
          label="Create Account"
          onPress={handleSignUp}
          loading={loading}
          fullWidth
          disabled={!email || !password || !confirmPassword}
        />

        <Text color="primary" weight="600" style={{ textAlign: 'center' }} onPress={() => router.back()}>
          Already have an account? Log in
        </Text>
      </View>
    </Screen>
  );
}
