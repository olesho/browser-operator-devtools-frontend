# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the Browser Operator [Chromium DevTools with Agentic Framework] - a fork of Chromium DevTools that adds an AI-powered multi-agent framework for browser automation. The main addition is the AI Chat panel (`front_end/panels/ai_chat/`) which enables running multi-agent workflows directly in the browser.

## Essential Commands

### Build Commands
```bash
# Initial setup - generate build files
npm run prebuild

# Main build
npm run build

# Watch mode for development
npm run watch

# Start development server
npm run start
```

### Testing
```bash
# Run all tests
npm test

# Run web tests
npm run webtest

# Debug web tests
npm run debug-webtest

# Run a specific test (example)
npm run webtest -- path/to/specific/test.ts
```

### Development Utilities
```bash
# Install/update dependencies
npm run install-deps

# Component development server
npm run components-server

# Generate protocol resources
npm run generate-protocol-resources

# Collect/bake UI strings for localization
npm run collect-strings
npm run bake-strings
```

## Architecture Overview

### Core Structure
The codebase follows a modular architecture with clear separation of concerns:

1. **front_end/core/** - Core functionality shared across DevTools
   - `sdk/` - SDK for browser interaction via Chrome DevTools Protocol
   - `protocol_client/` - Protocol communication layer
   - `common/` - Shared utilities
   - `platform/` - Platform-specific code

2. **front_end/panels/ai_chat/** - The AI Chat panel (main addition to vanilla DevTools)
   - `agent_framework/` - Multi-agent execution framework
   - `core/` - Core agent logic including BaseOrchestratorAgent and StateGraph
   - `tools/` - Agent tools for browser automation and data extraction
   - `ui/` - React-based chat interface components

3. **Build System** - Uses GN (Generate Ninja) + Ninja
   - Build configuration in `BUILD.gn` files
   - TypeScript compilation handled by custom build scripts
   - Output goes to `out/Default/`

### Key Architectural Patterns

1. **Module System**: Uses ES modules with TypeScript. Imports use relative paths from `front_end/` root.

2. **Agent Framework**: 
   - Agents extend `ConfiguredAgent` class
   - Tools extend `ConfigurableAgentTool`
   - State management via `StateGraph` for workflow orchestration
   - Tracing support for debugging agent execution

3. **UI Components**: 
   - Custom elements and React components
   - UI components in `front_end/ui/components/`
   - Panel-specific UI in respective panel directories

4. **Protocol Integration**:
   - All browser interaction goes through Chrome DevTools Protocol
   - SDK provides typed wrappers for protocol domains
   - Events and commands are strongly typed

### Development Guidelines

1. **TypeScript**: All new code should be in TypeScript. Use strict type checking.

2. **Imports**: Use relative imports from `front_end/` root:
   ```typescript
   import * as SDK from '../../core/sdk/sdk.js';
   import * as UI from '../../ui/legacy/legacy.js';
   ```

3. **Build Output**: The build generates `.js` files from `.ts` sources. Import statements should reference `.js` files even when importing TypeScript files.

4. **Testing**: Tests live alongside source files with `.test.ts` suffix or in `test/` directories.

5. **Localization**: UI strings must be localized using `i18nString` from `front_end/core/i18n/i18n.js`.

### Current Work Context

The current branch `feat/tracing-v2` is implementing tracing improvements in:
- `front_end/panels/ai_chat/core/TracingBackends.ts`
- `front_end/panels/ai_chat/core/TracingCallback.ts`

New files have been added for Langfuse integration:
- `front_end/global_typings/langfuse.d.ts`
- `front_end/panels/ai_chat/core/langfuse-shim.d.ts`
- `front_end/panels/ai_chat/core/langfuse-shim.js`