// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import type * as Common from '../../../core/common/common.js';
import * as Host from '../../../core/host/host.js';
import * as i18n from '../../../core/i18n/i18n.js';
import * as Buttons from '../../../ui/components/buttons/buttons.js';
import * as UI from '../../../ui/legacy/legacy.js';
import * as Lit from '../../../ui/lit/lit.js';
import * as VisualLogging from '../../../ui/visual_logging/visual_logging.js';
import {AgentService, Events as AgentEvents} from '../core/AgentService.js';
import { LiteLLMClient } from '../core/LiteLLMClient.js';

import chatViewStyles from './chatView.css.js';
import {
  type ChatMessage,
  ChatMessageEntity,
  ChatView,
  type ImageInputData,
  type ModelChatMessage,
  State as ChatViewState,
} from './ChatView.js';
import { HelpDialog } from './HelpDialog.js';
import { SettingsDialog } from './SettingsDialog.js';

const {html} = Lit;

// Model type definition
export interface ModelOption {
  value: string;
  label: string;
  type: 'openai' | 'litellm';
}

// Add model options constant - these are the default OpenAI models
const DEFAULT_OPENAI_MODELS: ModelOption[] = [
  {value: 'o4-mini-2025-04-16', label: 'O4 Mini', type: 'openai'},
  {value: 'gpt-4.1-mini-2025-04-14', label: 'GPT-4.1 Mini', type: 'openai'},
  {value: 'gpt-4.1-nano-2025-04-14', label: 'GPT-4.1 Nano', type: 'openai'},
  {value: 'gpt-4.1-2025-04-14', label: 'GPT-4.1', type: 'openai'},
];

// This will hold the current active model options
let MODEL_OPTIONS: ModelOption[] = [...DEFAULT_OPENAI_MODELS];

// Model selector localStorage keys
const MODEL_SELECTION_KEY = 'ai_chat_model_selection';
const MINI_MODEL_STORAGE_KEY = 'ai_chat_mini_model';
const NANO_MODEL_STORAGE_KEY = 'ai_chat_nano_model';
// Provider selection key
const PROVIDER_SELECTION_KEY = 'ai_chat_provider';
// LiteLLM configuration keys
const LITELLM_ENDPOINT_KEY = 'ai_chat_litellm_endpoint';
const LITELLM_API_KEY_STORAGE_KEY = 'ai_chat_litellm_api_key';

const UIStrings = {
  /**
   *@description Text for the AI welcome message
   */
  welcomeMessage: 'Hello! I\'m your AI assistant. How can I help you today?',
  /**
   *@description AI chat UI text creating a new chat.
   */
  newChat: 'New chat',
  /**
   *@description AI chat UI tooltip text for the help button.
   */
  help: 'Help',
  /**
   *@description AI chat UI tooltip text for the settings button (gear icon).
   */
  settings: 'Settings',
  /**
   *@description Announcement text for screen readers when a new chat is created.
   */
  newChatCreated: 'New chat created',
  /**
   *@description Announcement text for screen readers when the chat is deleted.
   */
  chatDeleted: 'Chat deleted',
  /**
   *@description AI chat UI text creating selecting a history entry.
   */
  history: 'History',
  /**
   *@description AI chat UI text deleting the current chat session from local history.
   */
  deleteChat: 'Delete local chat',
  /**
   * @description Default text shown in the chat input
   */
  inputPlaceholder: 'Ask a question...',
  /**
   * @description Placeholder when OpenAI API key is missing
   */
  missingOpenAIKey: 'Please add your OpenAI API key in Settings',
  /**
   * @description Placeholder when LiteLLM endpoint is missing
   */
  missingLiteLLMEndpoint: 'Please configure LiteLLM endpoint in Settings',
  /**
   *@description AI chat UI text for the test button.
   */
  test: 'Test',
} as const;

const str_ = i18n.i18n.registerUIStrings('panels/ai_chat/ui/AIChatPanel.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);

interface ToolbarViewInput {
  onNewChatClick: () => void;
  onHistoryClick: (event: MouseEvent) => void;
  onDeleteClick: () => void;
  onHelpClick: () => void;
  onSettingsClick: () => void;
  onTestClick: () => void;
  isDeleteHistoryButtonVisible: boolean;
  isCenteredView: boolean;
}

function toolbarView(input: ToolbarViewInput): Lit.LitTemplate {
  // clang-format off
  return html`
    <div class="toolbar-container" role="toolbar" .jslogContext=${VisualLogging.toolbar()} style="display: flex; justify-content: space-between; width: 100%; padding: 0 4px; box-sizing: border-box; margin: 0 0 10px 0;">
      <devtools-toolbar class="ai-chat-left-toolbar" role="presentation">
      <devtools-button
          title=${i18nString(UIStrings.history)}
          aria-label=${i18nString(UIStrings.history)}
          .iconName=${'history'}
          .jslogContext=${'ai-chat.history'}
          .variant=${Buttons.Button.Variant.TOOLBAR}
          @click=${input.onHistoryClick}></devtools-button>
      <devtools-button
          title=${i18nString(UIStrings.test)}
          aria-label=${i18nString(UIStrings.test)}
          .iconName=${'bug'}
          .jslogContext=${'ai-chat.test'}
          .variant=${Buttons.Button.Variant.TOOLBAR}
          @click=${input.onTestClick}></devtools-button>
          <div class="toolbar-divider"></div>
        ${!input.isCenteredView ? html`
        <devtools-button
          title=${i18nString(UIStrings.newChat)}
          aria-label=${i18nString(UIStrings.newChat)}
          .iconName=${'plus'}
          .jslogContext=${'ai-chat.new-chat'}
          .variant=${Buttons.Button.Variant.TOOLBAR}
          @click=${input.onNewChatClick}></devtools-button>
        ` : Lit.nothing}
      </devtools-toolbar>
      
      <devtools-toolbar class="ai-chat-right-toolbar" role="presentation">
        <div class="toolbar-divider"></div>
        ${input.isDeleteHistoryButtonVisible
          ? html`<devtools-button
              title=${i18nString(UIStrings.deleteChat)}
              aria-label=${i18nString(UIStrings.deleteChat)}
              .iconName=${'bin'}
              .jslogContext=${'ai-chat.delete'}
              .variant=${Buttons.Button.Variant.TOOLBAR}
              @click=${input.onDeleteClick}></devtools-button>`
          : Lit.nothing}
        <devtools-button
          title=${i18nString(UIStrings.settings)}
          aria-label=${i18nString(UIStrings.settings)}
          .iconName=${'gear'}
          .jslogContext=${'ai-chat.settings'}
          .variant=${Buttons.Button.Variant.TOOLBAR}
          @click=${input.onSettingsClick}></devtools-button>
        <devtools-button
          title=${i18nString(UIStrings.help)}
          aria-label=${i18nString(UIStrings.help)}
          .iconName=${'help'}
          .jslogContext=${'ai-chat.help'}
          .variant=${Buttons.Button.Variant.TOOLBAR}
          @click=${input.onHelpClick}></devtools-button>
        <devtools-button
            title="Close Chat Window"
            aria-label="Close Chat Window"
            .iconName=${'cross'}
            .jslogContext=${'ai-chat.close-devtools'}
            .variant=${Buttons.Button.Variant.TOOLBAR}
            @click=${() => Host.InspectorFrontendHost.InspectorFrontendHostInstance.closeWindow()}></devtools-button>
      </devtools-toolbar>
    </div>
  `;
  // clang-format on
}


export class AIChatPanel extends UI.Panel.Panel {
  static #instance: AIChatPanel|null = null;

  static instance(): AIChatPanel {
    if (!AIChatPanel.#instance) {
      AIChatPanel.#instance = new AIChatPanel();
    }
    return AIChatPanel.#instance;
  }

  static getMiniModel(): string {
    const instance = AIChatPanel.instance();
    return instance.#miniModel || instance.#selectedModel;
  }

  static getNanoModel(): string {
    const instance = AIChatPanel.instance();
    return instance.#nanoModel || instance.#miniModel || instance.#selectedModel;
  }
  
  /**
   * Gets all model options or filters by provider
   * @param provider Optional provider to filter by
   * @returns Array of model options
   */
  static getModelOptions(provider?: 'openai' | 'litellm'): ModelOption[] {
    // Try to get from all_model_options first (comprehensive list)
    const allModelOptionsStr = localStorage.getItem('ai_chat_all_model_options');
    if (allModelOptionsStr) {
      const allModelOptions = JSON.parse(allModelOptionsStr);
      // If provider is specified, filter by it
      return provider ? allModelOptions.filter((opt: ModelOption) => opt.type === provider) : allModelOptions;
    }
    
    // Fallback to legacy model_options if all_model_options doesn't exist
    const modelOptionsStr = localStorage.getItem('ai_chat_model_options');
    if (modelOptionsStr) {
      const modelOptions = JSON.parse(modelOptionsStr);
      // If we got legacy options, migrate them to all_model_options for future use
      localStorage.setItem('ai_chat_all_model_options', modelOptionsStr);
      // Apply provider filter if needed
      return provider ? modelOptions.filter((opt: ModelOption) => opt.type === provider) : modelOptions;
    }
    
    // If nothing is found, return default OpenAI models
    return provider === 'litellm' ? [] : DEFAULT_OPENAI_MODELS;
  }
  
  /**
   * Updates model options with new LiteLLM models
   * @param litellmModels Models fetched from LiteLLM
   * @param hadWildcard Whether LiteLLM returned a wildcard model
   * @returns Updated model options
   */
  static updateModelOptions(litellmModels: ModelOption[] = [], hadWildcard = false): ModelOption[] {
    // Get the selected provider (for context, but we store all models regardless)
    const selectedProvider = localStorage.getItem(PROVIDER_SELECTION_KEY) || 'openai';
    
    // Get existing custom models (if any)
    const savedCustomModels = JSON.parse(localStorage.getItem('ai_chat_custom_models') || '[]');
    
    // Transform custom models to ModelOption format
    const customModels = savedCustomModels.map((model: string) => ({
      value: model,
      label: `LiteLLM: ${model}`,
      type: 'litellm' as const
    }));
    
    // Create the comprehensive model list with all models from both providers
    const allModels = [
      ...DEFAULT_OPENAI_MODELS,  // Always include default OpenAI models
      ...customModels,          // Include custom LiteLLM models
      ...litellmModels          // Include fetched LiteLLM models
    ];
    
    // Save the comprehensive list to localStorage
    localStorage.setItem('ai_chat_all_model_options', JSON.stringify(allModels));
    
    // For backwards compatibility, also update the MODEL_OPTIONS variable
    // based on the currently selected provider
    if (selectedProvider === 'openai') {
      MODEL_OPTIONS = DEFAULT_OPENAI_MODELS;
    } else {
      // For LiteLLM provider, include custom models and fetched models
      MODEL_OPTIONS = [...customModels, ...litellmModels];
      
      // Add placeholder if needed for LiteLLM when we have no models
      if (hadWildcard && litellmModels.length === 0 && customModels.length === 0) {
        MODEL_OPTIONS.push({
          value: '_placeholder_add_custom',
          label: 'LiteLLM: Please add custom models in settings',
          type: 'litellm' as const
        });
      }
    }
    
    // Save MODEL_OPTIONS to localStorage for backwards compatibility
    localStorage.setItem('ai_chat_model_options', JSON.stringify(MODEL_OPTIONS));
    
    console.log('Updated model options:', {
      provider: selectedProvider,
      openaiModels: DEFAULT_OPENAI_MODELS.length,
      customModels: customModels.length,
      litellmModels: litellmModels.length,
      totalModelOptions: MODEL_OPTIONS.length,
      allModelsLength: allModels.length
    });
    
    return allModels;
  }
  
  /**
   * Adds a custom model to the options
   * @param modelName Name of the model to add
   * @param modelType Type of the model ('openai' or 'litellm')
   * @returns Updated model options
   */
  static addCustomModelOption(modelName: string, modelType: 'openai' | 'litellm' = 'litellm'): ModelOption[] {
    // Get existing custom models
    const savedCustomModels = JSON.parse(localStorage.getItem('ai_chat_custom_models') || '[]');
    
    // Check if the model already exists
    if (savedCustomModels.includes(modelName)) {
      console.log(`Custom model ${modelName} already exists, not adding again`);
      return AIChatPanel.getModelOptions();
    }
    
    // Add the new model to custom models
    savedCustomModels.push(modelName);
    localStorage.setItem('ai_chat_custom_models', JSON.stringify(savedCustomModels));
    
    // Create the model option object
    const newOption: ModelOption = {
      value: modelName,
      label: modelType === 'litellm' ? `LiteLLM: ${modelName}` : `OpenAI: ${modelName}`,
      type: modelType
    };
    
    // Get all existing model options
    const allModelOptions = AIChatPanel.getModelOptions();
    
    // Add the new option
    const updatedOptions = [...allModelOptions, newOption];
    localStorage.setItem('ai_chat_all_model_options', JSON.stringify(updatedOptions));
    
    // Update MODEL_OPTIONS for backwards compatibility if provider matches
    const currentProvider = localStorage.getItem(PROVIDER_SELECTION_KEY) || 'openai';
    if ((currentProvider === 'openai' && modelType === 'openai') || 
        (currentProvider === 'litellm' && modelType === 'litellm')) {
      MODEL_OPTIONS = [...MODEL_OPTIONS, newOption];
      localStorage.setItem('ai_chat_model_options', JSON.stringify(MODEL_OPTIONS));
    }
    
    return updatedOptions;
  }
  
  /**
   * Removes a custom model from the options
   * @param modelName Name of the model to remove
   * @returns Updated model options
   */
  static removeCustomModelOption(modelName: string): ModelOption[] {
    // Get existing custom models
    const savedCustomModels = JSON.parse(localStorage.getItem('ai_chat_custom_models') || '[]');
    
    // Check if the model exists
    if (!savedCustomModels.includes(modelName)) {
      console.log(`Custom model ${modelName} not found, nothing to remove`);
      return AIChatPanel.getModelOptions();
    }
    
    // Remove the model from custom models
    const updatedCustomModels = savedCustomModels.filter((model: string) => model !== modelName);
    localStorage.setItem('ai_chat_custom_models', JSON.stringify(updatedCustomModels));
    
    // Get all existing model options and remove the specified one
    const allModelOptions = AIChatPanel.getModelOptions();
    const updatedOptions = allModelOptions.filter(option => option.value !== modelName);
    localStorage.setItem('ai_chat_all_model_options', JSON.stringify(updatedOptions));
    
    // Update MODEL_OPTIONS for backwards compatibility
    MODEL_OPTIONS = MODEL_OPTIONS.filter(option => option.value !== modelName);
    localStorage.setItem('ai_chat_model_options', JSON.stringify(MODEL_OPTIONS));
    
    return updatedOptions;
  }

  static readonly panelName = 'ai-chat';

  // TODO: Move messages to a separate state object
  #messages: ChatMessage[] = [];
  #chatView!: ChatView; // Using the definite assignment assertion
  #toolbarContainer!: HTMLDivElement;
  #chatViewContainer!: HTMLDivElement;
  #isTextInputEmpty = true;
  #agentService = AgentService.getInstance();
  #isProcessing = false;
  #imageInput?: ImageInputData;
  #selectedAgentType: string | null = null;
  #selectedModel: string = MODEL_OPTIONS.length > 0 ? MODEL_OPTIONS[0].value : ''; // Default to first model if available
  #miniModel = ''; // Mini model selection
  #nanoModel = ''; // Nano model selection
  #canSendMessages = false; // Add flag to track if we can send messages (has required credentials)
  #settingsButton: HTMLElement | null = null; // Reference to the settings button
  #liteLLMApiKey: string | null = null; // LiteLLM API key
  #liteLLMEndpoint: string | null = null; // LiteLLM endpoint
  #apiKey: string | null = null; // Regular API key

  constructor() {
    super(AIChatPanel.panelName);

    this.#setupUI();
    this.#setupInitialState();
    this.#initializeAgentService();
    this.performUpdate();
    this.#fetchLiteLLMModelsOnLoad();
  }

  /**
   * Sets up the UI components and layout
   */
  #setupUI(): void {
    // Register CSS styles
    this.registerRequiredCSS(chatViewStyles);

    // Set flex layout for the content element to ensure it takes full height
    this.contentElement.style.display = 'flex';
    this.contentElement.style.flexDirection = 'column';
    this.contentElement.style.height = '100%';

    // Create container for the toolbar
    this.#toolbarContainer = document.createElement('div');
    this.contentElement.appendChild(this.#toolbarContainer);

    // Create container for the chat view
    this.#chatViewContainer = document.createElement('div');
    this.#chatViewContainer.style.flex = '1';
    this.#chatViewContainer.style.overflow = 'hidden';
    this.contentElement.appendChild(this.#chatViewContainer);

    // Create ChatView and append it to its container
    this.#chatView = new ChatView();
    this.#chatView.style.flexGrow = '1';
    this.#chatView.style.overflow = 'auto';
    this.#chatViewContainer.appendChild(this.#chatView);
  }

  /**
   * Sets up the initial state from localStorage
   */
  #setupInitialState(): void {
    // Add welcome message
    this.#messages.push({
      entity: ChatMessageEntity.MODEL,
      action: 'final',
      answer: i18nString(UIStrings.welcomeMessage),
      isFinalAnswer: true,
    });

    // Load API keys and configurations from localStorage
    this.#apiKey = localStorage.getItem('ai_chat_api_key');
    this.#liteLLMApiKey = localStorage.getItem(LITELLM_API_KEY_STORAGE_KEY);
    this.#liteLLMEndpoint = localStorage.getItem(LITELLM_ENDPOINT_KEY);
    
    // Load agent type if previously set
    const savedAgentType = localStorage.getItem('ai_chat_agent_type');
    if (savedAgentType) {
      this.#selectedAgentType = savedAgentType;
    }

    this.#setupModelOptions();
  }

  /**
   * Sets up model options based on provider and stored preferences
   */
  #setupModelOptions(): void {
    // Get the selected provider
    const selectedProvider = localStorage.getItem(PROVIDER_SELECTION_KEY) || 'openai';
    
    // Initialize MODEL_OPTIONS based on the selected provider
    this.#updateModelOptions([], false);
    
    // Load custom models
    const savedCustomModels = JSON.parse(localStorage.getItem('ai_chat_custom_models') || '[]');
    
    // If we have custom models and using LiteLLM, add them
    if (savedCustomModels.length > 0 && selectedProvider === 'litellm') {
      // Add custom models to MODEL_OPTIONS
      const customOptions = savedCustomModels.map((model: string) => ({
        value: model,
        label: `LiteLLM: ${model}`,
        type: 'litellm' as const
      }));
      MODEL_OPTIONS = [...MODEL_OPTIONS, ...customOptions];

      // Save MODEL_OPTIONS to localStorage
      localStorage.setItem('ai_chat_model_options', JSON.stringify(MODEL_OPTIONS));
    }
    
    this.#loadModelSelections();
  }

  /**
   * Loads model selections from localStorage
   */
  #loadModelSelections(): void {
    // Load the selected model
    const storedModel = localStorage.getItem(MODEL_SELECTION_KEY);
    
    if (MODEL_OPTIONS.length === 0) {
      console.warn('No model options available when loading model selections');
      return;
    }
    
    if (storedModel && MODEL_OPTIONS.some(option => option.value === storedModel)) {
      this.#selectedModel = storedModel;
    } else if (MODEL_OPTIONS.length > 0) {
      // If stored model is not valid, select the first available model
      this.#selectedModel = MODEL_OPTIONS[0].value;
      localStorage.setItem(MODEL_SELECTION_KEY, this.#selectedModel);
    }
    
    // Load mini model
    const storedMiniModel = localStorage.getItem(MINI_MODEL_STORAGE_KEY);
    if (storedMiniModel && MODEL_OPTIONS.some(option => option.value === storedMiniModel)) {
      this.#miniModel = storedMiniModel;
    } else {
      this.#miniModel = '';
      localStorage.removeItem(MINI_MODEL_STORAGE_KEY);
    }

    // Load nano model
    const storedNanoModel = localStorage.getItem(NANO_MODEL_STORAGE_KEY);
    if (storedNanoModel && MODEL_OPTIONS.some(option => option.value === storedNanoModel)) {
      this.#nanoModel = storedNanoModel;
    } else {
      this.#nanoModel = '';
      localStorage.removeItem(NANO_MODEL_STORAGE_KEY);
    }
    
    console.log('Loaded model selections:', {
      selectedModel: this.#selectedModel,
      miniModel: this.#miniModel,
      nanoModel: this.#nanoModel
    });
  }

  getSelectedModel(): string {
    return this.#selectedModel;
  }

  /**
   * Fetches LiteLLM models on initial load if needed
   */
  async #fetchLiteLLMModelsOnLoad(): Promise<void> {
    const selectedProvider = localStorage.getItem(PROVIDER_SELECTION_KEY) || 'openai';
    
    // Only fetch LiteLLM models if we're using LiteLLM provider
    if (selectedProvider === 'litellm') {
      await this.#refreshLiteLLMModels();
    } else {
      // Just update model options with empty LiteLLM models
      this.#updateModelOptions([], false);
    }
  }

  /**
   * Refreshes the list of LiteLLM models from the configured endpoint
   */
  async #refreshLiteLLMModels(): Promise<void> {
    const liteLLMApiKey = localStorage.getItem(LITELLM_API_KEY_STORAGE_KEY);
    const endpoint = localStorage.getItem(LITELLM_ENDPOINT_KEY);

    if (!endpoint) {
      console.log('No LiteLLM endpoint configured, skipping refresh');
      // Update with empty LiteLLM models but keep any custom models
      AIChatPanel.updateModelOptions([], false);
      this.performUpdate();
      return;
    }
    
    try {
      const { models: litellmModels, hadWildcard } = await this.#fetchLiteLLMModels(liteLLMApiKey, endpoint);
      // Use the static method
      AIChatPanel.updateModelOptions(litellmModels, hadWildcard);
      this.performUpdate();
    } catch (error) {
      console.error('Failed to refresh LiteLLM models:', error);
      // Clear LiteLLM models on error
      AIChatPanel.updateModelOptions([], false);
      this.performUpdate();
    }
  }

  /**
   * Fetches LiteLLM models from the specified endpoint
   * @param apiKey API key to use for the request (optional)
   * @param endpoint The LiteLLM endpoint URL
   * @returns Object containing models and wildcard flag
   */
  async #fetchLiteLLMModels(apiKey: string | null, endpoint?: string): Promise<{models: ModelOption[], hadWildcard: boolean}> {
    try {
      // Only attempt to fetch if an endpoint is provided
      if (!endpoint) {
        console.log('No LiteLLM endpoint provided, skipping model fetch');
        return { models: [], hadWildcard: false };
      }

      // Always fetch fresh models from LiteLLM
      const models = await LiteLLMClient.fetchModels(apiKey, endpoint);

      // Check if wildcard model exists
      const hadWildcard = models.some(model => model.id === '*');

      // Filter out the wildcard "*" model as it's not a real model
      const filteredModels = models.filter(model => model.id !== '*');

      // Transform the models to the format we need
      const litellmModels = filteredModels.map(model => ({
        value: model.id,  // Store actual model name
        label: `LiteLLM: ${model.id}`,
        type: 'litellm' as const
      }));

      console.log(`Fetched ${litellmModels.length} LiteLLM models, hadWildcard: ${hadWildcard}`);
      return { models: litellmModels, hadWildcard };
    } catch (error) {
      console.error('Failed to fetch LiteLLM models:', error);
      // Return empty array on error - no default models
      return { models: [], hadWildcard: false };
    }
  }

  /**
   * Instance method that delegates to the static method to update model options
   * @param litellmModels LiteLLM models to add to options
   * @param hadWildcard Whether LiteLLM returned a wildcard model
   */
  #updateModelOptions(litellmModels: ModelOption[], hadWildcard = false): void {
    // Call the static method
    AIChatPanel.updateModelOptions(litellmModels, hadWildcard);
  }

  /**
   * Determines the status of the selected model
   * @param modelValue The model value to check
   * @returns Object with isLiteLLM and isPlaceholder flags
   */
  #getModelStatus(modelValue: string): { isLiteLLM: boolean, isPlaceholder: boolean } {
    if (!modelValue) {
      console.warn('getModelStatus called with empty model value');
      return {
        isLiteLLM: false,
        isPlaceholder: false
      };
    }
    
    const modelOption = MODEL_OPTIONS.find(opt => opt.value === modelValue);
    
    if (!modelOption) {
      console.warn(`Model ${modelValue} not found in MODEL_OPTIONS`);
    }
    
    return {
      isLiteLLM: Boolean(modelOption?.type === 'litellm'),
      isPlaceholder: Boolean(modelOption?.value === '_placeholder_add_custom'),
    };
  }

  /**
   * Initialize the agent service based on the current provider and configuration
   */
  #initializeAgentService(): void {
    console.log("Initializing agent service...");
    
    // Get the selected provider and check model status
    const selectedProvider = localStorage.getItem(PROVIDER_SELECTION_KEY) || 'openai';
    const { isLiteLLM, isPlaceholder } = this.#getModelStatus(this.#selectedModel);
    
    // Don't initialize if the selected model is a placeholder
    if (isPlaceholder) {
      this.#setCanSendMessagesState(false, "Selected model is a placeholder");
      return;
    }
    
    // Check credentials based on provider
    const {canProceed, apiKey} = this.#checkCredentials(selectedProvider, isLiteLLM);
    
    // Update state if we can't proceed
    if (!canProceed) {
      this.#setCanSendMessagesState(false, "Missing required credentials");
      return;
    }
    
    // Remove any existing listeners to prevent duplicates
    this.#agentService.removeEventListener(AgentEvents.MESSAGES_CHANGED, this.#handleMessagesChanged.bind(this));
    
    // Register for messages changed events
    this.#agentService.addEventListener(AgentEvents.MESSAGES_CHANGED, this.#handleMessagesChanged.bind(this));
    
    // Initialize the agent service
    this.#agentService.initialize(apiKey, this.#selectedModel)
      .then(() => {
        this.#setCanSendMessagesState(true, "Agent service initialized successfully");
      })
      .catch(error => {
        console.error('Failed to initialize AgentService:', error);
        this.#setCanSendMessagesState(false, `Failed to initialize agent service: ${error instanceof Error ? error.message : String(error)}`);
      });
  }
  
  /**
   * Helper to set the canSendMessages state and update UI accordingly
   */
  #setCanSendMessagesState(canSend: boolean, reason: string): void {
    console.log(`Setting canSendMessages to ${canSend}: ${reason}`);
    this.#canSendMessages = canSend;
    this.#updateChatViewInputState();
    this.performUpdate();
  }
  
  /**
   * Checks if required credentials are available based on provider
   * @param provider The selected provider ('openai' or 'litellm')
   * @param isLiteLLM Whether the selected model is a LiteLLM model
   * @returns Object with canProceed flag and apiKey
   */
  #checkCredentials(provider: string, isLiteLLM: boolean): {canProceed: boolean, apiKey: string | null} {
    let canProceed = false;
    let apiKey: string | null = null;
    
    if (provider === 'litellm') {
      // For LiteLLM: endpoint is required, API key is optional
      const liteLLMEndpoint = localStorage.getItem(LITELLM_ENDPOINT_KEY);
      const hasLiteLLMEndpoint = Boolean(liteLLMEndpoint);
      canProceed = hasLiteLLMEndpoint;
      
      // For LiteLLM, prefer the dedicated LiteLLM API key, but fall back to regular API key
      apiKey = localStorage.getItem(LITELLM_API_KEY_STORAGE_KEY) || localStorage.getItem('ai_chat_api_key') || null;
      
      if (!canProceed) {
        console.log("LiteLLM selected but no endpoint configured. Messages disabled.");
      } else if (!apiKey) {
        console.log("LiteLLM endpoint configured but no API key provided. Some models may still work.");
      } else {
        console.log(`LiteLLM configured with endpoint ${liteLLMEndpoint} and API key is ${apiKey ? 'provided' : 'missing'}`);
      }
    } else {
      // For OpenAI: API key is required
      apiKey = localStorage.getItem('ai_chat_api_key');
      canProceed = Boolean(apiKey);
      
      if (!canProceed) {
        console.log("OpenAI selected but no API key configured. Messages disabled.");
      } else {
        console.log("OpenAI configured with API key.");
      }
    }
    
    return {canProceed, apiKey};
  }

  /**
   * Update the ChatView's input state directly without doing a full performUpdate
   * This updates the placeholder text and input state
   */
  #updateChatViewInputState(): void {
    if (!this.#chatView) {
      return;
    }
    
    // Update ChatView data with current input state
    this.#chatView.data = {
      ...this.#chatView.data,
      isInputDisabled: false, // Keep the input field enabled for better UX
      inputPlaceholder: this.#getInputPlaceholderText()
    };
  }

  /**
   * Get the appropriate placeholder text based on configuration status
   */
  #getInputPlaceholderText(): string {
    const selectedProvider = localStorage.getItem(PROVIDER_SELECTION_KEY) || 'openai';
    
    if (this.#canSendMessages) {
      return i18nString(UIStrings.inputPlaceholder);
    } else if (selectedProvider === 'litellm') {
      return i18nString(UIStrings.missingLiteLLMEndpoint);
    } else {
      return i18nString(UIStrings.missingOpenAIKey);
    }
  }

  /**
   * Update the settings button highlight based on credentials state
   */
  #updateSettingsButtonHighlight(): void {
    if (!this.#canSendMessages && !this.#settingsButton) {
      // Try to find the settings button after rendering
      this.#settingsButton = this.#toolbarContainer.querySelector('.ai-chat-right-toolbar devtools-button[title="Settings"]');

      // Add pulsating animation to draw attention to settings
      if (this.#settingsButton) {
        // Add CSS animation to make it glow/pulse
        this.#settingsButton.classList.add('settings-highlight');

        // Add the style to the document head if it doesn't exist yet
        const styleId = 'settings-highlight-style';
        if (!document.getElementById(styleId)) {
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = `
            .settings-highlight {
              animation: pulse 2s infinite;
              position: relative;
            }
            
            @keyframes pulse {
              0% {
                box-shadow: 0 0 0 0 rgba(var(--color-primary-rgb), 0.7);
              }
              70% {
                box-shadow: 0 0 0 6px rgba(var(--color-primary-rgb), 0);
              }
              100% {
                box-shadow: 0 0 0 0 rgba(var(--color-primary-rgb), 0);
              }
            }
          `;
          document.head.appendChild(style);
        }
      }
    } else if (this.#canSendMessages && this.#settingsButton) {
      // Remove the highlight if we now have an API key
      this.#settingsButton.classList.remove('settings-highlight');
      this.#settingsButton = null;
    }
  }

  /**
   * Handle messages changed event from the agent service
   */
  #handleMessagesChanged(event: Common.EventTarget.EventTargetEvent<ChatMessage[]>): void {
    const messages = event.data;
    this.#messages = [...messages];

    // Check if we should exit processing state
    this.#updateProcessingState(messages);
    this.performUpdate();
  }
  
  /**
   * Updates processing state based on the latest messages
   */
  #updateProcessingState(messages: ChatMessage[]): void {
    // Only set isProcessing to false if the last message is a final answer from the model
    const lastMessage = messages[messages.length - 1];
    if (lastMessage &&
        lastMessage.entity === ChatMessageEntity.MODEL &&
        lastMessage.action === 'final' &&
        lastMessage.isFinalAnswer) {
      this.#isProcessing = false;
    }
  }

  /**
   * Handles model change from UI and reinitializes the agent service
   * @param model The newly selected model
   */
  async #handleModelChanged(model: string): Promise<void> {
    // Update local state and save to localStorage
    this.#selectedModel = model;
    localStorage.setItem(MODEL_SELECTION_KEY, model);

    // Refresh available models list when using LiteLLM
    const selectedProvider = localStorage.getItem(PROVIDER_SELECTION_KEY) || 'openai';
    if (selectedProvider === 'litellm') {
      await this.#refreshLiteLLMModels();
    }

    // Reinitialize the agent service with the new model
    this.#initializeAgentService();
  }

  /**
   * Public method to send a message (passed to ChatView)
   */
  async sendMessage(text: string, imageInput?: ImageInputData): Promise<void> {
    if (!text.trim() || this.#isProcessing) {
      return;
    }
    
    // If we can't send messages due to missing credentials, add error message and return
    if (!this.#canSendMessages) {
      this.#addUserMessage(text, imageInput);
      this.#addCredentialErrorMessage();
      return;
    }

    // Set processing state
    this.#setProcessingState(true);

    try {  
      // Pass the selected agent type to the agent service
      await this.#agentService.sendMessage(text, imageInput, this.#selectedAgentType);
      // MESSAGES_CHANGED event from the agent service will update with AI response
    } catch (error) {
      this.#handleSendMessageError(error);
    }
  }
  
  /**
   * Adds a user message to the conversation
   */
  #addUserMessage(text: string, imageInput?: ImageInputData): void {
    this.#messages.push({
      entity: ChatMessageEntity.USER,
      text,
      imageInput,
    });
    this.performUpdate();
  }
  
  /**
   * Adds an error message about missing credentials
   */
  #addCredentialErrorMessage(): void {
    const selectedProvider = localStorage.getItem(PROVIDER_SELECTION_KEY) || 'openai';
    
    const errorMessage: ModelChatMessage = {
      entity: ChatMessageEntity.MODEL,
      action: 'final',
      error: selectedProvider === 'litellm' ? 
        'LiteLLM endpoint is not configured. Please add endpoint in Settings.' : 
        'OpenAI API key is missing. Please add API key in Settings.',
      isFinalAnswer: true,
    };
    this.#messages.push(errorMessage as ChatMessage);
    this.performUpdate();
  }
  
  /**
   * Sets the processing state for the UI
   */
  #setProcessingState(isProcessing: boolean): void {
    this.#isProcessing = isProcessing;
    this.#isTextInputEmpty = isProcessing ? true : this.#isTextInputEmpty;
    this.#imageInput = isProcessing ? undefined : this.#imageInput;
    this.performUpdate();
  }
  
  /**
   * Handles errors from sending messages
   */
  #handleSendMessageError(error: unknown): void {
    console.error('Failed to send message:', error);
    this.#setProcessingState(false);
    
    const errorMessage: ModelChatMessage = {
      entity: ChatMessageEntity.MODEL,
      action: 'final',
      error: error instanceof Error ? error.message : String(error),
      isFinalAnswer: true,
    };
    
    this.#messages.push(errorMessage as ChatMessage);
    this.performUpdate();
  }

  override wasShown(): void {
    this.performUpdate();
    this.#chatView?.focus();
  }

  /**
   * Cleanup when panel is hidden
   */
  override willHide(): void {
    // Explicitly remove any event listeners to prevent memory leaks
    this.#agentService.removeEventListener(AgentEvents.MESSAGES_CHANGED, this.#handleMessagesChanged.bind(this));
  }

  /**
   * Updates the UI components with the current state
   */
  override performUpdate(): void {
    this.#updateToolbar();
    this.#updateSettingsButtonHighlight();
    this.#updateChatViewState();
  }
  
  /**
   * Updates the toolbar UI
   */
  #updateToolbar(): void {
    const isCenteredView = this.#chatView?.isCenteredView ?? false;
    
    Lit.render(toolbarView({
      onNewChatClick: this.#onNewChatClick.bind(this),
      onHistoryClick: this.#onHistoryClick.bind(this),
      onDeleteClick: this.#onDeleteClick.bind(this),
      onHelpClick: this.#onHelpClick.bind(this),
      onSettingsClick: this.#onSettingsClick.bind(this),
      onTestClick: this.#onTestClick.bind(this),
      isDeleteHistoryButtonVisible: this.#messages.length > 1,
      isCenteredView,
    }), this.#toolbarContainer, { host: this });
  }
  
  /**
   * Updates the chat view with current state
   */
  #updateChatViewState(): void {
    if (!this.#chatView) {
      return;
    }
    
    try {
      this.#chatView.data = {
        onPromptSelected: this.#handlePromptSelected.bind(this),
        messages: this.#messages,
        onSendMessage: this.sendMessage.bind(this),
        state: this.#isProcessing ? ChatViewState.LOADING : ChatViewState.IDLE,
        isTextInputEmpty: this.#isTextInputEmpty,
        imageInput: this.#imageInput,
        modelOptions: MODEL_OPTIONS,
        selectedModel: this.#selectedModel,
        onModelChanged: this.#handleModelChanged.bind(this),
        onModelSelectorFocus: this.#refreshLiteLLMModels.bind(this),
        selectedAgentType: this.#selectedAgentType,
        isModelSelectorDisabled: this.#isProcessing,
        isInputDisabled: false,
        inputPlaceholder: this.#getInputPlaceholderText(),
      };
    } catch (error) {
      console.error('Error updating ChatView state:', error);
    }
  }

  /**
   * Handles prompt type selection from ChatView
   * @param promptType The selected prompt type (null means deselected)
   */
  #handlePromptSelected(promptType: string | null): void {
    console.log('Prompt selected in AIChatPanel:', promptType);
    this.#selectedAgentType = promptType;
    // Save selection for future sessions
    if (promptType) {
      localStorage.setItem('ai_chat_agent_type', promptType);
    } else {
      localStorage.removeItem('ai_chat_agent_type');
    }
  }

  #onNewChatClick(): void {
    this.#agentService.clearConversation();
    this.#messages = this.#agentService.getMessages();
    this.#isProcessing = false;
    this.#selectedAgentType = null; // Reset selected agent type
    this.performUpdate();
    UI.ARIAUtils.alert(i18nString(UIStrings.newChatCreated));
  }

  /**
   * Handles history button click
   * @param event Mouse event
   */
  #onHistoryClick(_event: MouseEvent): void {
    // Not yet implemented
    console.log('History feature not yet implemented');
  }

  #onDeleteClick(): void {
    this.#onNewChatClick();
    UI.ARIAUtils.alert(i18nString(UIStrings.chatDeleted));
  }

  #onHelpClick(): void {
    HelpDialog.show();
  }

  #onTestClick(): void {
    // Create a new chat
    this.#onNewChatClick();

    // Add and send a test message
    const testMessage = 'This is a test message. Please respond with a test response.';
    void this.sendMessage(testMessage);
  }

  /**
   * Handles the settings button click event and shows the settings dialog
   */
  #onSettingsClick(): void {
    SettingsDialog.show(
      this.#selectedModel,
      this.#miniModel,
      this.#nanoModel,
      async () => {
        await this.#handleSettingsChanged();
      },
      this.#fetchLiteLLMModels.bind(this),
      AIChatPanel.updateModelOptions,
      AIChatPanel.getModelOptions,
      AIChatPanel.addCustomModelOption,
      AIChatPanel.removeCustomModelOption
    );
  }
  
  /**
   * Handles changes made in the settings dialog
   */
  async #handleSettingsChanged(): Promise<void> {
    // Get the selected provider
    const prevProvider = localStorage.getItem(PROVIDER_SELECTION_KEY) || 'openai';
    const newProvider = localStorage.getItem(PROVIDER_SELECTION_KEY) || 'openai';
    
    console.log(`Provider changing from ${prevProvider} to ${newProvider}`);
    
    // Load saved settings
    this.#apiKey = localStorage.getItem('ai_chat_api_key');
    this.#liteLLMApiKey = localStorage.getItem(LITELLM_API_KEY_STORAGE_KEY);
    this.#liteLLMEndpoint = localStorage.getItem(LITELLM_ENDPOINT_KEY);
    
    // Reset model options based on the new provider
    if (newProvider === 'litellm') {
      // First update model options with empty models
      this.#updateModelOptions([], false);
      
      // Then refresh LiteLLM models
      await this.#refreshLiteLLMModels();
    } else {
      // For OpenAI, just update model options with empty LiteLLM models
      this.#updateModelOptions([], false);
    }
    
    this.#updateModelSelections();
    this.#initializeAgentService();
  }
  
  /**
   * Updates model selections based on updated options
   */
  #updateModelSelections(): void {
    // Load saved mini/nano models if valid
    const storedMiniModel = localStorage.getItem(MINI_MODEL_STORAGE_KEY);
    const storedNanoModel = localStorage.getItem(NANO_MODEL_STORAGE_KEY);
    
    // Check if mini/nano models are still valid with the new MODEL_OPTIONS
    if (storedMiniModel && MODEL_OPTIONS.some(option => option.value === storedMiniModel)) {
      this.#miniModel = storedMiniModel;
    } else {
      this.#miniModel = '';
    }
    
    if (storedNanoModel && MODEL_OPTIONS.some(option => option.value === storedNanoModel)) {
      this.#nanoModel = storedNanoModel;
    } else {
      this.#nanoModel = '';
    }
    
    // Check if the current selected model is valid for the new provider
    if (!MODEL_OPTIONS.some(opt => opt.value === this.#selectedModel) && MODEL_OPTIONS.length > 0) {
      console.log(`Selected model ${this.#selectedModel} is no longer valid with selected provider`);
      this.#selectedModel = MODEL_OPTIONS[0].value;
      localStorage.setItem(MODEL_SELECTION_KEY, this.#selectedModel);
    }
  }

  /**
   * Sets up the panel as a root panel
   */
  override markAsRoot(): void {
    super.markAsRoot();
    // Ensure the content element has appropriate accessibility attributes
    if (this.contentElement) {
      this.contentElement.setAttribute('aria-label', 'AI Chat Panel');
      this.contentElement.setAttribute('role', 'region');
    }
  }
}

export class ActionDelegate implements UI.ActionRegistration.ActionDelegate {
  handleAction(_context: UI.Context.Context, actionId: string): boolean {
    switch (actionId) {
      case 'ai-chat.toggle':
        void UI.ViewManager.ViewManager.instance().showView('ai-chat');
        return true;
    }
    return false;
  }
}