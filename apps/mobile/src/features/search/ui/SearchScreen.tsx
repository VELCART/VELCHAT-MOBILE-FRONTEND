/**
 * Search screen (§F1) — the app-wide search opened from the home header. WhatsApp/Slack
 * parity: an "Ask Vel AI or Search" field, scrollable type filters (All · Unread ·
 * Photos · Videos · Links · Docs · Audio · Contacts), a recent-chats row, and a result
 * list with the matched term highlighted. Fully theme-aware (light + dark) via tokens.
 *
 * Data is REAL and LOCAL (§M0): `useSearch` queries the same WatermelonDB the chat list +
 * chat screen read — conversations + messages, offline-first, never the network. There is
 * no server full-text search for personal chats (content is/will be opaque). The `chat` +
 * `message` kinds are backed by real rows; the media filters (Photos/Videos/Links/Docs/
 * Audio) have no local index yet, so they honestly show the empty state — never fabricated.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, TextInput, Pressable, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../theme';
import { useTranslation } from '../../../i18n';
import {
  Text,
  SearchIcon,
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
import { useSearch } from '../hooks/useSearch';
import type { ResultKind, SearchResult, FrequentChat } from '../model/types';

interface FilterDef {
  key: string;
  icon?: React.FC<IconProps>;
  kinds: readonly ResultKind[] | null;
  unreadOnly?: boolean;
}

// Only `chat`/`message` are backed by real local data. `all` shows both; `unread` narrows to
// unread conversations; `contacts` narrows to conversation (people/chat) matches. The media
// kinds have no local index yet → selecting one honestly yields the empty state.
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
  { key: 'contacts', icon: UserIcon, kinds: ['chat'] },
];

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
              // Monochrome theme: brandFrom == textPrimary, so the emphasis MUST come
              // from weight — the Bold face reads clearly heavier than a SemiBold title
              // or a Medium subtitle (colour alone would be invisible on titles).
              color: t.colors.brandFrom,
              fontFamily: t.typography.title.fontFamily,
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
  onPress,
}: {
  result: SearchResult;
  query: string;
  onPress: () => void;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={result.title}
      onPress={onPress}
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

function FrequentAvatar({
  name,
  onPress,
}: {
  name: string;
  onPress: () => void;
}): React.JSX.Element {
  const t = useTheme();
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
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

  // REAL data — the local DB (§M0), via the feature hook. `results` re-runs on the debounced
  // query; `frequent` is the live most-recent-chats row for the browse state.
  const { results, frequent } = useSearch(query);

  // The active chip narrows the already-query-matched results by kind (+ unread). Media chips
  // map to kinds we don't produce yet → an honest empty state, never a fabricated row.
  const filtered = useMemo(() => {
    const active = FILTERS[filterIdx];
    return results.filter(r => {
      if (active?.kinds && !active.kinds.includes(r.kind)) return false;
      if (active?.unreadOnly && !r.unread) return false;
      return true;
    });
  }, [results, filterIdx]);

  // Unread badge on the Unread chip = number of unread conversations in the current results.
  const unreadCount = useMemo(
    () => results.filter(r => r.unread).length,
    [results],
  );

  const browsing = query.trim() === '';

  const openChat = useCallback(
    (conversationId: string, name?: string) => {
      navigation.navigate('Chat', { conversationId, name });
    },
    [navigation],
  );

  // Let the screen paint FIRST (navigation feels instant), then focus on the very next
  // frame so raising the keyboard can't jank the push. autoFocus does it DURING the push
  // (Android window-resize hitch → "slow"); InteractionManager waits too long. rAF is the
  // sweet spot: instant screen, keyboard ~1 frame later.
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.colors.bgBase,
        paddingTop: insets.top,
      }}
    >
      {/* Search field — the back arrow lives INSIDE the bar (in place of the search
          icon); no separate header row, so the whole control sits in one clean place. */}
      <View
        style={{
          paddingHorizontal: t.spacing.sm,
          paddingTop: t.spacing.xs,
          paddingBottom: t.spacing.sm,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.xs,
            height: 48,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.bgSubtle,
            paddingLeft: t.spacing.xxs,
            paddingRight: t.spacing.md,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('profile.back')}
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={({ pressed }) => ({
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.5 : 1,
            })}
          >
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <ChevronRightIcon
                size={24}
                color={t.colors.textPrimary}
                strokeWidth={2.2}
              />
            </View>
          </Pressable>
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
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
            <SearchIcon
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
        // The input auto-focuses (keyboard up on entry) → without this the first tap on
        // a chip is eaten to dismiss the keyboard and the filter wouldn't change.
        keyboardShouldPersistTaps="handled"
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
            {...(f.unreadOnly && unreadCount ? { badge: unreadCount } : {})}
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
        {/* Frequent (most-recent) chats — only in the browse state; hidden once you start
            typing so an active search shows results alone (standard search behaviour).
            Hidden entirely when there are no local conversations yet. */}
        {browsing && frequent.length > 0 ? (
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
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: t.spacing.sm }}
            >
              {frequent.map((c: FrequentChat) => (
                <FrequentAvatar
                  key={c.id}
                  name={c.name}
                  onPress={() => openChat(c.id, c.name)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Results / empty — only once a query is active. The browse state above stands in
            for the empty query (no "No results for ''"). */}
        {browsing ? null : filtered.length > 0 ? (
          filtered.map(r => (
            <ResultRow
              key={r.id}
              result={r}
              query={query}
              onPress={() => {
                if (r.conversationId) {
                  openChat(r.conversationId, r.conversationName);
                }
              }}
            />
          ))
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
