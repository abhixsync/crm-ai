/**
 * Loan Assistant Module
 * Main export file for loan assistant functionality
 */

export {
  LOAN_ASSISTANT_SYSTEM_PROMPT,
  INTENT_TYPES,
  CONVERSATION_STAGES,
  EMPLOYMENT_TYPES,
  LOAN_TYPES,
} from './system-prompt.js';

export {
  detectIntent,
  extractLoanDetails,
  detectEmploymentType,
  determineNextStage,
} from './intent-detector.js';

export { ConversationManager } from './conversation-manager.js';
