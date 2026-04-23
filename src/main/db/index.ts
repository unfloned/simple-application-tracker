/**
 * DB domain — public API. `initDatabase` has to run once at app startup;
 * everything else below is the CRUD surface used by IPC handlers and
 * background jobs.
 */

export { initDatabase } from './init';
export {
    createApplication,
    deleteApplication,
    getApplication,
    listApplications,
    updateApplication,
} from './applications';
export { listApplicationEvents, listEventsForApplication } from './events';
export { listEmailsForApplication, logSentEmail } from './emails';
export {
    insertInboundEmail,
    getInboundEmailByMessageId,
    listInboundEmails,
    setInboundReviewStatus,
    updateInboundSuggestion,
    getLatestInboundReceivedAt,
} from './inbox';
export type {
    InboundEmailInput,
    InboundEmailRow,
    InboundReviewStatus,
} from './inbox';
export type { ApplicationEventRow, ApplicationRow, EmailLogRow } from './types';
