'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTrainerProfileStore } from '@/stores/trainerProfileStore';
import { useChatBarStore } from '@/stores/chatBarStore';
import type { UnitSystem } from '@/lib/types/user';
import { Button } from '@/components/ui/button-shadcn';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card-shadcn';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select-shadcn';

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
  const trainerProfile = useTrainerProfileStore((s) => s.profile);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <div className="pb-24">
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-4 sm:px-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your app preferences and training defaults.</p>
        </header>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Unit System</CardTitle>
            <CardDescription>Choose your preferred weight display format.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {(['metric', 'imperial'] as UnitSystem[]).map((unit) => (
                <Button
                  type="button"
                  key={unit}
                  variant={unitSystem === unit ? 'default' : 'outline'}
                  onClick={() => setUnitSystem(unit)}
                  className="capitalize"
                >
                  {unit === 'metric' ? 'kg' : 'lbs'}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Rest Timer</CardTitle>
            <CardDescription>Set default rest behavior for workouts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rest-duration">Default duration</Label>
              <Select
                id="rest-duration"
                value={defaultRestTimer}
                onChange={(e) => setDefaultRestTimer(Number(e.target.value))}
              >
                {REST_TIMER_OPTIONS.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds >= 60 ? `${seconds / 60}m` : `${seconds}s`}
                    {seconds < 60 ? '' : seconds % 60 !== 0 ? ` ${seconds % 60}s` : ''}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rest-autostart">Auto-start after each set</Label>
              <Select
                id="rest-autostart"
                value={autoStartRestTimer ? 'enabled' : 'disabled'}
                onChange={(e) => setAutoStartRestTimer(e.target.value === 'enabled')}
              >
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Trainer Profile</CardTitle>
            <CardDescription>
              {trainerProfile
                ? `${trainerProfile.experienceLevel} · ${trainerProfile.goals.join(', ')}`
                : 'Set up your training profile for personalized advice.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between"
              onClick={() => useChatBarStore.getState().expand()}
            >
              Open Trainer
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Button>
          </CardContent>
        </Card>

        <div className="pt-4">
          <Button variant="outline" className="w-full" onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
