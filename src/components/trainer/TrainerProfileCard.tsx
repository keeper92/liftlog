'use client';

import type { TrainerProfile } from '@/lib/types/user';
import Button from '@/components/ui/Button';

interface TrainerProfileCardProps {
  profile: TrainerProfile;
  onUpdate: () => void;
  onClose: () => void;
}

export default function TrainerProfileCard({ profile, onUpdate, onClose }: TrainerProfileCardProps) {
  return (
    <div className="absolute inset-x-0 top-0 z-20 bg-background/80 backdrop-blur-sm min-h-full">
      <div className="mx-4 mt-4 overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Training Profile</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </Button>
        </div>

        <div className="p-4 space-y-3">
          <ProfileRow label="Experience" value={profile.experienceLevel} />
          {profile.trainingFrequency && (
            <ProfileRow
              label="Frequency"
              value={`${profile.trainingFrequency}${profile.sessionDuration ? ` · ${profile.sessionDuration}` : ''}`}
            />
          )}
          {profile.goals.length > 0 && (
            <ProfileRow label="Goals" value={profile.goals.join(', ')} />
          )}
          {profile.gymAccess && (
            <ProfileRow label="Gym" value={profile.gymAccess} />
          )}
          {profile.availableEquipment.length > 0 && (
            <ProfileRow label="Equipment" value={profile.availableEquipment.join(', ')} />
          )}
          {profile.favoriteExercises.length > 0 && (
            <ProfileRow label="Favorites" value={profile.favoriteExercises.join(', ')} />
          )}
          {profile.dislikedOrAvoidedExercises.length > 0 && (
            <ProfileRow label="Avoids" value={profile.dislikedOrAvoidedExercises.join(', ')} />
          )}
          {profile.additionalNotes && (
            <ProfileRow label="Notes" value={profile.additionalNotes} />
          )}
        </div>

        <div className="p-4 border-t border-border">
          <Button variant="outline"
            onClick={onUpdate}
            className="w-full"
          >
            Update Profile
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground mt-0.5">{value}</p>
    </div>
  );
}
