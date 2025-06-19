// Simple test script to verify callLLM tracing works
// This can be run in the DevTools console to test the tracing functionality

console.log('Testing callLLM tracing...');

// Enable tracing for testing
localStorage.setItem('ai_chat_enable_tracing', 'true');

// Configure Langfuse backend (same as setup script)
const langfuseConfig = {
  type: 'langfuse',
  enabled: true,
  secretKey: 'sk-lf-b3418820-2b0f-41c6-9949-9c09a37e22e4',
  publicKey: 'pk-lf-051654b9-f6d2-46e4-9d78-30e3cff05204',
  baseUrl: 'http://localhost:3000',
  batchSize: 50,
  flushInterval: 5000
};

localStorage.setItem('ai_chat_tracing_backends', JSON.stringify([langfuseConfig]));

console.log('✅ Tracing enabled and configured for callLLM testing');
console.log('📝 Now refresh DevTools and use any AI tools to see callLLM invocations traced in Langfuse');