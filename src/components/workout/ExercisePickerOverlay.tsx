'use client';

import { useEffect, useCallback, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { rankExercisesBySearch, useExerciseSearch } from '@/hooks/useExerciseSearch';
import { CARDIO_DISPLAY_NAMES } from '@/lib/types/exercise';
import type { ExerciseRow } from '@/lib/types/exercise';
import { MUSCLE_GROUPS, EXERCISE_CATEGORIES } from '@/lib/constants';
import {
  inferEquipmentFromCategory,
  inferExerciseCategoryFromName,
  inferPrimaryMuscleFromName,
} from '@/lib/utils/exerciseInference';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/input-shadcn';
import { Select } from '@/components/ui/select-shadcn';

interface ExercisePickerOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (exercise: { id: string; name: string; category: string }) => void;
}

export default function ExercisePickerOverlay({ isOpen, onClose, onSelect }: ExercisePickerOverlayProps) {
  const supabase = useMemo(() => createClient(), []);

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
    libraryView,
    setLibraryView,
    favoriteExerciseIds,
    isFavorite,
    toggleFavorite,
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
  const [categoryManuallyChanged, setCategoryManuallyChanged] = useState(false);
  const [primaryMuscleManuallyChanged, setPrimaryMuscleManuallyChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Merge modal state
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSourceExercise, setMergeSourceExercise] = useState<ExerciseRow | null>(null);
  const [mergeSearch, setMergeSearch] = useState('');
  const [mergeResults, setMergeResults] = useState<ExerciseRow[]>([]);
  const [mergeTarget, setMergeTarget] = useState<ExerciseRow | null>(null);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeSaving, setMergeSaving] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [showDuplicateCheckModal, setShowDuplicateCheckModal] = useState(false);
  const [duplicateCheckName, setDuplicateCheckName] = useState('');
  const [duplicateResults, setDuplicateResults] = useState<ExerciseRow[]>([]);
  const [duplicateChecking, setDuplicateChecking] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  function handleSelectExercise(exercise: ExerciseRow) {
    onSelect({ id: exercise.id, name: exercise.name, category: exercise.category });
  }

  async function findPotentialDuplicates(name: string) {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, name, category, primary_muscles, equipment, is_custom, user_id')
      .order('name')
      .limit(2000);

    if (error || !data) {
      return { matches: [] as ExerciseRow[], error: 'Could not run duplicate check.' };
    }

    return {
      matches: rankExercisesBySearch(data as ExerciseRow[], name).slice(0, 12),
      error: null,
    };
  }

  function openCreateModal(initialName?: string) {
    setEditingExercise(null);
    const initial = initialName ?? search ?? '';
    setExerciseForm({
      name: initial,
      category: inferExerciseCategoryFromName(initial),
      primaryMuscle: inferPrimaryMuscleFromName(initial),
    });
    setCategoryManuallyChanged(false);
    setPrimaryMuscleManuallyChanged(false);
    setActionError(null);
    setShowCreateModal(true);
  }

  async function startCreateFlow() {
    const candidate = search.trim();
    if (!candidate) {
      openCreateModal('');
      return;
    }

    setDuplicateCheckName(candidate);
    setDuplicateResults([]);
    setDuplicateError(null);
    setShowDuplicateCheckModal(true);
    setDuplicateChecking(true);

    const { matches, error } = await findPotentialDuplicates(candidate);
    setDuplicateResults(matches);
    setDuplicateError(error);
    setDuplicateChecking(false);
  }

  function closeDuplicateCheckModal() {
    if (duplicateChecking) return;
    setShowDuplicateCheckModal(false);
    setDuplicateCheckName('');
    setDuplicateResults([]);
    setDuplicateError(null);
  }

  function handleUsePotentialDuplicate(exercise: ExerciseRow) {
    handleSelectExercise(exercise);
    closeDuplicateCheckModal();
  }

  function handleCreateAnyway() {
    const initial = duplicateCheckName || search;
    closeDuplicateCheckModal();
    openCreateModal(initial);
  }

  function openEditModal(exercise: ExerciseRow) {
    setEditingExercise(exercise);
    setExerciseForm({
      name: exercise.name,
      category: exercise.category,
      primaryMuscle: exercise.primary_muscles[0] || 'chest',
    });
    setCategoryManuallyChanged(true);
    setPrimaryMuscleManuallyChanged(true);
    setActionError(null);
    setShowCreateModal(true);
  }

  function closeCreateModal() {
    if (saving || deleting) return;
    setShowCreateModal(false);
    setCategoryManuallyChanged(false);
    setPrimaryMuscleManuallyChanged(false);
    setActionError(null);
  }

  function openMergeModal(exercise: ExerciseRow) {
    setShowCreateModal(false);
    setMergeSourceExercise(exercise);
    setMergeSearch(exercise.name);
    setMergeResults([]);
    setMergeTarget(null);
    setMergeError(null);
    setShowMergeModal(true);
  }

  function closeMergeModal() {
    if (mergeSaving) return;
    setShowMergeModal(false);
    setMergeSourceExercise(null);
    setMergeSearch('');
    setMergeResults([]);
    setMergeTarget(null);
    setMergeError(null);
  }

  useEffect(() => {
    if (!showMergeModal || !mergeSourceExercise) return;
    if (!mergeSearch.trim()) return;

    let cancelled = false;
    const debounce = setTimeout(async () => {
      setMergeLoading(true);
      const { data, error } = await supabase
        .from('exercises')
        .select('id, name, category, primary_muscles, equipment, is_custom, user_id')
        .neq('id', mergeSourceExercise.id)
        .ilike('name', `%${mergeSearch.trim()}%`)
        .order('name')
        .limit(12);

      if (cancelled) return;

      if (error) {
        setMergeResults([]);
        setMergeTarget(null);
        setMergeError('Unable to search exercises right now.');
      } else {
        const rows = (data ?? []) as ExerciseRow[];
        setMergeResults(rows);
        setMergeError(null);
        if (!rows.some((row) => row.id === mergeTarget?.id)) {
          setMergeTarget(null);
        }
      }
      setMergeLoading(false);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [mergeSearch, mergeSourceExercise, mergeTarget?.id, showMergeModal, supabase]);

  async function handleSaveExercise() {
    const trimmedName = exerciseForm.name.trim();
    if (!trimmedName) {
      setActionError('Exercise name is required.');
      return;
    }

    setSaving(true);
    setActionError(null);
    const inferredEquipment = inferEquipmentFromCategory(exerciseForm.category);
    const isOwnCustom = editingExercise?.is_custom && editingExercise?.user_id === currentUserId;

    if (editingExercise && isOwnCustom) {
      const { error } = await supabase
        .from('exercises')
        .update({
          name: trimmedName,
          category: exerciseForm.category,
          primary_muscles: [exerciseForm.primaryMuscle],
          equipment: inferredEquipment,
        })
        .eq('id', editingExercise.id);

      if (error) {
        setActionError(error.message || 'Could not save exercise changes.');
        setSaving(false);
        return;
      }

      setExercises((prev) =>
        prev.map((ex) =>
          ex.id === editingExercise.id
            ? { ...ex, name: trimmedName, category: exerciseForm.category, primary_muscles: [exerciseForm.primaryMuscle], equipment: inferredEquipment }
            : ex
        )
      );
    } else {
      const { data, error } = await supabase
        .from('exercises')
        .insert({
          name: trimmedName,
          category: exerciseForm.category,
          primary_muscles: [exerciseForm.primaryMuscle],
          secondary_muscles: [],
          equipment: inferredEquipment,
          is_custom: true,
          user_id: currentUserId,
        })
        .select('id, name, category, primary_muscles, equipment, is_custom, user_id')
        .single();

      if (error) {
        setActionError(error.message || 'Could not create exercise.');
        setSaving(false);
        return;
      }

      if (data) {
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

    const isOwnCustom = editingExercise.is_custom && editingExercise.user_id === currentUserId;
    if (!isOwnCustom) return;

    setActionError(null);

    const [{ count: setCount }, { count: templateCount }] = await Promise.all([
      supabase.from('sets').select('*', { count: 'exact', head: true }).eq('exercise_id', editingExercise.id),
      supabase.from('template_exercises').select('*', { count: 'exact', head: true }).eq('exercise_id', editingExercise.id),
    ]);

    const usageWarnings: string[] = [];
    if ((setCount || 0) > 0) {
      usageWarnings.push(`${setCount} logged set${setCount === 1 ? '' : 's'}`);
    }
    if ((templateCount || 0) > 0) {
      usageWarnings.push(`${templateCount} template entr${templateCount === 1 ? 'y' : 'ies'}`);
    }

    const warningText = usageWarnings.length
      ? `This will also delete ${usageWarnings.join(' and ')} tied to this exercise.`
      : 'This cannot be undone.';

    if (!window.confirm(`Delete "${editingExercise.name}"?\n\n${warningText}`)) return;

    setDeleting(true);

    const { error: templateDeleteError } = await supabase
      .from('template_exercises')
      .delete()
      .eq('exercise_id', editingExercise.id);
    if (templateDeleteError) {
      setActionError(templateDeleteError.message || 'Could not remove template references.');
      setDeleting(false);
      return;
    }

    const { error: setsDeleteError } = await supabase
      .from('sets')
      .delete()
      .eq('exercise_id', editingExercise.id);
    if (setsDeleteError) {
      setActionError(setsDeleteError.message || 'Could not delete exercise history.');
      setDeleting(false);
      return;
    }

    const { error: exerciseDeleteError } = await supabase
      .from('exercises')
      .delete()
      .eq('id', editingExercise.id);
    if (exerciseDeleteError) {
      setActionError(exerciseDeleteError.message || 'Could not delete exercise.');
      setDeleting(false);
      return;
    }

    setExercises((prev) => prev.filter((ex) => ex.id !== editingExercise.id));
    setDeleting(false);
    setShowCreateModal(false);
  }

  async function handleMergeExercises() {
    if (!mergeSourceExercise || !mergeTarget) return;

    const confirmed = window.confirm(
      `Merge "${mergeSourceExercise.name}" into "${mergeTarget.name}"?\n\nThis will move all logged history and template references, then delete "${mergeSourceExercise.name}".`
    );
    if (!confirmed) return;

    setMergeSaving(true);
    setMergeError(null);

    const { error: moveSetsError } = await supabase
      .from('sets')
      .update({ exercise_id: mergeTarget.id })
      .eq('exercise_id', mergeSourceExercise.id);
    if (moveSetsError) {
      setMergeError(moveSetsError.message || 'Could not move exercise history.');
      setMergeSaving(false);
      return;
    }

    type TemplateExerciseRef = {
      template_id: string;
      order_index: number;
      default_sets: number;
    };

    const { data: sourceTemplateRefs, error: sourceTemplateRefsError } = await supabase
      .from('template_exercises')
      .select('template_id, order_index, default_sets')
      .eq('exercise_id', mergeSourceExercise.id);
    if (sourceTemplateRefsError) {
      setMergeError(sourceTemplateRefsError.message || 'Could not read template references.');
      setMergeSaving(false);
      return;
    }

    const sourceRefs = (sourceTemplateRefs ?? []) as TemplateExerciseRef[];
    if (sourceRefs.length > 0) {
      const templateIds = Array.from(new Set(sourceRefs.map((ref) => ref.template_id)));
      const { data: existingTargetRefs, error: existingTargetRefsError } = await supabase
        .from('template_exercises')
        .select('template_id')
        .in('template_id', templateIds)
        .eq('exercise_id', mergeTarget.id);

      if (existingTargetRefsError) {
        setMergeError(existingTargetRefsError.message || 'Could not check existing template references.');
        setMergeSaving(false);
        return;
      }

      const existingTemplateIds = new Set(
        ((existingTargetRefs ?? []) as { template_id: string }[]).map((row) => row.template_id)
      );
      const rowsToInsert = sourceRefs
        .filter((ref) => !existingTemplateIds.has(ref.template_id))
        .map((ref) => ({
          template_id: ref.template_id,
          exercise_id: mergeTarget.id,
          order_index: ref.order_index,
          default_sets: ref.default_sets,
        }));

      const { error: deleteSourceTemplateRefsError } = await supabase
        .from('template_exercises')
        .delete()
        .eq('exercise_id', mergeSourceExercise.id);

      if (deleteSourceTemplateRefsError) {
        setMergeError(deleteSourceTemplateRefsError.message || 'Could not remove old template references.');
        setMergeSaving(false);
        return;
      }

      if (rowsToInsert.length > 0) {
        const { error: insertTargetTemplateRefsError } = await supabase
          .from('template_exercises')
          .insert(rowsToInsert);
        if (insertTargetTemplateRefsError) {
          setMergeError(insertTargetTemplateRefsError.message || 'Could not add merged template references.');
          setMergeSaving(false);
          return;
        }
      }
    }

    const { error: deleteSourceExerciseError } = await supabase
      .from('exercises')
      .delete()
      .eq('id', mergeSourceExercise.id);
    if (deleteSourceExerciseError) {
      setMergeError(deleteSourceExerciseError.message || 'Could not delete source exercise.');
      setMergeSaving(false);
      return;
    }

    setExercises((prev) => prev.filter((ex) => ex.id !== mergeSourceExercise.id));
    setMergeSaving(false);
    closeMergeModal();
  }

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      {/* Close button */}
      <div className="px-4 pt-3 flex justify-end">
        <Button unstyled
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-light transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </Button>
      </div>

      {/* Search */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative mb-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <Input
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
          <Button unstyled
            onClick={() => setLibraryView('favorites')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              libraryView === 'favorites' ? 'bg-primary text-white' : 'bg-surface-light text-text-secondary'
            }`}
          >
            Favorites ({favoriteExerciseIds.length})
          </Button>
          <Button unstyled
            onClick={() => setLibraryView('all')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              libraryView === 'all' ? 'bg-primary text-white' : 'bg-surface-light text-text-secondary'
            }`}
          >
            All
          </Button>
        </div>
      </div>

      {/* Exercise List */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {loading ? (
          <p className="text-text-muted text-sm text-center py-8">Loading...</p>
        ) : exercises.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-text-muted text-sm mb-4">
              {libraryView === 'favorites' && !search.trim()
                ? 'No favorites yet. Star exercises to pin them here.'
                : 'No exercises found'}
            </p>
            <Button variant="primary" onClick={startCreateFlow}>
              Create &quot;{search || 'Custom Exercise'}&quot;
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Create custom button */}
            <Button unstyled
              onClick={startCreateFlow}
              className="w-full text-left px-3 py-3 rounded-xl hover:bg-surface-light transition-colors min-h-[44px] border border-dashed border-border mb-2"
            >
              <div className="flex items-center gap-2 text-primary">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span className="font-medium text-sm">Create Custom Exercise</span>
              </div>
            </Button>

            {exercises.map((ex) => {
              const isOwnCustom = ex.is_custom && ex.user_id === currentUserId;
              return (
                <div key={ex.id} className="flex items-center gap-2">
                  <Button unstyled
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
                  </Button>
                  <Button unstyled
                    onClick={() => { void toggleFavorite(ex.id); }}
                    className={`p-2 transition-colors rounded-lg hover:bg-surface-light ${
                      isFavorite(ex.id) ? 'text-primary' : 'text-text-muted hover:text-text'
                    }`}
                    aria-label={isFavorite(ex.id) ? 'Remove favorite' : 'Add favorite'}
                    title={isFavorite(ex.id) ? 'Remove favorite' : 'Add favorite'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={isFavorite(ex.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </Button>
                  <Button unstyled
                    onClick={() => openEditModal(ex)}
                    className="p-2 text-text-muted hover:text-text transition-colors rounded-lg hover:bg-surface-light"
                    aria-label={isOwnCustom ? 'Manage exercise' : 'Rename exercise'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        isOpen={showDuplicateCheckModal}
        onClose={closeDuplicateCheckModal}
        title="Possible Duplicates"
        actions={[
          { label: 'Cancel', onClick: closeDuplicateCheckModal, variant: 'ghost', disabled: duplicateChecking },
          { label: 'Create Anyway', onClick: handleCreateAnyway, variant: 'primary', disabled: duplicateChecking },
        ]}
      >
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            Final duplicate check for <span className="font-medium text-text">&quot;{duplicateCheckName}&quot;</span>.
            Use an existing exercise if it matches.
          </p>
          {duplicateError && (
            <p className="text-xs text-error bg-error/10 rounded-lg px-3 py-2">{duplicateError}</p>
          )}
          <div className="max-h-64 overflow-y-auto space-y-1">
            {duplicateChecking ? (
              <p className="text-xs text-text-muted py-2 text-center">Searching full library...</p>
            ) : duplicateResults.length === 0 ? (
              <p className="text-xs text-text-muted py-2 text-center">No close matches found.</p>
            ) : (
              duplicateResults.map((exercise) => (
                <Button unstyled
                  key={exercise.id}
                  onClick={() => handleUsePotentialDuplicate(exercise)}
                  className="w-full text-left rounded-lg border border-border px-3 py-2 hover:bg-surface-light transition-colors"
                >
                  <p className="text-sm font-medium text-text">{CARDIO_DISPLAY_NAMES[exercise.name] || exercise.name}</p>
                  <p className="text-xs text-text-muted mt-0.5 capitalize">
                    {exercise.category.replace('_', ' ')}
                  </p>
                </Button>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* Create/Edit Exercise Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={closeCreateModal}
        title={
          editingExercise
            ? editingExercise.is_custom && editingExercise.user_id === currentUserId
              ? 'Edit Custom Exercise'
              : 'Create Renamed Copy'
            : 'Create Custom Exercise'
        }
        actions={[
          { label: 'Cancel', onClick: closeCreateModal, variant: 'ghost' as const, disabled: saving || deleting },
          { label: saving ? 'Saving...' : 'Save', onClick: handleSaveExercise, variant: 'primary' as const, disabled: deleting },
        ]}
      >
        <div className="space-y-4">
          {actionError && (
            <p className="text-xs text-error bg-error/10 rounded-lg px-3 py-2">{actionError}</p>
          )}
          {editingExercise && !(editingExercise.is_custom && editingExercise.user_id === currentUserId) && (
            <p className="text-xs text-text-muted bg-surface-light rounded-lg px-3 py-2">
              This will create a custom copy with your preferred name. The original exercise will remain unchanged.
            </p>
          )}
          {editingExercise?.is_custom && editingExercise.user_id === currentUserId && (
            <div className="bg-surface-light rounded-lg px-3 py-3 space-y-2">
              <p className="text-xs text-text-muted">
                Move this exercise&apos;s history into another exercise, or delete it with all linked history.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openMergeModal(editingExercise)}
                  disabled={saving || deleting}
                  className="sm:flex-1"
                >
                  Merge Into...
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={handleDeleteExercise}
                  disabled={saving || deleting}
                  loading={deleting}
                  className="sm:flex-1"
                >
                  Delete Exercise
                </Button>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1.5">Exercise Name</label>
            <Input
              type="text"
              value={exerciseForm.name}
              onChange={(e) => {
                const nextName = e.target.value;
                setExerciseForm((f) => {
                  const next = { ...f, name: nextName };
                  if (!categoryManuallyChanged) {
                    next.category = inferExerciseCategoryFromName(nextName);
                  }
                  if (!primaryMuscleManuallyChanged) {
                    next.primaryMuscle = inferPrimaryMuscleFromName(nextName);
                  }
                  return next;
                });
              }}
              placeholder="e.g., Bulgarian Split Squat"
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:border-primary outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Category</label>
            <Select
              value={exerciseForm.category}
              onChange={(e) => {
                setCategoryManuallyChanged(true);
                setExerciseForm((f) => ({ ...f, category: e.target.value }));
              }}
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:border-primary outline-none capitalize"
            >
              {EXERCISE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat} className="capitalize">
                  {cat.replace('_', ' ')}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Primary Muscle</label>
            <Select
              value={exerciseForm.primaryMuscle}
              onChange={(e) => {
                setPrimaryMuscleManuallyChanged(true);
                setExerciseForm((f) => ({ ...f, primaryMuscle: e.target.value }));
              }}
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:border-primary outline-none capitalize"
            >
              {MUSCLE_GROUPS.map((muscle) => (
                <option key={muscle} value={muscle} className="capitalize">
                  {muscle.replace('_', ' ')}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Modal>

      {/* Merge Exercises Modal */}
      <Modal
        isOpen={showMergeModal}
        onClose={closeMergeModal}
        title="Merge Exercise"
        actions={[
          { label: 'Cancel', onClick: closeMergeModal, variant: 'ghost' as const, disabled: mergeSaving },
          {
            label: mergeSaving ? 'Merging...' : 'Merge',
            onClick: handleMergeExercises,
            variant: 'primary' as const,
            disabled: mergeSaving || !mergeTarget,
          },
        ]}
      >
        <div className="space-y-4">
          {mergeError && (
            <p className="text-xs text-error bg-error/10 rounded-lg px-3 py-2">{mergeError}</p>
          )}
          {mergeSourceExercise && (
            <div className="text-xs text-text-muted bg-surface-light rounded-lg px-3 py-2">
              Merging from: <span className="text-text font-medium">{mergeSourceExercise.name}</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1.5">Merge Into</label>
            <Input
              type="text"
              value={mergeSearch}
              onChange={(e) => {
                const value = e.target.value;
                setMergeSearch(value);
                if (!value.trim()) {
                  setMergeResults([]);
                  setMergeTarget(null);
                }
              }}
              placeholder="Search exercise name..."
              className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:border-primary outline-none"
              autoFocus
            />
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1">
            {mergeLoading ? (
              <p className="text-xs text-text-muted py-3 text-center">Searching...</p>
            ) : mergeResults.length === 0 ? (
              <p className="text-xs text-text-muted py-3 text-center">No exercises found.</p>
            ) : (
              mergeResults.map((exercise) => {
                const selected = mergeTarget?.id === exercise.id;
                const isOwnCustom = exercise.is_custom && exercise.user_id === currentUserId;
                return (
                  <Button unstyled
                    key={exercise.id}
                    onClick={() => setMergeTarget(exercise)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                      selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-surface-light'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-text">{CARDIO_DISPLAY_NAMES[exercise.name] || exercise.name}</p>
                      {isOwnCustom && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Custom</span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted capitalize mt-0.5">{exercise.category.replace('_', ' ')}</p>
                  </Button>
                );
              })
            )}
          </div>

          {mergeTarget && (
            <p className="text-xs text-text-muted bg-surface-light rounded-lg px-3 py-2">
              Target: <span className="text-text font-medium">{mergeTarget.name}</span>
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
