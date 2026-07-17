/**
 * Screen-agnostic placeholder (empty/skeleton) used by not-yet-built screens.
 * Consistent themed empty state (§M16 look; real screens land in MP1+).
 */
import React from 'react';
import { useTheme } from '../theme';
import { Screen, Text, Column } from '../design-system';

export function Placeholder({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <Screen center>
      <Column gap={t.spacing.xs} align="center">
        <Text variant="title" align="center">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="body" color="secondary" align="center">
            {subtitle}
          </Text>
        ) : null}
      </Column>
    </Screen>
  );
}
