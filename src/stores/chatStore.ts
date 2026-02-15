import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ParsedWorkout } from './importStore';

export interface ImportData {
  workouts: ParsedWorkout[];
  needsConfirmation: boolean;
  questions?: string[];
  status?: 'pending' | 'confirmed' | 'imported' | 'cancelled';
}

export interface TemplateData {
  name: string;
  exercises: { name: string; defaultSets: number }[];
  status: 'pending' | 'saved' | 'cancelled';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  importData?: ImportData;
  templateData?: TemplateData;
}

interface ChatState {
  messages: ChatMessage[];
  addMessage: (role: 'user' | 'assistant', content: string, importData?: ImportData, templateData?: TemplateData) => string;
  updateMessage: (id: string, content: string, importData?: ImportData, templateData?: TemplateData) => void;
  updateImportStatus: (id: string, status: ImportData['status']) => void;
  updateTemplateStatus: (id: string, status: TemplateData['status']) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      addMessage: (role, content, importData, templateData) => {
        const id = crypto.randomUUID();
        set((state) => ({
          messages: [
            ...state.messages,
            { id, role, content, timestamp: new Date().toISOString(), importData, templateData },
          ],
        }));
        return id;
      },
      updateMessage: (id, content, importData, templateData) => {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, content, ...(importData && { importData }), ...(templateData && { templateData }) } : m
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
      updateTemplateStatus: (id, status) => {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id && m.templateData
              ? { ...m, templateData: { ...m.templateData, status } }
              : m
          ),
        }));
      },
      clearChat: () => set({ messages: [] }),
    }),
    { name: 'reps-chat' }
  )
);
