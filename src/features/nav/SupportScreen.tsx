// SUPPORT — Tutorials / User Guide (stubs until the hosted docs exist) + how to reach a human.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { View } from 'react-native';
import { APP_NAME } from '@/config';
import { Card, Muted, Row, Screen, Text, useColors, space } from '@/ui';

const ITEMS = [
  { key: 'tutorials', icon: 'play-circle-outline' as const, title: 'Tutorials', body: 'Short videos: first dog, first training record, deployments, reports. Arrive with the hosted docs.' },
  { key: 'guide', icon: 'book-outline' as const, title: 'User Guide', body: 'The written guide, screen by screen. Arrives with the hosted docs.' },
  { key: 'contact', icon: 'chatbubble-ellipses-outline' as const, title: 'Contact support', body: `Local demo mode has no chat. When ${APP_NAME} is hosted, this opens the support chat.` },
];

export function SupportScreen() {
  const c = useColors();
  return (
    <Screen title="Support" subtitle="Tutorials, the user guide and how to reach us." testID="screen-support">
      <View style={{ gap: space.sm }}>
        {ITEMS.map((it) => (
          <Card key={it.key} testID={`card-support-${it.key}`}>
            <Row align="flex-start">
              <Ionicons name={it.icon} size={26} color={c.primary} />
              <View style={{ flex: 1 }}>
                <Text variant="h3">{it.title}</Text>
                <Muted>{it.body}</Muted>
              </View>
            </Row>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
