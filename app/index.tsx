import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth/AuthProvider';
import { LoadingState } from '@/components/ui/LoadingState';

export default function Index() {
  const { session, isLoading } = useAuth();

  if (isLoading) return <LoadingState />;

  return <Redirect href={session ? '/(tabs)/home' : '/(auth)/sign-in'} />;
}
