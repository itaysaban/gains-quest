import { View, ActivityIndicator } from 'react-native';
import { useTheme } from '@/lib/theme';

export function LoadingState() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={theme.primary} size="large" />
    </View>
  );
}
