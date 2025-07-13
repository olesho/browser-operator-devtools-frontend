#!/usr/bin/env node

import { EvaluationServer } from './server.js';
import { ExampleAgent } from '../test/example-agent.js';
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
    console.log('  run <client-id> <evaluation-id>  - Run specific evaluation for a client');
    console.log('  run-all <client-id>              - Run all evaluations for a client');
    console.log('  eval <task>                      - Evaluate all connected agents with a task (legacy)');
    console.log('  agents                           - List connected agents');
    console.log('  test-agent                       - Start a test agent');
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
            console.log('Usage: eval <task>');
          } else {
            await this.runEvaluation(args.join(' '));
          }
          break;
        case 'agents':
          this.listAgents();
          break;
        case 'test-agent':
          this.startTestAgent();
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
    console.log(`  Connected agents: ${status.connectedAgents}`);
    console.log(`  Ready agents: ${status.readyAgents}`);
    console.log(`  Active evaluations: ${status.activeEvaluations}`);
    console.log('');
  }

  listAgents() {
    const agents = Array.from(this.server.connectedAgents.values());
    console.log('\\n👥 Connected Agents:');
    
    if (agents.length === 0) {
      console.log('  No agents connected');
    } else {
      agents.forEach(agent => {
        console.log(`  ID: ${agent.id}`);
        console.log(`    Connected: ${agent.connectedAt}`);
        console.log(`    Ready: ${agent.ready ? 'Yes' : 'No'}`);
        console.log(`    Address: ${agent.remoteAddress}`);
        console.log('');
      });
    }
  }

  async runEvaluation(task) {
    console.log(`\\n🔍 Running evaluation: "${task}"`);
    console.log('=====================================');
    
    try {
      const results = await this.server.evaluateAllAgents(task);
      
      console.log('\\n📋 Evaluation Results:');
      results.forEach((result, index) => {
        console.log(`\\n  Agent ${index + 1} (${result.agentId || 'unknown'}):`);
        
        if (result.error) {
          console.log(`    ❌ Error: ${result.error}`);
        } else {
          console.log(`    ✅ Success`);
          console.log(`    Duration: ${result.duration}ms`);
          
          if (result.judgeEvaluation?.overall_score) {
            console.log(`    Overall Score: ${result.judgeEvaluation.overall_score}/10`);
          }
          
          if (result.agentResponse) {
            const preview = result.agentResponse.length > 100 
              ? result.agentResponse.substring(0, 100) + '...'
              : result.agentResponse;
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
    console.log('\\n👥 Registered Clients:');
    
    if (clients.length === 0) {
      console.log('  No clients registered');
      return;
    }
    
    clients.forEach(client => {
      console.log(`\\n  📋 ${client.name} (${client.id})`);
      console.log(`     Description: ${client.description || 'N/A'}`);
      console.log(`     Secret Key: ${client.secretKey ? '***' : 'None'}`);
      
      const evaluations = this.server.getClientManager().getClientEvaluations(client.id);
      console.log(`     Evaluations: ${evaluations.length}`);
      
      evaluations.forEach(evaluation => {
        const status = evaluation.status || 'pending';
        const statusIcon = status === 'completed' ? '✅' : status === 'running' ? '🔄' : status === 'failed' ? '❌' : '⏳';
        console.log(`       ${statusIcon} ${evaluation.id}: ${evaluation.name}`);
      });
    });
    console.log('');
  }

  async runSpecificEvaluation(clientId, evaluationId) {
    console.log(`\\n🎯 Running evaluation '${evaluationId}' for client '${clientId}'...`);
    
    try {
      // Check if client is connected
      const connection = this.server.connectedAgents.get(clientId);
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
      const connection = this.server.connectedAgents.get(clientId);
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

  startTestAgent() {
    console.log('\\n🤖 Starting test agent...');
    
    const agent = new ExampleAgent();
    agent.connect().then(() => {
      console.log('✅ Test agent connected and ready');
    }).catch((error) => {
      console.log(`❌ Failed to start test agent: ${error.message}`);
    });
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