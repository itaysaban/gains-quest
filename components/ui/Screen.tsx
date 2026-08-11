import { ScrollView, View, type ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, spacing } from '@/lib/theme';

interface ScreenProps extends ViewProps {
  scroll?: boolean;
  padded?: boolean;
}

export function Screen({ children, scroll = false, padded = true, style, ...rest }: ScreenProps) {
  const theme = useTheme();
  const Container = scroll ? ScrollView : View;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'left', 'right']}>
      <Container
        style={
          scroll
            ? { padding: padded ? spacing.lg : 0 }
            : [{ flex: 1, padding: padded ? spacing.lg : 0 }, style]
        }
        contentContainerStyle={scroll ? { paddingBottom: spacing.xxl } : undefined}
        {...rest}
      >
        {children}
      </Container>
    </SafeAreaView>
  );
}
