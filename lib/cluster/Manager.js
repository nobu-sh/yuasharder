"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/ban-ts-comment */
const cluster_1 = __importDefault(require("cluster"));
const Cluster_1 = __importDefault(require("./Cluster"));
const os_1 = __importDefault(require("os"));
const numCPUs = os_1.default.cpus().length;
const events_1 = require("events");
const eris_1 = __importDefault(require("eris"));
const ClusterQueue_1 = __importDefault(require("../utils/ClusterQueue"));
class ClusterManager extends events_1.EventEmitter {
    constructor(token, initFile, options) {
        super();
        /**
         * Process Payload Events
         */
        this.payloads = {
            // Handle Emmiting all log events out of the Manager
            clusterInfo: (message) => {
                const msg = message.msg;
                this.emit('clusterInfo', msg);
            },
            clusterWarn: (message) => {
                const msg = message.msg;
                this.emit('clusterWarn', msg);
            },
            clusterError: (message) => {
                const msg = message.msg;
                this.emit('clusterError', msg);
            },
            shardConnect: (message) => {
                const msg = message.msg;
                this.emit('shardConnect', msg);
            },
            shardDisconnect: (message) => {
                const msg = message.msg;
                this.emit('shardDisconnect', msg);
            },
            shardReady: (message) => {
                const msg = message.msg;
                this.emit('shardReady', msg);
            },
            shardResume: (message) => {
                const msg = message.msg;
                this.emit('shardResume', msg);
            },
            shardWarn: (message) => {
                const msg = message.msg;
                this.emit('shardWarn', msg);
            },
            shardError: (message) => {
                const msg = message.msg;
                this.emit('shardError', msg);
            },
            info: (message) => {
                const msg = message.msg;
                this.emit('info', msg);
            },
            error: (message) => {
                const msg = message.msg;
                this.emit('error', msg);
            },
            // Once cluster has started and all shards have started, attempt next cluster
            shardsStarted: () => {
                this.queue.queue.splice(0, 1);
                if (this.queue.queue.length > 0) {
                    setTimeout(() => this.queue.startShards(), this.clusterTimeout);
                }
            },
            // Handles stats
            stats: (message) => {
                const msg = message.msg;
                this.stats.guilds += msg.guilds;
                this.stats.users += msg.users;
                this.stats.voice += msg.voice;
                this.stats.ram += msg.ram;
                this.stats.exclusiveGuilds += msg.exclusiveGuilds;
                this.stats.largeGuilds += msg.largeGuilds;
                msg.ram = msg.ram / 1000000;
                this.stats.clusters.push(msg);
                this.stats.clustersCounted += 1;
                if (this.stats.clustersCounted === this.clusters.size) {
                    function compare(a, b) {
                        if (a.clusterID < b.clusterID)
                            return -1;
                        if (a.clusterID > b.clusterID)
                            return 1;
                        return 0;
                    }
                    this.stats.clusters = this.stats.clusters.sort(compare);
                    this.emit("stats", this.stats);
                    this.broadcast(0, {
                        _eventName: "stats",
                        msg: this.stats,
                    });
                }
            },
            broadcast: (message) => {
                this.broadcast(0, message.msg);
            },
            sendTo: (message) => {
                this.sendTo(message.clusterID, message.msg);
            },
        };
        this.totalShards = options.totalShards || null;
        this.firstShardID = options.firstShardID || 0;
        this.lastShardID = options.lastShardID || 0;
        this.totalClusters = options.totalClusters || numCPUs;
        this.clusterTimeout = options.clusterTimeout * 1000 || 5000;
        this.token = token || null;
        this.clusters = new Map();
        this.workers = new Map();
        this.callbacks = new Map();
        this.queue = new ClusterQueue_1.default();
        this.statsInterval = options.statsInterval * 1000 || 60 * 1000;
        this.initFile = initFile;
        this.guildsPerShard = options.guildsPerShard || 1300;
        this.clientOptions = options.clientOptions || {};
        this.stats = {
            guilds: 0,
            users: 0,
            ram: 0,
            voice: 0,
            exclusiveGuilds: 0,
            largeGuilds: 0,
            clusters: [],
            clustersCounted: 0,
        };
        if (this.token) {
            this.eris = new eris_1.default.Client(token);
        }
        else {
            throw new Error("No Token Provided");
        }
    }
    /**
     * Determines if process is master or forked process
     */
    isMaster() {
        return cluster_1.default.isMaster;
    }
    /**
     * Start gettings stats on an interval
     */
    startStats() {
        if (this.statsInterval) {
            setInterval(() => {
                this.stats.guilds = 0;
                this.stats.users = 0;
                this.stats.ram = 0;
                this.stats.clusters = [];
                this.stats.voice = 0;
                this.stats.exclusiveGuilds = 0;
                this.stats.largeGuilds = 0;
                this.stats.clustersCounted = 0;
                const clusters = Object.entries(cluster_1.default.workers);
                this.executeStats(clusters, 0);
            }, this.statsInterval);
        }
    }
    /**
     * Loop through all clusters and request the stats
     * @param clusters All Clusters
     * @param start Cluster to start on
     */
    executeStats(clusters, start) {
        // @ts-expect-error
        const clustertoRequest = clusters.filter(c => c[1].state === 'online')[start];
        if (clustertoRequest) {
            const cluster = clustertoRequest[1];
            cluster.send({ payload: "stats" });
            this.executeStats(clusters, start + 1);
        }
    }
    /**
     * Do some before start calculations then start
     */
    preStart() {
        process.nextTick(async () => {
            this.emit("info", "Cluster manager has started");
            if (!this.totalShards) {
                this.totalShards = await this.calculateShards();
            }
            if (this.totalClusters > this.totalShards) {
                console.error(new Error("More clusters open than shards, reducing cluster amount to shard amount"));
                this.totalClusters = this.totalShards;
            }
            if (this.lastShardID === 0)
                this.lastShardID = this.totalShards - 1;
            this.emit("info", `Calculations Complete, Starting ${this.totalShards} Shards Across ${this.totalClusters} Clusters`);
            cluster_1.default.setupMaster({
                silent: false,
            });
            this.start(0);
        });
    }
    /**
     * Loop through all clusters starting from specified cluster and start them
     * @param clusterID Clusters Id
     */
    start(clusterID) {
        if (clusterID === this.totalClusters) {
            this.emit("info", "All clusters have been launched");
            const shards = [];
            for (let i = this.firstShardID; i <= this.lastShardID; i++) {
                shards.push(i);
            }
            const chunkedShards = this.chunk(shards, this.totalClusters);
            chunkedShards.forEach((chunk, clusterID) => {
                const cluster = this.clusters.get(clusterID);
                this.clusters.set(clusterID, Object.assign(cluster, {
                    firstShardID: Math.min(...chunk),
                    lastShardID: Math.max(...chunk),
                }));
            });
            this.connectShards();
        }
        else {
            const worker = cluster_1.default.fork();
            this.clusters.set(clusterID, { workerID: worker.id });
            this.workers.set(worker.id, clusterID);
            this.emit("clusterInfo", {
                shards: [null, null],
                clusterID: clusterID,
                message: "Launching Cluster",
            });
            clusterID += 1;
            this.start(clusterID);
        }
    }
    /**
     * Register Error Handlers
     */
    registerErrorHandlers() {
        process.on('uncaughtException', err => {
            this.emit("error", err.stack);
        });
    }
    /**
     * Register Process Payload Handler
     */
    registerPayloads() {
        cluster_1.default.on('message', async (worker, message) => {
            if (message.payload) {
                const clusterID = this.workers.get(worker.id);
                try {
                    this.payloads[message.payload](message, clusterID);
                }
                catch (err) {
                    this.emit("error", `Failed to execute payload function, may be because not valid payload event | ERR: ${err}`);
                }
            }
        });
    }
    /**
     * Register Other Handlers
     */
    registerHandlers() {
        cluster_1.default.on('disconnect', worker => {
            const clusterID = this.workers.get(worker.id);
            const cluster = this.clusters.get(clusterID);
            this.emit("clusterWarn", {
                clusterID: clusterID,
                shards: [cluster.firstShardID, cluster.lastShardID],
                message: "Cluster Disconnected",
            });
        });
        cluster_1.default.on('exit', (worker, code, signal) => {
            this.restartCluster(worker, code, signal);
        });
        this.queue.on('startShards', (item) => {
            const cluster = this.clusters.get(item.clusterId);
            const value = item.value;
            if (cluster) {
                cluster_1.default.workers[cluster.workerID].send(value);
            }
        });
    }
    /**
     * Launch Yua Sharder :3
     */
    launch() {
        if (cluster_1.default.isMaster) {
            this.registerErrorHandlers();
            this.preStart();
        }
        else if (cluster_1.default.isWorker) {
            const cluster = new Cluster_1.default();
            cluster.spawn();
        }
        this.registerPayloads();
        this.registerHandlers();
    }
    /**
     * Restart a cluster
     * @param worker Worker that exited
     * @param code Exit code
     * @param signal Yeah... idk
     */
    restartCluster(worker, code, signal) {
        const clusterID = this.workers.get(worker.id);
        const cluster = this.clusters.get(clusterID);
        this.emit("clusterWarn", {
            shards: [cluster.firstShardID, cluster.lastShardID],
            clusterID: clusterID,
            message: `Cluster Died, Attempting Restart`,
            code: code,
            signal: signal,
        });
        const shards = cluster.totalShards;
        const newWorker = cluster_1.default.fork();
        this.workers.delete(worker.id);
        this.clusters.set(clusterID, Object.assign(cluster, { workerID: newWorker.id }));
        this.workers.set(newWorker.id, clusterID);
        this.emit("clusterInfo", {
            shards: [cluster.firstShardID, cluster.lastShardID],
            clusterID: clusterID,
            message: `Restarting Cluster`,
        });
        this.queue.queueShards({
            clusterId: clusterID,
            value: {
                clusterId: clusterID,
                totalClusters: this.totalClusters,
                payload: "connect",
                totalShards: shards,
                firstShardID: cluster.firstShardID,
                lastShardID: cluster.lastShardID,
                token: this.token,
                initFile: this.initFile,
                clientOptions: this.clientOptions,
            },
        });
    }
    /**
     * Loops through clusters and queues shards
     */
    connectShards() {
        for (const clusterID in [...Array(this.totalClusters).keys()]) {
            const clusterIDInt = parseInt(clusterID);
            const cluster = this.clusters.get(clusterIDInt);
            if (!cluster.hasOwnProperty('firstShardID'))
                break;
            this.queue.queueShards({
                clusterId: clusterIDInt,
                value: {
                    clusterId: clusterIDInt,
                    totalClusters: this.totalClusters,
                    payload: "connect",
                    firstShardID: cluster.firstShardID,
                    lastShardID: cluster.lastShardID,
                    totalShards: this.totalShards,
                    token: this.token,
                    initFile: this.initFile,
                    clientOptions: this.clientOptions,
                },
            });
        }
        this.emit("info", "All shards spread");
        this.startStats();
    }
    /**
     * Calculate Shards based off of guilds per shard and bot gateway
     * @returns
     */
    async calculateShards() {
        let shards = this.totalShards;
        const result = await this.eris.getBotGateway();
        shards = result.shards;
        if (shards === 1) {
            return Promise.resolve(shards);
        }
        else {
            const guildCount = shards * 1000;
            const guildsPerShard = this.guildsPerShard;
            const shardsDecimal = guildCount / guildsPerShard;
            const finalShards = Math.ceil(shardsDecimal);
            return Promise.resolve(finalShards);
        }
    }
    /**
     * Evenly chunk shards across all clusters
     * @param shards Array of all shards
     * @param totalClusters Total amount of clusters
     * @returns
     */
    chunk(shards, totalClusters) {
        if (totalClusters < 2)
            return [shards];
        const len = shards.length;
        const out = [];
        let i = 0;
        let size;
        if (len % totalClusters === 0) {
            size = Math.floor(len / totalClusters);
            while (i < len) {
                out.push(shards.slice(i, i += size));
            }
        }
        else {
            while (i < len) {
                size = Math.ceil((len - i) / totalClusters--);
                out.push(shards.slice(i, i += size));
            }
        }
        return out;
    }
    /**
     * Broadcast message to all clusters
     * @param start Cluster to start on
     * @param message ...
     */
    broadcast(start, message) {
        const cluster = this.clusters.get(start);
        if (cluster) {
            cluster_1.default.workers[cluster.workerID].send(message);
            this.broadcast(start + 1, message);
        }
    }
    /**
     * Send message to specific cluster
     * @param cluster ...
     * @param message ...
     */
    sendTo(cluster, message) {
        const worker = cluster_1.default.workers[this.clusters.get(cluster).workerID];
        if (worker) {
            worker.send(message);
        }
    }
}
module.exports = ClusterManager;
