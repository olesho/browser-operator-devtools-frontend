// Run this in the browser console to set up Langfuse tracing
// IMPORTANT: Run this in the DevTools console, then refresh DevTools for changes to take effect

// Step 1: Clear any existing configuration
localStorage.removeItem('ai_chat_tracing_http_url');

// Step 2: Enable tracing
localStorage.setItem('ai_chat_enable_tracing', 'true');

// Step 3: Configure Langfuse backend with your credentials
const langfuseConfig = {
  type: 'langfuse',
  enabled: true,
  secretKey: 'sk-lf-b3418820-2b0f-41c6-9949-9c09a37e22e4',
  publicKey: 'pk-lf-051654b9-f6d2-46e4-9d78-30e3cff05204',
  baseUrl: 'http://localhost:3000',
  batchSize: 50,
  flushInterval: 5000
};

// Optional: Also configure console backend to see traces in console
const consoleConfig = {
  type: 'console',
  enabled: true,
  logLevel: 'info',
  includeMetrics: true
};

// Step 4: Save configuration
// Use Langfuse only
localStorage.setItem('ai_chat_tracing_backends', JSON.stringify([langfuseConfig]));

// Or use both Langfuse and console for debugging
// localStorage.setItem('ai_chat_tracing_backends', JSON.stringify([langfuseConfig, consoleConfig]));

// Step 5: Verify configuration
console.log('✅ Langfuse tracing configured successfully!');
console.log('Tracing enabled:', localStorage.getItem('ai_chat_enable_tracing'));
console.log('Backends configured:', JSON.parse(localStorage.getItem('ai_chat_tracing_backends')));

console.log('\n⚠️  IMPORTANT: Now refresh DevTools (Cmd+R or Ctrl+R) for the changes to take effect!');
console.log('\n📝 To test: Use the AI Chat panel to send a message and check your Langfuse dashboard at http://localhost:3000');