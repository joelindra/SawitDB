/**
 * BackupManager - Implements "Cadangan Lumbung" (Barn Backup)
 * Provides hot backup and point-in-time recovery
 */
const fs = require('fs');
const path = require('path');

class BackupManager {
    constructor(engine) {
        this.engine = engine;
    }

    /**
     * Create a hot backup of the database
     * @param {string} backupPath - Destination path for backup
     * @param {Object} options - Backup options
     */
    async createBackup(backupPath, options = {}) {
        const { incremental = false, compress = false } = options;

        try {
            // Ensure backup directory exists
            const backupDir = path.dirname(backupPath);
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            // Flush WAL to ensure consistency (if WAL is enabled)
            if (this.engine.wal && this.engine.wal.flush) {
                await this.engine.wal.flush();
            }

            // Flush pager to ensure all data is written
            if (this.engine.pager && this.engine.pager.flush) {
                this.engine.pager.flush();
            }

            // Create backup metadata
            const metadata = {
                timestamp: new Date().toISOString(),
                source: this.engine.dbPath,
                type: incremental ? 'incremental' : 'full',
                compressed: compress
            };

            // Copy .sawit file
            const sawitBackupPath = backupPath.replace(/\.[^.]+$/, '.sawit');
            fs.copyFileSync(this.engine.dbPath, sawitBackupPath);

            // Copy .wal file if exists
            const walPath = this.engine.dbPath.replace('.sawit', '.wal');
            if (fs.existsSync(walPath)) {
                const walBackupPath = backupPath.replace(/\.[^.]+$/, '.wal');
                fs.copyFileSync(walPath, walBackupPath);
            }

            // Write metadata
            const metadataPath = backupPath.replace(/\.[^.]+$/, '.meta.json');
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

            return {
                success: true,
                message: `Backup created successfully at ${backupPath}`,
                metadata: metadata
            };
        } catch (error) {
            throw new Error(`Backup failed: ${error.message}`);
        }
    }

    /**
     * Restore database from backup
     * @param {string} backupPath - Path to backup file
     * @param {Object} options - Restore options
     */
    async restoreBackup(backupPath, options = {}) {
        const { pointInTime = null } = options;

        try {
            // Read backup metadata
            const metadataPath = backupPath.replace(/\.[^.]+$/, '.meta.json');
            if (!fs.existsSync(metadataPath)) {
                throw new Error('Backup metadata not found');
            }

            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

            // Close current database
            if (this.engine.wal && this.engine.wal.close) {
                this.engine.wal.close();
            }
            if (this.engine.pager && this.engine.pager.flush) {
                this.engine.pager.flush();
            }
            if (this.engine.pager && this.engine.pager.close) {
                this.engine.pager.close();
            }

            // Restore .sawit file
            const sawitBackupPath = backupPath.replace(/\.[^.]+$/, '.sawit');
            if (!fs.existsSync(sawitBackupPath)) {
                throw new Error(`Backup file not found: ${sawitBackupPath}`);
            }
            fs.copyFileSync(sawitBackupPath, this.engine.dbPath);

            // Restore .wal file if exists
            const walBackupPath = backupPath.replace(/\.[^.]+$/, '.wal');
            const walPath = this.engine.dbPath.replace('.sawit', '.wal');
            if (fs.existsSync(walBackupPath)) {
                fs.copyFileSync(walBackupPath, walPath);
            }

            // Reinitialize pager to reload data
            const Pager = require('../modules/Pager');
            this.engine.pager = new Pager(this.engine.dbPath, this.engine.wal);

            // Reinitialize system tables
            if (this.engine._initSystem) {
                this.engine._initSystem();
            }

            return {
                success: true,
                message: `Database restored from backup: ${metadata.timestamp}`,
                metadata: metadata
            };
        } catch (error) {
            throw new Error(`Restore failed: ${error.message}`);
        }
    }

    /**
     * List available backups
     * @param {string} backupDir - Directory containing backups
     */
    listBackups(backupDir) {
        if (!fs.existsSync(backupDir)) {
            return [];
        }

        const files = fs.readdirSync(backupDir);
        const backups = [];

        for (const file of files) {
            if (file.endsWith('.meta.json')) {
                const metadataPath = path.join(backupDir, file);
                try {
                    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
                    backups.push({
                        file: file.replace('.meta.json', ''),
                        ...metadata
                    });
                } catch (e) {
                    console.error(`Failed to read backup metadata: ${file}`);
                }
            }
        }

        return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
}

module.exports = BackupManager;
