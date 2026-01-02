/**
 * Support Bundle Analyzer with Automatic Service Discovery
 * Processes support bundle logs and indexes them to Elasticsearch
 */
const fs = require('fs-extra');
const path = require('path');
const { LogParser } = require('./log-parser');

class SupportBundleAnalyzer {
  constructor(bundlePath, esClient) {
    this.bundlePath = bundlePath;
    this.esClient = esClient;
    this.bundleId = null;
    this.logParsers = new Map(); // Dynamic parser registry
    this.processedFiles = new Set(); // Track processed files
    this.stats = {
      totalServices: 0,
      totalLogFiles: 0,
      totalDocuments: 0,
      errors: 0
    };
  }

  /**
   * Main method to process the entire support bundle
   */
  async processBundle() {
    try {
      console.log(`🚀 Starting support bundle analysis...`);
      console.log(`📁 Bundle path: ${this.bundlePath}`);
      
      // Read service manifest
      const manifest = await this.readServiceManifest();
      this.bundleId = manifest.bundle_info.id;
      this.esClient.setBundleId(this.bundleId);
      
      console.log(`📦 Processing bundle: ${this.bundleId}`);
      console.log(`📅 Created: ${manifest.bundle_info.created}`);
      
      // Auto-discover all services (not just from manifest)
      const discoveredServices = await this.discoverAllServices();
      this.stats.totalServices = discoveredServices.length;
      
      console.log(`🔍 Discovered ${discoveredServices.length} services: ${discoveredServices.join(', ')}`);
      
      // Process each discovered service
      for (const serviceName of discoveredServices) {
        await this.processService(serviceName);
      }
      
      // Print final statistics
      this.printStatistics();
      
      console.log('✅ Bundle processing complete');
      
    } catch (error) {
      this.stats.errors++;
      throw new Error(`Failed to process bundle: ${error.message}`);
    }
  }

  /**
   * Read and parse service manifest
   * @returns {object} Service manifest data
   */
  async readServiceManifest() {
    const manifestPath = path.join(this.bundlePath, 'service_manifest.json');
    
    if (!await fs.pathExists(manifestPath)) {
      throw new Error(`Service manifest not found: ${manifestPath}`);
    }
    
    try {
      const manifest = await fs.readJson(manifestPath);
      console.log(`📋 Service manifest loaded: ${manifest.service_type}`);
      return manifest;
    } catch (error) {
      throw new Error(`Failed to read service manifest: ${error.message}`);
    }
  }

  /**
   * Auto-discover all services from directory structure
   * @returns {Array} Array of service names
   */
  async discoverAllServices() {
    const services = new Set();
    
    try {
      // Read from manifest first
      const manifest = await this.readServiceManifest();
      Object.keys(manifest.microservices).forEach(service => services.add(service));
      
      // Auto-discover additional services from directory structure
      const entries = await fs.readdir(this.bundlePath);
      for (const entry of entries) {
        const entryPath = path.join(this.bundlePath, entry);
        const stat = await fs.stat(entryPath);
        
        if (stat.isDirectory() && entry !== 'archived' && !entry.startsWith('.')) {
          // Check if this directory contains service data
          const hasServiceData = await this.hasServiceData(entryPath);
          if (hasServiceData) {
            services.add(entry);
          }
        }
      }
      
      return Array.from(services);
    } catch (error) {
      console.warn(`⚠️ Error discovering services: ${error.message}`);
      return [];
    }
  }

  /**
   * Check if directory contains service-like structure
   * @param {string} dirPath - Directory path to check
   * @returns {boolean} True if contains service data
   */
  async hasServiceData(dirPath) {
    try {
      // Check for jfrt structure
      const jfrtPath = path.join(dirPath, 'jfrt');
      if (await fs.pathExists(jfrtPath)) {
        return true;
      }
      
      // Check for direct service structure
      const logsPath = path.join(dirPath, 'logs');
      if (await fs.pathExists(logsPath)) {
        return true;
      }
      
      // Check for other service indicators
      const indicators = ['system', 'thread_dumps', 'node_manifest.json'];
      for (const indicator of indicators) {
        const indicatorPath = path.join(dirPath, indicator);
        if (await fs.pathExists(indicatorPath)) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Process a single service
   * @param {string} serviceName - Name of the service
   */
  async processService(serviceName) {
    try {
      console.log(`🔧 Processing service: ${serviceName}`);
      
      const servicePath = path.join(this.bundlePath, serviceName);
      if (!await fs.pathExists(servicePath)) {
        console.warn(`⚠️ Service path not found: ${servicePath}`);
        return;
      }

      // Find the actual service directory
      const serviceDir = await this.findServiceDirectory(servicePath);
      if (!serviceDir) {
        console.warn(`⚠️ Service directory not found for: ${serviceName}`);
        return;
      }

      // Process all data types
      await this.processServiceData(serviceName, serviceDir);
      
    } catch (error) {
      this.stats.errors++;
      console.error(`❌ Error processing service ${serviceName}: ${error.message}`);
    }
  }

  /**
   * Find the actual service directory within the service path
   * @param {string} servicePath - Service path
   * @returns {string|null} Actual service directory path
   */
  async findServiceDirectory(servicePath) {
    try {
      // Navigate through the directory structure to find the actual service directory
      const jfrtPath = path.join(servicePath, 'jfrt');
      if (!await fs.pathExists(jfrtPath)) {
        // Check if this is already a service directory
        const logsPath = path.join(servicePath, 'logs');
        if (await fs.pathExists(logsPath)) {
          return servicePath;
        }
        return null;
      }

      const entries = await fs.readdir(jfrtPath);
      for (const entry of entries) {
        const entryPath = path.join(jfrtPath, entry);
        const stat = await fs.stat(entryPath);
        if (stat.isDirectory()) {
          // Look for the service directory
          const serviceDir = await this.findServiceDirectoryRecursive(entryPath);
          if (serviceDir) return serviceDir;
        }
      }
      return null;
    } catch (error) {
      console.warn(`⚠️ Error finding service directory: ${error.message}`);
      return null;
    }
  }

  /**
   * Recursively find service directory
   * @param {string} dirPath - Directory path
   * @returns {string|null} Service directory path
   */
  async findServiceDirectoryRecursive(dirPath) {
    try {
      const entries = await fs.readdir(dirPath);
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        const stat = await fs.stat(entryPath);
        if (stat.isDirectory()) {
          // Check if this directory contains logs
          const logsPath = path.join(entryPath, 'logs');
          if (await fs.pathExists(logsPath)) {
            return entryPath;
          }
          // Recursively search
          const result = await this.findServiceDirectoryRecursive(entryPath);
          if (result) return result;
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Process all data types for a service
   * @param {string} serviceName - Service name
   * @param {string} serviceDir - Service directory path
   */
  async processServiceData(serviceName, serviceDir) {
    try {
      // Process logs
      const logsPath = path.join(serviceDir, 'logs');
      if (await fs.pathExists(logsPath)) {
        await this.processLogs(serviceName, logsPath);
      }

      // Process system info
      const systemPath = path.join(serviceDir, 'system');
      if (await fs.pathExists(systemPath)) {
        await this.processSystemInfo(serviceName, systemPath);
      }

      // Process thread dumps
      const threadDumpsPath = path.join(serviceDir, 'thread_dumps');
      if (await fs.pathExists(threadDumpsPath)) {
        await this.processThreadDumps(serviceName, threadDumpsPath);
      }

      // Process node manifest
      const nodeManifestPath = path.join(serviceDir, 'node_manifest.json');
      if (await fs.pathExists(nodeManifestPath)) {
        await this.processNodeManifest(serviceName, nodeManifestPath);
      }

    } catch (error) {
      this.stats.errors++;
      console.error(`❌ Error processing service data for ${serviceName}: ${error.message}`);
    }
  }

  /**
   * Process log files for a service
   * @param {string} serviceName - Service name
   * @param {string} logsPath - Logs directory path
   */
  async processLogs(serviceName, logsPath) {
    try {
      const logFiles = await fs.readdir(logsPath);
      
      for (const logFile of logFiles) {
        if (logFile.endsWith('.log')) {
          const logPath = path.join(logsPath, logFile);
          const fileKey = `${serviceName}:${logFile}`;
          
          if (!this.processedFiles.has(fileKey)) {
            await this.processLogFile(serviceName, logPath, logFile);
            this.processedFiles.add(fileKey);
            this.stats.totalLogFiles++;
          }
        }
      }
    } catch (error) {
      this.stats.errors++;
      console.error(`❌ Error processing logs for ${serviceName}: ${error.message}`);
    }
  }

  /**
   * Process a single log file
   * @param {string} serviceName - Service name
   * @param {string} logPath - Log file path
   * @param {string} logFile - Log file name
   */
  async processLogFile(serviceName, logPath, logFile) {
    try {
      console.log(`📄 Processing log: ${logFile}`);
      
      const content = await fs.readFile(logPath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        console.warn(`⚠️ Empty log file: ${logFile}`);
        return;
      }
      
      // Auto-detect log format and use appropriate parser
      const logType = this.detectLogType(logFile, lines[0]);
      const parser = this.getLogParser(logType);
      
      if (parser) {
        const documents = [];
        for (const line of lines) {
          try {
            const doc = parser.parse(line, serviceName, this.bundleId);
            if (doc) {
              documents.push(doc);
              this.stats.totalDocuments++;
            }
          } catch (error) {
            this.stats.errors++;
            console.warn(`⚠️ Failed to parse log line in ${logFile}: ${error.message}`);
          }
        }
        
        if (documents.length > 0) {
          await this.esClient.bulkIndex(logType, documents);
        }
      }
    } catch (error) {
      this.stats.errors++;
      console.error(`❌ Error processing log file ${logFile}: ${error.message}`);
    }
  }

  /**
   * Auto-detect log type based on filename and content
   * @param {string} logFile - Log file name
   * @param {string} firstLine - First line of the log
   * @returns {string} Detected log type
   */
  detectLogType(logFile, firstLine) {
    // Detect by filename
    if (logFile.includes('request')) return 'requests';
    if (logFile.includes('service')) return 'service';
    if (logFile.includes('audit')) return 'audit';
    if (logFile.includes('access')) return 'access';
    if (logFile.includes('security')) return 'security';
    
    // Detect by content format
    if (firstLine && firstLine.includes('|')) return 'requests';
    if (firstLine && firstLine.includes('[AUDIT]')) return 'audit';
    if (firstLine && firstLine.includes('[') && firstLine.includes(']')) return 'service';
    
    return 'generic';
  }

  /**
   * Get or create log parser for a specific type
   * @param {string} logType - Log type
   * @returns {LogParser} Log parser instance
   */
  getLogParser(logType) {
    if (!this.logParsers.has(logType)) {
      this.logParsers.set(logType, new LogParser(logType));
    }
    return this.logParsers.get(logType);
  }

  /**
   * Process system information files
   * @param {string} serviceName - Service name
   * @param {string} systemPath - System directory path
   */
  async processSystemInfo(serviceName, systemPath) {
    try {
      const files = await fs.readdir(systemPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(systemPath, file);
          await this.processSystemFile(serviceName, filePath, file);
        }
      }
    } catch (error) {
      this.stats.errors++;
      console.error(`❌ Error processing system info for ${serviceName}: ${error.message}`);
    }
  }

  /**
   * Process a single system file
   * @param {string} serviceName - Service name
   * @param {string} filePath - File path
   * @param {string} fileName - File name
   */
  async processSystemFile(serviceName, filePath, fileName) {
    try {
      const content = await fs.readJson(filePath);
      
      const doc = {
        '@timestamp': new Date(),
        'bundle_id': this.bundleId,
        'service_name': serviceName,
        'log_type': 'system_info',
        'file_name': fileName,
        'system_data': content
      };
      
      await this.esClient.bulkIndex('system', [doc]);
      this.stats.totalDocuments++;
      
    } catch (error) {
      this.stats.errors++;
      console.error(`❌ Error processing system file ${fileName}: ${error.message}`);
    }
  }

  /**
   * Process thread dump files
   * @param {string} serviceName - Service name
   * @param {string} threadDumpsPath - Thread dumps directory path
   */
  async processThreadDumps(serviceName, threadDumpsPath) {
    try {
      const files = await fs.readdir(threadDumpsPath);
      
      for (const file of files) {
        const filePath = path.join(threadDumpsPath, file);
        const stat = await fs.stat(filePath);
        
        if (stat.isFile()) {
          await this.processThreadDumpFile(serviceName, filePath, file);
        }
      }
    } catch (error) {
      this.stats.errors++;
      console.error(`❌ Error processing thread dumps for ${serviceName}: ${error.message}`);
    }
  }

  /**
   * Process a single thread dump file
   * @param {string} serviceName - Service name
   * @param {string} filePath - File path
   * @param {string} fileName - File name
   */
  async processThreadDumpFile(serviceName, filePath, fileName) {
    try {
      const doc = {
        '@timestamp': new Date(),
        'bundle_id': this.bundleId,
        'service_name': serviceName,
        'log_type': 'thread_dump',
        'file_name': fileName,
        'file_size': (await fs.stat(filePath)).size,
        'file_extension': path.extname(fileName)
      };
      
      await this.esClient.bulkIndex('thread_dumps', [doc]);
      this.stats.totalDocuments++;
      
    } catch (error) {
      this.stats.errors++;
      console.error(`❌ Error processing thread dump file ${fileName}: ${error.message}`);
    }
  }

  /**
   * Process node manifest file
   * @param {string} serviceName - Service name
   * @param {string} nodeManifestPath - Node manifest file path
   */
  async processNodeManifest(serviceName, nodeManifestPath) {
    try {
      const content = await fs.readJson(nodeManifestPath);
      
      const doc = {
        '@timestamp': new Date(),
        'bundle_id': this.bundleId,
        'service_name': serviceName,
        'log_type': 'node_manifest',
        'manifest_data': content
      };
      
      await this.esClient.bulkIndex('manifests', [doc]);
      this.stats.totalDocuments++;
      
    } catch (error) {
      this.stats.errors++;
      console.error(`❌ Error processing node manifest for ${serviceName}: ${error.message}`);
    }
  }

  /**
   * Print processing statistics
   */
  printStatistics() {
    console.log('\n📊 Processing Statistics:');
    console.log(`   Services processed: ${this.stats.totalServices}`);
    console.log(`   Log files processed: ${this.stats.totalLogFiles}`);
    console.log(`   Documents indexed: ${this.stats.totalDocuments}`);
    console.log(`   Errors encountered: ${this.stats.errors}`);
    console.log(`   Files processed: ${this.processedFiles.size}`);
  }

  /**
   * Get processing statistics
   * @returns {object} Processing statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      processedFiles: this.processedFiles.size,
      bundleId: this.bundleId
    };
  }
}

module.exports = { SupportBundleAnalyzer };
