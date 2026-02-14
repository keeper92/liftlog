'use client';

import { useEffect, useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useExerciseSearch } from '@/hooks/useExerciseSearch';
import { CARDIO_DISPLAY_NAMES } from '@/lib/types/exercise';
import type { ExerciseRow } from '@/lib/types/exercise';
import { MUSCLE_GROUPS, EXERCISE_CATEGORIES } from '@/lib/constants';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

interface ExercisePickerOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (exercise: { id: string; name: string; category: string }) => void;
}

export default function ExercisePickerOverlay({ isOpen, onClose, onSelect }: ExercisePickerOverlayProps) {
  const supabase = createClient();

  // Escape key to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return <PickerContent supabase={supabase} onClose={onClose} onSelect={onSelect} />;
}

/** Inner component that only mounts when overlay is open (so hooks run fresh each open) */
function PickerContent({
  supabase,
  onClose,
  onSelect,
}: {
  supabase: ReturnType<typeof createClient>;
  onClose: () => void;
  onSelect: (exercise: { id: string; name: string; category: string }) => void;
}) {
  const {
    exercises,
    setExercises,
    loading,
    search,
    setSearch,
    selectedMuscle,
    setSelectedMuscle,
    showCardio,
    setShowCardio,
    showRecentlyUsed,
    setShowRecentlyUsed,
    currentUserId,
  } = useExerciseSearch();

  // Create/Edit modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingExercise, setEditingExercise] = useState<ExerciseRow | null>(null);
  const [exerciseForm, setExerciseForm] = useState({
    name: '',
    category: 'barbell' as string,
    primaryMuscle: 'chest' as string,
  });
  const [saving, setSaving] = useState(false);

  function handleSelectExercise(exercise: ExerciseRow) {
    onSelect({ id: exercise.id, name: exercise.name, category: exercise.category });
  }

  function openCreateModal() {
    setEditingExercise(null);
    setExerciseForm({ name: search || '', category: 'barbell', primaryMuscle: 'chest' });
    setShowCreateModal(true);
  }

  function openEditModal(exercise: ExerciseRow) {
    setEditingExercise(exercise);
    setExerciseForm({
      name: exercise.name,
      category: exercise.category,
      primaryMuscle: exercise.primary_muscles[0] || 'chest',
    });
    setShowCreateModal(true);
  }

  async function handleSaveExercise() {
    if (!exerciseForm.name.trim()) return;

    setSaving(true);
    const isOwnCustom = editingExercise?.is_custom && editingExercise?.user_id === currentUserId;

    if (editingExercise && isOwnCustom) {
      const { error } = await supabase
        .from('exercises')
        .update({
          name: exerciseForm.name.trim(),
          category: exerciseForm.category,
          primary_muscles: [exerciseForm.primaryMuscle],
        })
        .eq('id', editingExercise.id);

      if (!error) {
        setExercises((prev) =>
          prev.map((ex) =>
            ex.id === editingExercise.id
              ? { ...ex, name: exerciseForm.name.trim(), category: exerciseForm.category, primary_muscles: [exerciseForm.primaryMuscle] }
              : ex
          )
        );
      }
    } else if (editingExercise && !isOwnCustom) {
      const { data, error } = await supabase
        .from('exercises')
        .insert({
          name: exerciseForm.name.trim(),
          category: exerciseForm.category,
          primary_muscles: [exerciseForm.primaryMuscle],
          secondary_muscles: [],
          is_custom: true,
          user_id: currentUserId,
        })
        .select('id, name, category, primary_muscles, equipment, is_custom, user_id')
        .single();

      if (!error && data) {
        onSelect({ id: data.id, name: data.name, category: data.category });
        setShowCreateModal(false);
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from('exercises')
        .insert({
          name: exerciseForm.name.trim(),
          category: exerciseForm.category,
          primary_muscles: [exerciseForm.primaryMuscle],
          secondary_muscles: [],
          is_custom: true,
          user_id: currentUserId,
        })
        .select('id, name, category, primary_muscles, equipment, is_custom, user_id')
        .single();

      if (!error && data) {
        onSelect({ id: data.id, name: data.name, category: data.category });
        setShowCreateModal(false);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setShowCreateModal(false);
  }

  async function handleDeleteExercise() {
    if (!editingExercise) return;
    if (!window.confirm('Delete this custom exercise? This cannot be undone.')) return;

    setSaving(true);
    const { error } = await supabase.from('exercises').delete().eq('id', editingExercise.id);
    if (!error) {
      setExercises((prev) => prev.filter((ex) => ex.id !== editingExercise.id));
    }
    setSaving(false);
    setShowCreateModal(false);
  }

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h1 className="text-lg font-bold">Add Exercise</h1>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-light transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative mb-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search exercises..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-3 min-h-[48px] text-sm focus:border-primary outline-none"
            autoFocus
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex overflow-x-auto gap-2 pb-2 -mx-4 px-4 scrollbar-hide">
          <button
            onClick={() => {
              setShowRecentlyUsed(true);
              setShowCardio(false);
              setSelectedMuscle(null);
            }}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              showRecentlyUsed ? 'bg-primary text-white' : 'bg-surface-light text-text-secondary'
            }`}
          >
            Recently Used
          </button>
          <button
            onClick={() => {
              setShowRecentlyUsed(false);
              setShowCardio(false);
              setSelectedMuscle(null);
            }}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              !showRecentlyUsed && !showCardio && !selectedMuscle ? 'bg-primary text-white' : 'bg-surface-light text-text-secondary'
            }`}
          >
            All
          </button>
          <button
            onClick={() => {
              setShowRecentlyUsed(false);
              setShowCardio(true);
              setSelectedMuscle(null);
            }}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              showCardio ? 'bg-primary text-white' : 'bg-surface-light text-text-secondary'
            }`}
          >
            Cardio
          </button>
          {MUSCLE_GROUPS.map((m) => (
            <button
              key={m}
              onClick={() => {
                setShowRecentlyUsed(false);
                setShowCardio(false);
                setSelectedMuscle(selectedMuscle === m ? null : m);
              }}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                !showRecentlyUsed && !showCardio && selectedMuscle === m ? 'bg-primary text-white' : 'bg-surface-light text-text-secondary'
              }`}
            >
              {m.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Exercise List */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {loading ? (
          <p className="text-text-muted text-sm text-center py-8">Loading...</p>
        ) : exercises.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-text-muted text-sm mb-4">No exercises found</p>
            <Button variant="primary" onClick={openCreateModal}>
              Create &quot;{search || 'Custom Exercise'}&quot;
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Create custom button */}
            <button
              onClick={openCreateModal}
              className="w-full text-left px-3 py-3 rounded-xl hover:bg-surface-light transition-colors min-h-[44px] border border-dashed border-border mb-2"
            >
              <div className="flex items-center gap-2 text-primary">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span className="font-medium text-sm">Create Custom Exercise</span>
              </div>
            </button>

            {exercises.map((ex) => {
              const isOwnCustom = ex.is_custom && ex.user_id === currentUserId;
              return (
                <div key={ex.id} className="flex items-center gap-2">
                  <button
                    onClick={() => handleSelectExercise(ex)}
                    className="flex-1 text-left px-3 py-3 rounded-xl hover:bg-surface-light transition-colors min-h-[44px]"
                  >
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{CARDIO_DISPLAY_NAMES[ex.name] || ex.name}</p>
                      {ex.is_custom && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                          Custom
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-surface text-text-secondary capitalize">
                        {ex.category.replace('_', ' ')}
                      </span>
                      {ex.primary_muscles.slice(0, 2).map((m) => (
                        <span key={m} className="text-xs text-text-muted capitalize">
                          {m.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  </button>
                  <button
                    onClick={() => openEditModal(ex)}
                    className="p-2 text-text-muted hover:text-text transition-colors rounded-lg hover:bg-surface-light"
                    aria-label={isOwnCustom ? 'Edit exercise' : 'Rename exercise'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit Exercise Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={
          editingExercise
            ? editingExercise.is_custom && editingExercise.user_id === currentUserId
              ? 'Edit Custom Exercise'
              : 'Create Renamed Copy'
            : 'Create Custom Exercise'
        }
        actions={[
          ...(editingExercise?.is_custom && editingExercise?.user_id === currentUserId
            ? [{ label: 'Delete', onClick: handleDeleteExercise, variant: 'ghost' as const }]
            : []),
          { label: 'Cancel', onClick: () => setShowCreateModal(false), variant: 'ghost' as const },
          { label: saving ? 'Saving...' : 'Save', onClick: handleSaveExercise, variant: 'primary' as const },
        ]}
      >
        <div className="space-y-4">
          {editingExercise && !(editingExercise.is_custom && editingExercise.user_id === currentUserId) && (
            <p className="text-xs text-text-muted bg-surface-light rounded-lg px-3 py-2">
              This will create a custom copy with your preferred name. The original exercise will remain unchanged.
            </p>
          )}
          <div>
            <label className="block text-sm font-medium mb-1.5">Exercise Name</label>
            <input
              type="text"
              value={exerciseForm.name}
              onChange={(e) => setExerciseForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g., Bulgarian Split Squat"
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:border-primary outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Category</label>
            <select
              value={exerciseForm.category}
              onChange={(e) => setExerciseForm((f) => ({ ...f, category: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:border-primary outline-none capitalize"
            >
              {EXERCISE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat} className="capitalize">
                  {cat.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Primary Muscle</label>
            <select
              value={exerciseForm.primaryMuscle}
              onChange={(e) => setExerciseForm((f) => ({ ...f, primaryMuscle: e.target.value }))}
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:border-primary outline-none capitalize"
            >
              {MUSCLE_GROUPS.map((muscle) => (
                <option key={muscle} value={muscle} className="capitalize">
                  {muscle.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
