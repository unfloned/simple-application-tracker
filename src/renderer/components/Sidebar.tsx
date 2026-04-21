import { Badge, Box, Kbd, Stack, Text, UnstyledButton } from '@mantine/core';
import {
    IconBriefcase,
    IconChartBar,
    IconInbox,
    IconMessageCircle,
    IconRobot,
    IconSettings,
    IconSparkles,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES, type RoutePath } from '../routes';

interface NavItem {
    path: RoutePath;
    icon: React.ComponentType<{ size?: number | string }>;
    labelKey: string;
    badge?: number;
    badgeColor?: string;
}

interface Props {
    applicationsCount: number;
    candidatesCount: number;
}

function NavButton({
    icon: Icon,
    label,
    active,
    badge,
    badgeColor,
    onClick,
}: {
    icon: React.ComponentType<{ size?: number | string }>;
    label: string;
    active: boolean;
    badge?: number;
    badgeColor?: string;
    onClick: () => void;
}) {
    return (
        <UnstyledButton
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 10px',
                borderRadius: 6,
                backgroundColor: active
                    ? 'light-dark(var(--mantine-color-accent-0), rgba(87, 130, 255, 0.15))'
                    : 'transparent',
                color: active
                    ? 'light-dark(var(--mantine-color-accent-7), var(--mantine-color-accent-2))'
                    : 'light-dark(var(--mantine-color-gray-7), var(--mantine-color-gray-3))',
                fontWeight: active ? 600 : 500,
                fontSize: 13,
                transition: 'background 120ms, color 120ms',
                width: '100%',
            }}
            onMouseEnter={(e) => {
                if (!active) {
                    e.currentTarget.style.backgroundColor =
                        'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))';
                }
            }}
            onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = 'transparent';
            }}
        >
            <Icon size={16} />
            <Text size="sm" style={{ flex: 1 }} inherit>
                {label}
            </Text>
            {badge !== undefined && badge > 0 && (
                <Badge
                    size="xs"
                    variant={active ? 'filled' : 'light'}
                    color={badgeColor || 'gray'}
                    styles={{ root: { fontWeight: 600 } }}
                >
                    {badge}
                </Badge>
            )}
        </UnstyledButton>
    );
}

export function Sidebar({ applicationsCount, candidatesCount }: Props) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const currentPath = location.pathname;

    const mainItems: NavItem[] = [
        {
            path: ROUTES.dashboard,
            icon: IconInbox,
            labelKey: 'nav.inbox',
        },
        {
            path: ROUTES.applications,
            icon: IconBriefcase,
            labelKey: 'tabs.applications',
            badge: applicationsCount,
            badgeColor: 'gray',
        },
        {
            path: ROUTES.candidates,
            icon: IconSparkles,
            labelKey: 'tabs.candidates',
            badge: candidatesCount > 0 ? candidatesCount : undefined,
            badgeColor: 'red',
        },
        {
            path: ROUTES.agents,
            icon: IconRobot,
            labelKey: 'nav.agents',
        },
        {
            path: ROUTES.chat,
            icon: IconMessageCircle,
            labelKey: 'nav.chat',
        },
        {
            path: ROUTES.analytics,
            icon: IconChartBar,
            labelKey: 'nav.analytics',
        },
    ];

    const isActive = (path: string) =>
        currentPath === path || (path === ROUTES.dashboard && currentPath === '/');

    return (
        <Stack
            h="100%"
            justify="space-between"
            py="sm"
            px="xs"
            gap={4}
            style={{
                backgroundColor:
                    'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))',
                borderRight:
                    '1px solid light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-5))',
            }}
        >
            <Stack gap={4}>
                <Box
                    px="sm"
                    py="xs"
                    mb={4}
                    style={{ WebkitAppRegion: 'drag', minHeight: 30 }}
                >
                    <Text
                        fw={700}
                        size="sm"
                        style={{ letterSpacing: '-0.02em', marginLeft: 54 }}
                    >
                        {t('app.titleShort')}
                    </Text>
                </Box>

                <Stack gap={2} px={4}>
                    <Text
                        size="xs"
                        c="dimmed"
                        tt="uppercase"
                        fw={600}
                        px="sm"
                        py={4}
                        style={{ letterSpacing: '0.06em', fontSize: 10 }}
                    >
                        {t('nav.section.main')}
                    </Text>
                    {mainItems.map((item) => (
                        <NavButton
                            key={item.path}
                            icon={item.icon}
                            label={t(item.labelKey)}
                            active={isActive(item.path)}
                            badge={item.badge}
                            badgeColor={item.badgeColor}
                            onClick={() => navigate(item.path)}
                        />
                    ))}
                </Stack>
            </Stack>

            <Stack gap={4} px={4}>
                <NavButton
                    icon={IconSettings}
                    label={t('toolbar.settings')}
                    active={isActive(ROUTES.settings)}
                    onClick={() => navigate(ROUTES.settings)}
                />
                <Box
                    px="sm"
                    py={6}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 11,
                        color: 'var(--mantine-color-dimmed)',
                    }}
                >
                    <Kbd size="xs">⌘</Kbd>
                    <Kbd size="xs">K</Kbd>
                    <Text size="xs" c="dimmed" inherit>
                        commands
                    </Text>
                </Box>
            </Stack>
        </Stack>
    );
}
