import WebSocket from 'ws';

class ExampleAgent {
  constructor(serverUrl = 'ws://localhost:8080') {
    this.serverUrl = serverUrl;
    this.ws = null;
    this.connected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.on('open', () => {
        console.log('Connected to evaluation server');
        this.connected = true;
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('close', () => {
        console.log('Disconnected from evaluation server');
        this.connected = false;
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
        reject(error);
      });
    });
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'welcome':
          console.log(`Welcome message: Server ID: ${message.serverId}, Version: ${message.version}`);
          // Register with the server after receiving welcome
          this.register();
          break;
        case 'registration_ack':
          if (message.status === 'accepted') {
            console.log('Registration accepted, sending ready signal');
            this.send({ type: 'ready' });
          } else {
            console.error('Registration rejected:', message.reason);
          }
          break;
        case 'pong':
          console.log('Received pong');
          break;
        default:
          // Handle JSON-RPC requests
          if (message.jsonrpc === '2.0' && message.method) {
            this.handleRpcRequest(message);
          } else {
            console.log('Unknown message:', message);
          }
      }
    } catch (error) {
      console.error('Failed to parse message:', error.message);
    }
  }

  handleRpcRequest(request) {
    console.log(`Received RPC call: ${request.method}`, request.params);

    if (request.method === 'evaluate') {
      // Simulate agent processing
      const response = this.evaluate(request.params);
      
      // Send response
      this.send({
        jsonrpc: '2.0',
        result: response,
        id: request.id
      });
    } else {
      // Send error for unknown methods
      this.send({
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: 'Method not found'
        },
        id: request.id
      });
    }
  }

  evaluate(task) {
    // Simple example agent that provides basic responses
    console.log(`Evaluating task: ${task}`);
    
    // Simulate some processing time
    const processingTime = Math.random() * 1000 + 500;
    
    // Generate a response based on the task
    const responses = [
      `I understand you're asking about: ${task}. Let me provide a comprehensive answer based on my knowledge.`,
      `To address your question about ${task}, I'll break this down into key points and provide detailed explanations.`,
      `This is an interesting question about ${task}. Let me analyze this systematically and provide you with a helpful response.`,
      `Regarding ${task}, there are several important aspects to consider. I'll walk you through each one.`,
      `Thank you for asking about ${task}. This is a complex topic that requires careful consideration of multiple factors.`
    ];
    
    const baseResponse = responses[Math.floor(Math.random() * responses.length)];
    
    // Add some additional content to make it more realistic
    const additionalContent = [
      "Here are the key points to consider:",
      "1. First, we need to understand the context and requirements.",
      "2. Then, we should analyze the available options and their trade-offs.",
      "3. Finally, we can recommend the best approach based on the specific situation.",
      "I hope this helps clarify the topic. Please let me know if you need any additional information."
    ];
    
    const fullResponse = [baseResponse, ...additionalContent].join('\n\n');
    
    console.log(`Generated response (${fullResponse.length} characters)`);
    return fullResponse;
  }

  register() {
    // Register with a default client ID for testing
    // In production, this would be generated dynamically
    this.send({
      type: 'register',
      clientId: '550e8400-e29b-41d4-a716-446655440000',
      secretKey: 'example-secret-key',
      capabilities: {
        tools: ['example_tool'],
        maxConcurrency: 1,
        version: '1.0.0'
      }
    });
  }

  send(data) {
    if (this.connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  ping() {
    this.send({ type: 'ping' });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Run the example agent if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new ExampleAgent();
  
  console.log('Starting example agent...');
  
  agent.connect().then(() => {
    console.log('Agent connected and ready for evaluations');
    
    // Send periodic pings to keep connection alive
    const pingInterval = setInterval(() => {
      if (agent.connected) {
        agent.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\\nShutting down agent...');
      clearInterval(pingInterval);
      agent.disconnect();
      process.exit(0);
    });
    
  }).catch((error) => {
    console.error('Failed to connect:', error.message);
    process.exit(1);
  });
}

export { ExampleAgent };