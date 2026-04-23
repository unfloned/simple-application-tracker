export const ROUTES = {
    dashboard: '/dashboard',
    applications: '/applications',
    candidates: '/candidates',
    inbox: '/inbox',
    agents: '/agents',
    chat: '/chat',
    analytics: '/analytics',
    settings: '/settings',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
