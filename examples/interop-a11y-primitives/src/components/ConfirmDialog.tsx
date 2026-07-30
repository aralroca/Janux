/** @jsxImportSource react */
import * as Dialog from '@radix-ui/react-dialog';

export interface ConfirmDialogProps {
  open: boolean;
  workspace: string;
  onOpenChange?: (open: boolean) => void;
  onConfirmed?: () => void;
}

/**
 * A plain Radix dialog — focus trap, escape handling, `aria-modal` and the
 * scroll lock all come from the library. Its content renders through a portal
 * into `document.body`, which is the interesting part: that is OUTSIDE the
 * `<janux-foreign>` host, and outside what the navigation morph treats as
 * opaque.
 */
export function ConfirmDialog({ open, workspace, onOpenChange, onConfirmed }: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger className="danger">Delete {workspace}…</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="sheet">
          <Dialog.Title className="sheet-title">Delete {workspace}?</Dialog.Title>
          <Dialog.Description className="sheet-body">
            This removes every document in the workspace. It cannot be undone.
          </Dialog.Description>
          <div className="sheet-actions">
            <Dialog.Close className="ghost">Cancel</Dialog.Close>
            <button className="danger" onClick={() => onConfirmed?.()}>
              Delete
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
