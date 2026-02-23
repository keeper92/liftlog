'use client';

import Button from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ModalAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  disabled?: boolean;
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  actions?: ModalAction[];
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  actions,
}: ModalProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md rounded-2xl p-5 sm:p-6">
        {title && (
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
        )}

        <div className="mt-3 text-sm text-muted-foreground">{children}</div>

        {actions && actions.length > 0 && (
          <DialogFooter className="mt-6">
            {actions.map((action) => (
              <Button
                key={action.label}
                variant={action.variant || 'primary'}
                size="sm"
                onClick={action.onClick}
                disabled={action.disabled}
              >
                {action.label}
              </Button>
            ))}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
