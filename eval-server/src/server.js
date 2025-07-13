import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { CONFIG, validateConfig } from './config.js';
import { RpcClient } from './rpc-client.js';
import { LLMEvaluator } from './evaluator.js';
import { logConnection, logEvaluation } from './logger.js';
import logger from './logger.js';
import { ClientManager } from './client-manager.js';
import { APIServer } from './api-server.js';

class EvaluationServer {
  constructor() {
    this.connectedAgents = new Map();
    this.rpcClient = new RpcClient();
    this.evaluator = new LLMEvaluator();
    this.evaluationQueue = [];
    this.activeEvaluations = 0;
    this.clientManager = new ClientManager('./clients', './evals');
    this.apiServer = new APIServer(this);
  }

  start() {
    // Validate configuration
    const configErrors = validateConfig();
    if (configErrors.length > 0) {
      logger.error('Configuration errors:', configErrors);
      process.exit(1);
    }

    // Create WebSocket server
    this.wss = new WebSocketServer({
      port: CONFIG.server.port,
      host: CONFIG.server.host
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', { error: error.message });
    });

    logger.info(`Evaluation server started on ws://${CONFIG.server.host}:${CONFIG.server.port}`);
    
    // Start API server
    this.apiServer.start();
    
    this.startEvaluationProcessor();
  }

  handleConnection(ws, request) {
    const connectionId = uuidv4(); // Temporary ID until registration
    const connection = {
      id: connectionId,
      ws,
      rpcClient: new RpcClient(),
      connectedAt: new Date().toISOString(),
      remoteAddress: request.socket.remoteAddress,
      registered: false,
      clientId: null
    };

    // Store temporarily with connection ID
    this.connectedAgents.set(connectionId, connection);
    
    logConnection({
      event: 'connected',
      connectionId,
      remoteAddress: connection.remoteAddress,
      totalConnections: this.connectedAgents.size
    });

    ws.on('message', (message) => {
      this.handleMessage(connection, message);
    });

    ws.on('close', () => {
      this.handleDisconnection(connection);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket connection error', {
        connectionId: connection.id,
        clientId: connection.clientId,
        error: error.message
      });
    });

    // Send welcome message
    this.sendMessage(ws, {
      type: 'welcome',
      serverId: 'server-001',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  }

  handleMessage(connection, message) {
    try {
      // Try to handle as RPC response first
      if (connection.rpcClient.handleResponse(message)) {
        return;
      }

      // Handle other message types
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'register':
          this.handleRegistration(connection, data);
          break;
        case 'ping':
          this.sendMessage(connection.ws, { 
            type: 'pong',
            timestamp: new Date().toISOString()
          });
          break;
        case 'ready':
          if (!connection.registered) {
            logger.warn('Received ready signal from unregistered client', {
              connectionId: connection.id
            });
            return;
          }
          connection.ready = true;
          logger.info('Client ready for evaluations', { 
            clientId: connection.clientId 
          });
          // Don't automatically start evaluations - wait for manual trigger
          // this.processClientEvaluations(connection.clientId);
          break;
        case 'status':
          this.handleStatusUpdate(connection, data);
          break;
        default:
          logger.warn('Unknown message type', { 
            connectionId: connection.id,
            clientId: connection.clientId, 
            type: data.type 
          });
      }
    } catch (error) {
      logger.warn('Failed to parse message', {
        connectionId: connection.id,
        error: error.message
      });
    }
  }

  handleRegistration(connection, data) {
    try {
      const { clientId, secretKey, capabilities } = data;
      
      // Validate client
      const validation = this.clientManager.validateClient(clientId, secretKey);
      if (!validation.valid) {
        this.sendMessage(connection.ws, {
          type: 'registration_ack',
          clientId,
          status: 'rejected',
          reason: validation.reason
        });
        logger.warn('Client registration rejected', {
          clientId,
          reason: validation.reason
        });
        return;
      }
      
      // Register client
      const result = this.clientManager.registerClient(clientId, secretKey, capabilities);
      
      // Update connection with client info
      connection.registered = true;
      connection.clientId = clientId;
      connection.capabilities = capabilities;
      
      // Move connection to use clientId as key
      this.connectedAgents.delete(connection.id);
      this.connectedAgents.set(clientId, connection);
      
      // Send acknowledgment
      this.sendMessage(connection.ws, {
        type: 'registration_ack',
        clientId,
        status: 'accepted',
        message: result.clientName ? `Welcome ${result.clientName}` : 'Client registered successfully',
        evaluationsCount: result.evaluationsCount
      });
      
      logger.info('Client registered successfully', {
        clientId,
        capabilities: capabilities?.tools?.join(', ')
      });
      
    } catch (error) {
      logger.error('Registration error', { error: error.message });
      this.sendMessage(connection.ws, {
        type: 'registration_ack',
        clientId: data.clientId,
        status: 'rejected',
        reason: error.message
      });
    }
  }

  handleStatusUpdate(connection, data) {
    if (!connection.registered) return;
    
    const { evaluationId, status, progress, message } = data;
    
    logger.info('Evaluation status update', {
      clientId: connection.clientId,
      evaluationId,
      status,
      progress,
      message
    });
    
    // Update evaluation status in client manager
    this.clientManager.updateEvaluationStatus(
      connection.clientId,
      evaluationId,
      status
    );
  }

  handleDisconnection(connection) {
    connection.rpcClient.cleanup();
    
    // Remove by connection ID or client ID
    if (connection.registered && connection.clientId) {
      this.connectedAgents.delete(connection.clientId);
    } else {
      this.connectedAgents.delete(connection.id);
    }
    
    logConnection({
      event: 'disconnected',
      connectionId: connection.id,
      clientId: connection.clientId,
      totalConnections: this.connectedAgents.size
    });
  }

  sendMessage(ws, data) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  async processClientEvaluations(clientId) {
    const client = this.connectedAgents.get(clientId);
    if (!client || !client.ready) return;
    
    // Get next pending evaluation for this client
    const evaluation = this.clientManager.getNextEvaluation(clientId);
    if (!evaluation) {
      logger.info('No pending evaluations for client', { clientId });
      return;
    }
    
    // Execute the evaluation
    try {
      await this.executeEvaluation(client, evaluation);
      
      // Process next evaluation after a delay
      setTimeout(() => {
        this.processClientEvaluations(clientId);
      }, 1000);
    } catch (error) {
      logger.error('Failed to execute evaluation', {
        clientId,
        evaluationId: evaluation.id,
        error: error.message
      });
    }
  }

  async executeEvaluation(client, evaluation) {
    const startTime = Date.now();
    const rpcId = `rpc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    try {
      logger.info('Starting evaluation', { 
        clientId: client.clientId,
        evaluationId: evaluation.id,
        tool: evaluation.tool
      });
      
      // Update status to running
      this.clientManager.updateEvaluationStatus(
        client.clientId,
        evaluation.id,
        'running'
      );
      
      // Prepare RPC request
      const rpcRequest = {
        jsonrpc: '2.0',
        method: 'evaluate',
        params: {
          evaluationId: evaluation.id,
          name: evaluation.name,
          url: evaluation.target?.url || evaluation.url,
          tool: evaluation.tool,
          input: evaluation.input,
          timeout: evaluation.timeout || 30000,
          metadata: {
            tags: evaluation.metadata?.tags || [],
            retries: evaluation.settings?.retry_policy?.max_retries || 0
          }
        },
        id: rpcId
      };
      
      // Send RPC request with proper timeout
      const response = await client.rpcClient.callMethod(
        client.ws,
        'evaluate',
        rpcRequest.params,
        evaluation.timeout || 45000
      );
      
      logger.info('Evaluation response received', {
        clientId: client.clientId,
        evaluationId: evaluation.id,
        executionTime: response.executionTime
      });
      
      // Validate response based on YAML configuration
      let validationResult = null;
      if (evaluation.validation) {
        validationResult = await this.validateResponse(
          response,
          evaluation
        );
      }
      
      // Update evaluation status
      this.clientManager.updateEvaluationStatus(
        client.clientId,
        evaluation.id,
        'completed',
        {
          response,
          validation: validationResult,
          duration: Date.now() - startTime
        }
      );
      
      // Log evaluation
      logEvaluation({
        evaluationId: evaluation.id,
        clientId: client.clientId,
        name: evaluation.name,
        tool: evaluation.tool,
        response,
        validation: validationResult,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      });
      
    } catch (error) {
      logger.error('Evaluation failed', {
        clientId: client.clientId,
        evaluationId: evaluation.id,
        error: error.message
      });
      
      // Update status to failed
      this.clientManager.updateEvaluationStatus(
        client.clientId,
        evaluation.id,
        'failed',
        {
          error: error.message,
          duration: Date.now() - startTime
        }
      );
      
      throw error;
    }
  }

  async validateResponse(response, evaluation) {
    const validation = evaluation.validation;
    
    if (validation.type === 'llm-judge' || validation.type === 'hybrid') {
      const llmConfig = validation.llm_judge || validation.llm_judge;
      
      // Prepare prompt with criteria
      const criteria = llmConfig.criteria || [];
      const task = `${evaluation.name} - ${evaluation.description || ''}`;
      
      // Use LLM evaluator
      const judgeResult = await this.evaluator.evaluate(
        task,
        JSON.stringify(response.output || response),
        {
          criteria,
          model: llmConfig.model
        }
      );
      
      return {
        type: 'llm-judge',
        result: judgeResult,
        passed: judgeResult.score >= 0.7 // Configurable threshold
      };
    }
    
    // Add other validation types as needed
    return null;
  }

  async evaluateAllAgents(task) {
    const readyAgents = Array.from(this.connectedAgents.values())
      .filter(agent => agent.ready);

    if (readyAgents.length === 0) {
      throw new Error('No ready agents available');
    }

    logger.info(`Starting evaluation for ${readyAgents.length} agents`, { task });

    const evaluationPromises = readyAgents.map(agent => 
      this.evaluateAgent(agent.id, task).catch(error => ({
        error: error.message,
        agentId: agent.id
      }))
    );

    const results = await Promise.all(evaluationPromises);
    
    logger.info('Batch evaluation completed', {
      totalAgents: readyAgents.length,
      successfulEvaluations: results.filter(r => !r.error).length,
      failedEvaluations: results.filter(r => r.error).length
    });

    return results;
  }

  startEvaluationProcessor() {
    // This method can be extended to process evaluation queues
    // For now, it's a placeholder for future batch processing functionality
    logger.info('Evaluation processor started');
  }

  getStatus() {
    return {
      connectedAgents: this.connectedAgents.size,
      readyAgents: Array.from(this.connectedAgents.values())
        .filter(agent => agent.ready).length,
      activeEvaluations: this.activeEvaluations
    };
  }

  getClientManager() {
    return this.clientManager;
  }

  stop() {
    if (this.wss) {
      this.wss.close();
      logger.info('Evaluation server stopped');
    }
    
    if (this.apiServer) {
      this.apiServer.stop();
    }
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new EvaluationServer();
  
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully');
    server.stop();
    process.exit(0);
  });

  server.start();
}

export { EvaluationServer };