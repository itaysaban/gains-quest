import { useState } from 'react';
import { View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth/AuthProvider';
import { spacing } from '@/lib/theme';

export default function SignIn() {
  const { signInWithPassword, signInWithOAuth } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setError(null);
    setLoading(true);
    const { error } = await signInWithPassword(email.trim(), password);
    setLoading(false);
    if (error) setError(error);
  }

  async function handleOAuth(provider: 'google' | 'apple') {
    setError(null);
    const { error } = await signInWithOAuth(provider);
    if (error) setError(error);
  }

  return (
    <Screen scroll>
      <View style={{ gap: spacing.lg, marginTop: spacing.xxl }}>
        <View style={{ gap: spacing.xs }}>
          <Text variant="title">Welcome back</Text>
          <Text color="muted">Log in to keep your streak alive.</Text>
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
          autoComplete="password"
          placeholder="••••••••"
        />

        {error ? <Text color="danger">{error}</Text> : null}

        <Button label="Log In" onPress={handleSignIn} loading={loading} fullWidth disabled={!email || !password} />

        <Link href="/(auth)/forgot-password" asChild>
          <Text color="primary" style={{ textAlign: 'center' }}>
            Forgot password?
          </Text>
        </Link>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="Google" variant="secondary" onPress={() => handleOAuth('google')} fullWidth />
          <Button label="Apple" variant="secondary" onPress={() => handleOAuth('apple')} fullWidth />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.xs }}>
          <Text color="muted">New here?</Text>
          <Text color="primary" weight="600" onPress={() => router.push('/(auth)/sign-up')}>
            Create an account
          </Text>
        </View>
      </View>
    </Screen>
  );
}
