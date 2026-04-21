import { Box, Group, Menu, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { ApplicationStatus, STATUS_ORDER } from '@shared/application';

const STATUS_COLOR: Record<ApplicationStatus, string> = {
    draft: 'gray',
    applied: 'blue',
    in_review: 'cyan',
    interview_scheduled: 'grape',
    interviewed: 'violet',
    offer_received: 'teal',
    accepted: 'green',
    rejected: 'red',
    withdrawn: 'dark',
};

function pillStyles(color: string, compact: boolean): React.CSSProperties {
    return {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: compact ? '4px 10px' : '6px 14px',
        borderRadius: 999,
        border: `1px solid light-dark(var(--mantine-color-${color}-4), var(--mantine-color-${color}-7))`,
        backgroundColor: `light-dark(var(--mantine-color-${color}-0), var(--mantine-color-${color}-9))`,
        color: `light-dark(var(--mantine-color-${color}-8), var(--mantine-color-${color}-2))`,
        fontSize: compact ? 12 : 13,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'background 120ms, border-color 120ms',
        minWidth: compact ? 140 : 160,
        justifyContent: 'space-between',
    };
}

interface Props {
    value: ApplicationStatus;
    onChange: (status: ApplicationStatus) => void;
    compact?: boolean;
}

export function StatusSelector({ value, onChange, compact = false }: Props) {
    const { t } = useTranslation();
    const color = STATUS_COLOR[value];

    return (
        <Menu position="bottom-start" shadow="md" width={220}>
            <Menu.Target>
                <UnstyledButton style={pillStyles(color, compact)}>
                    <Group gap={8} wrap="nowrap">
                        <Box
                            w={compact ? 6 : 8}
                            h={compact ? 6 : 8}
                            style={{
                                borderRadius: '50%',
                                backgroundColor: `var(--mantine-color-${color}-5)`,
                                flexShrink: 0,
                            }}
                        />
                        <Text
                            size={compact ? 'xs' : 'sm'}
                            fw={600}
                            style={{
                                color: `light-dark(var(--mantine-color-${color}-8), var(--mantine-color-${color}-2))`,
                            }}
                        >
                            {t(`status.${value}`)}
                        </Text>
                    </Group>
                    <IconChevronDown size={12} style={{ opacity: 0.6 }} />
                </UnstyledButton>
            </Menu.Target>

            <Menu.Dropdown>
                {STATUS_ORDER.map((status) => {
                    const statusColor = STATUS_COLOR[status];
                    const isActive = status === value;
                    return (
                        <Menu.Item
                            key={status}
                            onClick={() => onChange(status)}
                            leftSection={
                                <Box
                                    w={10}
                                    h={10}
                                    style={{
                                        borderRadius: '50%',
                                        backgroundColor: `var(--mantine-color-${statusColor}-5)`,
                                    }}
                                />
                            }
                            style={
                                isActive
                                    ? {
                                          backgroundColor: `light-dark(var(--mantine-color-${statusColor}-0), var(--mantine-color-${statusColor}-9))`,
                                      }
                                    : undefined
                            }
                        >
                            <Text size="sm" fw={isActive ? 600 : 400}>
                                {t(`status.${status}`)}
                            </Text>
                        </Menu.Item>
                    );
                })}
            </Menu.Dropdown>
        </Menu>
    );
}
