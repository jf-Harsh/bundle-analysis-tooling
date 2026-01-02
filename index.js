#!/usr/bin/env node

/**
 * Support Bundle Analyzer - Main Entry Point
 * Generic ELK Stack Integration for JFrog Support Bundle Analysis
 */

const { SupportBundleAnalyzer } = require('./src/analyzer');
const { ElasticsearchClient } = require('./src/elasticsearch-client');
const yargs = require('yargs');
const fs = require('fs-extra');
const path = require('path');

// Command line argument configuration
const argv = yargs
  .option('bundle-path', {
    alias: 'p',
    description: 'Path to support bundle directory',
    type: 'string',
    default: './newlogs3',
    demandOption: true
  })
  .option('elasticsearch-url', {
    alias: 'e',
    description: 'Elasticsearch URL',
    type: 'string',
    default: 'http://localhost:9200'
  })
  .option('verbose', {
    alias: 'v',
    description: 'Enable verbose logging',
    type: 'boolean',
    default: false
  })
  .option('dry-run', {
    alias: 'd',
    description: 'Perform a dry run without indexing to Elasticsearch',
    type: 'boolean',
    default: false
  })
  .option('help', {
    alias: 'h',
    description: 'Show help',
    type: 'boolean'
  })
  .example('$0 --bundle-path ./support-bundle', 'Analyze support bundle in ./support-bundle directory')
  .example('$0 -p ./bundle -e http://elasticsearch:9200', 'Analyze with custom Elasticsearch URL')
  .example('$0 -p ./bundle --dry-run', 'Perform dry run without indexing')
  .help()
  .alias('help', 'h')
  .version('1.0.0')
  .epilogue('For more information, visit: https://github.com/your-org/support-bundle-analyzer')
  .argv;

/**
 * Main function
 */
async function main() {
  const startTime = Date.now();
  
  try {
    console.log('🚀 JFrog Support Bundle Analyzer');
    console.log('=====================================');
    console.log(`📁 Bundle path: ${argv.bundlePath}`);
    console.log(`🔗 Elasticsearch: ${argv.elasticsearchUrl}`);
    console.log(`🔍 Verbose mode: ${argv.verbose ? 'ON' : 'OFF'}`);
    console.log(`🧪 Dry run: ${argv.dryRun ? 'ON' : 'OFF'}`);
    console.log('');

    // Validate bundle path
    await validateBundlePath(argv.bundlePath);

    // Initialize Elasticsearch client
    let esClient;
    if (!argv.dryRun) {
      esClient = new ElasticsearchClient(argv.elasticsearchUrl);
      await esClient.initialize();
    } else {
      console.log('🧪 DRY RUN MODE: Skipping Elasticsearch initialization');
      esClient = new MockElasticsearchClient();
    }

    // Initialize analyzer
    const analyzer = new SupportBundleAnalyzer(argv.bundlePath, esClient);

    // Process the bundle
    console.log('🔄 Starting bundle analysis...');
    await analyzer.processBundle();

    // Get final statistics
    const stats = analyzer.getStatistics();
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    // Print summary
    printSummary(stats, duration);

    // Refresh indices to make data searchable
    if (!argv.dryRun) {
      await esClient.refreshIndices('support-bundle-*');
      console.log('\n🌐 Data is now available in Kibana at: http://localhost:5601');
      console.log('📋 Create index patterns for:');
      console.log('   - support-bundle-*-requests');
      console.log('   - support-bundle-*-service');
      console.log('   - support-bundle-*-audit');
      console.log('   - support-bundle-*-access');
      console.log('   - support-bundle-*-system');
      console.log('   - support-bundle-*-thread_dumps');
      console.log('   - support-bundle-*-manifests');
    }

    console.log('\n✅ Analysis completed successfully!');

  } catch (error) {
    console.error('\n❌ Analysis failed:');
    console.error(`   ${error.message}`);
    
    if (argv.verbose) {
      console.error('\n📋 Stack trace:');
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

/**
 * Validate bundle path exists and contains required files
 * @param {string} bundlePath - Path to bundle directory
 */
async function validateBundlePath(bundlePath) {
  try {
    // Check if path exists
    if (!await fs.pathExists(bundlePath)) {
      throw new Error(`Bundle path does not exist: ${bundlePath}`);
    }

    // Check if it's a directory
    const stat = await fs.stat(bundlePath);
    if (!stat.isDirectory()) {
      throw new Error(`Bundle path is not a directory: ${bundlePath}`);
    }

    // Check for service manifest
    const manifestPath = path.join(bundlePath, 'service_manifest.json');
    if (!await fs.pathExists(manifestPath)) {
      throw new Error(`Service manifest not found: ${manifestPath}`);
    }

    console.log('✅ Bundle path validation passed');
    
  } catch (error) {
    throw new Error(`Bundle validation failed: ${error.message}`);
  }
}

/**
 * Print analysis summary
 * @param {object} stats - Processing statistics
 * @param {number} duration - Processing duration in seconds
 */
function printSummary(stats, duration) {
  console.log('\n📊 Analysis Summary');
  console.log('==================');
  console.log(`⏱️  Duration: ${duration.toFixed(2)} seconds`);
  console.log(`📦 Bundle ID: ${stats.bundleId}`);
  console.log(`🔧 Services: ${stats.totalServices}`);
  console.log(`📄 Log files: ${stats.totalLogFiles}`);
  console.log(`📝 Documents: ${stats.totalDocuments}`);
  console.log(`❌ Errors: ${stats.errors}`);
  console.log(`📁 Files processed: ${stats.processedFiles}`);
  
  if (stats.errors > 0) {
    console.log(`\n⚠️  ${stats.errors} errors occurred during processing. Check logs above for details.`);
  }
  
  if (stats.totalDocuments === 0) {
    console.log('\n⚠️  No documents were indexed. Check if log files contain valid data.');
  }
}

/**
 * Mock Elasticsearch client for dry run mode
 */
class MockElasticsearchClient {
  constructor() {
    this.bundleId = null;
    this.indexedDocuments = 0;
  }

  async initialize() {
    console.log('🧪 Mock Elasticsearch client initialized');
  }

  setBundleId(bundleId) {
    this.bundleId = bundleId;
  }

  async bulkIndex(indexType, documents) {
    this.indexedDocuments += documents.length;
    console.log(`🧪 [DRY RUN] Would index ${documents.length} documents to ${indexType}`);
  }

  async refreshIndices() {
    console.log('🧪 [DRY RUN] Would refresh indices');
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('\n💥 Uncaught Exception:');
  console.error(error.message);
  if (argv.verbose) {
    console.error(error.stack);
  }
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Analysis interrupted by user');
  process.exit(0);
});

// Handle SIGTERM
process.on('SIGTERM', () => {
  console.log('\n\n⏹️  Analysis terminated');
  process.exit(0);
});

// Run main function if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { main, validateBundlePath, printSummary };
