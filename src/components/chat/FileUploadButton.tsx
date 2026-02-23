'use client';

import { useRef } from 'react';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/input-shadcn';

interface FileUploadButtonProps {
  onFileContent: (content: string, filename: string) => void;
  accept?: string;
  disabled?: boolean;
}

export default function FileUploadButton({
  onFileContent,
  accept = '.csv,.json,.txt',
  disabled = false,
}: FileUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleClick() {
    inputRef.current?.click();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 500KB)
    if (file.size > 500 * 1024) {
      alert('File too large. Maximum size is 500KB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      onFileContent(content, file.name);
      // Reset input so same file can be selected again
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    };
    reader.onerror = () => {
      alert('Failed to read file. Please try again.');
    };
    reader.readAsText(file);
  }

  return (
    <>
      <Input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
        aria-hidden="true"
      />
      <Button unstyled
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="w-10 h-10 rounded-full bg-surface text-text-secondary flex items-center justify-center hover:bg-surface-light disabled:opacity-30 transition-all"
        aria-label="Upload file"
        title="Import workout data from file"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
        </svg>
      </Button>
    </>
  );
}
