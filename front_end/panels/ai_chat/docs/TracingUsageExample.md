# AI Chat Tracing Usage Example

This document demonstrates how to use the callback-based tracing functionality for LLM calls and tool executions in the AI Chat system.

## Overview

The AI Chat system now supports optional tracing of:
- LLM calls (requests and responses)
- Tool executions (start, success, error)
- Agent iterations
- Agent handoffs
- Provider-specific calls (OpenAI, LiteLLM)

## Enabling Tracing

### Method 1: Simple localStorage flags (Recommended for quick debugging)

```javascript
// Enable console tracing
localStorage.setItem('ai_chat_enable_tracing', 'true');

// Enable HTTP tracing to localhost:5000
localStorage.setItem('ai_chat_tracing_http_url', 'http://localhost:5000');

// Enable both
localStorage.setItem('ai_chat_enable_tracing', 'true');
localStorage.setItem('ai_chat_tracing_http_url', 'http://localhost:5000');

// Disable
localStorage.removeItem('ai_chat_enable_tracing');
localStorage.removeItem('ai_chat_tracing_http_url');
```

### Method 2: Advanced backend configuration

```javascript
// Configure multiple backends with custom settings
const backendConfigs = [
  {
    type: 'http',
    enabled: true,
    url: 'http://localhost:5000/traces',
    method: 'POST',
    batchSize: 25,
    flushInterval: 2000,
    headers: {
      'Authorization': 'Bearer your-token',
      'X-Environment': 'development'
    }
  },
  {
    type: 'console',
    enabled: true,
    logLevel: 'debug',
    includeMetrics: true
  }
];

localStorage.setItem('ai_chat_tracing_backends', JSON.stringify(backendConfigs));
```

Then refresh the AI Chat panel or create a new one.

### Method 3: Programmatic Usage

```javascript
import { createTracingCallback } from '../core/TracingCallback.js';
import { TracingBackendConfigHelper } from '../core/TracingBackends.js';

// Create a custom tracing callback with specific backends
const tracingCallback = createTracingCallback({
  enableConsoleLogging: false,  // Disable legacy console logging
  enableMetrics: true,          // Collect metrics
  maxEvents: 2000,              // Maximum events to keep in memory
  backends: [
    TracingBackendConfigHelper.createHTTPConfig('http://localhost:5000/api/traces'),
    TracingBackendConfigHelper.createConsoleConfig('debug')
  ]
});

// Use with AgentService
await agentService.sendMessage('Hello', undefined, 'research_agent', tracingCallback);
```

## Accessing Tracing Data

### Get Real-time Metrics

```javascript
// Get the AI Chat panel instance
const aiChatPanel = AIChatPanel.instance();

// Get current metrics
const metrics = aiChatPanel.getTracingMetrics();
console.log('Tracing Metrics:', metrics);

// Get backend information
const backends = aiChatPanel.getTracingBackends();
console.log('Active Backends:', backends);

// Manually flush all backends
await aiChatPanel.flushTracing();

// Send current metrics to all backends
await aiChatPanel.sendTracingMetrics();

// Example output:
// {
//   totalLLMCalls: 5,
//   totalErrors: 0,
//   totalToolExecutions: 12,
//   totalAgentIterations: 3,
//   averageResponseTime: 2500,
//   providers: { openai: 5, litellm: 0 }
// }
```

### Export Full Tracing Data

```javascript
// Export all tracing data as JSON
const tracingData = aiChatPanel.exportTracingData();
if (tracingData) {
  console.log('Full tracing data:', JSON.parse(tracingData));
  
  // Save to file (in a real browser environment)
  const blob = new Blob([tracingData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ai-chat-trace.json';
  a.click();
}
```

## Traced Events

The tracing system captures the following types of events:

### LLM Events
- `llm_stream_start` - LLM call initiated
- `llm_response` - LLM response received
- `llm_finish` - LLM call completed (with duration)
- `llm_error` - LLM call failed

### Agent Events
- `agent_service_start` - AgentService begins processing message
- `agent_iteration` - Agent starts a new iteration
- `agent_state_update` - Agent state updated
- `final_answer` - Agent provides final answer
- `agent_handoff` - Agent hands off to another agent

### Tool Events
- `tool_execution_start` - Tool execution begins
- `tool_execution_success` - Tool execution completed successfully
- `tool_execution_error` - Tool execution failed

### Provider Events
- `provider_call` - Call to specific provider (OpenAI/LiteLLM)
- `provider_response` - Provider response received
- `provider_error` - Provider call failed

## Example Tracing Output

```json
{
  "events": [
    {
      "timestamp": 1641234567890,
      "type": "agent_service_start",
      "data": {
        "selectedAgentType": "research_agent",
        "messageCount": 2,
        "userMessage": "Research the latest developments in AI..."
      }
    },
    {
      "timestamp": 1641234567891,
      "type": "agent_iteration",
      "data": {
        "agentName": "research_agent",
        "iteration": 1,
        "maxIterations": 10,
        "messageCount": 2
      }
    },
    {
      "timestamp": 1641234567892,
      "type": "provider_call",
      "data": {
        "provider": "openai",
        "modelName": "gpt-4",
        "messageCount": 2
      }
    },
    {
      "timestamp": 1641234567900,
      "type": "llm_response",
      "data": {
        "hasText": false,
        "hasFunctionCall": true,
        "hasReasoning": true,
        "textLength": 0,
        "functionName": "search_content"
      }
    },
    {
      "timestamp": 1641234567901,
      "type": "tool_execution_start",
      "data": {
        "toolName": "search_content",
        "toolArgs": { "query": "AI developments 2024" },
        "agentName": "research_agent"
      }
    },
    {
      "timestamp": 1641234568100,
      "type": "tool_execution_success",
      "data": {
        "toolName": "search_content",
        "resultText": "Found 15 matches...",
        "isError": false
      }
    }
  ],
  "metrics": {
    "totalLLMCalls": 3,
    "totalErrors": 0,
    "totalToolExecutions": 5,
    "totalAgentIterations": 2,
    "averageResponseTime": 1250,
    "providers": { "openai": 3 }
  },
  "exportTime": 1641234569000
}
```

## Using the Global Tracing Callback

For simple use cases, you can use the global tracing callback:

```javascript
import { getGlobalTracingCallback, resetGlobalTracingCallback } from '../core/TracingCallback.js';

// Get or create global tracing callback
const globalCallback = getGlobalTracingCallback({
  enableConsoleLogging: true,
  maxEvents: 500
});

// Use with any LLM call
await UnifiedLLMClient.callLLM(apiKey, modelName, prompt, options, globalCallback);

// Reset when done
resetGlobalTracingCallback();
```

## HTTP Backend Details

### Payload Format

When using the HTTP backend, traces are sent as JSON payloads with this structure:

```json
{
  "timestamp": 1641234569000,
  "source": "devtools-ai-chat",
  "events": [
    {
      "timestamp": 1641234567890,
      "type": "agent_service_start",
      "data": { "selectedAgentType": "research_agent" }
    },
    {
      "timestamp": 1641234567892,
      "type": "llm_response", 
      "data": { "hasText": true, "textLength": 150 }
    }
  ]
}
```

### Simple HTTP Server Example

Here's a simple Node.js server to receive traces:

```javascript
// server.js
const express = require('express');
const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  next();
});

app.post('/traces', (req, res) => {
  console.log('Received traces:', {
    timestamp: new Date(req.body.timestamp).toISOString(),
    source: req.body.source,
    eventCount: req.body.events.length,
    events: req.body.events.map(e => `${e.type}:${JSON.stringify(e.data).slice(0,50)}`)
  });
  
  res.json({ status: 'received', count: req.body.events.length });
});

app.listen(5000, () => console.log('Trace server running on http://localhost:5000'));
```

### Python Flask Server Example

```python
# server.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import json
from datetime import datetime

app = Flask(__name__)
CORS(app)

@app.route('/traces', methods=['POST'])
def receive_traces():
    data = request.json
    print(f"Received {len(data['events'])} trace events from {data['source']}")
    
    for event in data['events']:
        timestamp = datetime.fromtimestamp(event['timestamp'] / 1000)
        print(f"  {timestamp}: {event['type']} - {json.dumps(event['data'])[:100]}")
    
    return jsonify({'status': 'received', 'count': len(data['events'])})

if __name__ == '__main__':
    app.run(host='localhost', port=5000, debug=True)
```

## Creating Custom Backends

You can create custom tracing backends by implementing the `TracingBackend` interface:

```javascript
// custom-backend.js
import { TracingBackend } from '../core/TracingBackends.js';

class WebSocketTracingBackend implements TracingBackend {
  readonly type = 'websocket';
  
  constructor(config) {
    this.config = config;
    this.ws = new WebSocket(config.url);
  }
  
  async sendEvent(event) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }
  
  async sendBatch(events) {
    for (const event of events) {
      await this.sendEvent(event);
    }
  }
  
  async sendMetrics(metrics) {
    await this.sendEvent({ type: 'metrics', timestamp: Date.now(), data: metrics });
  }
  
  async flush() { /* WebSocket doesn't need flushing */ }
  async close() { this.ws.close(); }
}

// Register the custom backend
TracingBackendFactory.register('websocket', WebSocketTracingBackend);
```

## Performance Considerations

- Tracing adds minimal overhead to LLM calls and tool executions
- Events are stored in memory with a configurable limit (default: 1000 events)
- Console logging can be disabled for production use
- Consider clearing or resetting tracing data periodically for long-running sessions

## Debugging Tips

1. **Enable tracing before reproducing issues**:
   ```javascript
   localStorage.setItem('ai_chat_enable_tracing', 'true');
   ```

2. **Monitor metrics in real-time**:
   ```javascript
   setInterval(() => {
     const metrics = AIChatPanel.instance().getTracingMetrics();
     console.log('Current metrics:', metrics);
   }, 5000);
   ```

3. **Filter events by type**:
   ```javascript
   const tracingData = JSON.parse(AIChatPanel.instance().exportTracingData());
   const errorEvents = tracingData.events.filter(e => e.type.includes('error'));
   console.log('Error events:', errorEvents);
   ```

4. **Analyze response times**:
   ```javascript
   const tracingData = JSON.parse(AIChatPanel.instance().exportTracingData());
   const finishEvents = tracingData.events.filter(e => e.type === 'llm_finish');
   const durations = finishEvents.map(e => e.data.duration);
   console.log('Response times:', durations);
   ```

## Summary

The tracing system provides comprehensive observability for AI Chat operations with:

- **Pluggable backends**: HTTP, console, and custom backend support
- **Flexible configuration**: Simple localStorage flags or advanced JSON config
- **Rich event tracing**: LLM calls, tool executions, agent iterations
- **Performance monitoring**: Response times, error rates, provider metrics
- **Production ready**: Minimal overhead, configurable limits, error handling

**Yes, "tracing ingestion backends" is an excellent name** for this system - it clearly conveys the pluggable nature of where traces can be sent (HTTP endpoints, console, files, etc.).

For production deployments, consider:
- Setting up dedicated tracing endpoints 
- Using appropriate batch sizes and flush intervals
- Monitoring backend health and implementing fallbacks
- Rotating or archiving trace data periodically
 