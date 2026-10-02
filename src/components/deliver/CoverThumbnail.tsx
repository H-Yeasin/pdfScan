import { Image, StyleSheet, Text, View } from 'react-native';
import { layoutCover, type CoverTemplateId, type CoverValues } from '../../services/pdf/coverTemplates';
import { useTheme } from '../../theme';

const PAGE = { width: 595.28, height: 841.89 };
// A white sheet with dark ink, like the paper it stands for, in both themes.
const PAPER = '#ffffff';
const INK = '#1a1a1a';

// A small drawing of a cover from the same layoutCover items the PDF and the library copy use,
// with plain Views: text is a few pixels high, enough to see the arrangement.
export function CoverThumbnail({ templateId, values, width }: { templateId: CoverTemplateId; values: CoverValues; width: number }) {
  const { tokens } = useTheme();
  const scale = width / PAGE.width;
  const height = PAGE.height * scale;
  return (
    <View style={[styles.sheet, { width, height, borderColor: tokens.edge, backgroundColor: PAPER }]}>
      {layoutCover(templateId, values, PAGE).map((item, i) => {
        if (item.kind === 'text') {
          const fontSize = item.size * scale;
          const top = item.y * scale - fontSize;
          const position = item.align === 'center' ? { left: 0, right: 0, top } : { left: item.x * scale, right: 0, top };
          return (
            <Text
              key={i}
              allowFontScaling={false}
              numberOfLines={1}
              style={[
                styles.text,
                position,
                { fontSize, lineHeight: fontSize * 1.2, fontWeight: item.bold ? '700' : '400', textAlign: item.align },
              ]}
            >
              {item.text}
            </Text>
          );
        }
        if (item.kind === 'image') {
          return (
            <Image
              key={i}
              source={{ uri: item.uri }}
              resizeMode="contain"
              style={[styles.abs, { left: item.x * scale, top: item.y * scale, width: item.width * scale, height: item.height * scale }]}
            />
          );
        }
        if (item.kind === 'line') {
          return (
            <View
              key={i}
              style={[
                styles.abs,
                { left: item.x1 * scale, top: item.y1 * scale, width: (item.x2 - item.x1) * scale, height: Math.max(0.5, item.width * scale), backgroundColor: INK },
              ]}
            />
          );
        }
        return (
          <View
            key={i}
            style={[
              styles.abs,
              {
                left: item.x * scale,
                top: item.y * scale,
                width: item.width * scale,
                height: item.height * scale,
                borderWidth: Math.max(0.5, item.borderWidth * scale),
                borderColor: INK,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 3,
    overflow: 'hidden',
  },
  abs: {
    position: 'absolute',
  },
  text: {
    position: 'absolute',
    color: INK,
  },
});
