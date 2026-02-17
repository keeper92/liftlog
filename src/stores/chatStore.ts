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

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

function generateTitle(firstUserMessage: string): string {
  const text = firstUserMessage.replace(/^\[file:[^\]]*\]\s*/, '').trim();
  if (text.length <= 50) return text;
  const truncated = text.slice(0, 50);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: ChatMessage[]; // denormalized from active conversation

  createConversation: () => string;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;

  addMessage: (role: 'user' | 'assistant', content: string, importData?: ImportData, templateData?: TemplateData) => string;
  updateMessage: (id: string, content: string, importData?: ImportData, templateData?: TemplateData) => void;
  updateImportStatus: (id: string, status: ImportData['status']) => void;
  updateTemplateStatus: (id: string, status: TemplateData['status']) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      messages: [],

      createConversation: () => {
        const id = crypto.randomUUID();
        set((state) => {
          // Remove any empty conversations (no messages)
          const nonEmpty = state.conversations.filter((c) => c.messages.length > 0);
          return {
            conversations: [
              {
                id,
                title: 'New chat',
                messages: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              ...nonEmpty,
            ],
            activeConversationId: id,
            messages: [],
          };
        });
        return id;
      },

      switchConversation: (id) => {
        set((state) => {
          const conv = state.conversations.find((c) => c.id === id);
          return {
            activeConversationId: id,
            messages: conv?.messages || [],
          };
        });
      },

      deleteConversation: (id) => {
        set((state) => {
          const filtered = state.conversations.filter((c) => c.id !== id);
          const wasActive = state.activeConversationId === id;
          if (wasActive) {
            const next = filtered[0] || null;
            return {
              conversations: filtered,
              activeConversationId: next?.id || null,
              messages: next?.messages || [],
            };
          }
          return { conversations: filtered };
        });
      },

      addMessage: (role, content, importData, templateData) => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const newMessage: ChatMessage = { id, role, content, timestamp: now, importData, templateData };

        set((state) => {
          let convId = state.activeConversationId;
          let conversations = [...state.conversations];

          // Lazily create a conversation if none is active
          if (!convId || !conversations.find((c) => c.id === convId)) {
            const newConvId = crypto.randomUUID();
            // Remove empty conversations
            conversations = conversations.filter((c) => c.messages.length > 0);
            conversations.unshift({
              id: newConvId,
              title: 'New chat',
              messages: [],
              createdAt: now,
              updatedAt: now,
            });
            convId = newConvId;
          }

          const convIndex = conversations.findIndex((c) => c.id === convId);
          const conv = conversations[convIndex];
          const updatedMessages = [...conv.messages, newMessage];

          // Auto-title from first user message
          let title = conv.title;
          if (role === 'user' && !conv.messages.some((m) => m.role === 'user')) {
            title = generateTitle(content);
          }

          conversations[convIndex] = {
            ...conv,
            messages: updatedMessages,
            title,
            updatedAt: now,
          };

          return {
            conversations,
            activeConversationId: convId,
            messages: updatedMessages,
          };
        });
        return id;
      },

      updateMessage: (id, content, importData, templateData) => {
        set((state) => {
          const conversations = state.conversations.map((conv) => {
            const hasMessage = conv.messages.some((m) => m.id === id);
            if (!hasMessage) return conv;
            return {
              ...conv,
              messages: conv.messages.map((m) =>
                m.id === id
                  ? { ...m, content, ...(importData && { importData }), ...(templateData && { templateData }) }
                  : m
              ),
              updatedAt: new Date().toISOString(),
            };
          });

          // Update denormalized messages if the message is in the active conversation
          const activeConv = conversations.find((c) => c.id === state.activeConversationId);
          return {
            conversations,
            messages: activeConv?.messages || state.messages,
          };
        });
      },

      updateImportStatus: (id, status) => {
        set((state) => {
          const conversations = state.conversations.map((conv) => {
            const hasMessage = conv.messages.some((m) => m.id === id);
            if (!hasMessage) return conv;
            return {
              ...conv,
              messages: conv.messages.map((m) =>
                m.id === id && m.importData
                  ? { ...m, importData: { ...m.importData, status } }
                  : m
              ),
            };
          });
          const activeConv = conversations.find((c) => c.id === state.activeConversationId);
          return {
            conversations,
            messages: activeConv?.messages || state.messages,
          };
        });
      },

      updateTemplateStatus: (id, status) => {
        set((state) => {
          const conversations = state.conversations.map((conv) => {
            const hasMessage = conv.messages.some((m) => m.id === id);
            if (!hasMessage) return conv;
            return {
              ...conv,
              messages: conv.messages.map((m) =>
                m.id === id && m.templateData
                  ? { ...m, templateData: { ...m.templateData, status } }
                  : m
              ),
            };
          });
          const activeConv = conversations.find((c) => c.id === state.activeConversationId);
          return {
            conversations,
            messages: activeConv?.messages || state.messages,
          };
        });
      },

      clearChat: () => {
        // Create a new conversation instead of just wiping messages
        get().createConversation();
      },
    }),
    {
      name: 'reps-chat',
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        if (version === 0) {
          const old = persistedState as { messages?: ChatMessage[] };
          const messages = old.messages || [];
          if (messages.length > 0) {
            const firstUserMsg = messages.find((m) => m.role === 'user');
            const title = firstUserMsg ? generateTitle(firstUserMsg.content) : 'Previous chat';
            const convId = crypto.randomUUID();
            return {
              conversations: [
                {
                  id: convId,
                  title,
                  messages,
                  createdAt: messages[0]?.timestamp || new Date().toISOString(),
                  updatedAt: messages[messages.length - 1]?.timestamp || new Date().toISOString(),
                },
              ],
              activeConversationId: convId,
              messages,
            };
          }
          return {
            conversations: [],
            activeConversationId: null,
            messages: [],
          };
        }
        return persistedState as ChatState;
      },
    }
  )
);
