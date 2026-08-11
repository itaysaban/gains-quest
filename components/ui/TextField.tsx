import { TextInput, View, type TextInputProps } from 'react-native';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from './Text';

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function TextField({ label, error, style, ...rest }: TextFieldProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      {label ? (
        <Text variant="label" color="muted" weight="600">
          {label.toUpperCase()}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={theme.textMuted}
        style={[
          {
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: error ? theme.danger : theme.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            fontSize: 15,
            color: theme.text,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
