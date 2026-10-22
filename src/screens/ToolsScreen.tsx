import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { ToolTile } from '../components/tools/ToolTile';
import { useToolFlow } from '../components/tools/ToolFlow';
import { ScreenHeader, Text, useScreenHeader } from '../components/ui';
import { useT } from '../i18n/useT';
import { useIsPro } from '../services/pro/entitlement';
import { useRemoteConfig } from '../services/remote/remoteConfig';
import { getTool, TOOL_SECTIONS, toolBadge, toolsIn, type ToolBadge, type ToolDef } from '../services/tools/toolRegistry';
import { useAppSelector } from '../store/AppStateContext';
import { spacing, useTheme } from '../theme';

// §17 U8: the Tools tab, every tool the app has in one place: "Recently used" (the last four), then
// each section as a three-column grid. A tile starts the tool's flow (components/tools/ToolFlow:
// pick → options → run → result). The other entry points stay (Files' menus, the Reader).
export function ToolsScreen() {
  const { t } = useT();
  const { tokens } = useTheme();
  const header = useScreenHeader();
  const isPro = useIsPro();
  const { adsEnabled, proTasksFree } = useRemoteConfig();
  const recentIds = useAppSelector((s) => s.settings.recentTools);
  const flow = useToolFlow();
  const { open } = flow;

  const badgeOf = useCallback((tool: ToolDef): ToolBadge => toolBadge(tool, { isPro, adsEnabled, proTasksFree }), [isPro, adsEnabled, proTasksFree]);

  const sections = useMemo(
    () =>
      TOOL_SECTIONS.map((section) => ({ section, tools: toolsIn(section).filter((tool) => badgeOf(tool) !== 'hidden') })).filter(
        (s) => s.tools.length > 0
      ),
    [badgeOf]
  );
  const recent = useMemo(() => recentIds.map(getTool).filter((tool) => badgeOf(tool) !== 'hidden'), [recentIds, badgeOf]);

  const onPress = useCallback((tool: ToolDef) => open(tool.id), [open]);

  return (
    <View style={[styles.root, { backgroundColor: tokens.bg }]}>
      <ScreenHeader large scroll={header} title={t('tools.title')} />
      <Animated.ScrollView onScroll={header.onScroll} scrollEventThrottle={16} contentContainerStyle={[styles.content, { paddingTop: header.contentTop }]}>
        {recent.length > 0 ? (
          <View style={styles.section}>
            <Text variant="overline" color="muted" accessibilityRole="header" style={styles.sectionTitle}>
              {t('tools.recent')}
            </Text>
            <View style={styles.grid}>
              {recent.map((tool) => (
                <ToolTile key={tool.id} tool={tool} badge={badgeOf(tool)} onPress={onPress} style={styles.quarter} />
              ))}
            </View>
          </View>
        ) : null}
        {sections.map(({ section, tools }) => (
          <View key={section} style={styles.section}>
            <Text variant="overline" color="muted" accessibilityRole="header" style={styles.sectionTitle}>
              {t(`tools.section.${section}`)}
            </Text>
            <View style={styles.grid}>
              {tools.map((tool) => (
                <ToolTile key={tool.id} tool={tool} badge={badgeOf(tool)} onPress={onPress} style={styles.third} />
              ))}
            </View>
          </View>
        ))}
      </Animated.ScrollView>
      {flow.element}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: spacing.xl },
  section: { paddingTop: spacing.md },
  sectionTitle: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.sm },
  third: { width: '33.333%' },
  quarter: { width: '25%' },
});
