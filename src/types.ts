export interface UsageInfo {
    primaryWindow?: {
        usedPercent: number;
        windowMinutes?: number;
        resetsAt?: number;
    };
    secondaryWindow?: {
        usedPercent: number;
        windowMinutes?: number;
        resetsAt?: number;
    };
    planType?: string;
}

export interface AccountInfo {
    id: string;
    name: string;
    email: string;
    planType: string;
    subscriptionEnd: string | null;
    isActive: boolean;
    filePath: string;
    usage?: UsageInfo;
    expiresAt?: number; // Deprecated
    lastRefresh: string;
    lastUsageUpdate?: number;
    isTokenExpired?: boolean;
}

export interface ScanResult {
    accounts: AccountInfo[];
    accountsDir: string;
}

export interface WebDavConfig {
    enabled: boolean;
    url: string;        // https://dav.jianguoyun.com/dav/
    username: string;   // Nutstore login email
    password: string;   // App-specific password
    remotePath: string; // Remote directory path, e.g., /code-revolver/
}

export interface SyncSettings {
    // Sync content
    syncAccounts: boolean;    // Account files
    syncPrompts: boolean;     // Prompts
    syncSkills: boolean;      // Skills
    syncAgentsMd: boolean;    // AGENTS.MD
    syncConfigToml: boolean;  // config.toml
    // Last sync time
    lastSyncTime?: number;
}

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
    syncAccounts: true,
    syncPrompts: true,
    syncSkills: true,
    syncAgentsMd: true,
    syncConfigToml: false,  // Disabled by default (MCP paths vary by device)
};

export interface AppSettings {
    accountsDir?: string;
    autoCheck: boolean;
    checkInterval: number; // minutes
    enableAutoSwitch: boolean;
    autoSwitchThreshold: number; // percent remaining to trigger switch
    webdav?: WebDavConfig;
    sync?: SyncSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
    autoCheck: true,
    checkInterval: 30,
    enableAutoSwitch: false,
    autoSwitchThreshold: 5,
    webdav: {
        enabled: false,
        url: 'https://dav.jianguoyun.com/dav/',
        username: '',
        password: '',
        remotePath: '/code-revolver/',
    },
    sync: DEFAULT_SYNC_SETTINGS,
};

// ========== Prompts & Skills ==========

export interface PromptInfo {
    name: string;
    description: string;
    argumentHint?: string;
    filePath: string;
    content: string;
}

export interface SkillInfo {
    name: string;
    description: string;
    compatibility?: string;
    dirPath: string;
    hasScripts: boolean;
    hasAssets: boolean;
    hasReferences: boolean;
}

export interface CodexSyncConfig {
    syncPrompts: boolean;
    syncSkills: boolean;
    syncAgentsMd: boolean;
    syncConfigToml: boolean;
}

export const DEFAULT_CODEX_SYNC_CONFIG: CodexSyncConfig = {
    syncPrompts: true,
    syncSkills: true,
    syncAgentsMd: true,
    syncConfigToml: false,  // Disabled by default (MCP paths vary by device)
};

export interface SyncPreviewItem {
    name: string;
    type: 'account' | 'prompt' | 'skill' | 'agents' | 'config';
    action: 'upload' | 'download' | 'conflict' | 'unchanged';
    localTime?: number;
    remoteTime?: number;
}

export interface SyncPreview {
    items: SyncPreviewItem[];
    uploadCount: number;
    downloadCount: number;
    conflictCount: number;
}

export interface SyncResult {
    uploaded: string[];
    downloaded: string[];
    errors: string[];
}

export interface MutationResult {
    success: boolean;
    message?: string;
}
