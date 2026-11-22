// Asking the robot from the Ask tab. The question shows at once, the robot is asked, and its
// answer (or why there is none) joins the chat when it comes. That can take minutes when the robot
// drives somewhere to answer; meanwhile it says what it is doing.

import { answered, asked, conversationId, newChat } from './chat';
import { useChat } from './chatStore';
import { askAssistant } from './commands';

/** Ask `text` in this chat. Does nothing while another question is waiting, or for empty text. */
export async function askRobot(text: string): Promise<void> {
  const step = asked(useChat.getState(), text);
  if (step.send === null) return;
  useChat.setState(step.state);
  const conversation = step.state.conversation;
  const outcome = await askAssistant(conversation, step.send);
  useChat.setState((s) => answered(s, conversation, outcome));
}

/** New chat: the bubbles go and the robot starts afresh. An answer still on its way is dropped. */
export function startNewChat(): void {
  useChat.setState(newChat(conversationId()));
}
