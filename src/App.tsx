import { lazy, Suspense, useState } from 'react';
import { Header } from './components/Header';
import { NavigationBar, ViewType } from './components/NavigationBar';
import { AccountCard } from './components/AccountCard';
import { AddAccountDialog } from './components/AddAccountDialog';
import { EditAccountDialog } from './components/EditAccountDialog';
import { SettingsDialog } from './components/SettingsDialog';
import { SyncConfirmDialog } from './components/SyncConfirmDialog';
import { AccountPoolPanel } from './components/AccountPoolPanel';
import { PoolMetadataDialog } from './components/PoolMetadataDialog';
import { useAccounts } from './hooks/useAccounts';
import { useIntervalTask } from './hooks/useIntervalTask';
import { AnimatePresence, motion } from 'framer-motion';
import { AccountInfo, AccountPoolMetadata, DEFAULT_SYNC_SETTINGS, GatewaySettings } from './types';
import { Card, Button } from './components/ui';
import { commands } from './lib/commands';
import { preloadPanel, panelImporters } from './lib/panelImports';
import { useNotifications } from './lib/notificationState';
import { toErrorMessage } from './lib/errors';

// Empty state animation variants
const emptyStateVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { type: 'spring' as const, damping: 20, stiffness: 200 }
  },
};

// Page transition animation variants
const pageVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

const PromptsPanel = lazy(async () => ({ default: (await panelImporters.prompts()).PromptsPanel }));
const SkillsPanel = lazy(async () => ({ default: (await panelImporters.skills()).SkillsPanel }));
const AgentsPanel = lazy(async () => ({ default: (await panelImporters.agents()).AgentsPanel }));
const ConfigPanel = lazy(async () => ({ default: (await panelImporters.config()).ConfigPanel }));
const GatewayPanel = lazy(async () => ({ default: (await panelImporters.gateway()).GatewayPanel }));

function App() {
  const {
    accounts,
    accountsDir,
    loading,
    refresh,
    switchAccount,
    deleteAccount,
    settings,
    updateSettings,
    renameAccount,
    setAccountsDir,
    addAccount,
    refreshAccountToken,
    bestCandidateFilePath,
    rankedCandidates,
    updateAccountPoolMetadata,
    usageLoadingByPath,
    activeAccountMutation,
    lastFailedMutation,
    retryLastFailedMutation,
    dismissLastFailedMutation,
  } = useAccounts();
  const { notifyError } = useNotifications();

  const [currentView, setCurrentView] = useState<ViewType>('accounts');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [isPrivacyMode, setIsPrivacyMode] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountInfo | null>(null);
  const [poolEditingAccount, setPoolEditingAccount] = useState<AccountInfo | null>(null);
  const [clockTickMs, setClockTickMs] = useState(() => Date.now());

  useIntervalTask(true, 60_000, () => {
    setClockTickMs(Date.now());
  });

  const handleOpenDir = async () => {
    try {
      await commands.openAccountsDir();
    } catch (error) {
      notifyError(toErrorMessage(error), 'Open Directory');
    }
  };

  const handleNavigate = (view: ViewType) => {
    if (view !== 'accounts') {
      preloadPanel(view);
    }
    setCurrentView(view);
  };

  const handleSyncComplete = (lastSyncTime: number) => {
    updateSettings({
      sync: { ...(settings.sync || DEFAULT_SYNC_SETTINGS), lastSyncTime }
    });
    refresh();
  };

  const handleUpdateGateway = (updates: Partial<GatewaySettings>) => {
    updateSettings({
      gateway: {
        ...settings.gateway,
        ...updates,
      },
    });
  };

  const handleSavePoolMetadata = (accountId: string, metadata: AccountPoolMetadata) => {
    updateAccountPoolMetadata(accountId, metadata);
  };

  return (
    <div className="min-h-screen text-slate-200 p-4 sm:p-6 font-sans selection:bg-primary-500/30">
      <div className="max-w-5xl mx-auto">
        {currentView === 'accounts' && (
          <>
            <Header
              onRefresh={refresh}
              onOpenDir={handleOpenDir}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onAddAccount={() => setIsAddDialogOpen(true)}
              onTogglePrivacy={() => setIsPrivacyMode(!isPrivacyMode)}
              isPrivacyMode={isPrivacyMode}
              loading={loading}
            />
          </>
        )}

        <main className="space-y-4">
          {lastFailedMutation && (
            <Card className="border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-amber-200">Last account action failed</div>
                  <div className="text-xs text-amber-100/80">{lastFailedMutation.message}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-8" onClick={() => void retryLastFailedMutation()}>
                    Retry
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8" onClick={dismissLastFailedMutation}>
                    Dismiss
                  </Button>
                </div>
              </div>
            </Card>
          )}
          <Suspense fallback={<Card className="p-8 text-center text-slate-400">Loading panel...</Card>}>
            <AnimatePresence mode="wait">
              {currentView === 'accounts' && (
              <motion.div
                key="accounts"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <div className="mb-4">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
                    Workspace Tools
                  </div>
                  <NavigationBar
                    onNavigate={handleNavigate}
                    onPrefetchView={preloadPanel}
                    onSync={() => setIsSyncOpen(true)}
                  />
                </div>

                <div className="mb-4">
                  <AccountPoolPanel
                    accounts={accounts}
                    rankedCandidates={rankedCandidates}
                    autoSwitchEnabled={settings.enableAutoSwitch}
                    autoSwitchThreshold={settings.autoSwitchThreshold}
                    onToggleAutoSwitch={(enabled) => updateSettings({ enableAutoSwitch: enabled })}
                    onEditAccountPool={(account) => setPoolEditingAccount(account)}
                  />
                </div>

                {accounts.length === 0 && !loading ? (
                  <motion.div
                    variants={emptyStateVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    <Card className="text-center py-8 sm:py-12 px-4">
                      <motion.div
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-[8px] flex items-center justify-center mx-auto mb-4 sm:mb-6"
                        animate={{ 
                          scale: [1, 1.05, 1],
                          boxShadow: [
                            '0 0 0 0 rgba(34, 211, 238, 0)',
                            '0 0 20px 4px rgba(34, 211, 238, 0.2)',
                            '0 0 0 0 rgba(34, 211, 238, 0)'
                          ]
                        }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        <svg className="w-8 h-8 sm:w-10 sm:h-10 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                      </motion.div>
                      <h3 className="text-lg sm:text-xl font-bold text-gradient mb-2">Cylinder Is Empty</h3>
                      <p className="text-slate-400 text-sm sm:text-base max-w-sm mx-auto mb-6">
                        Place your <span className="font-mono px-2 py-0.5 rounded-md border border-white/10 bg-white/5 text-xs text-primary-400">auth.json</span> file into the accounts directory to load the first chamber automatically.
                      </p>
                      <Button
                        variant="default"
                        size="sm"
                        className="h-9"
                        onClick={() => setIsAddDialogOpen(true)}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Account
                      </Button>
                    </Card>
                  </motion.div>
                ) : (
                  <div className="space-y-2">
                    <AnimatePresence initial={false}>
                      {accounts.map((account, index) => (
                        <motion.div
                          key={account.filePath}
                          layout
                          style={{ contentVisibility: 'auto', containIntrinsicSize: '160px' }}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -12 }}
                          transition={{ 
                            type: 'spring', 
                            stiffness: 320, 
                            damping: 28, 
                            mass: 0.9,
                            delay: index * 0.05
                          }}
                        >
                          <AccountCard
                            account={account}
                            onSwitch={() => switchAccount(account.filePath)}
                            onEdit={() => setEditingAccount(account)}
                            onEditPool={() => setPoolEditingAccount(account)}
                            onDelete={() => deleteAccount(account.filePath)}
                            onRefreshToken={() => refreshAccountToken(account.filePath)}
                            renameAccount={renameAccount}
                            isBestCandidate={account.filePath === bestCandidateFilePath}
                            isPrivacyMode={isPrivacyMode}
                            isUsageLoading={usageLoadingByPath[account.filePath] ?? false}
                            isMutationLocked={!!activeAccountMutation}
                            activeMutationKind={activeAccountMutation?.filePath === account.filePath ? activeAccountMutation.kind : null}
                            clockTickMs={clockTickMs}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </motion.div>
              )}

              {currentView === 'prompts' && (
              <motion.div
                key="prompts"
                className="h-[calc(100vh-8rem)] sm:h-[calc(100vh-10rem)]"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <PromptsPanel onBack={() => setCurrentView('accounts')} />
              </motion.div>
              )}

              {currentView === 'skills' && (
              <motion.div
                key="skills"
                className="h-[calc(100vh-8rem)] sm:h-[calc(100vh-10rem)]"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <SkillsPanel onBack={() => setCurrentView('accounts')} />
              </motion.div>
              )}

              {currentView === 'agents' && (
              <motion.div
                key="agents"
                className="h-[calc(100vh-8rem)] sm:h-[calc(100vh-10rem)]"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <AgentsPanel onBack={() => setCurrentView('accounts')} />
              </motion.div>
              )}

              {currentView === 'config' && (
              <motion.div
                key="config"
                className="h-[calc(100vh-8rem)] sm:h-[calc(100vh-10rem)]"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <ConfigPanel onBack={() => setCurrentView('accounts')} />
              </motion.div>
              )}

              {currentView === 'gateway' && (
              <motion.div
                key="gateway"
                className="h-[calc(100vh-8rem)] sm:h-[calc(100vh-10rem)]"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2 }}
              >
                <GatewayPanel
                  onBack={() => setCurrentView('accounts')}
                  gateway={settings.gateway}
                  onUpdateGateway={handleUpdateGateway}
                />
              </motion.div>
              )}
            </AnimatePresence>
          </Suspense>
        </main>

        <AddAccountDialog
          isOpen={isAddDialogOpen}
          onClose={() => setIsAddDialogOpen(false)}
          onAddAccount={addAccount}
        />

        <EditAccountDialog
          isOpen={!!editingAccount}
          onClose={() => setEditingAccount(null)}
          account={editingAccount}
          onSave={refresh}
        />

        <SettingsDialog
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          accountsDir={accountsDir}
          onSetAccountsDir={setAccountsDir}
          onUpdateSettings={updateSettings}
        />

        <SyncConfirmDialog
          isOpen={isSyncOpen}
          onClose={() => setIsSyncOpen(false)}
          webdavConfig={settings.webdav || { enabled: false, url: '', username: '', password: '', remotePath: '' }}
          syncSettings={settings.sync || DEFAULT_SYNC_SETTINGS}
          onSyncComplete={handleSyncComplete}
        />

        <PoolMetadataDialog
          key={poolEditingAccount?.id || 'pool-metadata-dialog'}
          isOpen={!!poolEditingAccount}
          account={poolEditingAccount}
          onClose={() => setPoolEditingAccount(null)}
          onSave={handleSavePoolMetadata}
        />
      </div>
    </div>
  );
}

export default App;
