// App shell: ≥900px = left sidebar + content; <900px = top bar (menu → drawer, title, bell) + "+" menu.
// Same nav items in both; the whole nav re-renders when the role changes.
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_NAME } from '@/config';
import { GlowBackdrop } from '@/ui/GlowBackdrop';
import { glassBlur } from '@/ui/glass';
import { useList, useRepo } from '@/db/provider';
import { topUpDemo } from '@/db/seed';
import { ROLE_LABEL, type Role } from '@/db/types';
import { useAuth } from '@/features/auth/AuthProvider';
import { NotificationAlerts } from '@/features/notifications/NotificationAlerts';
import { NotificationsPanel } from '@/features/notifications/NotificationsPanel';
import { usePrefs } from '@/features/prefs/PrefsProvider';
import { Badge, Banner, Button, FieldHelpPanel, IconButton, Muted, Sheet, SupportBubble, Text, useColors, useIsDesktop, useToast, control, radius, space, fmtDate, blur } from '@/ui';
import { ThemeToggle } from '@/features/profile/ThemeToggle';
import { useInstall } from '@/features/pwa';
import { VaccineReminders } from '@/features/vet/VaccineReminders';
import { ADD_MENU, navItemsFor, SCREEN_TITLES, type NavItem } from './navConfig';

export function useScreenTitle(): string {
  const pathname = usePathname();
  const seg = pathname.split('/').filter(Boolean)[0] || 'records';
  return SCREEN_TITLES[seg] || 'Records';
}

export function useIsPhoneMode(): boolean {
  const { prefs } = usePrefs();
  return Platform.OS !== 'web' || prefs.simulatePhone;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const desktop = useIsDesktop();
  const c = useColors();
  const title = useScreenTitle();
  const pathname = usePathname();
  const { user, role, roles, seatExpired, seat, signOut, setRole } = useAuth();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const repo = useRepo();
  const toast = useToast();
  const phoneMode = useIsPhoneMode();
  const unread = useList('notification', (n) => n.user_id === user?.id && !n.read).length;
  const items = navItemsFor(role);
  const { canInstall, install } = useInstall();

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.title = `${title} · ${APP_NAME}`;
  }, [title]);
  useEffect(() => { setDrawer(false); }, [pathname]);

  const go = (href: string) => { setDrawer(false); setAddOpen(false); setUserOpen(false); setHelpOpen(false); router.push(href as never); };
  // RELOAD DATA re-reads the persisted store AND restores any demo record that is missing from it —
  // a store seeded before a seed change used to keep the old data forever while this button said
  // otherwise (found at the U6 merge: an old profile had zero GPS tracks after a "reload"). It only
  // CREATES absent rows: nothing you have edited, and nothing you have written yourself, is touched.
  const reloadData = async () => {
    setReloading(true);
    try {
      await repo.reload();
      const { created } = await topUpDemo(repo);
      toast.show(created > 0 ? `Data reloaded — ${created} missing demo ${created === 1 ? 'record was' : 'records were'} restored` : 'Data reloaded — nothing was missing');
    } catch {
      toast.show('Reload failed — data unchanged', 'error');
    } finally {
      setReloading(false);
    }
  };
  const doSignOut = async () => { setUserOpen(false); setDrawer(false); await signOut(); router.replace('/sign-in'); };
  const doInstall = async () => {
    setUserOpen(false);
    setDrawer(false);
    const outcome = await install();
    if (outcome === 'accepted') toast.show(`${APP_NAME} installed`);
    else if (outcome === 'dismissed') toast.show('Install cancelled — nothing changed');
    else toast.show('This browser has no install prompt right now', 'error');
  };
  const firstName = user?.first_name || user?.name?.split(' ')[0] || '';
  const isActive = (item: NavItem) => pathname === item.href || pathname.startsWith(item.href + '/');
  const billingBanner = role === 'handler' && seatExpired ? (
    <Banner
      tone="warning"
      testID="banner-billing"
      title={seat?.plan === 'trial' ? 'Your 30-day trial has ended' : 'Your subscription has expired'}
      body={`Records are read-only until a subscription is active${seat ? ` (ended ${fmtDate(seat.ends)})` : ''}. Handler seats are $14/month or $140/year and cover all your dogs.`}
      action={{ title: 'Billing', onPress: () => go('/billing'), testID: 'btn-billing-banner' }}
      style={{ marginBottom: 0, borderRadius: 0 }}
    />
  ) : null;

  const roleSwitcher = (
    <Sheet visible={roleOpen} onClose={() => setRoleOpen(false)} title="Switch role" testID="sheet-role" maxWidth={400}>
      {roles.map((r) => (
        <Pressable
          key={r}
          accessibilityRole="menuitem"
          accessibilityState={{ selected: r === role }}
          testID={`role-option-${r}`}
          onPress={() => { setRole(r); setRoleOpen(false); setDrawer(false); router.replace('/records'); }}
          style={[styles.menuItem, { backgroundColor: r === role ? c.primarySoft : 'transparent' }]}
        >
          <Ionicons name={r === role ? 'radio-button-on' : 'radio-button-off'} size={22} color={c.primary} style={{ marginRight: space.sm }} />
          <Text style={{ flex: 1, fontWeight: r === role ? '700' : '400' }}>{ROLE_LABEL[r]}</Text>
        </Pressable>
      ))}
      <Muted style={{ marginTop: space.sm }}>The last role used is remembered on this device.</Muted>
    </Sheet>
  );

  const addMenu = (
    <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Add" testID="sheet-add" maxWidth={400}>
      {ADD_MENU.filter((m) => !m.mobileOnly || phoneMode || !desktop).map((m) => (
        <View key={m.key}>
          {m.divider ? <View style={{ height: 1, backgroundColor: c.border, marginVertical: 4 }} /> : null}
          <Pressable accessibilityRole="menuitem" testID={m.testID} onPress={() => go(m.href)} style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}>
            <Ionicons name={m.icon} size={22} color={c.primary} style={{ marginRight: space.sm }} />
            <Text style={{ flex: 1 }}>{m.label}</Text>
            {m.badge ? <Badge tone="accent">{m.badge}</Badge> : null}
          </Pressable>
        </View>
      ))}
    </Sheet>
  );

  const userMenu = (
    <Sheet visible={userOpen} onClose={() => setUserOpen(false)} title={user?.name || 'Account'} testID="sheet-user" maxWidth={400}>
      <Muted style={{ marginBottom: space.sm }}>{user?.email}{user?.department ? ` · ${user.department}` : ''}</Muted>
      {/* Install lives here as well as on Profile: it is the one control a non-developer will look
          for in the account menu, and it hides itself when the app is already installed. */}
      {canInstall ? (
        <Pressable accessibilityRole="menuitem" accessibilityLabel={`Install ${APP_NAME}`} testID="menu-install-app" onPress={() => void doInstall()} style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}>
          <Ionicons name="download-outline" size={22} color={c.primary} style={{ marginRight: space.sm }} />
          <Text style={{ flex: 1 }}>Install {APP_NAME}</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="menuitem" testID="menu-user-profile" onPress={() => go('/profile')} style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}>
        <Ionicons name="person-circle-outline" size={22} color={c.primary} style={{ marginRight: space.sm }} />
        <Text style={{ flex: 1 }}>Profile</Text>
      </Pressable>
      <Pressable accessibilityRole="menuitem" testID="menu-user-support" onPress={() => go('/support')} style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}>
        <Ionicons name="help-buoy-outline" size={22} color={c.primary} style={{ marginRight: space.sm }} />
        <Text style={{ flex: 1 }}>Support</Text>
      </Pressable>
      <Pressable accessibilityRole="menuitem" accessibilityLabel="Sign out" testID="btn-sign-out" onPress={() => void doSignOut()} style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}>
        <Ionicons name="log-out-outline" size={22} color={c.danger} style={{ marginRight: space.sm }} />
        <Text style={{ flex: 1, color: c.danger }}>Sign out</Text>
      </Pressable>
    </Sheet>
  );

  const helpSheet = (
    <Sheet visible={helpOpen} onClose={() => setHelpOpen(false)} title="Help" testID="sheet-help" maxWidth={400}>
      {[
        { key: 'tutorials', icon: 'play-circle-outline' as const, label: 'Tutorials' },
        { key: 'guide', icon: 'book-outline' as const, label: 'User Guide' },
        { key: 'contact', icon: 'chatbubble-ellipses-outline' as const, label: 'Contact support' },
      ].map((m) => (
        <Pressable key={m.key} accessibilityRole="menuitem" testID={`help-${m.key}`} onPress={() => go('/support')} style={({ pressed }) => [styles.menuItem, { backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}>
          <Ionicons name={m.icon} size={22} color={c.primary} style={{ marginRight: space.sm }} />
          <Text style={{ flex: 1 }}>{m.label}</Text>
        </Pressable>
      ))}
      <Muted style={{ marginTop: space.sm }}>Every field also shows its help text under the input.</Muted>
    </Sheet>
  );

  const navList = (inDrawer?: boolean) => (
    <View accessibilityRole="menu" testID={inDrawer ? 'nav-drawer' : 'nav-sidebar'} style={{ paddingVertical: space.sm }}>
      {items.map((item) => {
        const active = isActive(item);
        return (
          <Pressable
            key={item.key}
            accessibilityRole="link"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            testID={item.testID}
            onPress={() => go(item.href)}
            style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
              styles.navItem,
              { backgroundColor: active ? c.navActiveBg : hovered || pressed ? 'rgba(255,255,255,0.08)' : 'transparent' },
            ]}
          >
            <Ionicons name={item.icon} size={22} color={active ? c.navActiveText : c.navText} style={{ marginRight: space.sm }} />
            <View style={{ flex: 1 }}>
              <Text variant="nav" style={{ color: active ? c.navActiveText : c.navText }}>{item.label}</Text>
              {item.caption ? <Text style={{ color: active ? c.navActiveText : c.navText, opacity: 0.85 }}>{item.caption}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  const userBlock = (inDrawer?: boolean) => (
    <View style={[styles.userBlock, { borderTopColor: 'rgba(255,255,255,0.15)' }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Reload data" accessibilityState={{ busy: reloading }} testID={inDrawer ? 'btn-reload-data-drawer' : 'btn-reload-data'} onPress={() => void reloadData()} style={styles.userRow}>
        <Ionicons name="refresh-outline" size={22} color={c.navText} style={{ marginRight: space.sm }} />
        <Text variant="nav" style={{ color: c.navText, flex: 1 }}>{reloading ? 'RELOADING…' : 'RELOAD DATA'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Support" accessibilityState={{ expanded: supportOpen }} testID={inDrawer ? 'btn-support-drawer' : 'btn-support'} onPress={() => setSupportOpen((v) => !v)} style={styles.userRow}>
        <Ionicons name="help-buoy-outline" size={22} color={c.navText} style={{ marginRight: space.sm }} />
        <Text variant="nav" style={{ color: c.navText, flex: 1 }}>SUPPORT</Text>
        <Ionicons name={supportOpen ? 'chevron-down' : 'chevron-forward'} size={20} color={c.navText} />
      </Pressable>
      {supportOpen ? (
        <View style={{ paddingLeft: space.xl }}>
          <Pressable accessibilityRole="link" accessibilityLabel="Tutorials" testID="link-support-tutorials" onPress={() => go('/support')} style={styles.userRow}>
            <Ionicons name="play-circle-outline" size={20} color={c.navText} style={{ marginRight: space.sm }} />
            <Text style={{ color: c.navText, flex: 1 }}>Tutorials</Text>
          </Pressable>
          <Pressable accessibilityRole="link" accessibilityLabel="User Guide" testID="link-support-guide" onPress={() => go('/support')} style={styles.userRow}>
            <Ionicons name="book-outline" size={20} color={c.navText} style={{ marginRight: space.sm }} />
            <Text style={{ color: c.navText, flex: 1 }}>User Guide</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Notifications" testID={inDrawer ? 'btn-notifications-drawer' : 'btn-notifications'} onPress={() => go('/notifications')} style={styles.userRow}>
        <Ionicons name="notifications-outline" size={22} color={c.navText} style={{ marginRight: space.sm }} />
        <Text variant="nav" style={{ color: c.navText, flex: 1 }}>NOTIFICATIONS</Text>
        {unread ? <View style={[styles.badge, { backgroundColor: c.accentSolid }]}><Text style={{ color: c.accentText, fontWeight: '700' }} testID="text-unread-count">{unread}</Text></View> : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Role: ${role ? ROLE_LABEL[role] : ''}${roles.length > 1 ? ' — tap to switch' : ''}`}
        accessibilityState={{ disabled: roles.length < 2 }}
        testID={inDrawer ? 'btn-switch-role-drawer' : 'btn-switch-role'}
        onPress={roles.length > 1 ? () => setRoleOpen(true) : undefined}
        style={styles.userRow}
      >
        <Ionicons name="briefcase-outline" size={22} color={c.navText} style={{ marginRight: space.sm }} />
        <Text variant="nav" style={{ color: c.navText, flex: 1 }}>ROLE ({role ? ROLE_LABEL[role].toUpperCase() : ''})</Text>
        {roles.length > 1 ? <Ionicons name="chevron-forward" size={20} color={c.navText} /> : null}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Sign out" testID={inDrawer ? 'btn-sign-out-drawer' : 'btn-sign-out-sidebar'} onPress={() => void doSignOut()} style={styles.userRow}>
        <Ionicons name="log-out-outline" size={22} color={c.navText} style={{ marginRight: space.sm }} />
        <Text variant="nav" style={{ color: c.navText, flex: 1 }}>LOGOUT</Text>
      </Pressable>
      <View style={{ paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.sm }}>
        <Muted style={{ color: c.navText, opacity: 0.7 }}>WELCOME</Muted>
        <Text style={{ color: c.navText, fontWeight: '600' }} testID={inDrawer ? 'text-user-name-drawer' : 'text-user-name'}>{user?.name}{user?.department ? ` · ${user.department}` : ''}</Text>
      </View>
    </View>
  );

  if (desktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <GlowBackdrop />
        <View style={[styles.sidebar, { backgroundColor: c.navBg, width: control.desktopSidebar }, glassBlur(blur.chrome)]} testID="sidebar">
          <View style={styles.brand}>
            <View style={[styles.logo, { backgroundColor: c.accentSolid }]}><Ionicons name="paw" size={22} color={c.accentText} /></View>
            <Text variant="h3" style={{ color: c.navText, letterSpacing: 1 }} testID="text-app-name">{APP_NAME}</Text>
          </View>
          <ScrollView style={{ flex: 1 }}>
            {navList()}
          </ScrollView>
          <View style={[styles.userBlock, { borderTopColor: 'rgba(255,255,255,0.15)' }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Reload data" accessibilityState={{ busy: reloading }} testID="btn-reload-data" onPress={() => void reloadData()} style={styles.userRow}>
              <Ionicons name="refresh-outline" size={22} color={c.navText} style={{ marginRight: space.sm }} />
              <Text variant="nav" style={{ color: c.navText, flex: 1 }}>{reloading ? 'RELOADING…' : 'RELOAD DATA'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Sign out" testID="btn-sign-out-sidebar" onPress={() => void doSignOut()} style={styles.userRow}>
              <Ionicons name="log-out-outline" size={22} color={c.navText} style={{ marginRight: space.sm }} />
              <Text variant="nav" style={{ color: c.navText, flex: 1 }}>LOGOUT</Text>
            </Pressable>
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* Header right cluster: ? help · bell · ROLE + name + briefcase · WELCOME + first name + avatar */}
          <View style={[styles.header, { backgroundColor: c.surface, borderBottomColor: c.border }]} testID="header">
            <View style={{ flex: 1 }} />
            <IconButton icon="help-circle-outline" accessibilityLabel="Help" testID="btn-help" onPress={() => setHelpOpen(true)} color={c.muted} size={26} />
            <ThemeToggle />
            {/* The bell opens the dropdown panel; the panel's "See all" (and the drawer row) go to /notifications. */}
            <IconButton icon="notifications-outline" accessibilityLabel="Notifications" testID="btn-notifications" onPress={() => setBellOpen(true)} color={c.muted} size={26} badge={unread} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Role: ${role ? ROLE_LABEL[role] : ''}${roles.length > 1 ? ' — tap to switch' : ''}`}
              testID="pill-role"
              onPress={roles.length > 1 ? () => setRoleOpen(true) : undefined}
              style={({ hovered }: { hovered?: boolean }) => [styles.headerCluster, { backgroundColor: hovered && roles.length > 1 ? c.surfaceAlt : 'transparent' }]}
            >
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="label" color="muted">ROLE</Text>
                <Text variant="bodyStrong" testID="text-role-name">{role ? ROLE_LABEL[role] : ''}</Text>
              </View>
              <Ionicons name="briefcase-outline" size={24} color={c.primary} style={{ marginLeft: space.sm }} />
              {roles.length > 1 ? <Ionicons name="chevron-down" size={18} color={c.muted} /> : null}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Account menu — ${user?.name || ''}`}
              testID="btn-user-menu"
              onPress={() => setUserOpen(true)}
              style={({ hovered }: { hovered?: boolean }) => [styles.headerCluster, { backgroundColor: hovered ? c.surfaceAlt : 'transparent' }]}
            >
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="label" color="muted">WELCOME</Text>
                <Text variant="bodyStrong" testID="text-user-name">{firstName}</Text>
              </View>
              <View style={[styles.avatar, { backgroundColor: c.primary }]}><Text style={{ color: c.primaryText, fontWeight: '700' }}>{(firstName[0] || '?').toUpperCase()}</Text></View>
            </Pressable>
          </View>
          {billingBanner}
          <VaccineReminders />
          <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
          {/* PT-NOT-05: alerts live at the bottom of the interface and name the NOTIFICATIONS menu. */}
          <NotificationAlerts suppressed={bellOpen || drawer} onOpen={() => go('/notifications')} />
        </View>
        {roleSwitcher}
        {addMenu}
        {userMenu}
        {helpSheet}
        <NotificationsPanel visible={bellOpen} onClose={() => setBellOpen(false)} />
        <FieldHelpPanel />
        <SupportBubble onPress={() => go('/support')} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <GlowBackdrop />
      <TopBar
        title={title}
        onMenu={() => setDrawer(true)}
        onAdd={role === 'handler' || role === 'trainer' ? () => setAddOpen(true) : undefined}
        onBell={() => setBellOpen(true)}
        onSupport={() => go('/support')}
        unread={unread}
      />
      {billingBanner}
      <VaccineReminders />
      <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
      {/* PT-NOT-05: alerts live at the bottom of the interface and name the NOTIFICATIONS menu. */}
      <NotificationAlerts suppressed={bellOpen || drawer} onOpen={() => go('/notifications')} />
      <Modal visible={drawer} transparent animationType="fade" onRequestClose={() => setDrawer(false)}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={[styles.drawer, { backgroundColor: c.navBg }]} testID="drawer">
            <DrawerInner>
              <View style={[styles.brand, { paddingRight: 0 }]}>
                <View style={[styles.logo, { backgroundColor: c.accentSolid }]}><Ionicons name="paw" size={22} color={c.accentText} /></View>
                <Text variant="h3" style={{ color: c.navText, letterSpacing: 1, flex: 1 }}>{APP_NAME}</Text>
                <IconButton icon="close" accessibilityLabel="Close menu" testID="btn-close-drawer" onPress={() => setDrawer(false)} color={c.navText} />
              </View>
              <ScrollView style={{ flex: 1 }}>
                {navList(true)}
                {userBlock(true)}
              </ScrollView>
            </DrawerInner>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={() => setDrawer(false)} style={{ flex: 1, backgroundColor: c.overlay }} />
        </View>
      </Modal>
      {roleSwitcher}
      {addMenu}
      {userMenu}
      {helpSheet}
      <NotificationsPanel visible={bellOpen} onClose={() => setBellOpen(false)} />
      <FieldHelpPanel />
      <SupportBubble onPress={() => go('/support')} />
    </View>
  );
}

function DrawerInner({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>{children}</View>;
}

function TopBar({ title, onMenu, onAdd, onBell, onSupport, unread }: { title: string; onMenu: () => void; onAdd?: () => void; onBell: () => void; onSupport: () => void; unread: number }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.topBar, { backgroundColor: c.navBg, paddingTop: insets.top }, glassBlur(blur.chrome)]} testID="topbar">
      <IconButton icon="menu" accessibilityLabel="Open menu" testID="btn-menu" onPress={onMenu} color={c.navText} size={28} />
      <Text variant="h3" style={{ color: c.navText, flex: 1, letterSpacing: 0.5 }} numberOfLines={1} testID="text-screen-title">{title.toUpperCase()}</Text>
      <ThemeToggle color={c.navText} testID="btn-theme-toggle-top" />
      {/* Support is docked here below 1024 px: the floating bubble covered calendar cells and stole
          their taps (DECISIONS E46). The drawer's SUPPORT ▸ row (PT-UX-05) is the other route. */}
      <IconButton icon="help-buoy-outline" accessibilityLabel="Support" testID="btn-support-top" onPress={onSupport} color={c.navText} />
      <IconButton icon="notifications-outline" accessibilityLabel="Notifications" testID="btn-notifications-top" onPress={onBell} color={c.navText} badge={unread} />
      {onAdd ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Add record" testID="btn-add" onPress={onAdd} style={[styles.addBtn, { backgroundColor: c.accentSolid }]}>
          <Ionicons name="add" size={26} color={c.accentText} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function RoleSwitchButton() {
  const { roles } = useAuth();
  if (roles.length < 2) return null;
  return <Button title="Switch role" variant="secondary" />;
}

const styles = StyleSheet.create({
  sidebar: { flexDirection: 'column' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  logo: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  navItem: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: space.md, marginHorizontal: space.sm, borderRadius: radius.md, marginBottom: 2 },
  userBlock: { borderTopWidth: 1, paddingVertical: space.sm },
  userRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: space.md },
  badge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs, paddingBottom: 4, minHeight: 56, gap: 2 },
  addBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginLeft: 4, marginRight: 6 },
  drawer: { width: 300, maxWidth: '85%' },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingHorizontal: space.md, borderBottomWidth: 1, gap: space.xs },
  headerCluster: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: space.sm, borderRadius: radius.md, marginLeft: space.xs },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginLeft: space.sm },
  menuItem: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: space.sm, borderRadius: radius.md },
});
