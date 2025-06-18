// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// import { Langfuse } from "langfuse";
import { type Callback } from './Callback.js';
import { createLogger } from './Logger.js';
import { 
  TracingBackend, 
  TracingBackendFactory, 
  TracingBackendConfigHelper,
  type TracingBackendConfig 
} from './TracingBackends.js';

// const langfuse = new Langfuse({
//   secretKey: "sk-lf-b3418820-2b0f-41c6-9949-9c09a37e22e4",
//   publicKey: "pk-lf-051654b9-f6d2-46e4-9d78-30e3cff05204",
//   baseUrl: "http://localhost:3000"
// });

// const trace = langfuse.trace({
//   name: "browser-operator-tracing",
// });

const logger = createLogger('TracingCallback');

export interface TraceEvent {
  timestamp: number;
  type: string;
  data: any;
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
        // Ensure we flush after sending events
        await backend.flush();
      } catch (error) {
        logger.error(`Failed to send event to ${backend.type} backend:`, error);
      }
    }
  }

  onResponse(response: any): void {
    this.addEvent('llm_response', {
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
    this.addEvent('llm_finish', {
      duration,
    });
    this.startTime = undefined;
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
    this.addEvent('llm_stream_finish', {});
  }

  onStreamStart(): void {
    this.startTime = Date.now();
    this.addEvent('llm_stream_start', {});
  }

  onStreamChunk(chunk: any): void {
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