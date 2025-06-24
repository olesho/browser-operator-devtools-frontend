// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { createLogger } from './Logger.js';
import { type TraceEvent } from './TracingCallback.js';

const logger = createLogger('TracingBackends');

/**
 * Configuration for tracing backends
 */
export interface TracingBackendConfig {
  type: 'http' | 'console' | 'websocket' | 'file' | 'langfuse';
  enabled: boolean;
  [key: string]: any; // Allow additional configuration per backend type
}

export interface HTTPBackendConfig extends TracingBackendConfig {
  type: 'http';
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
  batchSize?: number;
  flushInterval?: number; // ms
  timeout?: number; // ms
}

export interface ConsoleBackendConfig extends TracingBackendConfig {
  type: 'console';
  logLevel?: 'info' | 'debug' | 'warn';
  includeMetrics?: boolean;
}

export interface LangfuseBackendConfig extends TracingBackendConfig {
  type: 'langfuse';
  secretKey: string;
  publicKey: string;
  baseUrl?: string;
  flushInterval?: number;
  batchSize?: number;
}

/**
 * Base interface for tracing backends
 */
export interface TracingBackend {
  readonly type: string;
  readonly config: TracingBackendConfig;
  
  /**
   * Send a single trace event
   */
  sendEvent(event: TraceEvent): Promise<void>;
  
  /**
   * Send multiple trace events in batch
   */
  sendBatch(events: TraceEvent[]): Promise<void>;
  
  /**
   * Send metrics data
   */
  sendMetrics(metrics: any): Promise<void>;
  
  /**
   * Flush any pending data
   */
  flush(): Promise<void>;
  
  /**
   * Close/cleanup the backend
   */
  close(): Promise<void>;
}

/**
 * HTTP backend for sending traces to external endpoints
 */
export class HTTPTracingBackend implements TracingBackend {
  readonly type = 'http';
  readonly config: HTTPBackendConfig;
  
  private pendingEvents: TraceEvent[] = [];
  private flushTimer?: number;
  private isFlushing = false;

  constructor(config: HTTPBackendConfig) {
    this.config = {
      method: 'POST',
      batchSize: 50,
      flushInterval: 5000,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
      ...config,
    };
    
    // Start periodic flush
    if (this.config.flushInterval && this.config.flushInterval > 0) {
      this.flushTimer = window.setInterval(() => {
        this.flush().catch(error => {
          logger.error('Periodic flush failed:', error);
        });
      }, this.config.flushInterval);
    }
  }

  async sendEvent(event: TraceEvent): Promise<void> {
    this.pendingEvents.push(event);
    
    // Auto-flush if batch size reached
    if (this.config.batchSize && this.pendingEvents.length >= this.config.batchSize) {
      await this.flush();
    }
  }

  async sendBatch(events: TraceEvent[]): Promise<void> {
    this.pendingEvents.push(...events);
    await this.flush();
  }

  async sendMetrics(metrics: any): Promise<void> {
    const metricsEvent: TraceEvent = {
      timestamp: Date.now(),
      type: 'metrics',
      data: metrics,
    };
    await this.sendEvent(metricsEvent);
  }

  async flush(): Promise<void> {
    if (this.isFlushing || this.pendingEvents.length === 0) {
      return;
    }
    
    this.isFlushing = true;
    const eventsToSend = [...this.pendingEvents];
    this.pendingEvents = [];
    
    try {
      // Debug log to see the actual event data
      logger.debug('Events to send:', JSON.stringify(eventsToSend, null, 2));
      
      const payload = {
        timestamp: Date.now(),
        source: 'devtools-ai-chat',
        events: eventsToSend
      };
      
      // Debug log to see the final payload
      logger.debug('Final payload:', JSON.stringify(payload, null, 2));
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
      
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      logger.debug(`Successfully sent ${eventsToSend.length} events to ${this.config.url}`);
      
    } catch (error) {
      logger.error(`Failed to send traces to ${this.config.url}:`, error);
      // Re-add events to the beginning of pending events for retry
      this.pendingEvents.unshift(...eventsToSend);
      throw error;
    } finally {
      this.isFlushing = false;
    }
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    await this.flush();
  }
}

/**
 * Console backend for logging traces to browser console
 */
export class ConsoleTracingBackend implements TracingBackend {
  readonly type = 'console';
  readonly config: ConsoleBackendConfig;

  constructor(config: ConsoleBackendConfig) {
    this.config = {
      logLevel: 'info',
      includeMetrics: true,
      ...config,
    };
  }

  async sendEvent(event: TraceEvent): Promise<void> {
    const logMethod = this.config.logLevel === 'debug' ? console.debug :
                     this.config.logLevel === 'warn' ? console.warn :
                     console.info;
    
    logMethod(`[AI-Chat-Trace:${event.type}]`, {
      timestamp: new Date(event.timestamp).toISOString(),
      type: event.type,
      data: event.data,
    });
  }

  async sendBatch(events: TraceEvent[]): Promise<void> {
    console.group(`[AI-Chat-Trace] Batch of ${events.length} events`);
    for (const event of events) {
      await this.sendEvent(event);
    }
    console.groupEnd();
  }

  async sendMetrics(metrics: any): Promise<void> {
    if (!this.config.includeMetrics) {
      return;
    }
    
    console.info('[AI-Chat-Trace:metrics]', {
      timestamp: new Date().toISOString(),
      metrics,
    });
  }

  async flush(): Promise<void> {
    // Nothing to flush for console backend
  }

  async close(): Promise<void> {
    // Nothing to close for console backend
  }
}

/**
 * Langfuse backend for sending traces to Langfuse server using SDK
 */
// Simple Langfuse HTTP implementation
class SimpleLangfuse {
  private config: any;
  private pendingEvents: any[] = [];

  constructor(config: any) {
    this.config = config;
  }

  trace(options: any) {
    const traceId = options.id || `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = options.timestamp || new Date();
    
    // Create trace-create event
    this.pendingEvents.push({
      id: traceId,
      type: 'trace-create',
      timestamp: timestamp.toISOString(),
      body: {
        id: traceId,
        name: options.name,
        timestamp: timestamp.toISOString(),
        metadata: options.metadata || {},
        userId: options.userId,
        sessionId: options.sessionId,
        input: options.input,
        output: options.output,
        tags: options.tags || [],
      }
    });
    
    return {
      id: traceId,
      span: (spanOptions: any) => {
        const spanId = spanOptions.id || `span-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const spanTimestamp = spanOptions.startTime || new Date();
        
        this.pendingEvents.push({
          id: spanId,
          type: 'span-create',
          timestamp: spanTimestamp.toISOString(),
          body: {
            id: spanId,
            traceId: traceId,
            name: spanOptions.name,
            startTime: spanTimestamp.toISOString(),
            metadata: spanOptions.metadata || {},
            input: spanOptions.input,
          }
        });
        
        return {
          id: spanId,
          end: (endOptions?: any) => {
            this.pendingEvents.push({
              id: spanId,
              type: 'span-update',
              timestamp: new Date().toISOString(),
              body: {
                id: spanId,
                traceId: traceId,
                endTime: (endOptions && endOptions.endTime) ? endOptions.endTime.toISOString() : new Date().toISOString(),
                output: endOptions ? endOptions.output : undefined,
                metadata: endOptions ? endOptions.metadata : {},
              }
            });
          }
        };
      },
      generation: (genOptions: any) => {
        const genId = genOptions.id || `gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const genTimestamp = genOptions.startTime || new Date();
        
        this.pendingEvents.push({
          id: genId,
          type: 'generation-create',
          timestamp: genTimestamp.toISOString(),
          body: {
            id: genId,
            traceId: traceId,
            name: genOptions.name,
            model: genOptions.model || 'unknown',
            input: genOptions.input,
            startTime: genTimestamp.toISOString(),
            metadata: genOptions.metadata || {},
          }
        });
        
        return {
          id: genId,
          end: (endOptions?: any) => {
            this.pendingEvents.push({
              id: genId,
              type: 'generation-update',
              timestamp: new Date().toISOString(),
              body: {
                id: genId,
                traceId: traceId,
                endTime: (endOptions && endOptions.endTime) ? endOptions.endTime.toISOString() : new Date().toISOString(),
                output: endOptions ? endOptions.output : undefined,
                usage: endOptions ? endOptions.usage : undefined,
                metadata: endOptions ? endOptions.metadata : {},
              }
            });
          }
        };
      },
      event: (eventOptions: any) => {
        const eventId = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const eventTimestamp = eventOptions.timestamp || new Date();
        
        this.pendingEvents.push({
          id: eventId,
          type: 'event-create',
          timestamp: eventTimestamp.toISOString(),
          body: {
            id: eventId,
            traceId: traceId,
            name: eventOptions.name,
            level: eventOptions.level || 'DEFAULT',
            statusMessage: eventOptions.statusMessage,
            metadata: eventOptions.metadata || {},
            timestamp: eventTimestamp.toISOString(),
            input: eventOptions.input,
            output: eventOptions.output,
          }
        });
        
        return { id: eventId };
      },
      update: (updates: any) => {
        this.pendingEvents.push({
          id: traceId,
          type: 'trace-update',
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            endTime: updates.endTime ? updates.endTime.toISOString() : new Date().toISOString(),
            metadata: updates.metadata || {},
            output: updates.output,
          }
        });
      }
    };
  }

  event(options: any) {
    const eventId = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const eventTimestamp = options.timestamp || new Date();
    
    this.pendingEvents.push({
      id: eventId,
      type: 'event-create',
      timestamp: eventTimestamp.toISOString(),
      body: {
        id: eventId,
        name: options.name,
        level: options.level || 'DEFAULT',
        statusMessage: options.statusMessage,
        metadata: options.metadata || {},
        timestamp: eventTimestamp.toISOString(),
        input: options.input,
        output: options.output,
      }
    });
    
    return { id: eventId };
  }

  async flush() {
    if (this.pendingEvents.length === 0) return;
    
    logger.info(`[Langfuse] Flushing ${this.pendingEvents.length} events`);
    
    // Debug log trace events specifically
    const traceEvents = this.pendingEvents.filter(e => e.type === 'trace-update');
    if (traceEvents.length > 0) {
      console.log('🔍 [Langfuse] Trace updates being sent:', traceEvents.map(e => ({
        type: e.type,
        id: e.id,
        hasOutput: Boolean(e.body?.output),
        output: e.body?.output,
        outputType: typeof e.body?.output,
        outputPreview: typeof e.body?.output === 'string' ? e.body?.output.substring(0, 100) : e.body?.output,
      })));
    }
    
    try {
      const payload = { batch: this.pendingEvents };
      const url = `${this.config.baseUrl || 'http://localhost:3000'}/api/public/ingestion`;
      
      // Debug authentication
      const authString = `${this.config.publicKey}:${this.config.secretKey}`;
      const authHeader = 'Basic ' + btoa(authString);
      console.log('🔍 [Langfuse] Authentication debug:', {
        publicKey: this.config.publicKey,
        secretKeyPrefix: this.config.secretKey?.substring(0, 10) + '...',
        authStringLength: authString.length,
        authHeaderLength: authHeader.length,
        url
      });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          'X-Langfuse-Sdk-Name': 'langfuse-js',
          'X-Langfuse-Sdk-Version': '3.0.0',
          'X-Langfuse-Sdk-Variant': 'devtools-ai-chat',
          'X-Langfuse-Public-Key': this.config.publicKey,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        logger.info(`[Langfuse] Successfully sent ${this.pendingEvents.length} events`);
        this.pendingEvents = [];
      } else {
        const errorText = await response.text();
        logger.error(`[Langfuse] Failed to send events: ${response.status} ${response.statusText}`, errorText);
      }
    } catch (error) {
      logger.error('[Langfuse] Error sending events:', error);
    }
  }

  async shutdown() {
    await this.flush();
    logger.info('[Langfuse] Shutdown complete');
  }
}

export class LangfuseTracingBackend implements TracingBackend {
  readonly type = 'langfuse';
  readonly config: LangfuseBackendConfig;
  
  private langfuse: SimpleLangfuse | null = null;
  private currentTrace: any = null;
  private currentTraceInput: any = null; // Store trace input for observations
  private spans: Map<string, any> = new Map();
  private flushTimer?: number;
  private initialized = false;

  constructor(config: LangfuseBackendConfig) {
    this.config = {
      baseUrl: 'https://cloud.langfuse.com',
      flushInterval: 5000,
      batchSize: 50,
      ...config,
    };
    
    logger.info('Langfuse backend constructor called with config:', {
      type: config.type,
      enabled: config.enabled,
      baseUrl: this.config.baseUrl,
      hasSecretKey: !!this.config.secretKey,
      hasPublicKey: !!this.config.publicKey,
    });
    
    // Initialize Langfuse SDK
    this.initializeLangfuse();
    
    // Start periodic flush
    if (this.config.flushInterval && this.config.flushInterval > 0) {
      this.flushTimer = window.setInterval(() => {
        this.flush().catch(error => {
          logger.error('Langfuse periodic flush failed:', error);
        });
      }, this.config.flushInterval);
    }
  }

  private async initializeLangfuse(): Promise<void> {
    try {
      // Initialize Langfuse with config
      this.langfuse = new SimpleLangfuse({
        secretKey: this.config.secretKey,
        publicKey: this.config.publicKey,
        baseUrl: this.config.baseUrl,
      });
      
      this.initialized = true;
      logger.info('Langfuse backend initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Langfuse backend:', error);
      this.initialized = false;
    }
  }

  async sendEvent(event: TraceEvent): Promise<void> {
    if (!this.initialized || !this.langfuse) {
      logger.warn('Langfuse not initialized yet, queuing event');
      return;
    }
    
    // Debug log to see the structure of events
    logger.info(`Langfuse backend received event: ${event.type}`);
    logger.info('Event data structure:', JSON.stringify(event.data, null, 2));
    
    try {
      await this.processEvent(event);
    } catch (error) {
      logger.error(`Failed to process Langfuse event ${event.type}:`, error);
    }
  }

  async sendBatch(events: TraceEvent[]): Promise<void> {
    for (const event of events) {
      await this.sendEvent(event);
    }
    await this.flush();
  }

  async sendMetrics(metrics: any): Promise<void> {
    if (!this.langfuse) return;
    
    try {
      // Create an event for metrics
      this.langfuse.event({
        name: 'metrics',
        metadata: metrics,
      });
      
      logger.info('Sent metrics to Langfuse:', metrics);
    } catch (error) {
      logger.error('Failed to send metrics to Langfuse:', error);
    }
  }

  private async processEvent(event: TraceEvent): Promise<void> {
    if (!this.langfuse) return;
    
    const eventTime = new Date(event.timestamp);

    switch (event.type) {
      case 'llm_stream_start':
        // Start a new trace for each LLM interaction
        const traceInput = {
          messages: event.data?.messages,
          systemPrompt: event.data?.systemPrompt,
          modelName: event.data?.modelName,
          tools: event.data?.tools,
        };
        
        this.currentTrace = this.langfuse.trace({
          name: 'ai-chat-conversation',
          input: traceInput,
          userId: event.data?.userId,
          sessionId: event.data?.sessionId,
          metadata: {
            modelType: event.data?.modelType,
            messageCount: event.data?.messageCount,
            hasMessages: event.data?.hasMessages,
            hasSystemPrompt: event.data?.hasSystemPrompt,
            hasTools: event.data?.hasTools,
            ...event.data,
          },
          timestamp: eventTime,
        });
        
        // Store input for use in observations
        this.currentTraceInput = traceInput;
        
        logger.info(`Started new Langfuse trace with ${event.data?.messageCount || 0} messages`);
        break;

      case 'llm_response':
        if (this.currentTrace && this.currentTraceInput) {
          const generation = this.currentTrace.generation({
            name: 'llm-response',
            model: event.data?.modelName || event.data?.model || 'unknown',
            startTime: eventTime,
            input: this.currentTraceInput, // Add the stored input for this observation
            metadata: {
              hasText: event.data?.hasText,
              hasFunctionCall: event.data?.hasFunctionCall,
              hasReasoning: event.data?.hasReasoning,
              textLength: event.data?.textLength,
              functionName: event.data?.functionCall?.name,
            },
          });
          
          // End the generation immediately with the response
          generation.end({
            endTime: eventTime,
            output: {
              text: event.data?.text,
              functionCall: event.data?.functionCall,
              reasoning: event.data?.reasoning,
            },
            usage: event.data?.usage,
          });
        }
        break;

      case 'llm_error':
        if (this.currentTrace) {
          this.currentTrace.event({
            name: 'llm-error',
            level: 'ERROR',
            metadata: event.data,
            timestamp: eventTime,
          });
        }
        break;

      case 'llm_stream_chunk':
        // Handle streaming chunks - these often contain the actual content
        if (this.currentTrace) {
          // Only log meaningful chunks, not empty or metadata-only chunks
          const hasContent = event.data?.content || event.data?.text || event.data?.delta?.content;
          if (hasContent) {
            this.currentTrace.event({
              name: 'llm-stream-chunk',
              metadata: {
                chunkIndex: event.data?.index,
                finishReason: event.data?.finishReason,
                timestamp: eventTime.toISOString(),
              },
              output: event.data?.content || event.data?.text || event.data?.delta?.content,
              timestamp: eventTime,
            });
          }
        }
        break;

      case 'llm_finish':
      case 'llm_stream_finish':
        if (this.currentTrace) {
          // Build comprehensive output from available response data
          const output: any = {};
          
          if (event.data?.responseText) {
            output.text = event.data.responseText;
          }
          
          if (event.data?.accumulatedContent) {
            output.streamedContent = event.data.accumulatedContent;
          }
          
          if (event.data?.functionCall) {
            output.functionCall = event.data.functionCall;
          }
          
          if (event.data?.reasoning) {
            output.reasoning = event.data.reasoning;
          }
          
          if (event.data?.finalResponse) {
            output.fullResponse = event.data.finalResponse;
          }
          
          // Use the best available content as primary output
          let primaryOutput = output.text || output.streamedContent || output.fullResponse?.text;
          
          // If no text content, use the structured output object
          if (!primaryOutput) {
            if (Object.keys(output).length > 0) {
              primaryOutput = output;
            } else {
              // Fallback to any available content from event data
              primaryOutput = event.data?.finalResponse?.text || 
                             event.data?.responseText || 
                             event.data?.accumulatedContent ||
                             event.data?.finalResponse ||
                             "No output captured";
            }
          }
          
          console.log('🔍 [Langfuse] Setting trace output:', {
            primaryOutput: typeof primaryOutput === 'string' ? primaryOutput.substring(0, 100) + '...' : primaryOutput,
            outputType: typeof primaryOutput,
            outputKeys: typeof primaryOutput === 'object' ? Object.keys(primaryOutput) : 'N/A',
            hasText: Boolean(output.text),
            hasStreamedContent: Boolean(output.streamedContent),
            hasFullResponse: Boolean(output.fullResponse),
            eventDataKeys: Object.keys(event.data || {}),
          });
          
          // Ensure we have a valid output before updating
          if (primaryOutput === undefined || primaryOutput === null) {
            logger.warn('[Langfuse] Warning: primaryOutput is null/undefined, using fallback');
            primaryOutput = 'No response content captured';
          }
          
          const updateData = {
            endTime: eventTime,
            output: primaryOutput,
            metadata: { 
              duration: event.data?.duration,
              totalTokens: event.data?.totalTokens,
              outputFields: Object.keys(output),
              hasResponseText: Boolean(event.data?.responseText),
              hasAccumulatedContent: Boolean(event.data?.accumulatedContent),
              hasFunctionCall: Boolean(event.data?.functionCall),
              hasReasoning: Boolean(event.data?.reasoning),
              outputType: typeof primaryOutput,
              outputLength: typeof primaryOutput === 'string' ? primaryOutput.length : 'N/A',
              traceUpdateCalled: true,
              ...event.data,
            },
          };
          
          console.log('🔍 [Langfuse] Calling trace.update() with:', {
            hasOutput: Boolean(updateData.output),
            outputType: typeof updateData.output,
            outputSample: typeof updateData.output === 'string' ? updateData.output.substring(0, 50) : updateData.output,
          });
          
          this.currentTrace.update(updateData);
          logger.info(`Finished Langfuse trace with duration: ${event.data?.duration}ms, output type: ${typeof primaryOutput}`);
          
          // Clear trace and input data after completion
          this.currentTrace = null;
          this.currentTraceInput = null;
        }
        break;

      case 'call_llm_invocation':
        if (this.currentTrace) {
          // Create a span for the callLLM invocation
          const span = this.currentTrace.span({
            name: `call-llm-${event.data?.toolName || event.data?.method || 'unknown'}`,
            startTime: eventTime,
            input: {
              userPrompt: event.data?.userPrompt,
              systemPrompt: event.data?.systemPrompt,
              modelName: event.data?.modelName,
              toolName: event.data?.toolName,
              method: event.data?.method,
              strictJsonMode: event.data?.strictJsonMode,
            },
            metadata: {
              toolName: event.data?.toolName,
              method: event.data?.method,
              strictJsonMode: event.data?.strictJsonMode,
              timestamp: event.data?.timestamp,
            },
          });
          // Store the span for completion
          this.spans.set(`callLLM-${event.data?.toolName || 'default'}`, span);
        }
        break;

      case 'call_llm_completion':
      case 'call_llm_json_parsed':
        if (this.currentTrace) {
          const spanKey = `callLLM-${event.data?.toolName || 'default'}`;
          const span = this.spans.get(spanKey);
          if (span) {
            span.end({
              endTime: eventTime,
              output: {
                success: event.data?.success,
                responseText: event.data?.responseText,
                parsedJson: event.data?.parsedJson,
                method: event.data?.method,
                toolName: event.data?.toolName,
              },
              metadata: {
                success: event.data?.success,
                strictJsonMode: event.data?.strictJsonMode,
                timestamp: event.data?.timestamp,
              },
            });
            this.spans.delete(spanKey);
          }
        }
        break;

      case 'call_llm_error':
        if (this.currentTrace) {
          const spanKey = `callLLM-${event.data?.toolName || 'default'}`;
          const span = this.spans.get(spanKey);
          if (span) {
            span.end({
              endTime: eventTime,
              output: {
                error: event.data?.error,
                responseText: event.data?.responseText,
                method: event.data?.method,
                toolName: event.data?.toolName,
              },
              metadata: {
                error: event.data?.error,
                timestamp: event.data?.timestamp,
                level: 'ERROR',
              },
            });
            this.spans.delete(spanKey);
          }
        }
        break;

      case 'tool_execution_start':
        if (this.currentTrace) {
          const span = this.currentTrace.span({
            name: event.data?.toolName || 'tool-execution',
            startTime: eventTime,
            input: {
              toolName: event.data?.toolName,
              toolArgs: event.data?.toolArgs,
              agentName: event.data?.agentName,
            },
            metadata: {
              toolName: event.data?.toolName,
              agentName: event.data?.agentName,
              ...event.data,
            },
          });
          this.spans.set(event.data?.toolName || 'default', span);
        }
        break;

      case 'tool_execution_success':
      case 'tool_execution_end':
        const toolName = event.data?.toolName || 'default';
        const span = this.spans.get(toolName);
        if (span) {
          span.end({
            endTime: eventTime,
            output: {
              resultText: event.data?.resultText,
              result: event.data?.result,
              isError: event.data?.isError || false,
              success: !event.data?.isError,
            },
            metadata: {
              toolName: event.data?.toolName,
              isError: event.data?.isError || false,
              ...event.data,
            },
          });
          this.spans.delete(toolName);
        }
        break;

      case 'tool_execution_error':
        const errorToolName = event.data?.toolName || 'default';
        const errorSpan = this.spans.get(errorToolName);
        if (errorSpan) {
          errorSpan.end({
            endTime: eventTime,
            output: {
              error: event.data?.error,
              toolName: event.data?.toolName,
              isError: true,
              success: false,
            },
            metadata: {
              toolName: event.data?.toolName,
              error: event.data?.error,
              level: 'ERROR',
              isError: true,
              ...event.data,
            },
          });
          this.spans.delete(errorToolName);
        }
        break;

      case 'agent_iteration':
        if (this.currentTrace) {
          this.currentTrace.event({
            name: 'agent-iteration',
            metadata: event.data,
            timestamp: eventTime,
          });
        }
        break;

      case 'call_llm_invocation':
        // Handle direct callLLM method invocations (tools, simple prompts)
        if (this.currentTrace) {
          // Create a span for the callLLM invocation
          const span = this.currentTrace.span({
            name: `callLLM-${event.data?.toolName || 'unknown'}`,
            startTime: eventTime,
            metadata: {
              method: event.data?.method,
              modelName: event.data?.modelName,
              toolName: event.data?.toolName,
              strictJsonMode: event.data?.strictJsonMode,
              userPromptLength: event.data?.userPrompt?.length,
            },
            input: {
              userPrompt: event.data?.userPrompt,
              systemPrompt: event.data?.systemPrompt,
              modelName: event.data?.modelName,
            },
          });
          
          // Store the span for later completion
          const spanKey = `callLLM-${event.data?.toolName || 'unknown'}-${eventTime.getTime()}`;
          this.spans.set(spanKey, span);
          
          logger.info(`Started callLLM span for ${event.data?.toolName || 'unknown'} tool`);
        } else {
          // Create a new trace for standalone callLLM invocations
          this.currentTrace = this.langfuse.trace({
            name: `tool-execution-${event.data?.toolName || 'unknown'}`,
            input: {
              userPrompt: event.data?.userPrompt,
              systemPrompt: event.data?.systemPrompt,
              modelName: event.data?.modelName,
              method: event.data?.method,
            },
            metadata: {
              toolName: event.data?.toolName,
              strictJsonMode: event.data?.strictJsonMode,
              standalone: true,
            },
            timestamp: eventTime,
          });
          
          logger.info(`Started new trace for standalone callLLM invocation: ${event.data?.toolName || 'unknown'}`);
        }
        break;

      case 'call_llm_completion':
      case 'call_llm_json_parsed':
        // Handle callLLM completion events
        if (this.currentTrace) {
          // Find and close the corresponding span
          const spanKey = `callLLM-${event.data?.toolName || 'unknown'}`;
          for (const [key, span] of this.spans.entries()) {
            if (key.startsWith(spanKey)) {
              span.end({
                endTime: eventTime,
                output: {
                  responseText: event.data?.responseText,
                  parsedJson: event.data?.parsedJson,
                  success: event.data?.success,
                },
                metadata: {
                  strictJsonMode: event.data?.strictJsonMode,
                  completionType: event.type,
                },
              });
              this.spans.delete(key);
              logger.info(`Completed callLLM span for ${event.data?.toolName || 'unknown'} tool`);
              break;
            }
          }
          
          // Also update the trace if it's a standalone callLLM
          if (event.data?.success && this.currentTrace) {
            this.currentTrace.update({
              endTime: eventTime,
              output: {
                responseText: event.data?.responseText,
                parsedJson: event.data?.parsedJson,
              },
            });
          }
        }
        break;

      case 'call_llm_error':
        // Handle callLLM error events
        if (this.currentTrace) {
          // Find and close the corresponding span with error
          const spanKey = `callLLM-${event.data?.toolName || 'unknown'}`;
          for (const [key, span] of this.spans.entries()) {
            if (key.startsWith(spanKey)) {
              span.end({
                endTime: eventTime,
                output: { 
                  error: event.data?.error,
                  responseText: event.data?.responseText,
                },
                metadata: {
                  level: 'ERROR',
                  statusMessage: event.data?.error,
                },
              });
              this.spans.delete(key);
              logger.info(`Completed callLLM span with error for ${event.data?.toolName || 'unknown'} tool`);
              break;
            }
          }
          
          // Also add error event to trace
          this.currentTrace.event({
            name: 'callLLM-error',
            level: 'ERROR',
            metadata: event.data,
            timestamp: eventTime,
          });
        }
        break;

      default:
        // Handle other event types as generic events
        if (this.currentTrace) {
          this.currentTrace.event({
            name: event.type,
            metadata: event.data,
            timestamp: eventTime,
          });
        } else {
          // Create standalone event if no trace is active
          this.langfuse.event({
            name: event.type,
            metadata: event.data,
            timestamp: eventTime,
          });
        }
        break;
    }
  }

  async flush(): Promise<void> {
    if (!this.langfuse) {
      logger.warn('Langfuse not initialized, cannot flush');
      return;
    }
    
    try {
      logger.info('Flushing Langfuse traces...');
      await this.langfuse.flush();
      logger.info('Successfully flushed Langfuse traces');
    } catch (error) {
      logger.error('Failed to flush Langfuse traces:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    
    try {
      await this.flush();
      if (this.langfuse) {
        await this.langfuse.shutdown();
      }
      logger.info('Langfuse backend closed successfully');
    } catch (error) {
      logger.error('Error closing Langfuse backend:', error);
    }
  }
}

/**
 * Factory for creating tracing backends
 */
export class TracingBackendFactory {
  private static backends = new Map<string, new (config: any) => TracingBackend>();
  
  static {
    // Register built-in backends
    TracingBackendFactory.register('http', HTTPTracingBackend);
    TracingBackendFactory.register('console', ConsoleTracingBackend);
    TracingBackendFactory.register('langfuse', LangfuseTracingBackend);
  }
  
  /**
   * Register a new backend type
   */
  static register<T extends TracingBackend>(
    type: string, 
    backendClass: new (config: any) => T
  ): void {
    TracingBackendFactory.backends.set(type, backendClass);
  }
  
  /**
   * Create a backend instance
   */
  static create(config: TracingBackendConfig): TracingBackend {
    const BackendClass = TracingBackendFactory.backends.get(config.type);
    if (!BackendClass) {
      throw new Error(`Unknown tracing backend type: ${config.type}`);
    }
    
    return new BackendClass(config);
  }
  
  /**
   * Get available backend types
   */
  static getAvailableTypes(): string[] {
    return Array.from(TracingBackendFactory.backends.keys());
  }
}

/**
 * Configuration helper for common scenarios
 */
export class TracingBackendConfigHelper {
  /**
   * Create HTTP backend config for localhost development
   */
  static createHTTPConfig(url: string = 'http://localhost:8888/api/v1/traces'): HTTPBackendConfig {
    return {
      type: 'http',
      enabled: true,
      url,
      method: 'POST',
      batchSize: 20,
      flushInterval: 3000,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'X-Source': 'devtools-ai-chat',
      },
    };
  }
  
  /**
   * Create console backend config
   */
  static createConsoleConfig(logLevel: 'info' | 'debug' | 'warn' = 'info'): ConsoleBackendConfig {
    return {
      type: 'console',
      enabled: true,
      logLevel,
      includeMetrics: true,
    };
  }
  
  /**
   * Create Langfuse backend config
   */
  static createLangfuseConfig(secretKey: string, publicKey: string, baseUrl: string = 'http://localhost:3000'): LangfuseBackendConfig {
    return {
      type: 'langfuse',
      enabled: true,
      secretKey,
      publicKey,
      baseUrl,
      batchSize: 50,
      flushInterval: 5000,
    };
  }
  
  /**
   * Parse backend configs from localStorage
   */
  static parseFromLocalStorage(): TracingBackendConfig[] {
    try {
      const configJson = localStorage.getItem('ai_chat_tracing_backends');
      if (!configJson) {
        return [];
      }
      
      const configs = JSON.parse(configJson);
      return Array.isArray(configs) ? configs : [];
    } catch (error) {
      logger.error('Failed to parse tracing backend configs from localStorage:', error);
      return [];
    }
  }
  
  /**
   * Save backend configs to localStorage
   */
  static saveToLocalStorage(configs: TracingBackendConfig[]): void {
    try {
      localStorage.setItem('ai_chat_tracing_backends', JSON.stringify(configs));
    } catch (error) {
      logger.error('Failed to save tracing backend configs to localStorage:', error);
    }
  }
  
  /**
   * Get default configs based on simple flags
   */
  static getDefaultConfigs(): TracingBackendConfig[] {
    // First try to get configs from localStorage
    const storedConfigs = TracingBackendConfigHelper.parseFromLocalStorage();
    if (storedConfigs.length > 0) {
      return storedConfigs;
    }
    
    // Fallback to default configs based on simple flags
    const configs: TracingBackendConfig[] = [];
    
    // Always add HTTP backend with default URL
    // const httpUrl = localStorage.getItem('ai_chat_tracing_http_url') || 'http://localhost:8888/api/v1/traces';
    // configs.push(TracingBackendConfigHelper.createHTTPConfig(httpUrl));
    
    // Check for console backend
    const enableConsole = localStorage.getItem('ai_chat_enable_tracing') === 'true';
    if (enableConsole) {
      configs.push(TracingBackendConfigHelper.createConsoleConfig());
    }
    
    return configs;
  }
}

// Enable tracing
localStorage.setItem('ai_chat_enable_tracing', 'true');

// Example backend configurations:

// HTTP backend configuration
// const httpBackendConfig = {
//   type: 'http',
//   enabled: true,
//   url: 'http://localhost:8888/api/v1/traces',
//   method: 'POST',
//   batchSize: 20,
//   flushInterval: 3000,
//   timeout: 5000,
//   headers: {
//     'Content-Type': 'application/json',
//     'X-Source': 'devtools-ai-chat'
//   }
// };

// Langfuse backend configuration
const langfuseBackendConfig = {
  type: 'langfuse',
  enabled: true,
  secretKey: 'sk-lf-c49b659b-9046-4e9c-a4ad-7ed0048ed9b9',
  publicKey: 'pk-lf-3671be28-398a-434b-8544-a5949f32d848',
  baseUrl: 'http://localhost:3000',  // or 'https://cloud.langfuse.com' for cloud
  batchSize: 50,
  flushInterval: 5000
};

// Set up multiple backends
const backendConfigs = [
  // httpBackendConfig, 
  langfuseBackendConfig];

localStorage.setItem('ai_chat_tracing_backends', JSON.stringify(backendConfigs)); 