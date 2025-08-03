#!/usr/bin/env node

import { EvaluationServer } from './server.js';
import readline from 'readline';

class EvaluationCLI {
  constructor() {
    this.server = new EvaluationServer();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async start() {
    console.log('🚀 Starting Evaluation Server CLI');
    console.log('====================================');
    
    // Start the server
    this.server.start();
    
    // Wait a moment for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.showHelp();
    this.startInteractiveMode();
  }

  showHelp() {
    console.log('\\nAvailable commands:');
    console.log('  status                           - Show server status');
    console.log('  clients                          - List all clients and their evaluations');
    console.log('  clients-connected                - List connected clients');
    console.log('  list-tabs [client-id]            - List active tabs (all clients or specific client)');
    console.log('  run <client-id> <evaluation-id>  - Run specific evaluation for a client');
    console.log('  run-all <client-id>              - Run all evaluations for a client');
    console.log('  run-tab <client-id> <tab-id> <evaluation-id> - Run evaluation on specific tab');
    console.log('  eval <evaluation-id>             - Run specific evaluation on all connected clients');
    console.log('  eval all                         - Run all pending evaluations on all clients');
    console.log('  help                             - Show this help');
    console.log('  quit                             - Exit the CLI');
    console.log('');
  }

  startInteractiveMode() {
    this.rl.question('eval-server> ', (input) => {
      this.handleCommand(input.trim());
    });
  }

  async handleCommand(input) {
    const [command, ...args] = input.split(' ');
    
    try {
      switch (command) {
        case 'status':
          this.showStatus();
          break;
        case 'clients':
          this.listClients();
          break;
        case 'run':
          if (args.length < 2) {
            console.log('Usage: run <client-id> <evaluation-id>');
          } else {
            await this.runSpecificEvaluation(args[0], args[1]);
          }
          break;
        case 'run-all':
          if (args.length < 1) {
            console.log('Usage: run-all <client-id>');
          } else {
            await this.runAllEvaluations(args[0]);
          }
          break;
        case 'eval':
          if (args.length === 0) {
            console.log('Usage: eval <evaluation-id>  OR  eval all');
          } else {
            await this.runEvaluation(args.join(' '));
          }
          break;
        case 'clients-connected':
          this.listConnectedClients();
          break;
        case 'list-tabs':
          this.listTabs(args[0]);
          break;
        case 'run-tab':
          if (args.length < 3) {
            console.log('Usage: run-tab <client-id> <tab-id> <evaluation-id>');
          } else {
            await this.runTabEvaluation(args[0], args[1], args[2]);
          }
          break;
        case 'help':
          this.showHelp();
          break;
        case 'quit':
        case 'exit':
          this.quit();
          return;
        case '':
          break;
        default:
          console.log(`Unknown command: ${command}. Type 'help' for available commands.`);
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
    
    this.startInteractiveMode();
  }

  showStatus() {
    const status = this.server.getStatus();
    console.log('\\n📊 Server Status:');
    console.log(`  Connected clients: ${status.connectedClients}`);
    console.log(`  Unique base clients: ${status.uniqueBaseClients}`);
    console.log(`  Total tabs: ${status.totalTabs}`);
    console.log(`  Ready clients: ${status.readyClients}`);
    console.log(`  Active evaluations: ${status.activeEvaluations}`);
    console.log('');
  }

  listConnectedClients() {
    const clients = Array.from(this.server.connectedClients.values());
    console.log('\\n👥 Connected Clients:');
    
    if (clients.length === 0) {
      console.log('  No clients connected');
    } else {
      clients.forEach(client => {
        const compositeId = client.compositeClientId || client.clientId || client.id;
        const baseId = client.baseClientId || client.clientId || client.id;
        const tabId = client.tabId || 'default';
        
        console.log(`  Composite ID: ${compositeId}`);
        console.log(`    Base Client: ${baseId}`);
        console.log(`    Tab ID: ${tabId}`);
        console.log(`    Connected: ${client.connectedAt}`);
        console.log(`    Ready: ${client.ready ? 'Yes' : 'No'}`);
        console.log(`    Registered: ${client.registered ? 'Yes' : 'No'}`);
        console.log(`    Address: ${client.remoteAddress}`);
        console.log('');
      });
    }
  }

  async runEvaluation(task) {
    if (task && task.includes('-')) {
      console.log(`\\n🔍 Running specific evaluation: "${task}"`);
    } else if (task === 'all') {
      console.log(`\\n🔍 Running all pending evaluations`);
    } else {
      console.log(`\\n🔍 Running evaluation: "${task}"`);
    }
    console.log('=====================================');
    
    try {
      const results = await this.server.evaluateAllClients(task);
      
      console.log('\\n📋 Evaluation Results:');
      results.forEach((result, index) => {
        console.log(`\\n  Client ${index + 1} (${result.clientId || 'unknown'}):`);
        
        if (result.error) {
          console.log(`    ❌ Error: ${result.error}`);
        } else {
          console.log(`    ✅ Success`);
          if (result.evaluationId) {
            console.log(`    Evaluation ID: ${result.evaluationId}`);
          }
          if (result.duration) {
            console.log(`    Duration: ${result.duration}ms`);
          }
          
          if (result.judgeEvaluation?.overall_score) {
            console.log(`    Overall Score: ${result.judgeEvaluation.overall_score}/10`);
          }
          
          if (result.clientResponse) {
            const preview = result.clientResponse.length > 100 
              ? result.clientResponse.substring(0, 100) + '...'
              : result.clientResponse;
            console.log(`    Response: ${preview}`);
          }
        }
      });
      
      console.log('\\n✅ Evaluation completed');
    } catch (error) {
      console.log(`\\n❌ Evaluation failed: ${error.message}`);
    }
  }

  listClients() {
    const clients = this.server.getClientManager().getAllClients();
    console.log('\n👥 Registered Clients:');
    
    if (clients.length === 0) {
      console.log('  No clients registered');
      return;
    }
    
    clients.forEach(client => {
      console.log(`\n  📋 ${client.name} (${client.id})`);
      console.log(`     Description: ${client.description || 'N/A'}`);
      console.log(`     Secret Key: ${client.secretKey ? '***' : 'None'}`);
      
      const evaluations = this.server.getClientManager().getClientEvaluations(client.id);
      console.log(`     Evaluations: ${evaluations.length}`);
      
      // Group evaluations by category
      const evaluationsByCategory = {};
      evaluations.forEach(evaluation => {
        const category = evaluation.category || 'uncategorized';
        if (!evaluationsByCategory[category]) {
          evaluationsByCategory[category] = [];
        }
        evaluationsByCategory[category].push(evaluation);
      });
      
      // Display evaluations grouped by category
      Object.keys(evaluationsByCategory).sort().forEach(category => {
        const categoryEvals = evaluationsByCategory[category];
        console.log(`\n       📁 ${category} (${categoryEvals.length})`);
        categoryEvals.forEach(evaluation => {
          const status = evaluation.status || 'pending';
          const statusIcon = status === 'completed' ? '✅' : status === 'running' ? '🔄' : status === 'failed' ? '❌' : '⏳';
          console.log(`         ${statusIcon} ${evaluation.id}: ${evaluation.name}`);
        });
      });
    });
    console.log('');
  }

  async runSpecificEvaluation(clientId, evaluationId) {
    console.log(`\\n🎯 Running evaluation '${evaluationId}' for client '${clientId}'...`);
    
    try {
      // Check if client is connected
      const connection = this.server.connectedClients.get(clientId);
      if (!connection || !connection.ready) {
        console.log(`❌ Client '${clientId}' is not connected or not ready`);
        return;
      }
      
      // Get the evaluation
      const evaluation = this.server.getClientManager().getClientEvaluations(clientId)
        .find(e => e.id === evaluationId);
      
      if (!evaluation) {
        console.log(`❌ Evaluation '${evaluationId}' not found for client '${clientId}'`);
        return;
      }
      
      // Reset evaluation status to pending
      this.server.getClientManager().updateEvaluationStatus(clientId, evaluationId, 'pending');
      
      // Execute the evaluation
      await this.server.executeEvaluation(connection, evaluation);
      
      console.log(`✅ Evaluation '${evaluationId}' completed successfully`);
    } catch (error) {
      console.log(`❌ Evaluation failed: ${error.message}`);
    }
  }

  async runAllEvaluations(clientId) {
    console.log(`\\n🚀 Running all evaluations for client '${clientId}'...`);
    
    try {
      // Check if client is connected
      const connection = this.server.connectedClients.get(clientId);
      if (!connection || !connection.ready) {
        console.log(`❌ Client '${clientId}' is not connected or not ready`);
        return;
      }
      
      // Get all evaluations for this client
      const evaluations = this.server.getClientManager().getClientEvaluations(clientId);
      
      if (evaluations.length === 0) {
        console.log(`❌ No evaluations found for client '${clientId}'`);
        return;
      }
      
      console.log(`Found ${evaluations.length} evaluations to run...`);
      
      let completed = 0;
      let failed = 0;
      
      for (const evaluation of evaluations) {
        console.log(`\\n🔄 Running: ${evaluation.name} (${evaluation.id})`);
        
        try {
          // Reset evaluation status to pending
          this.server.getClientManager().updateEvaluationStatus(clientId, evaluation.id, 'pending');
          
          // Execute the evaluation
          await this.server.executeEvaluation(connection, evaluation);
          
          console.log(`  ✅ Completed: ${evaluation.name}`);
          completed++;
        } catch (error) {
          console.log(`  ❌ Failed: ${evaluation.name} - ${error.message}`);
          failed++;
        }
        
        // Add a small delay between evaluations
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      console.log(`\\n📊 Results: ${completed} completed, ${failed} failed`);
    } catch (error) {
      console.log(`❌ Batch evaluation failed: ${error.message}`);
    }
  }

  /**
   * List active tabs for all clients or a specific client
   */
  listTabs(clientId = null) {
    console.log('\\n📱 Active Tabs:');
    
    if (clientId) {
      // List tabs for specific client
      const { baseClientId } = this.server.getClientManager().parseCompositeClientId(clientId);
      const tabs = this.server.getClientManager().getClientTabs(baseClientId);
      
      if (tabs.length === 0) {
        console.log(`  No active tabs for client: ${clientId}`);
        return;
      }
      
      console.log(`\\n  Client: ${baseClientId}`);
      tabs.forEach(tab => {
        console.log(`    📄 Tab ID: ${tab.tabId}`);
        console.log(`       Composite ID: ${tab.compositeClientId}`);
        console.log(`       Connected: ${tab.connectedAt}`);
        console.log(`       Address: ${tab.remoteAddress || 'unknown'}`);
        console.log('');
      });
    } else {
      // List tabs for all clients
      const clientsWithTabs = this.server.getClientManager().getAllClientsWithTabs();
      
      if (clientsWithTabs.length === 0) {
        console.log('  No active tabs');
        return;
      }
      
      let totalTabs = 0;
      clientsWithTabs.forEach(client => {
        console.log(`\\n  📋 ${client.name} (${client.baseClientId})`);
        console.log(`     Active tabs: ${client.tabCount}`);
        
        client.activeTabs.forEach(tab => {
          console.log(`       📄 Tab ID: ${tab.tabId}`);
          console.log(`          Composite ID: ${tab.compositeClientId}`);
          console.log(`          Connected: ${tab.connectedAt}`);
          console.log(`          Address: ${tab.remoteAddress || 'unknown'}`);
        });
        
        totalTabs += client.tabCount;
      });
      
      console.log(`\\n  Total: ${clientsWithTabs.length} clients, ${totalTabs} active tabs`);
    }
    console.log('');
  }

  /**
   * Run evaluation on a specific tab
   */
  async runTabEvaluation(clientId, tabId, evaluationId) {
    const compositeClientId = `${clientId}:${tabId}`;
    console.log(`\\n🎯 Running evaluation '${evaluationId}' on tab '${tabId}' of client '${clientId}'...`);
    
    try {
      // Check if the specific tab is connected
      const connection = this.server.connectedClients.get(compositeClientId);
      if (!connection || !connection.ready) {
        console.log(`❌ Tab '${tabId}' of client '${clientId}' is not connected or not ready`);
        console.log(`   Composite ID: ${compositeClientId}`);
        return;
      }
      
      // Get the evaluation
      const evaluation = this.server.getClientManager().getClientEvaluations(clientId)
        .find(e => e.id === evaluationId);
      
      if (!evaluation) {
        console.log(`❌ Evaluation '${evaluationId}' not found for client '${clientId}'`);
        return;
      }
      
      // Reset evaluation status to pending
      this.server.getClientManager().updateEvaluationStatus(clientId, evaluationId, 'pending');
      
      // Execute the evaluation on the specific tab
      await this.server.executeEvaluation(connection, evaluation);
      
      console.log(`✅ Evaluation '${evaluationId}' completed successfully on tab '${tabId}'`);
    } catch (error) {
      console.log(`❌ Tab evaluation failed: ${error.message}`);
    }
  }


  quit() {
    console.log('\\n👋 Shutting down...');
    this.server.stop();
    this.rl.close();
    process.exit(0);
  }
}

// Start CLI if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const cli = new EvaluationCLI();
  
  process.on('SIGINT', () => {
    cli.quit();
  });
  
  cli.start().catch(error => {
    console.error('Failed to start CLI:', error.message);
    process.exit(1);
  });
}