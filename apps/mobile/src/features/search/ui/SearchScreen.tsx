/**
 * Search screen (§F1) — the app-wide search opened from the home header. WhatsApp/Slack
 * parity: an "Ask Vel AI or Search" field, scrollable type filters (All · Unread ·
 * Photos · Videos · Links · Docs · Audio · Contacts), a frequent-contacts row, and a
 * rich multi-type result list (chats, messages, files, media, links, contacts) with the
 * matched term highlighted. Fully theme-aware (light + dark) via design tokens.
 *
 * The result feed is placeholder data for now — the real source is the search-service
 * (`/search`) + the local DB, wired in a later slice. It is shaped so swapping the
 * source is a drop-in: the UI, filtering, and highlighting all stay as-is.
 */
import React, { useMemo, useRef, useState } from 'react';
import { View, TextInput, Pressable, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../theme';
import { useTranslation } from '../../../i18n';
import {
  Text,
  SearchIcon,
  SparkleIcon,
  SlidersIcon,
  ChevronRightIcon,
  ChatIcon,
  ImageIcon,
  VideoIcon,
  LinkIcon,
  FileTextIcon,
  HeadphonesIcon,
  UserIcon,
  PlayIcon,
  type IconProps,
} from '../../../design-system';
import type { RootStackParamList } from '../../../navigation/types';

type ResultKind =
  | 'chat'
  | 'message'
  | 'image'
  | 'video'
  | 'file'
  | 'audio'
  | 'link'
  | 'contact';

interface SearchResult {
  id: string;
  kind: ResultKind;
  title: string;
  subtitle: string;
  time?: string;
  unread?: boolean;
}

// Placeholder feed (see file header). Ordered newest-first, mixed types.
const RESULTS: readonly SearchResult[] = [
  {
    id: 'r1',
    kind: 'chat',
    title: 'Rahul Sharma',
    subtitle: 'You: Resume bhej diya.',
    time: 'Yesterday',
    unread: true,
  },
  {
    id: 'r2',
    kind: 'file',
    title: 'Resume.pdf',
    subtitle: '2.4 MB · Shared by Rahul Sharma',
    time: 'Yesterday',
  },
  {
    id: 'r3',
    kind: 'file',
    title: 'Resume_Final.docx',
    subtitle: '1.1 MB · Shared in HR Team',
    time: '3d ago',
  },
  {
    id: 'r4',
    kind: 'image',
    title: 'Resume Screenshot.png',
    subtitle: 'Image · In chat with Rahul Sharma',
    time: '2d ago',
  },
  {
    id: 'r5',
    kind: 'image',
    title: 'My Resume 2025.jpg',
    subtitle: 'Image · In chat with you',
    time: '5d ago',
  },
  {
    id: 'r6',
    kind: 'video',
    title: 'Resume Tips.mp4',
    subtitle: 'Video · Shared by Aman Verma',
    time: '1w ago',
  },
  {
    id: 'r7',
    kind: 'audio',
    title: 'Voice note',
    subtitle: '0:42 · From Riya Singh',
    time: '4d ago',
  },
  {
    id: 'r8',
    kind: 'link',
    title: 'Resume — Google Drive',
    subtitle: 'drive.google.com/drive/folders/1abc…',
    time: '2d ago',
  },
  {
    id: 'r9',
    kind: 'link',
    title: 'Rahul Sharma | LinkedIn',
    subtitle: 'linkedin.com/in/rahul_sharma',
    time: '1w ago',
  },
  {
    id: 'r10',
    kind: 'message',
    title: 'Aman Verma',
    subtitle: 'Sent the resume template link',
    time: '1w ago',
    unread: true,
  },
  {
    id: 'r11',
    kind: 'contact',
    title: 'Rahul Sharma',
    subtitle: '+91 98266 52257',
  },
];

const FREQUENT: readonly string[] = [
  'Rahul Sharma',
  'Riya Singh',
  'Aman Verma',
  'Karan Malhotra',
  'Ishita Mehta',
];

interface FilterDef {
  key: string;
  icon?: React.FC<IconProps>;
  kinds: readonly ResultKind[] | null;
  unreadOnly?: boolean;
}

const FILTERS: readonly FilterDef[] = [
  { key: 'all', kinds: null },
  {
    key: 'unread',
    icon: ChatIcon,
    kinds: ['chat', 'message'],
    unreadOnly: true,
  },
  { key: 'photos', icon: ImageIcon, kinds: ['image'] },
  { key: 'videos', icon: VideoIcon, kinds: ['video'] },
  { key: 'links', icon: LinkIcon, kinds: ['link'] },
  { key: 'docs', icon: FileTextIcon, kinds: ['file'] },
  { key: 'audio', icon: HeadphonesIcon, kinds: ['audio'] },
  { key: 'contacts', icon: UserIcon, kinds: ['contact'] },
];

const UNREAD_COUNT = RESULTS.filter(r => r.unread).length;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Render `text` with each case-insensitive occurrence of `query` emphasised. Keeps the
 * SAME type metrics for the highlighted span (only weight + colour change) so the line
 * never reflows. */
function Highlight({
  text,
  query,
  variant,
  color,
  numberOfLines,
}: {
  text: string;
  query: string;
  variant: 'label' | 'caption' | 'body';
  color: 'primary' | 'secondary';
  numberOfLines?: number;
}): React.JSX.Element {
  const t = useTheme();
  const q = query.trim();
  // exactOptionalPropertyTypes: only pass numberOfLines when it's actually set.
  const numProps = numberOfLines !== undefined ? { numberOfLines } : {};
  if (!q) {
    return (
      <Text variant={variant} color={color} {...numProps}>
        {text}
      </Text>
    );
  }
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'ig'));
  const lower = q.toLowerCase();
  return (
    <Text variant={variant} color={color} {...numProps}>
      {parts.map((p, i) =>
        p.toLowerCase() === lower && p !== '' ? (
          <Text
            key={i}
            variant={variant}
            style={{
              color: t.colors.brandFrom,
              fontFamily: t.typography.label.fontFamily,
            }}
          >
            {p}
          </Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

/** The leading avatar/thumbnail for a result — a circle for people/chats, a rounded
 * square for files/media/links; all monochrome so it reads on the app's B&W theme. */
function Leading({
  kind,
  title,
}: {
  kind: ResultKind;
  title: string;
}): React.JSX.Element {
  const t = useTheme();
  const SIZE = 46;
  const circle = kind === 'chat' || kind === 'message' || kind === 'contact';
  const base = {
    width: SIZE,
    height: SIZE,
    borderRadius: circle ? SIZE / 2 : t.radius.sm,
    backgroundColor: t.colors.bgSubtle,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  };

  if (kind === 'contact') {
    const initial = title.trim().charAt(0).toUpperCase();
    return (
      <View style={base}>
        <Text variant="label" style={{ color: t.colors.textSecondary }}>
          {initial}
        </Text>
      </View>
    );
  }

  const Icon =
    kind === 'chat' || kind === 'message'
      ? ChatIcon
      : kind === 'image'
        ? ImageIcon
        : kind === 'video'
          ? VideoIcon
          : kind === 'audio'
            ? HeadphonesIcon
            : kind === 'link'
              ? LinkIcon
              : FileTextIcon;

  return (
    <View style={base}>
      <Icon size={22} color={t.colors.textSecondary} strokeWidth={2} />
      {kind === 'video' ? (
        <View
          style={{
            position: 'absolute',
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: t.colors.actionBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <PlayIcon size={12} color={t.colors.actionFg} />
        </View>
      ) : null}
    </View>
  );
}

function ResultRow({
  result,
  query,
}: {
  result: SearchResult;
  query: string;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={result.title}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.sm,
        paddingVertical: t.spacing.sm,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Leading kind={result.kind} title={result.title} />
      <View style={{ flex: 1 }}>
        <Highlight
          text={result.title}
          query={query}
          variant="label"
          color="primary"
          numberOfLines={1}
        />
        <Highlight
          text={result.subtitle}
          query={query}
          variant="caption"
          color="secondary"
          numberOfLines={1}
        />
      </View>
      <View style={{ alignItems: 'flex-end', gap: t.spacing.xxs }}>
        {result.time ? (
          <Text variant="caption" color="tertiary">
            {result.time}
          </Text>
        ) : null}
        {result.unread ? (
          <View
            style={{
              minWidth: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: t.colors.brandFrom,
            }}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

function FilterChip({
  label,
  icon: Icon,
  active,
  badge,
  onPress,
}: {
  label: string;
  icon?: React.FC<IconProps>;
  active: boolean;
  badge?: number;
  onPress: () => void;
}): React.JSX.Element {
  const t = useTheme();
  const fg = active ? t.colors.actionFg : t.colors.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.xxs,
        height: 36,
        paddingHorizontal: t.spacing.md,
        borderRadius: t.radius.pill,
        backgroundColor: active ? t.colors.actionBg : t.colors.bgSubtle,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {Icon ? <Icon size={16} color={fg} strokeWidth={2} /> : null}
      <Text variant="caption" style={{ color: fg }}>
        {label}
      </Text>
      {badge ? (
        <View
          style={{
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: 5,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: active ? t.colors.actionFg : t.colors.brandFrom,
          }}
        >
          <Text
            variant="caption"
            style={{
              fontSize: 11,
              lineHeight: 14,
              color: active ? t.colors.actionBg : t.colors.actionFg,
            }}
          >
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function FrequentAvatar({ name }: { name: string }): React.JSX.Element {
  const t = useTheme();
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      style={({ pressed }) => ({
        width: 72,
        alignItems: 'center',
        gap: t.spacing.xxs,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: t.colors.bgSubtle,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: t.colors.hairline,
        }}
      >
        <Text variant="title" style={{ color: t.colors.textSecondary }}>
          {initial}
        </Text>
      </View>
      <Text variant="caption" color="secondary" numberOfLines={1}>
        {name.split(' ')[0]}
      </Text>
    </Pressable>
  );
}

export function SearchScreen(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const inputRef = useRef<TextInput>(null);

  const [query, setQuery] = useState('');
  const [filterIdx, setFilterIdx] = useState(0);

  const filtered = useMemo(() => {
    const active = FILTERS[filterIdx];
    const q = query.trim().toLowerCase();
    return RESULTS.filter(r => {
      if (active?.kinds && !active.kinds.includes(r.kind)) return false;
      if (active?.unreadOnly && !r.unread) return false;
      if (!q) return true;
      return `${r.title} ${r.subtitle}`.toLowerCase().includes(q);
    });
  }, [query, filterIdx]);

  const showRecent = query.trim() === '' && filterIdx === 0;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.colors.bgBase,
        paddingTop: insets.top,
      }}
    >
      {/* Header — back · wordmark · filters */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 56,
          paddingLeft: t.spacing.xs,
          paddingRight: t.spacing.sm,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <View style={{ transform: [{ rotate: '180deg' }] }}>
            <ChevronRightIcon
              size={26}
              color={t.colors.textPrimary}
              strokeWidth={2.2}
            />
          </View>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', flex: 1 }}>
          <Text variant="title" style={{ fontSize: 20 }}>
            Search{' '}
          </Text>
          <Text variant="title" style={{ fontSize: 20 }}>
            Vel
          </Text>
          <Text
            variant="title"
            style={{ fontSize: 20, color: t.colors.brandFrom }}
          >
            Chat
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('search.filters.all')}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <SlidersIcon size={22} color={t.colors.textPrimary} strokeWidth={2} />
        </Pressable>
      </View>

      {/* Search field */}
      <View
        style={{ paddingHorizontal: t.spacing.lg, paddingBottom: t.spacing.sm }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            height: 46,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.bgSubtle,
            paddingHorizontal: t.spacing.md,
          }}
        >
          <SearchIcon
            size={19}
            color={t.colors.textSecondary}
            strokeWidth={2}
          />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder={tr('search.placeholder')}
            placeholderTextColor={t.colors.textTertiary}
            returnKeyType="search"
            autoCorrect={false}
            style={{
              flex: 1,
              fontFamily: t.typography.body.fontFamily,
              fontSize: 16,
              color: t.colors.textPrimary,
              paddingVertical: 0,
            }}
          />
          {query.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr('common.dismiss')}
              onPress={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
            >
              <View style={{ transform: [{ rotate: '45deg' }] }}>
                <Text style={{ fontSize: 22, color: t.colors.textTertiary }}>
                  +
                </Text>
              </View>
            </Pressable>
          ) : (
            <SparkleIcon
              size={20}
              color={t.colors.brandFrom}
              strokeWidth={1.8}
            />
          )}
        </View>
      </View>

      {/* Type filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: t.spacing.lg,
          gap: t.spacing.xs,
          paddingBottom: t.spacing.sm,
        }}
        style={{ flexGrow: 0 }}
      >
        {FILTERS.map((f, i) => (
          <FilterChip
            key={f.key}
            label={tr(`search.filters.${f.key}`)}
            {...(f.icon ? { icon: f.icon } : {})}
            active={i === filterIdx}
            {...(f.unreadOnly && UNREAD_COUNT ? { badge: UNREAD_COUNT } : {})}
            onPress={() => setFilterIdx(i)}
          />
        ))}
      </ScrollView>

      {/* Body */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: t.spacing.lg,
          paddingBottom: insets.bottom + t.spacing.xl,
        }}
      >
        {/* Frequent people */}
        <View style={{ marginTop: t.spacing.xs, marginBottom: t.spacing.sm }}>
          <Text
            variant="caption"
            color="tertiary"
            style={{ marginBottom: t.spacing.xs }}
          >
            {tr('search.frequent')}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: t.spacing.sm }}
          >
            {FREQUENT.map(name => (
              <FrequentAvatar key={name} name={name} />
            ))}
          </ScrollView>
        </View>

        {/* Results / empty */}
        {showRecent ? (
          <Text
            variant="caption"
            color="tertiary"
            style={{ marginTop: t.spacing.xs, marginBottom: t.spacing.xxs }}
          >
            {tr('search.recent')}
          </Text>
        ) : null}

        {filtered.length > 0 ? (
          filtered.map(r => <ResultRow key={r.id} result={r} query={query} />)
        ) : (
          <View style={{ alignItems: 'center', paddingTop: t.spacing.huge }}>
            <SearchIcon
              size={40}
              color={t.colors.textTertiary}
              strokeWidth={1.6}
            />
            <Text
              variant="label"
              align="center"
              style={{ marginTop: t.spacing.md }}
            >
              {tr('search.noResults', { q: query.trim() })}
            </Text>
            <Text
              variant="caption"
              color="secondary"
              align="center"
              style={{ marginTop: t.spacing.xxs }}
            >
              {tr('search.noResultsSub')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
