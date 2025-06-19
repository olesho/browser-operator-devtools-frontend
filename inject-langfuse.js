// This script injects the Langfuse SDK into the DevTools window
// Run this in the DevTools console before using the AI Chat panel

(async function() {
  try {
    // Try to load Langfuse from npm
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/langfuse@latest/dist/index.js';
    script.onload = () => {
      console.log('✅ Langfuse SDK loaded from CDN');
      // The SDK should now be available as window.Langfuse
    };
    script.onerror = () => {
      console.error('❌ Failed to load Langfuse SDK from CDN');
    };
    document.head.appendChild(script);
  } catch (error) {
    console.error('Failed to inject Langfuse:', error);
  }
})();