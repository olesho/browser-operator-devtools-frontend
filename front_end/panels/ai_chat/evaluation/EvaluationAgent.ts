// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { WebSocketRPCClient } from '../common/WebSocketRPCClient.js';
import { getEvaluationConfig, getEvaluationClientId } from '../common/EvaluationConfig.js';
import { ToolRegistry } from '../agent_framework/ConfigurableAgentTool.js';
import { AgentService } from '../core/AgentService.js';
import { createLogger } from '../core/Logger.js';
import {
  RegisterMessage,
  ReadyMessage,
  StatusMessage,
  WelcomeMessage,
  RegistrationAckMessage,
  EvaluationRequest,
  EvaluationSuccessResponse,
  EvaluationErrorResponse,
  ErrorCodes,
  isWelcomeMessage,
  isRegistrationAckMessage,
  isEvaluationRequest,
  isPongMessage,
  createRegisterMessage,
  createReadyMessage,
  createStatusMessage,
  createSuccessResponse,
  createErrorResponse
} from './EvaluationProtocol.js';

const logger = createLogger('EvaluationAgent');

export interface EvaluationAgentOptions {
  clientId: string;
  endpoint: string;
  secretKey?: string;
}

export class EvaluationAgent {
  private client: WebSocketRPCClient | null = null;
  private clientId: string;
  private endpoint: string;
  private secretKey?: string;
  private registered = false;
  private ready = false;
  private activeEvaluations = new Map<string, any>();
  private heartbeatInterval: number | null = null;

  constructor(options: EvaluationAgentOptions) {
    this.clientId = options.clientId;
    this.endpoint = options.endpoint;
    this.secretKey = options.secretKey;
  }

  public async connect(): Promise<void> {
    if (this.client && this.client.isConnectionReady()) {
      logger.warn('Already connected');
      return;
    }

    logger.info('Connecting to evaluation server', {
      endpoint: this.endpoint,
      clientId: this.clientId
    });

    this.client = new WebSocketRPCClient({
      endpoint: this.endpoint,
      secretKey: this.secretKey,
      reconnectAttempts: 5,
      reconnectDelay: 2000
    });

    // Setup event handlers
    this.setupEventHandlers();

    // Connect to server
    await this.client.connect();
  }

  public disconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }

    this.registered = false;
    this.ready = false;
    this.activeEvaluations.clear();

    logger.info('Disconnected from evaluation server');
  }

  public isConnected(): boolean {
    return this.client?.isConnectionReady() || false;
  }

  public isRegistered(): boolean {
    return this.registered;
  }

  public isReady(): boolean {
    return this.ready;
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('connected', () => {
      logger.info('WebSocket connected, waiting for welcome message');
    });

    this.client.on('disconnected', () => {
      logger.info('WebSocket disconnected');
      this.registered = false;
      this.ready = false;
      this.stopHeartbeat();
    });

    this.client.on('message', (data: any) => {
      this.handleMessage(data);
    });

    this.client.on('error', (error: any) => {
      logger.error('WebSocket error:', typeof error === 'object' ? JSON.stringify(error) : error);
    });
  }

  private async handleMessage(message: any): Promise<void> {
    try {
      if (isWelcomeMessage(message)) {
        logger.info('Received welcome message from server', {
          serverId: message.serverId,
          version: message.version
        });
        await this.register();
      }
      else if (isRegistrationAckMessage(message)) {
        this.handleRegistrationAck(message);
      }
      else if (isEvaluationRequest(message)) {
        await this.handleEvaluationRequest(message);
      }
      else if (isPongMessage(message)) {
        logger.debug('Received pong');
      }
      else {
        logger.warn('Unknown message type:', message);
      }
    } catch (error) {
      logger.error('Error handling message:', error);
    }
  }

  private async register(): Promise<void> {
    if (!this.client) return;

    const tools: string[] = [];
    
    const registerMessage = createRegisterMessage(
      this.clientId,
      {
        tools,
        maxConcurrency: 3,
        version: '1.0.0'
      },
      this.secretKey
    );

    logger.info('Registering with server', {
      clientId: this.clientId,
      tools: tools.join(', ')
    });

    this.client.send(registerMessage);
  }

  private handleRegistrationAck(message: RegistrationAckMessage): void {
    if (message.status === 'accepted') {
      logger.info('Registration accepted', {
        evaluationsCount: message.evaluationsCount
      });
      this.registered = true;
      this.sendReady();
      this.startHeartbeat();
    } else {
      logger.error('Registration rejected', {
        reason: message.reason
      });
      this.disconnect();
    }
  }

  private sendReady(): void {
    if (!this.client || !this.registered) return;

    const readyMessage = createReadyMessage();
    this.client.send(readyMessage);
    this.ready = true;

    logger.info('Sent ready signal to server');
  }

  private async handleEvaluationRequest(request: EvaluationRequest): Promise<void> {
    const { params, id } = request;
    const startTime = Date.now();

    logger.info('Received evaluation request', {
      evaluationId: params.evaluationId,
      tool: params.tool,
      url: params.url
    });

    // Track active evaluation
    this.activeEvaluations.set(params.evaluationId, {
      startTime,
      tool: params.tool
    });

    try {
      // Send status update
      this.sendStatus(params.evaluationId, 'running', 0.1, 'Starting evaluation...');

      // Get the tool from registry
      const tool = ToolRegistry.getRegisteredTool(params.tool);
      if (!tool) {
        throw new Error(`Tool not found: ${params.tool}`);
      }

      // Navigate to URL if needed
      if (params.url) {
        this.sendStatus(params.evaluationId, 'running', 0.2, 'Navigating to URL...');
        
        // Note: Page navigation would be handled here if needed
        // For now, we assume the evaluation runs on the current page
      }

      // Execute the tool
      this.sendStatus(params.evaluationId, 'running', 0.5, `Executing ${params.tool}...`);
      
      const toolResult = await this.executeToolWithTimeout(
        tool,
        params.input,
        params.timeout || 30000
      );

      const executionTime = Date.now() - startTime;

      // Send JSON-RPC success response
      const rpcResponse = {
        jsonrpc: '2.0',
        id: id,
        result: {
          output: toolResult,
          executionTime,
          status: 'success',
          steps: [{
            tool: params.tool,
            timestamp: new Date().toISOString(),
            duration: executionTime,
            status: 'success'
          }],
          metadata: {
            url: params.url,
            evaluationId: params.evaluationId
          }
        }
      };

      if (this.client) {
        this.client.send(rpcResponse);
      }

      this.sendStatus(params.evaluationId, 'completed', 1.0, 'Evaluation completed successfully');

      logger.info('Evaluation completed successfully', {
        evaluationId: params.evaluationId,
        executionTime
      });

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Evaluation failed', {
        evaluationId: params.evaluationId,
        error: errorMessage
      });

      // Send JSON-RPC error response
      const rpcResponse = {
        jsonrpc: '2.0',
        id: id,
        error: {
          code: ErrorCodes.TOOL_EXECUTION_ERROR,
          message: 'Tool execution failed',
          data: {
            tool: params.tool,
            error: errorMessage,
            url: params.url,
            timestamp: new Date().toISOString()
          }
        }
      };

      if (this.client) {
        this.client.send(rpcResponse);
      }

      this.sendStatus(params.evaluationId, 'failed', 1.0, errorMessage);

    } finally {
      this.activeEvaluations.delete(params.evaluationId);
    }
  }

  private async executeToolWithTimeout(
    tool: any,
    input: any,
    timeout: number
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Tool execution timeout after ${timeout}ms`));
      }, timeout);

      tool.execute(input)
        .then((result: any) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error: Error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private sendStatus(
    evaluationId: string,
    status: 'running' | 'completed' | 'failed',
    progress?: number,
    message?: string
  ): void {
    if (!this.client || !this.ready) return;

    const statusMessage = createStatusMessage(
      evaluationId,
      status,
      progress,
      message
    );

    this.client.send(statusMessage);
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      if (this.client && this.ready) {
        this.client.send({
          type: 'ping',
          timestamp: new Date().toISOString()
        });
      }
    }, 30000); // Send ping every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  public getActiveEvaluationsCount(): number {
    return this.activeEvaluations.size;
  }

  public getActiveEvaluations(): string[] {
    return Array.from(this.activeEvaluations.keys());
  }
}

// Global instance management
let evaluationAgent: EvaluationAgent | null = null;

export function getEvaluationAgent(): EvaluationAgent | null {
  return evaluationAgent;
}

export async function createAndConnectEvaluationAgent(
  clientId: string,
  endpoint: string,
  secretKey?: string
): Promise<EvaluationAgent> {
  if (evaluationAgent) {
    evaluationAgent.disconnect();
  }

  evaluationAgent = new EvaluationAgent({
    clientId,
    endpoint,
    secretKey
  });

  await evaluationAgent.connect();
  return evaluationAgent;
}

export function disconnectEvaluationAgent(): void {
  if (evaluationAgent) {
    evaluationAgent.disconnect();
    evaluationAgent = null;
  }
}