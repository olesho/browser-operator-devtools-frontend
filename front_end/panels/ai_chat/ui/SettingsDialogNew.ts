// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as i18n from '../../../core/i18n/i18n.js';
import * as UI from '../../../ui/legacy/legacy.js';
import { LLMClient } from '../LLM/LLMClient.js';
import { createLogger } from '../core/Logger.js';
import { TracingConfig, type TracingConfigData } from './components/TracingConfig.js';
import { EvaluationConfig, type EvaluationConfigData } from './components/EvaluationConfig.js';
import { VectorDatabaseConfig, type VectorDatabaseConfigData, isVectorDBEnabled } from './components/VectorDatabaseConfig.js';
import { ProviderConfig, type ProviderConfigData, type ProviderConfigDeps, type ModelOption } from './components/ProviderConfig.js';

const logger = createLogger('SettingsDialog');

// UI Strings
const UIStrings = {
  /**
   *@description Settings dialog title
   */
  settings: 'Settings',
  /**
   *@description Browsing history section title
   */
  browsingHistoryTitle: 'Browsing History',
  /**
   *@description Browsing history description
   */
  browsingHistoryDescription: 'Your browsing history is stored locally to enable search by domains and keywords.',
  /**
   *@description Clear browsing history button
   */
  clearHistoryButton: 'Clear Browsing History',
  /**
   *@description History cleared message
   */
  historyCleared: 'Browsing history cleared successfully',
  /**
   *@description Important notice title
   */
  importantNotice: 'Important Notice',
};

const str_ = i18n.i18n.registerUIStrings('panels/ai_chat/ui/SettingsDialog.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

export { isVectorDBEnabled };

export class SettingsDialog {
  static async show(
    selectedModel: string,
    miniModel: string,
    nanoModel: string,
    onSettingsSaved: () => void,
    fetchLiteLLMModels: (apiKey: string|null, endpoint?: string) => Promise<{models: ModelOption[], hadWildcard: boolean}>,
    updateModelOptions: (litellmModels: ModelOption[], hadWildcard?: boolean) => void,
    getModelOptions: (provider?: 'openai' | 'litellm' | 'groq' | 'openrouter') => ModelOption[],
    addCustomModelOption: (modelName: string, modelType?: 'openai' | 'litellm' | 'groq' | 'openrouter') => ModelOption[],
    removeCustomModelOption: (modelName: string) => ModelOption[],
  ): Promise<void> {
    logger.debug('SettingsDialog.show - Initial parameters:', {
      selectedModel,
      miniModel,
      nanoModel
    });

    // Create a settings dialog
    const dialog = new UI.Dialog.Dialog();
    dialog.setDimmed(true);
    dialog.setOutsideClickCallback(() => dialog.hide());
    dialog.contentElement.classList.add('settings-dialog');

    // Create settings content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'settings-content';
    contentDiv.style.overflowY = 'auto';
    dialog.contentElement.appendChild(contentDiv);
    
    // Create header
    const headerDiv = document.createElement('div');
    headerDiv.className = 'settings-header';
    contentDiv.appendChild(headerDiv);
    
    const title = document.createElement('h2');
    title.className = 'settings-title';
    title.textContent = i18nString(UIStrings.settings);
    headerDiv.appendChild(title);
    
    const closeButton = document.createElement('button');
    closeButton.className = 'settings-close-button';
    closeButton.setAttribute('aria-label', 'Close settings');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => dialog.hide());
    headerDiv.appendChild(closeButton);

    // Create provider configuration dependencies
    const providerDeps: ProviderConfigDeps = {
      fetchLiteLLMModels,
      updateModelOptions,
      getModelOptions,
      addCustomModelOption,
      removeCustomModelOption
    };

    // Create configuration sections
    const providerConfig = ProviderConfig.create(contentDiv, selectedModel, miniModel, nanoModel, providerDeps);
    const vectorDbConfig = VectorDatabaseConfig.create(contentDiv);
    const tracingConfig = TracingConfig.create(contentDiv);
    const evaluationConfig = EvaluationConfig.create(contentDiv);

    // Add browsing history section
    SettingsDialog.createBrowsingHistorySection(contentDiv);

    // Add disclaimer section
    SettingsDialog.createDisclaimerSection(contentDiv);
    
    // Create save/cancel buttons
    const { saveButton, saveStatusMessage } = SettingsDialog.createFooter(
      contentDiv,
      dialog,
      providerConfig,
      vectorDbConfig,
      tracingConfig,
      evaluationConfig,
      onSettingsSaved
    );

    // Add styles
    SettingsDialog.addStyles(dialog);
    
    dialog.show();
    
    return Promise.resolve();
  }

  private static createBrowsingHistorySection(container: HTMLElement): void {
    const historySection = document.createElement('div');
    historySection.className = 'settings-section history-section';
    container.appendChild(historySection);
    
    const historyTitle = document.createElement('h3');
    historyTitle.className = 'settings-subtitle';
    historyTitle.textContent = i18nString(UIStrings.browsingHistoryTitle);
    historySection.appendChild(historyTitle);
    
    const historyDescription = document.createElement('p');
    historyDescription.className = 'settings-description';
    historyDescription.textContent = i18nString(UIStrings.browsingHistoryDescription);
    historySection.appendChild(historyDescription);
    
    // Status message element (initially hidden)
    const statusMessage = document.createElement('div');
    statusMessage.className = 'settings-status history-status';
    statusMessage.style.display = 'none';
    statusMessage.textContent = i18nString(UIStrings.historyCleared);
    historySection.appendChild(statusMessage);
    
    // Clear history button
    const clearHistoryButton = document.createElement('button');
    clearHistoryButton.textContent = i18nString(UIStrings.clearHistoryButton);
    clearHistoryButton.className = 'settings-button clear-button';
    clearHistoryButton.setAttribute('type', 'button');
    historySection.appendChild(clearHistoryButton);
    
    clearHistoryButton.addEventListener('click', async () => {
      try {
        // Import the VisitHistoryManager from its dedicated file
        const { VisitHistoryManager } = await import('../tools/VisitHistoryManager.js');
        await VisitHistoryManager.getInstance().clearHistory();
        
        // Show success message
        statusMessage.style.display = 'block';
        
        // Hide message after 3 seconds
        setTimeout(() => {
          statusMessage.style.display = 'none';
        }, 3000);
      } catch (error) {
        logger.error('Error clearing browsing history:', error);
      }
    });
  }

  private static createDisclaimerSection(container: HTMLElement): void {
    const disclaimerSection = document.createElement('div');
    disclaimerSection.classList.add('settings-section', 'disclaimer-section');
    container.appendChild(disclaimerSection);
    
    const disclaimerTitle = document.createElement('h3');
    disclaimerTitle.textContent = i18nString(UIStrings.importantNotice);
    disclaimerTitle.classList.add('settings-subtitle');
    disclaimerSection.appendChild(disclaimerTitle);

    const disclaimerText = document.createElement('div');
    disclaimerText.classList.add('settings-disclaimer');
    disclaimerText.innerHTML = `
      <p class="disclaimer-warning">
        <strong>Alpha Version:</strong> This is an alpha version of the Browser Operator - AI Assistant feature.
      </p>
      <p class="disclaimer-note">
        <strong>Data Sharing:</strong> When using this feature, your browser data and conversation content will be sent to the AI model for processing.
      </p>
      <p class="disclaimer-note">
        <strong>Model Support:</strong> We currently support OpenAI models directly. And we support LiteLLM as a proxy to access 100+ other models.
      </p>
      <p class="disclaimer-footer">
        By using this feature, you acknowledge that your data will be processed according to Model Provider's privacy policy and terms of service.
      </p>
    `;
    disclaimerSection.appendChild(disclaimerText);
  }

  private static createFooter(
    container: HTMLElement,
    dialog: UI.Dialog.Dialog,
    providerConfig: ProviderConfigData,
    vectorDbConfig: VectorDatabaseConfigData,
    tracingConfig: TracingConfigData,
    evaluationConfig: EvaluationConfigData,
    onSettingsSaved: () => void
  ): { saveButton: HTMLButtonElement, saveStatusMessage: HTMLElement } {
    // Button container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'settings-footer';
    container.appendChild(buttonContainer);
    
    // Status message for save operation
    const saveStatusMessage = document.createElement('div');
    saveStatusMessage.className = 'settings-status save-status';
    saveStatusMessage.style.display = 'none';
    saveStatusMessage.style.marginRight = 'auto'; // Push to left
    buttonContainer.appendChild(saveStatusMessage);
    
    // Cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'settings-button cancel-button';
    cancelButton.setAttribute('type', 'button');
    cancelButton.addEventListener('click', () => dialog.hide());
    buttonContainer.appendChild(cancelButton);
    
    // Save button
    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.className = 'settings-button save-button';
    saveButton.setAttribute('type', 'button');
    buttonContainer.appendChild(saveButton);
    
    saveButton.addEventListener('click', async () => {
      // Disable save button while saving
      saveButton.disabled = true;
      
      // Show saving status
      saveStatusMessage.textContent = 'Saving settings...';
      saveStatusMessage.style.backgroundColor = 'var(--color-accent-blue-background)';
      saveStatusMessage.style.color = 'var(--color-accent-blue)';
      saveStatusMessage.style.display = 'block';
      
      try {
        // Save all configurations
        ProviderConfig.save(providerConfig);
        VectorDatabaseConfig.save(vectorDbConfig);
        TracingConfig.save(tracingConfig);
        EvaluationConfig.save(evaluationConfig);
        
        logger.debug('Settings saved successfully');
        
        // Set success message and notify parent
        saveStatusMessage.textContent = 'Settings saved successfully';
        saveStatusMessage.style.backgroundColor = 'var(--color-accent-green-background)';
        saveStatusMessage.style.color = 'var(--color-accent-green)';
        saveStatusMessage.style.display = 'block';
        
        onSettingsSaved();
        
        setTimeout(() => {
          dialog.hide();
        }, 1500);
      } catch (error) {
        logger.error('Failed to save settings:', error);
        saveStatusMessage.textContent = 'Failed to save settings';
        saveStatusMessage.style.backgroundColor = 'var(--color-accent-red-background)';
        saveStatusMessage.style.color = 'var(--color-accent-red)';
      } finally {
        saveButton.disabled = false;
      }
    });

    return { saveButton, saveStatusMessage };
  }

  private static addStyles(dialog: UI.Dialog.Dialog): void {
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      .settings-dialog {
        color: var(--color-text-primary);
        background-color: var(--color-background);
      }
      
      .settings-content {
        padding: 0;
        max-width: 100%;
      }
      
      .settings-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid var(--color-details-hairline);
      }
      
      .settings-title {
        font-size: 18px;
        font-weight: 500;
        margin: 0;
        color: var(--color-text-primary);
      }
      
      .settings-close-button {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: var(--color-text-secondary);
        padding: 4px 8px;
      }
      
      .settings-close-button:hover {
        color: var(--color-text-primary);
      }
      
      .provider-selection-section {
        padding: 16px 20px;
        border-bottom: 1px solid var(--color-details-hairline);
      }
      
      .provider-select {
        margin-top: 8px;
      }
      
      .provider-content {
        padding: 16px 20px;
        border-bottom: 1px solid var(--color-details-hairline);
      }
      
      .settings-section {
        margin-bottom: 24px;
      }
      
      .settings-subtitle {
        font-size: 16px;
        font-weight: 500;
        margin: 0 0 12px 0;
        color: var(--color-text-primary);
      }
      
      .settings-label {
        font-size: 14px;
        font-weight: 500;
        margin-bottom: 6px;
        color: var(--color-text-primary);
      }
      
      .settings-hint {
        font-size: 12px;
        color: var(--color-text-secondary);
        margin-bottom: 8px;
      }
      
      .settings-description {
        font-size: 14px;
        color: var(--color-text-secondary);
        margin: 4px 0 12px 0;
      }
      
      .settings-input, .settings-select {
        width: 100%;
        padding: 8px 12px;
        border-radius: 4px;
        border: 1px solid var(--color-details-hairline);
        background-color: var(--color-background-elevation-2);
        color: var(--color-text-primary);
        font-size: 14px;
        box-sizing: border-box;
        height: 32px;
      }
      
      .settings-input:focus, .settings-select:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 1px var(--color-primary-opacity-30);
      }
      
      .settings-status {
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 13px;
        margin: 8px 0;
      }
      
      .history-section {
        margin-top: 16px;
        padding: 16px 20px;
        border-bottom: 1px solid var(--color-details-hairline);
      }
      
      .disclaimer-section {
        background-color: var(--color-background-elevation-1);
        border-radius: 8px;
        padding: 16px 20px;
        margin: 16px 20px;
        border: 1px solid var(--color-details-hairline);
      }
      
      .disclaimer-warning {
        color: var(--color-accent-orange);
        margin-bottom: 8px;
      }
      
      .disclaimer-note {
        margin-bottom: 8px;
      }
      
      .disclaimer-footer {
        font-size: 12px;
        color: var(--color-text-secondary);
        margin-top: 8px;
      }
      
      .settings-footer {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 12px;
        padding: 16px 20px;
        border-top: 1px solid var(--color-details-hairline);
      }
      
      .save-status {
        margin: 0;
        font-size: 13px;
        padding: 6px 10px;
      }
      
      .settings-button {
        padding: 8px 16px;
        border-radius: 4px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
        font-family: inherit;
        background-color: var(--color-background-elevation-1);
        border: 1px solid var(--color-details-hairline);
        color: var(--color-text-primary);
      }
      
      .settings-button:hover {
        background-color: var(--color-background-elevation-2);
      }
      
      .settings-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .clear-button {
        margin-top: 8px;
      }
      
      /* Vector DB section styles */
      .vector-db-section {
        margin-top: 16px;
        padding: 16px 20px;
        border-bottom: 1px solid var(--color-details-hairline);
      }
      
      /* Tracing section styles */
      .tracing-section {
        margin-top: 16px;
        padding: 16px 20px;
        border-bottom: 1px solid var(--color-details-hairline);
      }
      
      .tracing-enabled-container {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }
      
      .tracing-checkbox {
        margin: 0;
      }
      
      .tracing-label {
        font-weight: 500;
        color: var(--color-text-primary);
        cursor: pointer;
      }
      
      .tracing-config-container {
        margin-top: 16px;
        padding-left: 24px;
        border-left: 2px solid var(--color-details-hairline);
      }

      /* Evaluation section styles */
      .evaluation-section {
        margin-top: 16px;
        padding: 16px 20px;
        border-bottom: 1px solid var(--color-details-hairline);
      }
      
      .evaluation-enabled-container {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }
      
      .evaluation-checkbox {
        margin: 0;
      }
      
      .evaluation-label {
        font-weight: 500;
        color: var(--color-text-primary);
        cursor: pointer;
      }
      
      .evaluation-config-container {
        margin-top: 16px;
        padding-left: 24px;
        border-left: 2px solid var(--color-details-hairline);
      }

      /* Cancel button */
      .cancel-button {
        background-color: var(--color-background-elevation-1);
        border: 1px solid var(--color-details-hairline);
        color: var(--color-text-primary);
      }
      
      .cancel-button:hover {
        background-color: var(--color-background-elevation-2);
      }
      
      /* Save button */
      .save-button {
        background-color: var(--color-primary);
        border: 1px solid var(--color-primary);
        color: white;
      }
      
      .save-button:hover {
        background-color: var(--color-primary-variant);
      }
    `;
    dialog.contentElement.appendChild(styleElement);
  }
}