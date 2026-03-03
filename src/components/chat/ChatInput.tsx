'use client';

import { useState, useRef, useImperativeHandle, forwardRef } from 'react';
import { Button } from '@/components/ui/button-shadcn';
import { Input } from '@/components/ui/input-shadcn';
import { FileUploadButton } from '@/components/chat';

export interface ChatInputHandle {
  focus: () => void;
  clear: () => void;
}

interface ChatInputProps {
  onSend: (text: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  showFileUpload?: boolean;
  onFileContent?: (content: string, filename: string) => void;
  /** Compact mode for the persistent chat bar (smaller height, no file upload) */
  compact?: boolean;
}

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  {
    onSend,
    isLoading = false,
    disabled = false,
    placeholder = 'Ask your trainer...',
    showFileUpload = false,
    onFileContent,
    compact = false,
  },
  ref
) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => setInput(''),
  }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading || disabled) return;
    setInput('');
    onSend(text);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      {showFileUpload && onFileContent && (
        <FileUploadButton
          onFileContent={onFileContent}
          disabled={isLoading || disabled}
        />
      )}
      <Input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={placeholder}
        disabled={isLoading || disabled}
        className={`flex-1 rounded-full ${compact ? 'h-10' : 'h-11'}`}
      />
      <Button
        type="submit"
        size="icon"
        disabled={!input.trim() || isLoading || disabled}
        className={`rounded-full ${compact ? 'h-9 w-9' : 'h-10 w-10'}`}
      >
        <svg
          width={compact ? 16 : 18}
          height={compact ? 16 : 18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
      </Button>
    </form>
  );
});

export default ChatInput;
