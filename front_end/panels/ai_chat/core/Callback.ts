// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Base interface for callbacks in the AI Chat system
 */
export class Callback {
  /**
   * Called when a response is received
   */
  onResponse(response: any): void {}

  /**
   * Called when an error occurs
   */
  onError(error: any): void {}

  /**
   * Called when the operation finishes
   */
  onFinish(): void {}

  /**
   * Called when streaming starts
   */
  onStreamStart(): void {}

  /**
   * Called when streaming ends
   */
  onStreamFinish(): void {}

  /**
   * Called when a stream chunk is received
   */
  onStreamChunk(chunk: any): void {}

  /**
   * Called when a stream error occurs
   */
  onStreamError(error: any): void {}

  /**
   * Called when a stream chunk finishes
   */
  onStreamChunkFinish(): void {}

  /**
   * Called when a stream chunk error occurs
   */
  onStreamChunkError(error: any): void {}
} 