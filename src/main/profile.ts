import { safeStorage } from 'electron';
import Store from 'electron-store';

export interface UserProfile {
    fullName: string;
    email: string;
    phone: string;
    signature: string;
    cvPath: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPassword: string;
    smtpFromName: string;
}

interface StoredProfile extends Omit<UserProfile, 'smtpPassword'> {
    smtpPasswordEnc: string;
    /** Legacy plaintext field from pre-0.4.0. Only present when migration runs. */
    smtpPassword?: string;
}

const ENC_PREFIX = 'enc:v1:';

function encryptPassword(plain: string): string {
    if (!plain) return '';
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
            'OS keychain encryption is not available. Refusing to store the SMTP password as plain text.',
        );
    }
    const buf = safeStorage.encryptString(plain);
    return ENC_PREFIX + buf.toString('base64');
}

function decryptPassword(stored: string): string {
    if (!stored) return '';
    if (!stored.startsWith(ENC_PREFIX)) return stored;
    try {
        const buf = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64');
        return safeStorage.decryptString(buf);
    } catch (err) {
        console.warn('[profile] decryptString failed:', (err as Error).message);
        return '';
    }
}

const store = new Store<StoredProfile>({
    name: 'user-profile',
    defaults: {
        fullName: '',
        email: '',
        phone: '',
        signature: '',
        cvPath: '',
        smtpHost: '',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: '',
        smtpPasswordEnc: '',
        smtpFromName: '',
    },
});

migrateLegacyPassword();

function migrateLegacyPassword(): void {
    const legacy = store.get('smtpPassword');
    if (legacy && typeof legacy === 'string') {
        if (!store.get('smtpPasswordEnc')) {
            try {
                store.set('smtpPasswordEnc', encryptPassword(legacy));
            } catch (err) {
                console.warn('[profile] legacy password migration failed:', (err as Error).message);
                return;
            }
        }
        store.delete('smtpPassword' as keyof StoredProfile);
    }
}

export function getUserProfile(): UserProfile {
    return {
        fullName: store.get('fullName'),
        email: store.get('email'),
        phone: store.get('phone'),
        signature: store.get('signature'),
        cvPath: store.get('cvPath'),
        smtpHost: store.get('smtpHost'),
        smtpPort: store.get('smtpPort'),
        smtpSecure: store.get('smtpSecure'),
        smtpUser: store.get('smtpUser'),
        smtpPassword: decryptPassword(store.get('smtpPasswordEnc')),
        smtpFromName: store.get('smtpFromName'),
    };
}

export function setUserProfile(profile: Partial<UserProfile>): UserProfile {
    for (const [key, value] of Object.entries(profile)) {
        if (value === undefined) continue;
        if (key === 'smtpPassword') {
            store.set('smtpPasswordEnc', encryptPassword(String(value)));
        } else {
            const storedKey = key as keyof StoredProfile;
            store.set(storedKey, value as StoredProfile[typeof storedKey]);
        }
    }
    return getUserProfile();
}

export function isSmtpEncryptionAvailable(): boolean {
    try {
        return safeStorage.isEncryptionAvailable();
    } catch {
        return false;
    }
}
