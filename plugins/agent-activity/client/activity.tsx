import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { copyText, Icon, ScrollView, useRevealedText } from "@getpaseo/plugin/client/react-native";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";
import {
  activityIcon, detailSections, presentValue, previewText, rawValue, renderReadable, MAX_FORMAT_CHARS, PREVIEW_CHARS, PREVIEW_LINES,
  type DetailSection, type ReadableSegment, type TextPreview,
} from "../shared/details";
import { headerSummary } from "../shared/summary";
import { parseInlineMarkdown, parseReasoningMarkdown } from "../shared/markdown";
import type { DiffLine } from "../shared/presentation";
import type { ReasoningItemData, ToolCallItemData } from "../shared/timeline";
import { useSyntaxTokens } from "./highlight";

type Theme = PluginTimelineItemProps["theme"];
type Layout = PluginTimelineItemProps["layout"];

function useStyles(theme: Theme, layout: Layout) {
  return useMemo(() => {
    const { colors } = theme;
    return {
      row: { minWidth: 0 } satisfies ViewStyle,
      header: {
        flexDirection: "row", alignItems: "center", gap: 6,
        // Paseo 0.8 adds 16px between plugin items (unlike native tool rows).
        // Keep desktop content to one 16px line: 16 + host 16 = 32px pitch.
        // Do not cancel the host gap with negative margins: final/footer gaps can be zero.
        minHeight: layout.compact ? 44 : 16, minWidth: 0,
        paddingHorizontal: 2, paddingVertical: layout.compact ? 4 : 0, borderRadius: 4,
      } satisfies ViewStyle,
      title: { color: colors.foreground, fontSize: 13, lineHeight: layout.compact ? 20 : 16, flexShrink: 1, minWidth: 0, maxWidth: "60%" } satisfies TextStyle,
      summary: { color: colors.foregroundMuted, fontSize: 12, lineHeight: layout.compact ? 20 : 16, flexShrink: 1, minWidth: 0, maxWidth: layout.compact ? "45%" : 320 } satisfies TextStyle,
      status: { color: colors.foregroundMuted, fontSize: 11, lineHeight: layout.compact ? 18 : 16 } satisfies TextStyle,
      body: { marginLeft: 20, paddingTop: 4, paddingBottom: 8, gap: 14, minWidth: 0 } satisfies ViewStyle,
      section: { gap: 5, minWidth: 0 } satisfies ViewStyle,
      toolbar: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 } satisfies ViewStyle,
      label: { color: colors.foregroundMuted, fontSize: 11, lineHeight: 18, flex: 1 } satisfies TextStyle,
      action: { paddingHorizontal: 5, paddingVertical: layout.compact ? 8 : 3, borderRadius: 3 } satisfies ViewStyle,
      actionText: { color: colors.foregroundMuted, fontSize: 11, lineHeight: 18 } satisfies TextStyle,
      code: {
        backgroundColor: colors.surface1, padding: 10, borderRadius: 4,
        minWidth: "100%",
      } satisfies ViewStyle,
      codeText: { color: colors.foreground, fontFamily: "monospace", fontSize: 12, lineHeight: 19 } satisfies TextStyle,
      prose: { color: colors.foreground, fontSize: 13, lineHeight: 21 } satisfies TextStyle,
      scroll: { maxHeight: layout.compact ? 280 : 360 } satisfies ViewStyle,
      message: { color: colors.foregroundMuted, fontSize: 11, lineHeight: 18 } satisfies TextStyle,
      error: { color: colors.statusDanger, fontSize: 12, lineHeight: 19 } satisfies TextStyle,
      stats: { flexDirection: "row", gap: 5 } satisfies ViewStyle,
    };
  }, [theme, layout.compact]);
}
type Styles = ReturnType<typeof useStyles>;

function QuietButton({ label, children, onPress, theme, style, expanded, disabled }: {
  label: string; children: ReactNode | ((active: boolean) => ReactNode); onPress: () => void;
  theme: Theme; style: ViewStyle; expanded?: boolean; disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ ...(expanded !== undefined ? { expanded } : {}), disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        style,
        (hovered || pressed) && { backgroundColor: theme.colors.surface1 },
        focused && { outlineColor: theme.colors.accent, outlineWidth: 1, outlineStyle: "solid" },
      ]}
    >
      {typeof children === "function" ? children(hovered || focused) : children}
    </Pressable>
  );
}

function Header({ title, summary, icon, status, expanded, toggle, styles, theme, stats, monospace }: {
  title: string; summary?: string; icon?: string; status?: ToolCallItemData["status"];
  expanded: boolean; toggle: () => void; styles: Styles; theme: Theme;
  stats?: { additions: number; deletions: number }; monospace?: boolean;
}) {
  return (
    <QuietButton label={(expanded ? "Collapse " : "Expand ") + title} expanded={expanded} onPress={toggle} theme={theme} style={styles.header}>
      {icon ? <Icon name={icon} size={14} color={theme.colors.foregroundMuted} /> : null}
      <Text numberOfLines={1} style={styles.title}>{title}</Text>
      <Text numberOfLines={1} style={[styles.summary, monospace && { fontFamily: "monospace" }]}>{summary ?? ""}</Text>
      <View style={{ flex: 1 }} />
      {stats && (stats.additions > 0 || stats.deletions > 0) ? (
        <View style={styles.stats}>
          <Text style={[styles.status, { color: theme.colors.statusSuccess }]}>{"+" + stats.additions}</Text>
          <Text style={[styles.status, { color: theme.colors.statusDanger }]}>{"−" + stats.deletions}</Text>
        </View>
      ) : null}
      {status === "running" ? (
        <ActivityIndicator accessibilityLabel="Running" color={theme.colors.foregroundMuted} size="small" style={{ width: 14, height: 14, transform: [{ scale: 0.65 }] }} />
      ) : status === "failed" ? (
        <><Icon name="X" size={12} color={theme.colors.statusDanger} /><Text style={[styles.error, { lineHeight: styles.title.lineHeight }]}>Failed</Text></>
      ) : status === "canceled" ? <Text style={styles.status}>Canceled</Text> : null}
    </QuietButton>
  );
}

function CodeContent({ code, language, diff, theme, styles }: {
  code: string; language: string; diff?: DiffLine[]; theme: Theme; styles: Styles;
}) {
  const tokens = useSyntaxTokens(code, diff ? "text" : language, theme.colors);
  const wrap = !diff && (language === "text" || language === "json");
  const content = (
      <View style={[styles.code, wrap && { minWidth: 0, width: "100%" }]}>
        {diff ? diff.map((line, index) => (
          <Text key={index} selectable style={[styles.codeText, {
            color: line.kind === "add" ? theme.colors.statusSuccess : line.kind === "remove" ? theme.colors.statusDanger : line.kind === "meta" ? theme.colors.foregroundMuted : theme.colors.foreground,
          }]}>
            {(line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " ") + line.text}
          </Text>
        )) : tokens ? tokens.map((line, index) => (
          <Text key={index} selectable style={styles.codeText}>
            {line.length ? line.map((token, tokenIndex) => (
              <Text key={tokenIndex} style={{ color: token.color ?? theme.colors.foreground }}>{token.content}</Text>
            )) : " "}
          </Text>
        )) : <Text selectable style={styles.codeText}>{code || " "}</Text>}
      </View>
  );
  return wrap ? content : <ScrollView horizontal nestedScrollEnabled contentContainerStyle={{ flexGrow: 1 }}>{content}</ScrollView>;
}

function ReadableSegments({ segments, theme, styles }: {
  segments: ReadableSegment[]; theme: Theme; styles: Styles;
}) {
  // Copy retains exact logical separators; newline-only Text nodes add extra
  // line boxes on React Native Web, so visual blocks use a small fixed gap.
  return <View style={{ gap: 6, minWidth: 0 }}>
    {segments.map((segment, index) => {
      if (segment.kind === "status") {
        const statusStyle = segment.tone === "error"
          ? styles.error
          : [styles.message, segment.tone === "warning" && { color: theme.colors.statusWarning }];
        return <View key={index} style={{ minWidth: 0 }}><Text selectable style={statusStyle}>{segment.text || " "}</Text></View>;
      }
      return <View key={index} style={{ minWidth: 0 }}><CodeContent code={segment.text} language={segment.language} theme={theme} styles={styles} /></View>;
    })}
  </View>;
}

function Section({ section, theme, styles, running }: {
  section: DetailSection; theme: Theme; styles: Styles; running?: boolean;
}) {
  const [raw, setRaw] = useState(false);
  const [all, setAll] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "pending" | "copied" | "failed">("idle");
  const copyRequest = useRef(0);
  useEffect(() => {
    copyRequest.current += 1;
    setCopyState("idle");
    return () => { copyRequest.current += 1; };
  }, [section.value, section.raw, raw]);
  const readable = !raw ? section.readable : undefined;
  // Do not stringify a multi-megabyte envelope/base64 payload merely to show twenty text lines.
  const value = useMemo(() => readable ? undefined : presentValue(section.value, section.language), [readable, section.value, section.language]);
  const source = useMemo(() => raw
    ? section.raw !== undefined ? rawValue(section.raw) : value?.raw ?? ""
    : value?.text ?? "", [raw, section.raw, value]);
  const preview = useMemo(() => readable ? renderReadable(readable) : previewText(source), [readable, source]);
  const rendered: TextPreview = useMemo(() => all ? (readable ? renderReadable(readable, true) : { text: source, truncated: false }) : preview, [all, readable, source, preview]);
  const visible = rendered.text;
  const copy = async () => {
    const request = ++copyRequest.current;
    setCopyState("pending");
    try {
      await copyText(readable ? renderReadable(readable, true).text : source);
      if (request === copyRequest.current) setCopyState("copied");
    } catch {
      if (request === copyRequest.current) setCopyState("failed");
    }
  };
  const canRaw = !!section.readable || value?.canFormat || section.raw !== undefined;
  const formatLimited = readable
    ? rendered.formatLimited === true
    : !raw && !value?.canFormat && (value?.formatLimited === true || source.length > MAX_FORMAT_CHARS && /^\s*[[{]/.test(source.slice(0, 256)));
  const readableSegments = !raw && readable ? rendered.segments : undefined;
  const content = section.prose && !raw
    ? <Text selectable style={section.label === "Error" ? styles.error : styles.prose}>{visible}</Text>
    : readableSegments
      ? <ReadableSegments segments={readableSegments} theme={theme} styles={styles} />
      : <CodeContent code={visible} language={raw ? "text" : rendered.language ?? readable?.language ?? value?.language ?? "text"} diff={!raw && (!preview.truncated || all) ? section.diff : undefined} theme={theme} styles={styles} />;
  return (
    <View style={styles.section}>
      <View style={styles.toolbar}>
        <Text style={styles.label}>{section.label}</Text>
        {canRaw ? (
          <QuietButton label={(raw ? "Format " : "Show raw ") + section.label} onPress={() => { setRaw(!raw); setCopyState("idle"); }} theme={theme} style={styles.action}>
            <Text style={styles.actionText}>{raw ? (section.readable ? "Readable" : "Formatted") : "Raw"}</Text>
          </QuietButton>
        ) : null}
        <QuietButton label={"Copy " + section.label} onPress={() => { void copy(); }} disabled={copyState === "pending"} theme={theme} style={styles.action}>
          <Text style={styles.actionText}>{copyState === "copied" ? "Copied" : copyState === "pending" ? "Copying…" : "Copy"}</Text>
        </QuietButton>
      </View>
      {readable ? <Text style={styles.message}>{readable.note}</Text> : null}
      {formatLimited ? <Text style={styles.message}>Formatting limit · Showing original text with wrapping</Text> : null}
      {preview.truncated && !all ? <Text style={styles.message}>Preview limit · First {PREVIEW_LINES} lines / {PREVIEW_CHARS.toLocaleString()} characters</Text> : null}
      {visible === "" || (running && section.label === "Output" && section.value == null) ? <Text style={styles.message}>{running && section.label === "Output" ? "Waiting for output…" : "Empty"}</Text> : (
        <ScrollView nestedScrollEnabled style={styles.scroll}>{content}</ScrollView>
      )}
      {preview.truncated ? (
        <QuietButton label={(all ? "Show less " : "Show all ") + section.label} onPress={() => setAll(!all)} theme={theme} style={styles.action}>
          <Text style={styles.actionText}>{all ? "Show less" : readable ? "Preview · Show all" : "Preview · Show all (" + source.length.toLocaleString() + " characters)"}</Text>
        </QuietButton>
      ) : null}
      {copyState === "failed" ? <Text accessibilityRole="alert" style={styles.error}>Copy failed. Select the text to copy manually.</Text> : null}
    </View>
  );
}

function Details({ data, theme, styles }: { data: ToolCallItemData; theme: Theme; styles: Styles }) {
  const sections = useMemo(() => detailSections(data), [data]);
  return (
    <View style={styles.body}>
      {sections.map((section) => <Section key={section.label} section={section} theme={theme} styles={styles} running={data.status === "running"} />)}
    </View>
  );
}

export function ToolActivity({ item, theme, layout }: PluginTimelineItemProps<ToolCallItemData>) {
  const styles = useStyles(theme, layout);
  const [expanded, setExpanded] = useState(false);
  const data = item.data;
  const presentation = data.presentation;
  return (
    <View style={styles.row}>
      <Header title={presentation.label} summary={headerSummary(presentation, layout.compact)}
        icon={presentation.icon || activityIcon(presentation.category)} status={data.status}
        expanded={expanded} toggle={() => setExpanded(!expanded)}
        styles={styles} theme={theme} stats={presentation.diffStats}
        monospace={presentation.category === "shell" || !!presentation.filePath} />
      {expanded ? <Details data={data} theme={theme} styles={styles} /> : null}
    </View>
  );
}

function InlineText({ text, styles, theme }: { text: string; styles: Styles; theme: Theme }) {
  return <>{parseInlineMarkdown(text).map((part, index) => (
    <Text key={index} style={[
      styles.prose,
      part.type === "bold" && { fontWeight: "600" },
      part.type === "italic" && { fontStyle: "italic" },
      part.type === "code" && { fontFamily: "monospace", backgroundColor: theme.colors.surface1 },
    ]}>{part.text}</Text>
  ))}</>;
}
function ReasoningBody({ data, styles, theme }: { data: ReasoningItemData; styles: Styles; theme: Theme }) {
  const [all, setAll] = useState(false);
  const preview = previewText(data.text);
  const text = useRevealedText(all ? data.text : preview.text, data.phase);
  // Keep Show all available without building a Markdown node for every huge-output line.
  const plain = text.length > MAX_FORMAT_CHARS;
  const blocks = useMemo(() => plain ? [] : parseReasoningMarkdown(text), [plain, text]);
  return (
    <View style={styles.body}>
      <ScrollView style={styles.scroll} nestedScrollEnabled>
        <View style={{ gap: 5 }}>
          {plain ? <Text selectable style={styles.prose}>{text}</Text> : null}
          {blocks.map((block, index) => {
            if (block.type === "spacer") return <View key={index} style={{ height: 3 }} />;
            if (block.type === "code") return <CodeContent key={index} code={block.text} language={block.language ?? "text"} theme={theme} styles={styles} />;
            return (
              <Text key={index} selectable style={[
                styles.prose,
                block.type === "heading" && { fontWeight: "600" },
                block.type === "quote" && { color: theme.colors.foregroundMuted },
              ]}>
                {block.type === "unordered" ? "• " : block.type === "ordered" ? block.marker + " " : ""}
                <InlineText text={block.text} styles={styles} theme={theme} />
              </Text>
            );
          })}
        </View>
      </ScrollView>
      {preview.truncated ? <QuietButton label={all ? "Show less reasoning" : "Show all reasoning"} onPress={() => setAll(!all)} theme={theme} style={styles.action}>
        <Text style={styles.actionText}>{all ? "Show less" : "Preview · Show all"}</Text>
      </QuietButton> : null}
    </View>
  );
}
export function ReasoningActivity({ item, theme, layout }: PluginTimelineItemProps<ReasoningItemData>) {
  const styles = useStyles(theme, layout);
  const [expanded, setExpanded] = useState(false);
  const running = item.data.phase === "streaming";
  return (
    <View style={styles.row}>
      <QuietButton label={expanded ? "Collapse Thinking" : "Expand Thinking"} expanded={expanded}
        onPress={() => setExpanded(!expanded)} theme={theme} style={styles.header}>
        {(active) => <>
          <Icon name="Brain" size={12} color={active || expanded ? theme.colors.foreground : theme.colors.foregroundMuted} />
          <Text numberOfLines={1} style={{ ...styles.title, fontSize: 14, fontWeight: "400",
            color: active || expanded || running ? theme.colors.foreground : theme.colors.foregroundMuted,
            opacity: running ? 0.72 : 1 }}>Thinking</Text>
          <View style={{ flex: 1 }} />
          {running ? <ActivityIndicator accessibilityLabel="Running" color={theme.colors.foregroundMuted} size="small" style={{ width: 14, height: 14, transform: [{ scale: 0.65 }] }} /> : null}
        </>}
      </QuietButton>
      {expanded ? <ReasoningBody data={item.data} styles={styles} theme={theme} /> : null}
    </View>
  );
}
