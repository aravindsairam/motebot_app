// The chat on the Ask tab as plain data: the bubbles, whether a question is waiting for its
// answer, and the conversation they belong to. Each step returns the new state; who sends the
// question and where the state is kept is the caller's business (ask.ts, chatStore.ts), so this is
// tested without a connection.
//
// One question at a time: the next waits for the answer. New chat clears the bubbles and starts a
// new conversation; an answer still on its way for the old one is dropped when it comes.

import type { AssistantAnswer, AssistantStatus } from '../transport/messages';
import { sentence } from './actionsStore';

export interface ChatBubble {
  id: number;
  from: 'me' | 'robot';
  text: string;
  problem: boolean; // the robot could not answer: shown muted, with the reason
  picture: Uint8Array | null; // JPEG: what the camera saw
  mark: { x: number; y: number } | null; // a place on the map that goes with the answer, metres
}

export interface ChatState {
  conversation: string; // chosen by the app; the robot carries the chat on under it
  bubbles: ChatBubble[];
  waiting: boolean; // a question is on its way: the next one waits for its answer
  nextId: number;
}

/** How the question ended: the robot's answer, or why there is none. */
export interface AnswerOutcome {
  ok: boolean;
  text: string; // why not, when not OK: the robot's words, or what happened to the request
  answer: AssistantAnswer | null;
}

export const MAX_QUESTION_LENGTH = 500;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** "phone-" and eight letters or digits: a new conversation. */
export function conversationId(random: () => number = Math.random): string {
  let id = '';
  for (let i = 0; i < 8; i++) id += LETTERS[Math.min(LETTERS.length - 1, Math.floor(random() * LETTERS.length))];
  return `phone-${id}`;
}

export function newChat(conversation: string): ChatState {
  return { conversation, bubbles: [], waiting: false, nextId: 1 };
}

function bubble(id: number, from: ChatBubble['from'], text: string, more: Partial<ChatBubble> = {}): ChatBubble {
  return { id, from, text, problem: false, picture: null, mark: null, ...more };
}

/** The user asks `text`. Sent unless it is empty or another question is waiting. */
export function asked(s: ChatState, text: string): { state: ChatState; send: string | null } {
  const question = text.trim().slice(0, MAX_QUESTION_LENGTH);
  if (!question || s.waiting) return { state: s, send: null };
  return {
    state: { ...s, bubbles: [...s.bubbles, bubble(s.nextId, 'me', question)], waiting: true, nextId: s.nextId + 1 },
    send: question,
  };
}

/** The question asked in `conversation` has been answered, or has failed (refused, not available,
 *  timed out, connection lost). Dropped when the chat has moved on to a new conversation since. */
export function answered(s: ChatState, conversation: string, outcome: AnswerOutcome): ChatState {
  if (conversation !== s.conversation || !s.waiting) return s;
  let reply: ChatBubble;
  if (outcome.ok) {
    const a = outcome.answer;
    const picture = a && a.picture.length > 0 ? a.picture : null;
    const text = a?.text.trim() || (picture ? '' : 'The robot gave no answer.');
    reply = bubble(s.nextId, 'robot', text, { picture, mark: a?.mark ?? null });
  } else {
    // The robot's own words when it gave them ("No API key yet: ..."), else what happened.
    const why = outcome.answer?.text.trim() || outcome.text.trim() || "the robot couldn't answer";
    reply = bubble(s.nextId, 'robot', sentence(why), { problem: true });
  }
  return { ...s, bubbles: [...s.bubbles, reply], waiting: false, nextId: s.nextId + 1 };
}

/** What the robot says it is doing about this chat's question ("going to the kitchen"), shown
 *  under the dots while the answer is awaited; null when there is nothing to show. `status` should
 *  be the robot's latest, and only while it is fresh. */
export function doingLine(s: ChatState, status: AssistantStatus | null): string | null {
  if (!s.waiting || !status || !status.busy || status.conversation !== s.conversation) return null;
  const doing = status.doing.trim();
  return doing ? sentence(doing).replace(/\.$/, '…') : null;
}
