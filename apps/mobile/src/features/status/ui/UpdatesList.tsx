/**
 * UpdatesList screen — Premium WhatsApp-parity Status & Updates tab (§F1, §F2).
 * Strictly theme-aware, compact & sleek sizing, zero bloated FABs:
 * - "Add status" row with user avatar & '+' badge.
 * - Collapsible "Viewed updates" & "Recent updates" sections with status rings.
 * - Long-press Hide/Unhide status confirmation modal dialog.
 * - Collapsible "Hidden updates" section with muted status icons.
 * - Channels section with description and discovery link.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  Modal,
  TouchableWithoutFeedback,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme';
import { useTranslation } from '../../../i18n';
import {
  Text,
  ChevronRightIcon,
  ChevronDownIcon,
} from '../../../design-system';
import { useProfileSummary } from '../../user';
import { StatusAvatar } from './StatusAvatar';
import type { RootStackParamList } from '../../../navigation/types';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface StatusItem {
  id: string;
  name: string;
  time: string;
  avatarPath?: string;
  statusCount: number;
  isViewed: boolean;
  isHidden?: boolean;
}

const INITIAL_RECENT_UPDATES: StatusItem[] = [
  {
    id: 'st-1',
    name: 'Aman Bhilai Sankra',
    time: 'Yesterday',
    statusCount: 2,
    isViewed: true,
  },
  {
    id: 'st-2',
    name: 'Janki Bhasker',
    time: 'Yesterday',
    statusCount: 1,
    isViewed: true,
  },
  {
    id: 'st-3',
    name: 'Papa 2',
    time: 'Yesterday',
    statusCount: 3,
    isViewed: true,
  },
  {
    id: 'st-4',
    name: 'Dk Verma Sir',
    time: 'Yesterday',
    statusCount: 1,
    isViewed: true,
  },
];

const INITIAL_HIDDEN_UPDATES: StatusItem[] = [
  {
    id: 'st-h1',
    name: 'Mom',
    time: 'Yesterday',
    statusCount: 1,
    isViewed: true,
    isHidden: true,
  },
  {
    id: 'st-h2',
    name: 'Silki Di',
    time: 'Yesterday',
    statusCount: 2,
    isViewed: true,
    isHidden: true,
  },
  {
    id: 'st-h3',
    name: 'Mhes Sir Raipur (Ujju) Dr',
    time: 'Yesterday',
    statusCount: 1,
    isViewed: true,
    isHidden: true,
  },
  {
    id: 'st-h4',
    name: 'Mnish Fd Ssipmt',
    time: 'Yesterday',
    statusCount: 1,
    isViewed: true,
    isHidden: true,
  },
];

export function UpdatesList(): React.JSX.Element {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { displayName, avatar } = useProfileSummary();

  const [recentUpdates, setRecentUpdates] = useState<StatusItem[]>(
    INITIAL_RECENT_UPDATES,
  );
  const [hiddenUpdates, setHiddenUpdates] = useState<StatusItem[]>(
    INITIAL_HIDDEN_UPDATES,
  );

  const [viewedExpanded, setViewedExpanded] = useState(true);
  const [hiddenExpanded, setHiddenExpanded] = useState(false);

  // Modal context state for long-press action (Hide / Unhide dialog)
  const [targetStatus, setTargetStatus] = useState<StatusItem | null>(null);

  const toggleViewed = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setViewedExpanded(prev => !prev);
  }, []);

  const toggleHidden = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHiddenExpanded(prev => !prev);
  }, []);

  const handleHideToggle = useCallback(() => {
    if (!targetStatus) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (targetStatus.isHidden) {
      // Unhide item
      setHiddenUpdates(prev =>
        prev.filter(item => item.id !== targetStatus.id),
      );
      setRecentUpdates(prev => [...prev, { ...targetStatus, isHidden: false }]);
    } else {
      // Hide item
      setRecentUpdates(prev =>
        prev.filter(item => item.id !== targetStatus.id),
      );
      setHiddenUpdates(prev => [...prev, { ...targetStatus, isHidden: true }]);
    }
    setTargetStatus(null);
  }, [targetStatus]);

  const userName = displayName ?? tr('status.addStatus');
  const activeAccent = t.scheme === 'dark' ? '#30D158' : '#25D366';

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bgBase }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Section Header */}
        <Text
          variant="title"
          style={{
            fontSize: 20,
            paddingHorizontal: t.spacing.lg,
            paddingTop: t.spacing.md,
            paddingBottom: t.spacing.xxs,
            color: t.colors.textPrimary,
          }}
        >
          {tr('status.title')}
        </Text>

        {/* My Status / Add Status Row */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('status.addStatus')}
          onPress={() => navigation.navigate('Profile')}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
            paddingHorizontal: t.spacing.lg,
            paddingVertical: 10,
            backgroundColor: pressed ? t.colors.bgSubtle : 'transparent',
          })}
        >
          <StatusAvatar
            name={userName}
            thumbnailPath={avatar ?? undefined}
            isAdd
            size={46}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              variant="label"
              numberOfLines={1}
              style={{ fontSize: 16, color: t.colors.textPrimary }}
            >
              {tr('status.addStatus')}
            </Text>
            <Text variant="caption" color="tertiary" numberOfLines={1}>
              {tr('status.disappearsHint')}
            </Text>
          </View>
        </Pressable>

        {/* Viewed Updates Section Header */}
        {recentUpdates.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('status.viewedUpdates')}
            onPress={toggleViewed}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: t.spacing.lg,
              paddingTop: t.spacing.md,
              paddingBottom: t.spacing.xxs,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text
              variant="caption"
              style={{
                color: t.colors.textSecondary,
                fontSize: 13,
                fontFamily: t.typography.label.fontFamily,
              }}
            >
              {tr('status.viewedUpdates')}
            </Text>
            <View
              style={{
                transform: [{ rotate: viewedExpanded ? '180deg' : '0deg' }],
              }}
            >
              <ChevronDownIcon size={16} color={t.colors.textSecondary} />
            </View>
          </Pressable>
        ) : null}

        {/* Viewed Updates List */}
        {viewedExpanded
          ? recentUpdates.map(item => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={item.name}
                onPress={() => {}}
                onLongPress={() => setTargetStatus(item)}
                delayLongPress={280}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.md,
                  paddingHorizontal: t.spacing.lg,
                  paddingVertical: 10,
                  backgroundColor: pressed ? t.colors.bgSubtle : 'transparent',
                })}
              >
                <StatusAvatar
                  name={item.name}
                  thumbnailPath={item.avatarPath}
                  statusCount={item.statusCount}
                  isViewed={item.isViewed}
                  size={46}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    variant="label"
                    numberOfLines={1}
                    style={{ fontSize: 16, color: t.colors.textPrimary }}
                  >
                    {item.name}
                  </Text>
                  <Text variant="caption" color="tertiary" numberOfLines={1}>
                    {item.time}
                  </Text>
                </View>
              </Pressable>
            ))
          : null}

        {/* Hidden Updates Section Header */}
        {hiddenUpdates.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('status.hiddenUpdates')}
            onPress={toggleHidden}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: t.spacing.lg,
              paddingTop: t.spacing.md,
              paddingBottom: t.spacing.xxs,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text
              variant="caption"
              style={{
                color: t.colors.textSecondary,
                fontSize: 13,
                fontFamily: t.typography.label.fontFamily,
              }}
            >
              {tr('status.hiddenUpdates')}
            </Text>
            <View
              style={{
                transform: [{ rotate: hiddenExpanded ? '180deg' : '0deg' }],
              }}
            >
              <ChevronDownIcon size={16} color={t.colors.textSecondary} />
            </View>
          </Pressable>
        ) : null}

        {/* Hidden Updates List */}
        {hiddenExpanded
          ? hiddenUpdates.map(item => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={item.name}
                onPress={() => {}}
                onLongPress={() => setTargetStatus(item)}
                delayLongPress={280}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.md,
                  paddingHorizontal: t.spacing.lg,
                  paddingVertical: 10,
                  backgroundColor: pressed ? t.colors.bgSubtle : 'transparent',
                })}
              >
                <StatusAvatar
                  name={item.name}
                  thumbnailPath={item.avatarPath}
                  statusCount={item.statusCount}
                  isViewed
                  size={46}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    variant="label"
                    numberOfLines={1}
                    style={{ fontSize: 16, color: t.colors.textPrimary }}
                  >
                    {item.name}
                  </Text>
                  <Text variant="caption" color="tertiary" numberOfLines={1}>
                    {item.time}
                  </Text>
                </View>
                {/* Muted icon indicator */}
                <View style={{ opacity: 0.5 }}>
                  <Text
                    variant="caption"
                    color="tertiary"
                    style={{ fontSize: 15 }}
                  >
                    🔇
                  </Text>
                </View>
              </Pressable>
            ))
          : null}

        {/* Channels Section */}
        <View
          style={{
            marginTop: t.spacing.lg,
            paddingHorizontal: t.spacing.lg,
            borderTopWidth: 1,
            borderTopColor: t.colors.hairline,
            paddingTop: t.spacing.md,
          }}
        >
          <Text
            variant="title"
            style={{
              fontSize: 20,
              color: t.colors.textPrimary,
              marginBottom: 4,
            }}
          >
            {tr('status.channels')}
          </Text>
          <Text
            variant="body"
            color="secondary"
            style={{ fontSize: 14, lineHeight: 20, marginBottom: t.spacing.sm }}
          >
            {tr('status.channelsSubtitle')}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('status.findChannels')}
            onPress={() => {}}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 10,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text
              variant="label"
              style={{ fontSize: 15, color: t.colors.textSecondary }}
            >
              {tr('status.findChannels')}
            </Text>
            <ChevronRightIcon size={16} color={t.colors.textSecondary} />
          </Pressable>
        </View>
      </ScrollView>

      {/* Long-Press Hide/Unhide Status Modal */}
      {targetStatus ? (
        <Modal
          transparent
          animationType="fade"
          visible
          onRequestClose={() => setTargetStatus(null)}
        >
          <TouchableWithoutFeedback onPress={() => setTargetStatus(null)}>
            <View
              style={{
                flex: 1,
                backgroundColor: 'rgba(0,0,0,0.45)',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 28,
              }}
            >
              <TouchableWithoutFeedback>
                <View
                  style={{
                    width: '100%',
                    backgroundColor: t.colors.surfaceElevated,
                    borderRadius: 20,
                    padding: 24,
                    borderWidth: 1,
                    borderColor: t.colors.hairline,
                  }}
                >
                  <Text
                    variant="title"
                    style={{
                      fontSize: 19,
                      color: t.colors.textPrimary,
                      marginBottom: 10,
                    }}
                  >
                    {targetStatus.isHidden
                      ? tr('status.unhideConfirmTitle', {
                          name: targetStatus.name,
                        })
                      : tr('status.hideConfirmTitle', {
                          name: targetStatus.name,
                        })}
                  </Text>
                  <Text
                    variant="body"
                    color="secondary"
                    style={{ fontSize: 14.5, lineHeight: 21, marginBottom: 20 }}
                  >
                    {targetStatus.isHidden
                      ? tr('status.unhideConfirmBody', {
                          name: targetStatus.name,
                        })
                      : tr('status.hideConfirmBody', {
                          name: targetStatus.name,
                        })}
                  </Text>

                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'flex-end',
                      gap: 16,
                    }}
                  >
                    <Pressable
                      onPress={() => setTargetStatus(null)}
                      style={({ pressed }) => ({
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <Text
                        variant="label"
                        style={{ color: activeAccent, fontSize: 15 }}
                      >
                        {tr('status.cancel')}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={handleHideToggle}
                      style={({ pressed }) => ({
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <Text
                        variant="label"
                        style={{ color: activeAccent, fontSize: 15 }}
                      >
                        {targetStatus.isHidden
                          ? tr('status.unhide')
                          : tr('status.hide')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      ) : null}
    </View>
  );
}
