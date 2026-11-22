// The chat on the Ask tab, kept while the app runs: switching tabs, or the connection dropping,
// does not lose it. A new conversation each time the app starts (chat.ts says how it moves).

import { create } from 'zustand';

import { type ChatState, conversationId, newChat } from './chat';

export const useChat = create<ChatState>(() => newChat(conversationId()));
