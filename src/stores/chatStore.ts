import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ParsedWorkout } from './importStore';

export interface ImportData {
  workouts: ParsedWorkout[];
  needsConfirmation: boolean;
  questions?: string[];
  status?: 'pending' | 'confirmed' | 'imported' | 'cancelled';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  importData?: ImportData;
}

interface ChatState {
  messages: ChatMessage[];
  addMessage: (role: 'user' | 'assistant', content: string, importData?: ImportData) => string;
  updateMessage: (id: string, content: string, importData?: ImportData) => void;
  updateImportStatus: (id: string, status: ImportData['status']) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      addMessage: (role, content, importData) => {
        const id = crypto.randomUUID();
        set((state) => ({
          messages: [
            ...state.messages,
            { id, role, content, timestamp: new Date().toISOString(), importData },
          ],
        }));
        return id;
      },
      updateMessage: (id, content, importData) => {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, content, ...(importData && { importData }) } : m
          ),
        }));
      },
      updateImportStatus: (id, status) => {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id && m.importData
              ? { ...m, importData: { ...m.importData, status } }
              : m
          ),
        }));
      },
      clearChat: () => set({ messages: [] }),
    }),
    { name: 'rep-chat' }
  )
);
