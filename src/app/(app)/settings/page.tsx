'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSettingsStore } from '@/stores/settingsStore';
import type { UnitSystem } from '@/lib/types/user';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

const REST_TIMER_OPTIONS = [30, 60, 90, 120, 180, 300];

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const {
    unitSystem,
    defaultRestTimer,
    autoStartRestTimer,
    setUnitSystem,
    setDefaultRestTimer,
    setAutoStartRestTimer,
  } = useSettingsStore();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <div className="px-5 pt-8 pb-4">
      <p className="text-xs font-medium text-text-muted uppercase tracking-wider">LiftLog</p>
      <h1 className="text-3xl font-bold mt-1 mb-8">Settings</h1>

      <div className="space-y-4">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Unit System</p>
              <p className="text-sm text-text-secondary">Weight display format</p>
            </div>
            <div className="flex rounded-lg overflow-hidden border border-border">
              {(['metric', 'imperial'] as UnitSystem[]).map((unit) => (
                <button
                  key={unit}
                  onClick={() => setUnitSystem(unit)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    unitSystem === unit
                      ? 'bg-primary text-white'
                      : 'bg-surface text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {unit === 'metric' ? 'kg' : 'lbs'}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Rest Timer</p>
              <p className="text-sm text-text-secondary">Default duration between sets</p>
            </div>
            <select
              value={defaultRestTimer}
              onChange={(e) => setDefaultRestTimer(Number(e.target.value))}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            >
              {REST_TIMER_OPTIONS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds >= 60 ? `${seconds / 60}m` : `${seconds}s`}
                  {seconds < 60 ? '' : seconds % 60 !== 0 ? ` ${seconds % 60}s` : ''}
                </option>
              ))}
            </select>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Auto-Start Rest Timer</p>
              <p className="text-sm text-text-secondary">Start timer after logging a set</p>
            </div>
            <button
              onClick={() => setAutoStartRestTimer(!autoStartRestTimer)}
              className={`relative h-7 w-12 rounded-full transition-colors ${
                autoStartRestTimer ? 'bg-primary' : 'bg-border'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform ${
                  autoStartRestTimer ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </Card>
      </div>

      <div className="mt-10">
        <Button variant="outline" fullWidth onClick={handleSignOut}>
          Sign Out
        </Button>
      </div>
    </div>
  );
}
