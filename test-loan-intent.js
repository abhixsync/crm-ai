// Test script to verify intent detection for declining phrases
import { detectIntent } from './src/modules/loan-assistant/intent-detector.js';

const testPhrases = [
  'nhi lena muje',
  'loan nhi chahiye',
  'mujhe nhi chahiye',
  'nhi chahiye',
  'definitely not',
  'thik h',
  'car loan',
  'haan 5 lakh',
];

console.log('\n🧪 Testing Intent Detection\n');
console.log('═══════════════════════════════════════\n');

testPhrases.forEach(phrase => {
  const result = detectIntent(phrase);
  console.log(`📝 Phrase: "${phrase}"`);
  console.log(`   Intent: ${result.intent}`);
  console.log(`   Confidence: ${result.confidence}`);
  console.log(`   Details: ${JSON.stringify(result.details)}`);
  console.log('---\n');
});
