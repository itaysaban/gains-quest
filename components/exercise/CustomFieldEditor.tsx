import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import type { CustomFieldDef } from '@/types/database.types';

export function CustomFieldEditor({
  fields,
  onChange,
}: {
  fields: CustomFieldDef[];
  onChange: (fields: CustomFieldDef[]) => void;
}) {
  const theme = useTheme();

  function addField() {
    onChange([...fields, { key: `field_${fields.length + 1}`, label: '', type: 'text' }]);
  }

  function updateField(idx: number, patch: Partial<CustomFieldDef>) {
    const next = [...fields];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }

  function removeField(idx: number) {
    onChange(fields.filter((_, i) => i !== idx));
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="label" color="muted" weight="600">
          CUSTOM FIELDS
        </Text>
        <Pressable onPress={addField} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="add-circle" size={18} color={theme.primary} />
          <Text color="primary" weight="600" variant="caption">
            Add field
          </Text>
        </Pressable>
      </View>

      {fields.map((field, idx) => (
        <View
          key={idx}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            backgroundColor: theme.surfaceAlt,
            padding: spacing.sm,
            borderRadius: radius.md,
          }}
        >
          <View style={{ flex: 1 }}>
            <TextField
              placeholder="e.g. Band Color"
              value={field.label}
              onChangeText={(text) =>
                updateField(idx, { label: text, key: text.trim().toLowerCase().replace(/\s+/g, '_') || field.key })
              }
            />
          </View>
          <Pressable
            onPress={() => updateField(idx, { type: field.type === 'text' ? 'number' : 'text' })}
            style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}
          >
            <Text variant="caption" color="primary" weight="600">
              {field.type}
            </Text>
          </Pressable>
          <Pressable onPress={() => removeField(idx)} hitSlop={8}>
            <Ionicons name="trash-outline" size={18} color={theme.textMuted} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
