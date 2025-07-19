// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as i18n from '../../../../core/i18n/i18n.js';
import { getTracingConfig, setTracingConfig, isTracingEnabled } from '../../tracing/TracingConfig.js';
import { createLogger } from '../../core/Logger.js';

const logger = createLogger('TracingConfig');

// UI Strings for tracing
const UIStrings = {
  /**
   *@description Tracing section title
   */
  tracingSection: 'Tracing Configuration',
  /**
   *@description Tracing enabled label
   */
  tracingEnabled: 'Enable Tracing',
  /**
   *@description Tracing enabled hint
   */
  tracingEnabledHint: 'Enable observability tracing for AI Chat interactions',
  /**
   *@description Langfuse endpoint label
   */
  langfuseEndpoint: 'Langfuse Endpoint',
  /**
   *@description Langfuse endpoint hint
   */
  langfuseEndpointHint: 'URL of your Langfuse server (e.g., http://localhost:3000)',
  /**
   *@description Langfuse public key label
   */
  langfusePublicKey: 'Langfuse Public Key',
  /**
   *@description Langfuse public key hint
   */
  langfusePublicKeyHint: 'Your Langfuse project public key (starts with pk-lf-)',
  /**
   *@description Langfuse secret key label
   */
  langfuseSecretKey: 'Langfuse Secret Key',
  /**
   *@description Langfuse secret key hint
   */
  langfuseSecretKeyHint: 'Your Langfuse project secret key (starts with sk-lf-)',
  /**
   *@description Test tracing button
   */
  testTracing: 'Test Connection',
};

const str_ = i18n.i18n.registerUIStrings('panels/ai_chat/ui/components/TracingConfig.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

export interface TracingConfigData {
  enabled: boolean;
  endpoint: string;
  publicKey: string;
  secretKey: string;
}

export class TracingConfig {
  static create(container: HTMLElement): TracingConfigData {
    // Add tracing configuration section
    const tracingSection = document.createElement('div');
    tracingSection.className = 'settings-section tracing-section';
    container.appendChild(tracingSection);

    const tracingSectionTitle = document.createElement('h3');
    tracingSectionTitle.className = 'settings-subtitle';
    tracingSectionTitle.textContent = i18nString(UIStrings.tracingSection);
    tracingSection.appendChild(tracingSectionTitle);

    // Get current tracing configuration
    const currentTracingConfig = getTracingConfig();

    // Tracing enabled checkbox
    const tracingEnabledContainer = document.createElement('div');
    tracingEnabledContainer.className = 'tracing-enabled-container';
    tracingSection.appendChild(tracingEnabledContainer);

    const tracingEnabledCheckbox = document.createElement('input');
    tracingEnabledCheckbox.type = 'checkbox';
    tracingEnabledCheckbox.id = 'tracing-enabled';
    tracingEnabledCheckbox.className = 'tracing-checkbox';
    tracingEnabledCheckbox.checked = isTracingEnabled();
    tracingEnabledContainer.appendChild(tracingEnabledCheckbox);

    const tracingEnabledLabel = document.createElement('label');
    tracingEnabledLabel.htmlFor = 'tracing-enabled';
    tracingEnabledLabel.className = 'tracing-label';
    tracingEnabledLabel.textContent = i18nString(UIStrings.tracingEnabled);
    tracingEnabledContainer.appendChild(tracingEnabledLabel);

    const tracingEnabledHint = document.createElement('div');
    tracingEnabledHint.className = 'settings-hint';
    tracingEnabledHint.textContent = i18nString(UIStrings.tracingEnabledHint);
    tracingSection.appendChild(tracingEnabledHint);

    // Tracing configuration container (shown when enabled)
    const tracingConfigContainer = document.createElement('div');
    tracingConfigContainer.className = 'tracing-config-container';
    tracingConfigContainer.style.display = tracingEnabledCheckbox.checked ? 'block' : 'none';
    tracingSection.appendChild(tracingConfigContainer);

    // Langfuse endpoint
    const endpointLabel = document.createElement('div');
    endpointLabel.className = 'settings-label';
    endpointLabel.textContent = i18nString(UIStrings.langfuseEndpoint);
    tracingConfigContainer.appendChild(endpointLabel);

    const endpointHint = document.createElement('div');
    endpointHint.className = 'settings-hint';
    endpointHint.textContent = i18nString(UIStrings.langfuseEndpointHint);
    tracingConfigContainer.appendChild(endpointHint);

    const endpointInput = document.createElement('input');
    endpointInput.className = 'settings-input';
    endpointInput.type = 'text';
    endpointInput.placeholder = 'http://localhost:3000';
    endpointInput.value = currentTracingConfig.endpoint || 'http://localhost:3000';
    tracingConfigContainer.appendChild(endpointInput);

    // Langfuse public key
    const publicKeyLabel = document.createElement('div');
    publicKeyLabel.className = 'settings-label';
    publicKeyLabel.textContent = i18nString(UIStrings.langfusePublicKey);
    tracingConfigContainer.appendChild(publicKeyLabel);

    const publicKeyHint = document.createElement('div');
    publicKeyHint.className = 'settings-hint';
    publicKeyHint.textContent = i18nString(UIStrings.langfusePublicKeyHint);
    tracingConfigContainer.appendChild(publicKeyHint);

    const publicKeyInput = document.createElement('input');
    publicKeyInput.className = 'settings-input';
    publicKeyInput.type = 'text';
    publicKeyInput.placeholder = 'pk-lf-...';
    publicKeyInput.value = currentTracingConfig.publicKey || '';
    tracingConfigContainer.appendChild(publicKeyInput);

    // Langfuse secret key
    const secretKeyLabel = document.createElement('div');
    secretKeyLabel.className = 'settings-label';
    secretKeyLabel.textContent = i18nString(UIStrings.langfuseSecretKey);
    tracingConfigContainer.appendChild(secretKeyLabel);

    const secretKeyHint = document.createElement('div');
    secretKeyHint.className = 'settings-hint';
    secretKeyHint.textContent = i18nString(UIStrings.langfuseSecretKeyHint);
    tracingConfigContainer.appendChild(secretKeyHint);

    const secretKeyInput = document.createElement('input');
    secretKeyInput.className = 'settings-input';
    secretKeyInput.type = 'password';
    secretKeyInput.placeholder = 'sk-lf-...';
    secretKeyInput.value = currentTracingConfig.secretKey || '';
    tracingConfigContainer.appendChild(secretKeyInput);

    // Test connection button
    const testTracingButton = document.createElement('button');
    testTracingButton.className = 'settings-button test-button';
    testTracingButton.textContent = i18nString(UIStrings.testTracing);
    tracingConfigContainer.appendChild(testTracingButton);

    // Test status message
    const testTracingStatus = document.createElement('div');
    testTracingStatus.className = 'settings-status';
    testTracingStatus.style.display = 'none';
    tracingConfigContainer.appendChild(testTracingStatus);

    // Toggle tracing config visibility
    tracingEnabledCheckbox.addEventListener('change', () => {
      tracingConfigContainer.style.display = tracingEnabledCheckbox.checked ? 'block' : 'none';
    });

    // Test tracing connection
    testTracingButton.addEventListener('click', async () => {
      testTracingButton.disabled = true;
      testTracingStatus.style.display = 'block';
      testTracingStatus.textContent = 'Testing connection...';
      testTracingStatus.style.backgroundColor = 'var(--color-background-elevation-1)';
      testTracingStatus.style.color = 'var(--color-text-primary)';

      try {
        const endpoint = endpointInput.value.trim();
        const publicKey = publicKeyInput.value.trim();
        const secretKey = secretKeyInput.value.trim();

        if (!endpoint || !publicKey || !secretKey) {
          throw new Error('All fields are required for testing');
        }

        // Test the connection with a simple trace
        const testPayload = {
          batch: [{
            id: `test-${Date.now()}`,
            timestamp: new Date().toISOString(),
            type: 'trace-create',
            body: {
              id: `trace-test-${Date.now()}`,
              name: 'Connection Test',
              timestamp: new Date().toISOString()
            }
          }]
        };

        const response = await fetch(`${endpoint}/api/public/ingestion`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + btoa(`${publicKey}:${secretKey}`)
          },
          body: JSON.stringify(testPayload)
        });

        if (response.ok) {
          testTracingStatus.textContent = '✓ Connection successful';
          testTracingStatus.style.backgroundColor = 'var(--color-accent-green-background)';
          testTracingStatus.style.color = 'var(--color-accent-green)';
        } else {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
      } catch (error) {
        testTracingStatus.textContent = `✗ ${error instanceof Error ? error.message : 'Connection failed'}`;
        testTracingStatus.style.backgroundColor = 'var(--color-accent-red-background)';
        testTracingStatus.style.color = 'var(--color-accent-red)';
      } finally {
        testTracingButton.disabled = false;
        setTimeout(() => {
          testTracingStatus.style.display = 'none';
        }, 5000);
      }
    });

    // Return configuration data getter
    return {
      get enabled() { return tracingEnabledCheckbox.checked; },
      get endpoint() { return endpointInput.value.trim(); },
      get publicKey() { return publicKeyInput.value.trim(); },
      get secretKey() { return secretKeyInput.value.trim(); }
    };
  }

  static save(config: TracingConfigData): void {
    if (config.enabled) {
      if (config.endpoint && config.publicKey && config.secretKey) {
        setTracingConfig({
          provider: 'langfuse',
          endpoint: config.endpoint,
          publicKey: config.publicKey,
          secretKey: config.secretKey
        });
      }
    } else {
      setTracingConfig({ provider: 'disabled' });
    }

    logger.debug('Tracing configuration saved', config);
  }
}