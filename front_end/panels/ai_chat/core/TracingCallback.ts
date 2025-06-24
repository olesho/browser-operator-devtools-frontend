// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { type Callback } from './Callback.js';
import { createLogger } from './Logger.js';
import { 
  TracingBackend, 
  TracingBackendFactory, 
  TracingBackendConfigHelper,
  type TracingBackendConfig 
} from './TracingBackends.js';

const logger = createLogger('TracingCallback');

export interface TraceEvent {
  timestamp: number;
  type: string;
  data: any;
}

export interface LLMCallContext {
  messages?: any[];
  openaiMessages?: any[];
  systemPrompt?: string;
  modelName?: string;
  modelType?: string;
  tools?: any[];
  messageCount?: number;
  hasMessages?: boolean;
  hasSystemPrompt?: boolean;
  hasTools?: boolean;
}

export interface TracingOptions {
  enableConsoleLogging?: boolean;
  enableMetrics?: boolean;
  maxEvents?: number;
  backends?: TracingBackendConfig[];
}

/**
 * Simple tracing callback implementation for LLM calls and tool executions
 */
export class TracingCallback implements Callback {
  private events: TraceEvent[] = [];
  private startTime?: number;
  private options: TracingOptions;
  private backends: TracingBackend[] = [];
  private currentLLMContext?: LLMCallContext; // Store the current LLM call context
  private accumulatedResponse: string = ''; // Store accumulated response content
  private finalResponse?: any; // Store final response object

  constructor(options: TracingOptions = {}) {
    this.options = {
      enableConsoleLogging: true,
      enableMetrics: true,
      maxEvents: 1000,
      ...options,
    };
    
    this.initializeBackends();
  }

  private initializeBackends(): void {
    try {
      // Get backend configs from options or localStorage
      let backendConfigs = this.options.backends;
      
      if (!backendConfigs || backendConfigs.length === 0) {
        backendConfigs = TracingBackendConfigHelper.getDefaultConfigs();
      }
      
      // Create backend instances
      for (const config of backendConfigs) {
        if (config.enabled) {
          try {
            const backend = TracingBackendFactory.create(config);
            this.backends.push(backend);
            logger.info(`Initialized ${config.type} tracing backend`);
          } catch (error) {
            logger.error(`Failed to initialize ${config.type} backend:`, error);
          }
        }
      }
      
      // Fallback to console if no backends and console logging enabled
      if (this.backends.length === 0 && this.options.enableConsoleLogging) {
        const consoleBackend = TracingBackendFactory.create(TracingBackendConfigHelper.createConsoleConfig());
        this.backends.push(consoleBackend);
      }
      
    } catch (error) {
      logger.error('Failed to initialize tracing backends:', error);
    }
  }

  private addEvent(type: string, data: any): void {
    const event: TraceEvent = {
      timestamp: Date.now(),
      type,
      data,
    };

    this.events.push(event);

    // Keep only the most recent events to prevent memory leaks
    if (this.events.length > (this.options.maxEvents || 1000)) {
      this.events.shift();
    }

    // Send to all configured backends
    this.sendToBackends(event);

    // Legacy console logging for backward compatibility
    if (this.options.enableConsoleLogging && this.backends.length === 0) {
      logger.info(`[TRACE] ${type}:`, data);
    }
  }

  private async sendToBackends(event: TraceEvent): Promise<void> {
    for (const backend of this.backends) {
      try {
        await backend.sendEvent(event);
        // Don't flush here - let backends handle their own batching/flushing
      } catch (error) {
        logger.error(`Failed to send event to ${backend.type} backend:`, error);
      }
    }
  }

  onResponse(response: any): void {
    // Store the final response for trace completion
    this.finalResponse = response;
    
    // Debug log to verify we're capturing response content
    console.log('🔍 [TracingCallback] onResponse called with:', {
      hasText: Boolean(response?.text),
      hasFunction: Boolean(response?.functionCall),
      hasReasoning: Boolean(response?.reasoning),
      textLength: response?.text?.length || 0,
      textPreview: response?.text?.substring(0, 100) || 'No text',
    });
    
    this.addEvent('llm_response', {
      // Include actual content for Langfuse tracing
      text: response.text,
      functionCall: response.functionCall,
      reasoning: response.reasoning,
      // Keep metadata for other backends
      hasText: Boolean(response.text),
      hasFunctionCall: Boolean(response.functionCall),
      hasReasoning: Boolean(response.reasoning),
      textLength: response.text?.length || 0,
      functionName: response.functionCall?.name,
    });
  }

  onError(error: any): void {
    this.addEvent('llm_error', {
      message: error instanceof Error ? error.message : String(error),
      type: error?.constructor?.name || 'Unknown',
    });
  }

  onFinish(): void {
    const duration = this.startTime ? Date.now() - this.startTime : 0;
    
    // Debug log to verify we have response content to send
    console.log('🔍 [TracingCallback] onFinish called with:', {
      duration,
      hasFinalResponse: Boolean(this.finalResponse),
      hasResponseText: Boolean(this.finalResponse?.text),
      hasAccumulatedContent: Boolean(this.accumulatedResponse),
      accumulatedLength: this.accumulatedResponse?.length || 0,
      responseTextLength: this.finalResponse?.text?.length || 0,
    });
    
    this.addEvent('llm_finish', {
      duration,
      // Include final response content for trace output
      finalResponse: this.finalResponse,
      responseText: this.finalResponse?.text,
      functionCall: this.finalResponse?.functionCall,
      reasoning: this.finalResponse?.reasoning,
      accumulatedContent: this.accumulatedResponse,
    });
    
    // Reset for next conversation
    this.startTime = undefined;
    this.finalResponse = undefined;
    this.accumulatedResponse = '';
  }

  onStream(response: any): void {
    this.addEvent('llm_stream', response);
  }

  onStreamError(error: any): void {
    this.addEvent('llm_stream_error', {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  onStreamFinish(): void {
    this.addEvent('llm_stream_finish', {
      // Include final response content for trace output
      finalResponse: this.finalResponse,
      responseText: this.finalResponse?.text,
      functionCall: this.finalResponse?.functionCall,
      reasoning: this.finalResponse?.reasoning,
      accumulatedContent: this.accumulatedResponse,
    });
  }

  onStreamStart(): void {
    this.startTime = Date.now();
    
    // Include the captured LLM context (messages, system prompt, etc.)
    const contextData = this.currentLLMContext ? {
      // Include actual prompt/messages for Langfuse tracing
      messages: this.currentLLMContext.messages,
      openaiMessages: this.currentLLMContext.openaiMessages,
      systemPrompt: this.currentLLMContext.systemPrompt,
      modelName: this.currentLLMContext.modelName,
      modelType: this.currentLLMContext.modelType,
      tools: this.currentLLMContext.tools,
      messageCount: this.currentLLMContext.messageCount,
      // Keep metadata for backward compatibility
      hasMessages: Boolean(this.currentLLMContext.messages),
      hasSystemPrompt: Boolean(this.currentLLMContext.systemPrompt),
      hasTools: Boolean(this.currentLLMContext.tools && this.currentLLMContext.tools.length > 0),
    } : {};
    
    this.addEvent('llm_stream_start', contextData);
    
    // Clear the context after using it
    this.currentLLMContext = undefined;
  }

  onStreamChunk(chunk: any): void {
    // Capture LLM context for use in onStreamStart
    if (chunk.type === 'llm_call_context') {
      this.currentLLMContext = {
        messages: chunk.messages,
        openaiMessages: chunk.openaiMessages,
        systemPrompt: chunk.systemPrompt,
        modelName: chunk.modelName,
        modelType: chunk.modelType,
        tools: chunk.tools,
        messageCount: chunk.messageCount,
      };
      return; // Don't add this as a regular chunk event
    }
    
    // Handle callLLM invocation events
    if (chunk.type === 'call_llm_invocation') {
      this.addEvent('call_llm_invocation', chunk);
      return;
    }
    
    // Handle callLLM completion events
    if (chunk.type === 'call_llm_completion' || chunk.type === 'call_llm_json_parsed' || chunk.type === 'call_llm_error') {
      this.addEvent(chunk.type, chunk);
      return;
    }
    
    // Accumulate response content from stream chunks
    if (chunk && typeof chunk === 'object') {
      const content = chunk.content || chunk.text || chunk.delta?.content;
      if (content && typeof content === 'string') {
        this.accumulatedResponse += content;
      }
    }
    
    this.addEvent('llm_stream_chunk', chunk);
  }

  onStreamChunkError(error: any): void {
    this.addEvent('llm_stream_chunk_error', {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  onStreamChunkFinish(): void {
    this.addEvent('llm_stream_chunk_finish', {});
  }

  /**
   * Cleanup and flush all backends
   */
  async cleanup(): Promise<void> {
    for (const backend of this.backends) {
      try {
        await backend.close();
      } catch (error) {
        logger.error(`Failed to close ${backend.type} backend:`, error);
      }
    }
  }

  /**
   * Get all traced events
   */
  getEvents(): TraceEvent[] {
    return [...this.events];
  }

  /**
   * Get events of a specific type
   */
  getEventsByType(type: string): TraceEvent[] {
    return this.events.filter(event => event.type === type);
  }

  /**
   * Get basic metrics from the traced events
   */
  getMetrics(): {
    totalLLMCalls: number;
    totalErrors: number;
    totalToolExecutions: number;
    totalAgentIterations: number;
    averageResponseTime: number;
    providers: Record<string, number>;
  } {
    const llmCalls = this.getEventsByType('llm_stream_start').length;
    const errors = this.getEventsByType('llm_error').length + 
                   this.getEventsByType('llm_stream_error').length +
                   this.getEventsByType('tool_execution_error').length;
    const toolExecutions = this.getEventsByType('tool_execution_start').length;
    const agentIterations = this.getEventsByType('agent_iteration').length;

    // Calculate average response time
    const finishEvents = this.getEventsByType('llm_finish');
    const averageResponseTime = finishEvents.length > 0 
      ? finishEvents.reduce((sum, event) => sum + (event.data.duration || 0), 0) / finishEvents.length
      : 0;

    // Count provider usage
    const providers: Record<string, number> = {};
    this.getEventsByType('provider_call').forEach(event => {
      const provider = event.data.provider;
      providers[provider] = (providers[provider] || 0) + 1;
    });

    return {
      totalLLMCalls: llmCalls,
      totalErrors: errors,
      totalToolExecutions: toolExecutions,
      totalAgentIterations: agentIterations,
      averageResponseTime,
      providers,
    };
  }

  /**
   * Clear all traced events
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Export traced events as JSON
   */
  exportAsJSON(): string {
    return JSON.stringify({
      events: this.events,
      metrics: this.getMetrics(),
      exportTime: Date.now(),
    }, null, 2);
  }

  /**
   * Send current metrics to all backends
   */
  async sendMetricsToBackends(): Promise<void> {
    const metrics = this.getMetrics();
    for (const backend of this.backends) {
      try {
        await backend.sendMetrics(metrics);
      } catch (error) {
        logger.error(`Failed to send metrics to ${backend.type} backend:`, error);
      }
    }
  }

  /**
   * Flush all backends
   */
  async flush(): Promise<void> {
    for (const backend of this.backends) {
      try {
        await backend.flush();
      } catch (error) {
        logger.error(`Failed to flush ${backend.type} backend:`, error);
      }
    }
  }

  /**
   * Close all backends
   */
  async close(): Promise<void> {
    // Flush all backends before closing
    await this.flush();
    for (const backend of this.backends) {
      try {
        await backend.close();
      } catch (error) {
        logger.error(`Failed to close ${backend.type} backend:`, error);
      }
    }
    this.backends = [];
  }

  /**
   * Get information about active backends
   */
  getBackendInfo(): Array<{ type: string; config: any }> {
    return this.backends.map(backend => ({
      type: backend.type,
      config: backend.config,
    }));
  }
}

/**
 * Factory function to create a tracing callback
 */
export function createTracingCallback(options?: TracingOptions): TracingCallback {
  return new TracingCallback(options);
}

/**
 * Global tracing callback instance for simple usage
 */
let globalTracingCallback: TracingCallback | null = null;

/**
 * Get or create the global tracing callback
 */
export function getGlobalTracingCallback(options?: TracingOptions): TracingCallback {
  if (!globalTracingCallback) {
    globalTracingCallback = new TracingCallback(options);
  }
  return globalTracingCallback;
}

/**
 * Reset the global tracing callback
 */
export function resetGlobalTracingCallback(): void {
  globalTracingCallback = null;
} 