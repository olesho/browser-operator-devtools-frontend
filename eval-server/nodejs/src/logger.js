import winston from 'winston';
import { existsSync, mkdirSync } from 'fs';
import { CONFIG } from './config.js';

// Ensure logs directory exists
if (!existsSync(CONFIG.logging.dir)) {
  mkdirSync(CONFIG.logging.dir, { recursive: true });
}

const logger = winston.createLogger({
  level: CONFIG.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'bo-eval-server' },
  transports: [
    new winston.transports.File({ 
      filename: `${CONFIG.logging.dir}/error.log`, 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: `${CONFIG.logging.dir}/combined.log` 
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Create dedicated evaluation logger once to avoid recreating on each call
const evaluationLogger = winston.createLogger({
  format: winston.format.json(),
  transports: [
    new winston.transports.File({
      filename: `${CONFIG.logging.dir}/evaluations.jsonl`
    })
  ]
});

export function logEvaluation(evaluationData) {
  const logEntry = {
    type: 'evaluation',
    timestamp: new Date().toISOString(),
    ...evaluationData
  };
  
  // Pretty print evaluation summary to console
  console.log('\n' + '='.repeat(80));
  console.log(`📊 EVALUATION COMPLETED: ${evaluationData.name}`);
  console.log('='.repeat(80));
  console.log(`🆔 ID: ${evaluationData.evaluationId}`);
  console.log(`🔧 Tool: ${evaluationData.tool}`);
  console.log(`⏱️  Duration: ${evaluationData.duration}ms`);
  console.log(`👤 Client: ${evaluationData.clientId}`);
  
  if (evaluationData.response?.output?.output) {
    console.log(`\n📝 Output:\n${evaluationData.response.output.output}`);
  }
  
  if (evaluationData.validation?.result) {
    const val = evaluationData.validation.result;
    console.log(`\n📋 Validation:`);
    console.log(`   ✅ Passed: ${evaluationData.validation.passed ? 'YES' : 'NO'}`);
    console.log(`   📊 Overall Score: ${val.overall_score}/10`);
    if (val.strengths?.length > 0) {
      console.log(`   💪 Strengths: ${val.strengths.join(', ')}`);
    }
    if (val.weaknesses?.length > 0) {
      console.log(`   ⚠️  Weaknesses: ${val.weaknesses.join(', ')}`);
    }
  }
  
  console.log('='.repeat(80) + '\n');
  
  // Also log structured data for file logs
  logger.info('Evaluation completed', logEntry);
  
  // Also save to dedicated evaluation log
  evaluationLogger.info(logEntry);
}

export function logRpcCall(callData) {
  logger.info('RPC call', {
    type: 'rpc',
    timestamp: new Date().toISOString(),
    ...callData
  });
}

export function logConnection(connectionData) {
  logger.info('Connection event', {
    type: 'connection',
    timestamp: new Date().toISOString(),
    ...connectionData
  });
}

// Track shutdown state to prevent multiple calls
let isShuttingDown = false;

/**
 * Gracefully shutdown loggers to prevent resource leaks
 * Closes all transports and flushes pending writes
 */
export function shutdownLoggers() {
  if (isShuttingDown) {
    return Promise.resolve();
  }
  
  isShuttingDown = true;
  
  return Promise.all([
    new Promise((resolve) => {
      // Check if logger is already destroyed
      if (logger.destroyed || logger._writableState?.ended) {
        resolve();
        return;
      }
      
      logger.end(() => {
        console.log('Main logger shutdown complete');
        resolve();
      });
    }),
    new Promise((resolve) => {
      // Check if evaluationLogger is already destroyed
      if (evaluationLogger.destroyed || evaluationLogger._writableState?.ended) {
        resolve();
        return;
      }
      
      evaluationLogger.end(() => {
        console.log('Evaluation logger shutdown complete');
        resolve();
      });
    })
  ]);
}

/**
 * Get the current shutdown state
 */
export function isLoggersShuttingDown() {
  return isShuttingDown;
}

export default logger;