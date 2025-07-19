// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as i18n from '../../../../core/i18n/i18n.js';
import * as Switch from '../../../../ui/components/switch/switch.js';
import { getEvaluationConfig, setEvaluationConfig, isEvaluationEnabled, connectToEvaluationService, disconnectFromEvaluationService, getEvaluationClientId, isEvaluationConnected } from '../../common/EvaluationConfig.js';
import { createLogger } from '../../core/Logger.js';

const logger = createLogger('EvaluationConfig');

// UI Strings for evaluation configuration
const UIStrings = {
  /**
   *@description Evaluation section title
   */
  evaluationSection: 'Evaluation Configuration',
  /**
   *@description Evaluation enabled label
   */
  evaluationEnabled: 'Enable Evaluation',
  /**
   *@description Evaluation enabled hint
   */
  evaluationEnabledHint: 'Enable evaluation service connection for AI Chat interactions',
  /**
   *@description Evaluation endpoint label
   */
  evaluationEndpoint: 'Evaluation Endpoint',
  /**
   *@description Evaluation endpoint hint
   */
  evaluationEndpointHint: 'WebSocket endpoint for the evaluation service (e.g., ws://localhost:8080)',
  /**
   *@description Evaluation secret key label
   */
  evaluationSecretKey: 'Evaluation Secret Key',
  /**
   *@description Evaluation secret key hint
   */
  evaluationSecretKeyHint: 'Secret key for authentication with the evaluation service (optional)',
  /**
   *@description Evaluation connection status
   */
  evaluationConnectionStatus: 'Connection Status',
};

const str_ = i18n.i18n.registerUIStrings('panels/ai_chat/ui/components/EvaluationConfig.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

export interface EvaluationConfigData {
  enabled: boolean;
  endpoint: string;
  secretKey: string;
}

export class EvaluationConfig {
  static create(container: HTMLElement): EvaluationConfigData {
    // Add evaluation configuration section
    const evaluationSection = document.createElement('div');
    evaluationSection.className = 'settings-section evaluation-section';
    container.appendChild(evaluationSection);

    const evaluationSectionTitle = document.createElement('h3');
    evaluationSectionTitle.className = 'settings-subtitle';
    evaluationSectionTitle.textContent = i18nString(UIStrings.evaluationSection);
    evaluationSection.appendChild(evaluationSectionTitle);

    // Get current evaluation configuration
    const currentEvaluationConfig = getEvaluationConfig();

    // Evaluation enabled toggle switch
    const evaluationEnabledContainer = document.createElement('div');
    evaluationEnabledContainer.className = 'evaluation-enabled-container';
    evaluationEnabledContainer.style.display = 'flex';
    evaluationEnabledContainer.style.alignItems = 'center';
    evaluationEnabledContainer.style.gap = '8px';
    evaluationSection.appendChild(evaluationEnabledContainer);

    const evaluationEnabledSwitch = new Switch.Switch.Switch();
    evaluationEnabledSwitch.checked = isEvaluationEnabled();
    evaluationEnabledSwitch.jslogContext = 'evaluation-enabled';
    evaluationEnabledContainer.appendChild(evaluationEnabledSwitch);

    const evaluationEnabledLabel = document.createElement('label');
    evaluationEnabledLabel.className = 'evaluation-label';
    evaluationEnabledLabel.textContent = i18nString(UIStrings.evaluationEnabled);
    evaluationEnabledLabel.style.cursor = 'pointer';
    evaluationEnabledLabel.addEventListener('click', () => {
      evaluationEnabledSwitch.checked = !evaluationEnabledSwitch.checked;
      evaluationEnabledSwitch.dispatchEvent(new Switch.Switch.SwitchChangeEvent(evaluationEnabledSwitch.checked));
    });
    evaluationEnabledContainer.appendChild(evaluationEnabledLabel);

    const evaluationEnabledHint = document.createElement('div');
    evaluationEnabledHint.className = 'settings-hint';
    evaluationEnabledHint.textContent = i18nString(UIStrings.evaluationEnabledHint);
    evaluationSection.appendChild(evaluationEnabledHint);

    // Connection status indicator
    const connectionStatusContainer = document.createElement('div');
    connectionStatusContainer.className = 'connection-status-container';
    connectionStatusContainer.style.display = 'flex';
    connectionStatusContainer.style.alignItems = 'center';
    connectionStatusContainer.style.gap = '8px';
    connectionStatusContainer.style.marginTop = '8px';
    connectionStatusContainer.style.fontSize = '13px';
    evaluationSection.appendChild(connectionStatusContainer);

    const connectionStatusDot = document.createElement('div');
    connectionStatusDot.className = 'connection-status-dot';
    connectionStatusDot.style.width = '8px';
    connectionStatusDot.style.height = '8px';
    connectionStatusDot.style.borderRadius = '50%';
    connectionStatusDot.style.flexShrink = '0';
    connectionStatusContainer.appendChild(connectionStatusDot);

    const connectionStatusText = document.createElement('span');
    connectionStatusText.className = 'connection-status-text';
    connectionStatusContainer.appendChild(connectionStatusText);

    // Function to update connection status
    const updateConnectionStatus = () => {
      const isConnected = isEvaluationConnected();
      
      logger.debug('Updating connection status', { isConnected });
      
      if (isConnected) {
        connectionStatusDot.style.backgroundColor = 'var(--color-accent-green)';
        connectionStatusText.textContent = 'Connected to evaluation server';
        connectionStatusText.style.color = 'var(--color-accent-green)';
      } else {
        connectionStatusDot.style.backgroundColor = 'var(--color-text-disabled)';
        connectionStatusText.textContent = 'Not connected';
        connectionStatusText.style.color = 'var(--color-text-disabled)';
      }
    };

    // Update status initially
    updateConnectionStatus();
    
    // Set up periodic status updates every 2 seconds
    const statusUpdateInterval = setInterval(updateConnectionStatus, 2000);

    // Evaluation configuration container (shown when enabled)
    const evaluationConfigContainer = document.createElement('div');
    evaluationConfigContainer.className = 'evaluation-config-container';
    evaluationConfigContainer.style.display = evaluationEnabledSwitch.checked ? 'block' : 'none';
    evaluationSection.appendChild(evaluationConfigContainer);

    // Client ID display (read-only)
    const clientIdLabel = document.createElement('div');
    clientIdLabel.className = 'settings-label';
    clientIdLabel.textContent = 'Client ID';
    evaluationConfigContainer.appendChild(clientIdLabel);

    const clientIdHint = document.createElement('div');
    clientIdHint.className = 'settings-hint';
    clientIdHint.textContent = 'Unique identifier for this DevTools instance';
    evaluationConfigContainer.appendChild(clientIdHint);

    const clientIdInput = document.createElement('input');
    clientIdInput.type = 'text';
    clientIdInput.className = 'settings-input';
    clientIdInput.value = currentEvaluationConfig.clientId || 'Auto-generated on first connection';
    clientIdInput.readOnly = true;
    clientIdInput.style.backgroundColor = 'var(--color-background-elevation-1)';
    clientIdInput.style.cursor = 'default';
    evaluationConfigContainer.appendChild(clientIdInput);

    // Evaluation endpoint
    const evaluationEndpointLabel = document.createElement('div');
    evaluationEndpointLabel.className = 'settings-label';
    evaluationEndpointLabel.textContent = i18nString(UIStrings.evaluationEndpoint);
    evaluationConfigContainer.appendChild(evaluationEndpointLabel);

    const evaluationEndpointHint = document.createElement('div');
    evaluationEndpointHint.className = 'settings-hint';
    evaluationEndpointHint.textContent = i18nString(UIStrings.evaluationEndpointHint);
    evaluationConfigContainer.appendChild(evaluationEndpointHint);

    const evaluationEndpointInput = document.createElement('input');
    evaluationEndpointInput.type = 'text';
    evaluationEndpointInput.className = 'settings-input';
    evaluationEndpointInput.placeholder = 'ws://localhost:8080';
    evaluationEndpointInput.value = currentEvaluationConfig.endpoint || 'ws://localhost:8080';
    evaluationConfigContainer.appendChild(evaluationEndpointInput);

    // Evaluation secret key
    const evaluationSecretKeyLabel = document.createElement('div');
    evaluationSecretKeyLabel.className = 'settings-label';
    evaluationSecretKeyLabel.textContent = i18nString(UIStrings.evaluationSecretKey);
    evaluationConfigContainer.appendChild(evaluationSecretKeyLabel);

    const evaluationSecretKeyHint = document.createElement('div');
    evaluationSecretKeyHint.className = 'settings-hint';
    evaluationSecretKeyHint.textContent = i18nString(UIStrings.evaluationSecretKeyHint);
    evaluationConfigContainer.appendChild(evaluationSecretKeyHint);

    const evaluationSecretKeyInput = document.createElement('input');
    evaluationSecretKeyInput.type = 'password';
    evaluationSecretKeyInput.className = 'settings-input';
    evaluationSecretKeyInput.placeholder = 'Optional secret key';
    evaluationSecretKeyInput.value = currentEvaluationConfig.secretKey || '';
    evaluationConfigContainer.appendChild(evaluationSecretKeyInput);

    // Connection status message
    const connectionStatusMessage = document.createElement('div');
    connectionStatusMessage.className = 'settings-status';
    connectionStatusMessage.style.display = 'none';
    evaluationConfigContainer.appendChild(connectionStatusMessage);

    // Auto-connect when evaluation is enabled/disabled
    evaluationEnabledSwitch.addEventListener(Switch.Switch.SwitchChangeEvent.eventName, async (event: Event) => {
      const switchEvent = event as Switch.Switch.SwitchChangeEvent;
      const isEnabled = switchEvent.checked;
      evaluationConfigContainer.style.display = isEnabled ? 'block' : 'none';
      
      // Show connection status
      connectionStatusMessage.style.display = 'block';
      
      if (isEnabled) {
        // Auto-connect when enabled
        connectionStatusMessage.textContent = 'Connecting...';
        connectionStatusMessage.style.backgroundColor = 'var(--color-background-elevation-1)';
        connectionStatusMessage.style.color = 'var(--color-text-primary)';
        
        try {
          const endpoint = evaluationEndpointInput.value.trim() || 'ws://localhost:8080';
          const secretKey = evaluationSecretKeyInput.value.trim();

          // Update config and connect
          setEvaluationConfig({
            enabled: true,
            endpoint,
            secretKey
          });

          await connectToEvaluationService();
          
          // Update client ID display after connection
          const clientId = getEvaluationClientId();
          if (clientId) {
            clientIdInput.value = clientId;
          }
          
          connectionStatusMessage.textContent = '✓ Connected successfully';
          connectionStatusMessage.style.backgroundColor = 'var(--color-accent-green-background)';
          connectionStatusMessage.style.color = 'var(--color-accent-green)';
          
          // Update connection status indicator
          setTimeout(updateConnectionStatus, 500);
        } catch (error) {
          connectionStatusMessage.textContent = `✗ ${error instanceof Error ? error.message : 'Connection failed'}`;
          connectionStatusMessage.style.backgroundColor = 'var(--color-accent-red-background)';
          connectionStatusMessage.style.color = 'var(--color-accent-red)';
          
          // Uncheck the switch if connection failed
          evaluationEnabledSwitch.checked = false;
          evaluationConfigContainer.style.display = 'none';
        }
      } else {
        // Auto-disconnect when disabled
        connectionStatusMessage.textContent = 'Disconnecting...';
        connectionStatusMessage.style.backgroundColor = 'var(--color-background-elevation-1)';
        connectionStatusMessage.style.color = 'var(--color-text-primary)';
        
        try {
          disconnectFromEvaluationService();
          
          // Update config
          setEvaluationConfig({
            enabled: false,
            endpoint: evaluationEndpointInput.value.trim() || 'ws://localhost:8080',
            secretKey: evaluationSecretKeyInput.value.trim()
          });
          
          connectionStatusMessage.textContent = '✓ Disconnected';
          connectionStatusMessage.style.backgroundColor = 'var(--color-background-elevation-1)';
          connectionStatusMessage.style.color = 'var(--color-text-primary)';
          
          // Update connection status indicator
          updateConnectionStatus();
        } catch (error) {
          connectionStatusMessage.textContent = `✗ Disconnect error: ${error instanceof Error ? error.message : 'Unknown error'}`;
          connectionStatusMessage.style.backgroundColor = 'var(--color-accent-red-background)';
          connectionStatusMessage.style.color = 'var(--color-accent-red)';
        }
      }
      
      // Hide status message after 3 seconds
      setTimeout(() => {
        connectionStatusMessage.style.display = 'none';
      }, 3000);
    });

    // Return configuration data getter
    return {
      get enabled() { return evaluationEnabledSwitch.checked; },
      get endpoint() { return evaluationEndpointInput.value.trim() || 'ws://localhost:8080'; },
      get secretKey() { return evaluationSecretKeyInput.value.trim(); }
    };
  }

  static save(config: EvaluationConfigData): void {
    setEvaluationConfig({
      enabled: config.enabled,
      endpoint: config.endpoint,
      secretKey: config.secretKey
    });

    logger.debug('Evaluation configuration saved', config);
  }
}