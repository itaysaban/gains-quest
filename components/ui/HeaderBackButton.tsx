import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing } from '@/lib/theme';

/**
 * Explicit back button for the root screen of tabs hidden from the tab bar (Library, Progress,
 * Settings — see app/(tabs)/_layout.tsx's href:null entries). Navigating to one of these via
 * router.push() switches the active tab rather than pushing onto a stack, so no back button appears
 * by default; this makes the way back explicit instead of relying on tab-switch history semantics.
 */
export function HeaderBackButton() {
  const router = useRouter();
  const theme = useTheme();

  return (
    <Pressable onPress={() => router.back()} hitSlop={8} style={{ paddingRight: spacing.sm }}>
      <Ionicons name="chevron-back" size={26} color={theme.text} />
    </Pressable>
  );
}
