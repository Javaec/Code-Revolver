import { AppSettings } from '../../types';
import { Button, Input } from '../ui';

interface SettingsGeneralTabProps {
  localDir: string;
  settings: AppSettings;
  onLocalDirChange: (value: string) => void;
  onBrowseDir: () => void | Promise<void>;
  onSaveDir: () => void | Promise<void>;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
}

export function SettingsGeneralTab({
  localDir,
  settings,
  onLocalDirChange,
  onBrowseDir,
  onSaveDir,
  onUpdateSettings,
}: SettingsGeneralTabProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-300">Account Data Directory</label>
        <div className="flex gap-2">
          <Input
            type="text"
            value={localDir}
            onChange={(e) => onLocalDirChange(e.target.value)}
            className="flex-1 text-sm"
          />
          <Button variant="outline" size="sm" onClick={() => void onBrowseDir()}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void onSaveDir()}>
            Save
          </Button>
        </div>
        <p className="text-xs text-slate-500">Existing JSON files will be automatically copied to the new directory after modification</p>
      </div>

      <div className="h-px bg-white/10" />

      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-slate-200">Auto Background Check</div>
          <div className="text-xs text-slate-400">Periodically scan account status and usage</div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={settings.autoCheck}
            onChange={(e) => onUpdateSettings({ autoCheck: e.target.checked })}
          />
          <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600" />
        </label>
      </div>

      {settings.autoCheck && (
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2">Check Interval (minutes)</label>
          <Input
            type="number"
            min="5"
            max="1440"
            value={settings.checkInterval}
            onChange={(e) => onUpdateSettings({ checkInterval: parseInt(e.target.value) || 30 })}
            className="w-32"
          />
        </div>
      )}

      <div className="h-px bg-white/10" />

      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-slate-200">Smart Auto Switch</div>
          <div className="text-xs text-slate-400">Automatically switch to the best candidate based on remaining quota</div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={settings.enableAutoSwitch}
            onChange={(e) => onUpdateSettings({ enableAutoSwitch: e.target.checked })}
          />
          <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
        </label>
      </div>

      {settings.enableAutoSwitch && (
        <div className="pl-1 space-y-2">
          <label className="block text-sm font-medium text-slate-400">Auto switch when remaining quota is below (%)</label>
          <Input
            type="number"
            min={1}
            max={50}
            value={settings.autoSwitchThreshold}
            onChange={(e) => {
              const val = Math.min(50, Math.max(1, parseInt(e.target.value) || settings.autoSwitchThreshold));
              onUpdateSettings({ autoSwitchThreshold: val });
            }}
            className="w-32"
          />
          <p className="text-xs text-slate-500">For example, if set to 5, it will switch when remaining quota is &lt;= 5%</p>
        </div>
      )}
    </div>
  );
}
