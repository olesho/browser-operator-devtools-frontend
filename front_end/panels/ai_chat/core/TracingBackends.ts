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
  type: 'http' | 'console' | 'websocket' | 'file';
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
 * Factory for creating tracing backends
 */
export class TracingBackendFactory {
  private static backends = new Map<string, new (config: any) => TracingBackend>();
  
  static {
    // Register built-in backends
    TracingBackendFactory.register('http', HTTPTracingBackend);
    TracingBackendFactory.register('console', ConsoleTracingBackend);
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
  static createHTTPConfig(url: string = 'http://localhost:8888'): HTTPBackendConfig {
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
    const configs: TracingBackendConfig[] = [];
    
    // Always add HTTP backend with default URL
    const httpUrl = localStorage.getItem('ai_chat_tracing_http_url') || 'http://localhost:8888/api/v1/traces';
    configs.push(TracingBackendConfigHelper.createHTTPConfig(httpUrl));
    
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

// Set up the HTTP backend configuration
const backendConfigs = [
  {
    type: 'http',
    enabled: true,
    url: 'http://localhost:8888/traces',  // Note: include /traces path
    method: 'POST',
    batchSize: 20,
    flushInterval: 3000,
    timeout: 5000,
    headers: {
      'Content-Type': 'application/json',
      'X-Source': 'devtools-ai-chat'
    }
  }
];

localStorage.setItem('ai_chat_tracing_backends', JSON.stringify(backendConfigs)); 