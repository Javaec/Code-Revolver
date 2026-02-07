import { Button } from './ui';

interface HeaderProps {
    onRefresh: () => void;
    onOpenDir: () => void;
    onOpenSettings: () => void;
    onAddAccount: () => void;
    onTogglePrivacy: () => void;
    isPrivacyMode: boolean;
    loading: boolean;
}

export function Header({ onRefresh, onOpenDir, onOpenSettings, onAddAccount, onTogglePrivacy, isPrivacyMode, loading }: HeaderProps) {
    return (
        <header className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
                <div>
                    <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Code Revolver</h1>
                    <p className="text-[11px] text-slate-500 mt-0.5">Cylinder rotation for Codex accounts and limits</p>
                </div>
            </div>

            <div className="flex gap-2">
                <Button
                    onClick={onTogglePrivacy}
                    variant={isPrivacyMode ? 'secondary' : 'outline'}
                    size="sm"
                    className={`h-9 ${isPrivacyMode ? 'text-primary-300 border-primary-500/40 bg-primary-500/10' : ''}`}
                    title={isPrivacyMode ? "Disable Privacy Mode" : "Enable Privacy Mode (Blur Sensitive Info)"}
                >
                    {isPrivacyMode ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                        </svg>
                    ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                    )}
                </Button>

                <Button
                    onClick={onRefresh}
                    disabled={loading}
                    variant="outline"
                    size="sm"
                    className="h-9"
                    title="Refresh List"
                >
                    <svg
                        className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </Button>

                <Button onClick={onAddAccount} variant="outline" size="sm" className="h-9" title="Add Account">
                    <svg className="w-4 h-4 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                </Button>

                <Button onClick={onOpenDir} variant="outline" size="sm" className="h-9" title="Open Folder">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                    </svg>
                </Button>

                <Button onClick={onOpenSettings} variant="outline" size="sm" className="h-9" title="Settings">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </Button>
            </div>
        </header>
    );
}
