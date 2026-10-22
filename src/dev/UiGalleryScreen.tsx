import { useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useRouter } from '../navigation/router';
import { ICONS, spacing, useTheme, type TypeVariant } from '../theme';
import {
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  FilterChip,
  IconButton,
  ListItem,
  ProgressBar,
  ScreenHeader,
  Skeleton,
  Text,
  TextField,
  useScreenHeader,
  type ButtonVariant,
} from '../components/ui';
import { SegmentedControl } from '../components/shared/SegmentedControl';

// Dev-only (Settings → Developer when __DEV__), §17 U2: every kit component in every variant, to
// check them by eye in both themes and at a larger font. The theme switch here is the app's own
// (it changes the whole app). Android has no per-screen font scale, so the 1.3 check is the phone's
// own setting (Settings → Display → Font size); the header shows the scale in use.

const VARIANTS: TypeVariant[] = ['display', 'headline', 'title', 'subtitle', 'body', 'bodyStrong', 'label', 'caption', 'overline', 'mono'];
const BUTTONS: ButtonVariant[] = ['primary', 'tonal', 'outline', 'ghost', 'danger', 'highlight'];
const THEMES = ['system', 'light', 'dark'] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="overline" color="muted">
        {title}
      </Text>
      {children}
    </View>
  );
}

export function UiGalleryScreen() {
  const { back } = useRouter();
  const { tokens, themePref, setThemePref } = useTheme();
  const { fontScale } = useWindowDimensions();
  const header = useScreenHeader({ subtitle: true });
  const [name, setName] = useState('Lecture 4');
  const [note, setNote] = useState('');
  const [filters, setFilters] = useState<Record<string, boolean>>({ notes: true, slides: false, exams: false });
  const [selected, setSelected] = useState(true);
  const [switched, setSwitched] = useState(true);
  const [progress, setProgress] = useState(0.4);
  const [loading, setLoading] = useState(false);

  return (
    <View style={[styles.root, { backgroundColor: tokens.bg }]}>
      <ScreenHeader
        large
        scroll={header}
        title="UI gallery"
        subtitle={`Font scale ${fontScale.toFixed(2)} · ${themePref}`}
        back={back}
        actions={[{ icon: ICONS.find, label: 'Find', onPress: () => {} }, { icon: ICONS.share, label: 'Share', onPress: () => {}, badge: 3 }]}
        onMore={() => {}}
      />
      <Animated.ScrollView
        onScroll={header.onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: header.contentTop }]}
      >
        <SegmentedControl
          segments={THEMES.map((id) => ({ id, label: id }))}
          value={themePref}
          onChange={(value) => setThemePref(value)}
        />

        <Section title="Text">
          {VARIANTS.map((v) => (
            <Text key={v} variant={v}>
              {v} · The quick brown fox
            </Text>
          ))}
          <Text weight="bold">body, weight bold</Text>
          <Text color="accentInk">accentInk</Text>
          <Text color="highlightInk">highlightInk</Text>
        </Section>

        <Section title="Button">
          {BUTTONS.map((variant) => (
            <View key={variant} style={styles.row}>
              <Button variant={variant} label={variant} icon={ICONS.share} onPress={() => {}} />
              <Button variant={variant} size="md" label="md" onPress={() => {}} />
              <Button variant={variant} size="sm" label="sm" onPress={() => {}} />
            </View>
          ))}
          <Button label="Save (tap: loading)" loading={loading} fullWidth onPress={() => {
            setLoading(true);
            setTimeout(() => setLoading(false), 1500);
          }} />
          <Button label="Disabled" disabled fullWidth />
        </Section>

        <Section title="IconButton">
          <View style={styles.row}>
            <IconButton icon={ICONS.find} accessibilityLabel="plain" onPress={() => {}} />
            <IconButton icon={ICONS.mark} accessibilityLabel="tonal" variant="tonal" onPress={() => {}} />
            <IconButton icon={ICONS.scan} accessibilityLabel="filled" variant="filled" onPress={() => {}} />
            <IconButton icon={ICONS.notes} accessibilityLabel="selected" selected onPress={() => {}} />
            <IconButton icon={ICONS.bookmark} accessibilityLabel="badge" badge onPress={() => {}} />
            <IconButton icon={ICONS.share} accessibilityLabel="count" badge={120} onPress={() => {}} />
            <IconButton icon={ICONS.delete} accessibilityLabel="sm" size="sm" onPress={() => {}} />
            <IconButton icon={ICONS.lock} accessibilityLabel="disabled" disabled />
          </View>
        </Section>

        <Section title="Card">
          <Card>
            <Text variant="subtitle">surface</Text>
            <Text variant="caption" color="muted">elevation 1</Text>
          </Card>
          <Card tone="tinted" tint="blue" onPress={() => {}} accessibilityLabel="tinted blue">
            <Text variant="subtitle" color={tokens.courseColors.blue}>tinted · blue (pressable)</Text>
          </Card>
          <Card tone="tinted" tint="orange">
            <Text variant="subtitle" color={tokens.courseColors.orange}>tinted · orange</Text>
          </Card>
          <Card tone="accent">
            <Text variant="subtitle" color="accentInk">accent</Text>
          </Card>
          <Card tone="highlight">
            <Text variant="subtitle" color="highlightInk">highlight</Text>
          </Card>
          <Card elevation={3}>
            <Text variant="subtitle">elevation 3</Text>
          </Card>
        </Section>

        <Section title="ListItem">
          <Card padded={false}>
            <ListItem title="Chevron" subtitle="With a subtitle" icon={ICONS.course} trailing="chevron" onPress={() => {}} />
            <Divider inset="icon" />
            <ListItem title="More" meta="2 MB" icon={ICONS.files} trailing="more" onPress={() => {}} onMore={() => {}} />
            <Divider inset="icon" />
            <ListItem title="Switch" icon={ICONS.lock} switchValue={switched} onValueChange={setSwitched} />
            <Divider inset="icon" />
            <ListItem title="Selectable (tap)" subtitle="Checkbox state" selected={selected} onPress={() => setSelected(!selected)} />
            <Divider />
            <ListItem title="Delete" icon={ICONS.delete} danger onPress={() => {}} />
            <ListItem title="Disabled" icon={ICONS.pro} disabled onPress={() => {}} />
          </Card>
        </Section>

        <Section title="Chip">
          <View style={styles.wrap}>
            {Object.keys(filters).map((key) => (
              <FilterChip
                key={key}
                label={key}
                count={key === 'notes' ? 12 : undefined}
                selected={filters[key]}
                onPress={() => setFilters({ ...filters, [key]: !filters[key] })}
              />
            ))}
            <Chip label="Physics" icon={ICONS.course} onRemove={() => {}} />
            <Chip label="Action" onPress={() => {}} />
            <Chip label="Disabled" disabled onPress={() => {}} />
          </View>
        </Section>

        <Section title="TextField">
          <TextField label="Name" value={name} onChangeText={setName} helper="Shown on the cover" clearable icon={ICONS.rename} />
          <TextField label="Error" value="" onChangeText={() => {}} placeholder="Required" error="Give it a name" />
          <TextField label="Multiline" value={note} onChangeText={setNote} multiline placeholder="Notes…" />
          <TextField label="Not editable" value="Read only" onChangeText={() => {}} editable={false} />
        </Section>

        <Section title="Badge">
          <View style={styles.row}>
            <Badge kind="pro" />
            <Badge kind="new" />
            <Badge count={3} />
            <Badge count={250} tone="danger" />
            <Badge label="Beta" tone="neutral" />
            <Badge />
          </View>
        </Section>

        <Section title="ProgressBar">
          <ProgressBar value={progress} />
          <View style={styles.row}>
            <Button size="sm" variant="tonal" label="-10%" onPress={() => setProgress(Math.max(0, progress - 0.1))} />
            <Button size="sm" variant="tonal" label="+10%" onPress={() => setProgress(Math.min(1, progress + 0.1))} />
          </View>
          <ProgressBar />
          <ProgressBar value={0.75} tone="highlight" height={8} />
        </Section>

        <Section title="Skeleton">
          <Skeleton height={20} width="60%" />
          <Skeleton height={14} />
          <Skeleton height={96} radius={20} />
        </Section>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
