// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import { createLogger } from '../core/Logger.js';
import { 
  TracingProvider, 
  type TracingContext, 
  type TraceMetadata, 
  type ObservationData 
} from './TracingProvider.js';

const logger = createLogger('LangfuseProvider');

interface LangfuseEvent {
  id: string;
  timestamp: string;
  type: 'trace-create' | 'span-create' | 'event-create' | 'generation-create' | 'score-create';
  body: Record<string, any>;
  metadata?: Record<string, any>;
}

interface LangfuseBatch {
  batch: LangfuseEvent[];
  metadata?: Record<string, any>;
}

/**
 * Langfuse implementation of TracingProvider
 */
export class LangfuseProvider extends TracingProvider {
  private endpoint: string;
  private publicKey: string;
  private secretKey: string;
  private eventBuffer: LangfuseEvent[] = [];
  private flushTimer?: number;
  private readonly batchSize = 5; // Reduced for debugging
  private readonly flushInterval = 2000; // 2 seconds for debugging

  constructor(endpoint: string, publicKey: string, secretKey: string, enabled: boolean = true) {
    super(enabled);
    this.endpoint = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
    this.publicKey = publicKey;
    this.secretKey = secretKey;
  }

  async initialize(): Promise<void> {
    if (!this.enabled) return;
    
    logger.info('Initializing Langfuse provider', {
      endpoint: this.endpoint,
      publicKey: this.publicKey.substring(0, 10) + '...'
    });

    // Start auto-flush timer
    this.startAutoFlush();
  }

  async createSession(sessionId: string, metadata?: TraceMetadata): Promise<void> {
    if (!this.enabled) return;

    // Sessions are implicitly created when traces reference them
    logger.debug('Session will be created implicitly', { sessionId });
  }

  async createTrace(
    traceId: string,
    sessionId: string,
    name: string,
    input?: any,
    metadata?: TraceMetadata,
    userId?: string,
    tags?: string[]
  ): Promise<void> {
    if (!this.enabled) return;

    const event: LangfuseEvent = {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      type: 'trace-create',
      body: {
        id: traceId,
        sessionId,
        name,
        timestamp: new Date().toISOString(),
        ...(input !== undefined && { input }),
        ...(metadata && { metadata }),
        ...(userId && { userId }),
        ...(tags && tags.length > 0 && { tags })
      }
    };

    this.addEvent(event);
  }

  async createObservation(
    observation: ObservationData,
    traceId: string
  ): Promise<void> {
    console.error(`[CRITICAL LANGFUSE DEBUG] createObservation called - enabled: ${this.enabled}, traceId: ${traceId}`);
    if (!this.enabled) {
      console.error(`[CRITICAL LANGFUSE DEBUG] Provider disabled, returning early`);
      return;
    }

    // Determine the correct event type based on observation type
    let eventType: 'span-create' | 'event-create' | 'generation-create';
    switch (observation.type) {
      case 'span':
        eventType = 'span-create';
        break;
      case 'event':
        eventType = 'event-create';
        break;
      case 'generation':
        eventType = 'generation-create';
        break;
      default:
        eventType = 'event-create'; // Default fallback
    }

    const startTime = observation.startTime || new Date();
    
    const body: Record<string, any> = {
      id: observation.id,
      traceId,
      name: observation.name || 'Unnamed Observation',
      startTime: startTime.toISOString(), // Required field for all observations
      ...(observation.parentObservationId && { parentObservationId: observation.parentObservationId }),
      ...(observation.input !== undefined && { input: observation.input }),
      ...(observation.output !== undefined && { output: observation.output }),
      ...(observation.metadata && { metadata: observation.metadata }),
      ...(observation.error && { level: 'ERROR', statusMessage: observation.error })
    };

    // Add type-specific fields
    if (observation.type === 'span') {
      if (observation.endTime) {
        body.endTime = observation.endTime.toISOString();
      }
    }

    if (observation.type === 'generation') {
      if (observation.model) {
        body.model = observation.model;
      }
      if (observation.modelParameters) {
        body.modelParameters = observation.modelParameters;
      }
      if (observation.usage) {
        body.usage = {
          promptTokens: observation.usage.promptTokens,
          completionTokens: observation.usage.completionTokens,
          totalTokens: observation.usage.totalTokens
        };
      }
      // Generation uses completionStartTime
      body.completionStartTime = startTime.toISOString();
    }

    const event: LangfuseEvent = {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      type: eventType, // Use correct Langfuse event type
      body,
      metadata: observation.metadata
    };

    console.error(`[CRITICAL LANGFUSE DEBUG] About to call addEvent with observation event:`, JSON.stringify(event, null, 2));
    this.addEvent(event);
    console.error(`[CRITICAL LANGFUSE DEBUG] addEvent called successfully, event added to buffer`);
  }

  async updateObservation(
    observationId: string,
    updates: Partial<ObservationData>
  ): Promise<void> {
    if (!this.enabled) return;

    // For updates, we need to create a new event with the same observation ID
    // This is a limitation of the Langfuse API - updates are done by creating new events
    logger.debug('Observation updates not fully supported in batch API', { observationId, updates });
  }

  async finalizeTrace(
    traceId: string,
    output?: any,
    metadata?: TraceMetadata
  ): Promise<void> {
    if (!this.enabled) return;

    // Create a trace-create event with output to update the trace
    const event: LangfuseEvent = {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      type: 'trace-create',
      body: {
        id: traceId,
        timestamp: new Date().toISOString(),
        ...(output !== undefined && { output }),
        ...(metadata && { metadata })
      }
    };

    this.addEvent(event);
    
    // Flush immediately when trace is finalized
    await this.flush();
  }

  async flush(): Promise<void> {
    console.error(`[CRITICAL FLUSH DEBUG] flush() called - enabled: ${this.enabled}, buffer length: ${this.eventBuffer.length}`);
    
    if (!this.enabled) {
      console.error(`[CRITICAL FLUSH DEBUG] Provider disabled, returning early`);
      return;
    }
    
    if (this.eventBuffer.length === 0) {
      console.error(`[CRITICAL FLUSH DEBUG] Buffer empty, nothing to flush`);
      return;
    }

    const events = [...this.eventBuffer];
    this.eventBuffer = [];
    
    console.error(`[CRITICAL FLUSH DEBUG] About to send batch with ${events.length} events`);

    try {
      await this.sendBatch(events);
      console.error(`[CRITICAL FLUSH DEBUG] Successfully flushed ${events.length} events to Langfuse`);
      logger.debug(`Flushed ${events.length} events to Langfuse`);
    } catch (error) {
      console.error(`[CRITICAL FLUSH DEBUG] Failed to flush events:`, error);
      logger.error('Failed to flush events to Langfuse', error);
      // Re-add events to buffer on failure
      this.eventBuffer.unshift(...events);
    }
  }

  private async sendBatch(events: LangfuseEvent[]): Promise<void> {
    const batch: LangfuseBatch = {
      batch: events,
      metadata: {
        source: 'devtools-ai-chat',
        version: '1.0.0'
      }
    };

    console.error(`[CRITICAL SEND DEBUG] Sending batch to ${this.endpoint}/api/public/ingestion with ${events.length} events`);
    console.error(`[CRITICAL SEND DEBUG] Batch payload:`, JSON.stringify(batch, null, 2));

    const response = await fetch(`${this.endpoint}/api/public/ingestion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + btoa(`${this.publicKey}:${this.secretKey}`)
      },
      body: JSON.stringify(batch)
    });

    console.error(`[CRITICAL SEND DEBUG] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CRITICAL SEND DEBUG] Error response body:`, errorText);
      throw new Error(`Langfuse ingestion failed: ${response.status} ${errorText}`);
    } else {
      const responseText = await response.text();
      console.error(`[CRITICAL SEND DEBUG] Success response body:`, responseText);
    }
  }

  private addEvent(event: LangfuseEvent): void {
    console.error(`[CRITICAL BUFFER DEBUG] Adding event to buffer - type: ${event.type}, current buffer size: ${this.eventBuffer.length}`);
    
    logger.debug('Adding event to buffer', { 
      eventType: event.type, 
      eventId: event.id,
      bufferSize: this.eventBuffer.length + 1
    });
    
    this.eventBuffer.push(event);
    console.error(`[CRITICAL BUFFER DEBUG] Event added, new buffer size: ${this.eventBuffer.length}, batch size limit: ${this.batchSize}`);

    if (this.eventBuffer.length >= this.batchSize) {
      console.error(`[CRITICAL BUFFER DEBUG] Buffer full (${this.eventBuffer.length}/${this.batchSize}), triggering auto-flush`);
      logger.debug('Buffer full, triggering auto-flush');
      this.flush().catch(error => {
        console.error(`[CRITICAL BUFFER DEBUG] Auto-flush failed:`, error);
        logger.error('Auto-flush failed', error);
      });
    } else {
      console.error(`[CRITICAL BUFFER DEBUG] Buffer not full yet (${this.eventBuffer.length}/${this.batchSize}), waiting for more events or timer`);
    }
  }

  private startAutoFlush(): void {
    console.error(`[CRITICAL TIMER DEBUG] Starting auto-flush timer with interval: ${this.flushInterval}ms`);
    this.flushTimer = window.setInterval(() => {
      console.error(`[CRITICAL TIMER DEBUG] Auto-flush timer triggered, buffer size: ${this.eventBuffer.length}`);
      this.flush().catch(error => {
        console.error(`[CRITICAL TIMER DEBUG] Periodic flush failed:`, error);
        logger.error('Periodic flush failed', error);
      });
    }, this.flushInterval);
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Cleanup method to stop auto-flush timer
   */
  destroy(): void {
    if (this.flushTimer) {
      window.clearInterval(this.flushTimer);
    }
    // Final flush
    this.flush().catch(error => {
      logger.error('Final flush failed', error);
    });
  }
}