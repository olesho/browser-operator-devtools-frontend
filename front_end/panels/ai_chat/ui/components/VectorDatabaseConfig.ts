// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as i18n from '../../../../core/i18n/i18n.js';
import { createLogger } from '../../core/Logger.js';

const logger = createLogger('VectorDatabaseConfig');

// Vector DB configuration keys - Milvus format
const VECTOR_DB_ENABLED_KEY = 'ai_chat_vector_db_enabled';
const MILVUS_ENDPOINT_KEY = 'ai_chat_milvus_endpoint';
const MILVUS_USERNAME_KEY = 'ai_chat_milvus_username';
const MILVUS_PASSWORD_KEY = 'ai_chat_milvus_password';
const MILVUS_COLLECTION_KEY = 'ai_chat_milvus_collection';
const MILVUS_OPENAI_KEY = 'ai_chat_milvus_openai_key';

// UI Strings for vector database
const UIStrings = {
  /**
   *@description Vector DB section label
   */
  vectorDBLabel: 'Vector Database Configuration',
  /**
   *@description Vector DB enabled label
   */
  vectorDBEnabled: 'Enable Vector Database',
  /**
   *@description Vector DB enabled hint
   */
  vectorDBEnabledHint: 'Enable Vector Database for semantic search of websites',
  /**
   *@description Milvus endpoint label
   */
  vectorDBEndpoint: 'Milvus Endpoint',
  /**
   *@description Milvus endpoint hint
   */
  vectorDBEndpointHint: 'Enter the URL for your Milvus server (e.g., http://localhost:19530 or https://your-milvus.com)',
  /**
   *@description Milvus username label
   */
  vectorDBApiKey: 'Milvus Username',
  /**
   *@description Milvus username hint
   */
  vectorDBApiKeyHint: 'For self-hosted: username (default: root). For Milvus Cloud: leave as root',
  /**
   *@description Vector DB collection label
   */
  vectorDBCollection: 'Collection Name',
  /**
   *@description Vector DB collection hint
   */
  vectorDBCollectionHint: 'Name of the collection to store websites (default: bookmarks)',
  /**
   *@description Milvus password/token label
   */
  milvusPassword: 'Password/API Token',
  /**
   *@description Milvus password/token hint
   */
  milvusPasswordHint: 'For self-hosted: password (default: Milvus). For Milvus Cloud: API token directly',
  /**
   *@description OpenAI API key for embeddings label
   */
  milvusOpenAIKey: 'OpenAI API Key (for embeddings)',
  /**
   *@description OpenAI API key for embeddings hint
   */
  milvusOpenAIKeyHint: 'Required for generating embeddings using OpenAI text-embedding-3-small model',
  /**
   *@description Test vector DB connection button
   */
  testVectorDBConnection: 'Test Connection',
  /**
   *@description Vector DB connection testing status
   */
  testingVectorDBConnection: 'Testing connection...',
  /**
   *@description Vector DB connection success message
   */
  vectorDBConnectionSuccess: 'Vector DB connection successful!',
  /**
   *@description Vector DB connection failed message
   */
  vectorDBConnectionFailed: 'Vector DB connection failed',
};

const str_ = i18n.i18n.registerUIStrings('panels/ai_chat/ui/components/VectorDatabaseConfig.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

export interface VectorDatabaseConfigData {
  enabled: boolean;
  endpoint: string;
  username: string;
  password: string;
  collection: string;
  openaiApiKey: string;
}

// Helper function to check if Vector DB is enabled
export function isVectorDBEnabled(): boolean {
  return localStorage.getItem(VECTOR_DB_ENABLED_KEY) === 'true';
}

export class VectorDatabaseConfig {
  static create(container: HTMLElement): VectorDatabaseConfigData {
    // Add Vector DB configuration section
    const vectorDBSection = document.createElement('div');
    vectorDBSection.className = 'settings-section vector-db-section';
    container.appendChild(vectorDBSection);
    
    const vectorDBTitle = document.createElement('h3');
    vectorDBTitle.textContent = i18nString(UIStrings.vectorDBLabel);
    vectorDBTitle.classList.add('settings-subtitle');
    vectorDBSection.appendChild(vectorDBTitle);
    
    // Vector DB enabled checkbox
    const vectorDBEnabledContainer = document.createElement('div');
    vectorDBEnabledContainer.className = 'tracing-enabled-container';
    vectorDBSection.appendChild(vectorDBEnabledContainer);

    const vectorDBEnabledCheckbox = document.createElement('input');
    vectorDBEnabledCheckbox.type = 'checkbox';
    vectorDBEnabledCheckbox.id = 'vector-db-enabled';
    vectorDBEnabledCheckbox.className = 'tracing-checkbox';
    vectorDBEnabledCheckbox.checked = localStorage.getItem(VECTOR_DB_ENABLED_KEY) === 'true';
    vectorDBEnabledContainer.appendChild(vectorDBEnabledCheckbox);

    const vectorDBEnabledLabel = document.createElement('label');
    vectorDBEnabledLabel.htmlFor = 'vector-db-enabled';
    vectorDBEnabledLabel.className = 'tracing-label';
    vectorDBEnabledLabel.textContent = i18nString(UIStrings.vectorDBEnabled);
    vectorDBEnabledContainer.appendChild(vectorDBEnabledLabel);

    const vectorDBEnabledHint = document.createElement('div');
    vectorDBEnabledHint.className = 'settings-hint';
    vectorDBEnabledHint.textContent = i18nString(UIStrings.vectorDBEnabledHint);
    vectorDBSection.appendChild(vectorDBEnabledHint);

    // Vector DB configuration container (shown when enabled)
    const vectorDBConfigContainer = document.createElement('div');
    vectorDBConfigContainer.className = 'tracing-config-container';
    vectorDBConfigContainer.style.display = vectorDBEnabledCheckbox.checked ? 'block' : 'none';
    vectorDBSection.appendChild(vectorDBConfigContainer);
    
    // Vector DB Endpoint
    const vectorDBEndpointDiv = document.createElement('div');
    vectorDBEndpointDiv.classList.add('settings-field');
    vectorDBConfigContainer.appendChild(vectorDBEndpointDiv);
    
    const vectorDBEndpointLabel = document.createElement('label');
    vectorDBEndpointLabel.textContent = i18nString(UIStrings.vectorDBEndpoint);
    vectorDBEndpointLabel.classList.add('settings-label');
    vectorDBEndpointDiv.appendChild(vectorDBEndpointLabel);
    
    const vectorDBEndpointHint = document.createElement('div');
    vectorDBEndpointHint.textContent = i18nString(UIStrings.vectorDBEndpointHint);
    vectorDBEndpointHint.classList.add('settings-hint');
    vectorDBEndpointDiv.appendChild(vectorDBEndpointHint);
    
    const vectorDBEndpointInput = document.createElement('input');
    vectorDBEndpointInput.classList.add('settings-input');
    vectorDBEndpointInput.type = 'text';
    vectorDBEndpointInput.placeholder = 'http://localhost:19530';
    vectorDBEndpointInput.value = localStorage.getItem(MILVUS_ENDPOINT_KEY) || '';
    vectorDBEndpointDiv.appendChild(vectorDBEndpointInput);
    
    // Vector DB API Key
    const vectorDBApiKeyDiv = document.createElement('div');
    vectorDBApiKeyDiv.classList.add('settings-field');
    vectorDBConfigContainer.appendChild(vectorDBApiKeyDiv);
    
    const vectorDBApiKeyLabel = document.createElement('label');
    vectorDBApiKeyLabel.textContent = i18nString(UIStrings.vectorDBApiKey);
    vectorDBApiKeyLabel.classList.add('settings-label');
    vectorDBApiKeyDiv.appendChild(vectorDBApiKeyLabel);
    
    const vectorDBApiKeyHint = document.createElement('div');
    vectorDBApiKeyHint.textContent = i18nString(UIStrings.vectorDBApiKeyHint);
    vectorDBApiKeyHint.classList.add('settings-hint');
    vectorDBApiKeyDiv.appendChild(vectorDBApiKeyHint);
    
    const vectorDBApiKeyInput = document.createElement('input');
    vectorDBApiKeyInput.classList.add('settings-input');
    vectorDBApiKeyInput.type = 'text';
    vectorDBApiKeyInput.placeholder = 'root';
    vectorDBApiKeyInput.value = localStorage.getItem(MILVUS_USERNAME_KEY) || 'root';
    vectorDBApiKeyDiv.appendChild(vectorDBApiKeyInput);
    
    // Milvus Password
    const milvusPasswordDiv = document.createElement('div');
    milvusPasswordDiv.classList.add('settings-field');
    vectorDBConfigContainer.appendChild(milvusPasswordDiv);
    
    const milvusPasswordLabel = document.createElement('label');
    milvusPasswordLabel.textContent = i18nString(UIStrings.milvusPassword);
    milvusPasswordLabel.classList.add('settings-label');
    milvusPasswordDiv.appendChild(milvusPasswordLabel);
    
    const milvusPasswordHint = document.createElement('div');
    milvusPasswordHint.textContent = i18nString(UIStrings.milvusPasswordHint);
    milvusPasswordHint.classList.add('settings-hint');
    milvusPasswordDiv.appendChild(milvusPasswordHint);
    
    const milvusPasswordInput = document.createElement('input');
    milvusPasswordInput.classList.add('settings-input');
    milvusPasswordInput.type = 'password';
    milvusPasswordInput.placeholder = 'Milvus (self-hosted) or API token (cloud)';
    milvusPasswordInput.value = localStorage.getItem(MILVUS_PASSWORD_KEY) || 'Milvus';
    milvusPasswordDiv.appendChild(milvusPasswordInput);
    
    // OpenAI API Key for embeddings
    const milvusOpenAIDiv = document.createElement('div');
    milvusOpenAIDiv.classList.add('settings-field');
    vectorDBConfigContainer.appendChild(milvusOpenAIDiv);
    
    const milvusOpenAILabel = document.createElement('label');
    milvusOpenAILabel.textContent = i18nString(UIStrings.milvusOpenAIKey);
    milvusOpenAILabel.classList.add('settings-label');
    milvusOpenAIDiv.appendChild(milvusOpenAILabel);
    
    const milvusOpenAIHint = document.createElement('div');
    milvusOpenAIHint.textContent = i18nString(UIStrings.milvusOpenAIKeyHint);
    milvusOpenAIHint.classList.add('settings-hint');
    milvusOpenAIDiv.appendChild(milvusOpenAIHint);
    
    const milvusOpenAIInput = document.createElement('input');
    milvusOpenAIInput.classList.add('settings-input');
    milvusOpenAIInput.type = 'password';
    milvusOpenAIInput.placeholder = 'sk-...';
    milvusOpenAIInput.value = localStorage.getItem(MILVUS_OPENAI_KEY) || '';
    milvusOpenAIDiv.appendChild(milvusOpenAIInput);
    
    // Vector DB Collection Name
    const vectorDBCollectionDiv = document.createElement('div');
    vectorDBCollectionDiv.classList.add('settings-field');
    vectorDBConfigContainer.appendChild(vectorDBCollectionDiv);
    
    const vectorDBCollectionLabel = document.createElement('label');
    vectorDBCollectionLabel.textContent = i18nString(UIStrings.vectorDBCollection);
    vectorDBCollectionLabel.classList.add('settings-label');
    vectorDBCollectionDiv.appendChild(vectorDBCollectionLabel);
    
    const vectorDBCollectionHint = document.createElement('div');
    vectorDBCollectionHint.textContent = i18nString(UIStrings.vectorDBCollectionHint);
    vectorDBCollectionHint.classList.add('settings-hint');
    vectorDBCollectionDiv.appendChild(vectorDBCollectionHint);
    
    const vectorDBCollectionInput = document.createElement('input');
    vectorDBCollectionInput.classList.add('settings-input');
    vectorDBCollectionInput.type = 'text';
    vectorDBCollectionInput.placeholder = 'bookmarks';
    vectorDBCollectionInput.value = localStorage.getItem(MILVUS_COLLECTION_KEY) || 'bookmarks';
    vectorDBCollectionDiv.appendChild(vectorDBCollectionInput);
    
    // Test Vector DB Connection Button
    const vectorDBTestDiv = document.createElement('div');
    vectorDBTestDiv.classList.add('settings-field', 'test-connection-field');
    vectorDBConfigContainer.appendChild(vectorDBTestDiv);
    
    const vectorDBTestButton = document.createElement('button');
    vectorDBTestButton.classList.add('settings-button', 'test-button');
    vectorDBTestButton.setAttribute('type', 'button');
    vectorDBTestButton.textContent = i18nString(UIStrings.testVectorDBConnection);
    vectorDBTestDiv.appendChild(vectorDBTestButton);
    
    const vectorDBTestStatus = document.createElement('div');
    vectorDBTestStatus.classList.add('settings-status');
    vectorDBTestStatus.style.display = 'none';
    vectorDBTestDiv.appendChild(vectorDBTestStatus);
    
    // Toggle vector DB config visibility
    vectorDBEnabledCheckbox.addEventListener('change', () => {
      vectorDBConfigContainer.style.display = vectorDBEnabledCheckbox.checked ? 'block' : 'none';
      localStorage.setItem(VECTOR_DB_ENABLED_KEY, vectorDBEnabledCheckbox.checked.toString());
    });
    
    // Save Vector DB settings on input change
    const saveVectorDBSettings = () => {
      localStorage.setItem(VECTOR_DB_ENABLED_KEY, vectorDBEnabledCheckbox.checked.toString());
      localStorage.setItem(MILVUS_ENDPOINT_KEY, vectorDBEndpointInput.value);
      localStorage.setItem(MILVUS_USERNAME_KEY, vectorDBApiKeyInput.value);
      localStorage.setItem(MILVUS_PASSWORD_KEY, milvusPasswordInput.value);
      localStorage.setItem(MILVUS_COLLECTION_KEY, vectorDBCollectionInput.value);
      localStorage.setItem(MILVUS_OPENAI_KEY, milvusOpenAIInput.value);
    };
    
    vectorDBEndpointInput.addEventListener('input', saveVectorDBSettings);
    vectorDBApiKeyInput.addEventListener('input', saveVectorDBSettings);
    milvusPasswordInput.addEventListener('input', saveVectorDBSettings);
    vectorDBCollectionInput.addEventListener('input', saveVectorDBSettings);
    milvusOpenAIInput.addEventListener('input', saveVectorDBSettings);
    
    // Test Vector DB connection
    vectorDBTestButton.addEventListener('click', async () => {
      const endpoint = vectorDBEndpointInput.value.trim();
      
      if (!endpoint) {
        vectorDBTestStatus.textContent = 'Please enter an endpoint URL';
        vectorDBTestStatus.style.color = 'var(--color-accent-red)';
        vectorDBTestStatus.style.display = 'block';
        setTimeout(() => {
          vectorDBTestStatus.style.display = 'none';
        }, 3000);
        return;
      }
      
      vectorDBTestButton.disabled = true;
      vectorDBTestStatus.textContent = i18nString(UIStrings.testingVectorDBConnection);
      vectorDBTestStatus.style.color = 'var(--color-text-secondary)';
      vectorDBTestStatus.style.display = 'block';
      
      try {
        // Import and test the Vector DB client
        const { VectorDBClient } = await import('../../tools/VectorDBClient.js');
        const vectorClient = new VectorDBClient({
          endpoint,
          username: vectorDBApiKeyInput.value || 'root',
          password: milvusPasswordInput.value || 'Milvus',
          collection: vectorDBCollectionInput.value || 'bookmarks',
          openaiApiKey: milvusOpenAIInput.value || undefined
        });
        
        const testResult = await vectorClient.testConnection();
        
        if (testResult.success) {
          vectorDBTestStatus.textContent = i18nString(UIStrings.vectorDBConnectionSuccess);
          vectorDBTestStatus.style.color = 'var(--color-accent-green)';
        } else {
          vectorDBTestStatus.textContent = `${i18nString(UIStrings.vectorDBConnectionFailed)}: ${testResult.error}`;
          vectorDBTestStatus.style.color = 'var(--color-accent-red)';
        }
      } catch (error: any) {
        vectorDBTestStatus.textContent = `${i18nString(UIStrings.vectorDBConnectionFailed)}: ${error.message}`;
        vectorDBTestStatus.style.color = 'var(--color-accent-red)';
      } finally {
        vectorDBTestButton.disabled = false;
        setTimeout(() => {
          vectorDBTestStatus.style.display = 'none';
        }, 5000);
      }
    });

    // Return configuration data getter
    return {
      get enabled() { return vectorDBEnabledCheckbox.checked; },
      get endpoint() { return vectorDBEndpointInput.value.trim(); },
      get username() { return vectorDBApiKeyInput.value.trim(); },
      get password() { return milvusPasswordInput.value.trim(); },
      get collection() { return vectorDBCollectionInput.value.trim(); },
      get openaiApiKey() { return milvusOpenAIInput.value.trim(); }
    };
  }

  static save(config: VectorDatabaseConfigData): void {
    localStorage.setItem(VECTOR_DB_ENABLED_KEY, config.enabled.toString());
    localStorage.setItem(MILVUS_ENDPOINT_KEY, config.endpoint);
    localStorage.setItem(MILVUS_USERNAME_KEY, config.username);
    localStorage.setItem(MILVUS_PASSWORD_KEY, config.password);
    localStorage.setItem(MILVUS_COLLECTION_KEY, config.collection);
    localStorage.setItem(MILVUS_OPENAI_KEY, config.openaiApiKey);

    logger.debug('Vector Database configuration saved', config);
  }
}