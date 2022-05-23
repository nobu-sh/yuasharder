"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const eris_1 = __importDefault(require("eris"));
const Base_1 = __importDefault(require("../classes/Base"));
const IPC_1 = __importDefault(require("../classes/IPC"));
class Cluster {
    constructor() {
        this.clusterShards = 0;
        this.totalShards = 0;
        this.firstShardID = 0;
        this.lastShardID = 0;
        this.initFile = null;
        this.clusterID = 0;
        this.totalClusters = 0;
        this.clusterGuilds = 0;
        this.clusterUsers = 0;
        this.clusterUptime = 0;
        this.clusterVoiceChannels = 0;
        this.clusterLargeGuilds = 0;
        this.clusterExclusiveGuilds = 0;
        this.shardsStats = [];
        this.application = null;
        this.client = null;
        this.ipc = null;
        /**
         * Payload events from process
         */
        this.payloads = {
            /**
             * Connect Payload Handle
             * @param msg Process message
             * @returns
             */
            connect: (msg) => {
                this.firstShardID = msg.firstShardID;
                this.lastShardID = msg.lastShardID;
                this.initFile = msg.initFile;
                this.clusterID = msg.clusterId;
                this.totalClusters = msg.totalClusters;
                this.clusterShards = (this.lastShardID - this.firstShardID) + 1;
                this.totalShards = msg.totalShards;
                if (this.clusterShards < 1)
                    return;
                process.send({
                    payload: 'clusterInfo',
                    msg: {
                        shards: [this.firstShardID, this.lastShardID],
                        clusterID: this.clusterID,
                        message: `Connect IPC Firing`,
                    },
                });
                this.connect(msg.firstShardID, msg.lastShardID, this.totalShards, msg.token, msg.clientOptions);
            },
            /**
             * Stats Payload Handle
             */
            stats: () => {
                process.send({
                    payload: "stats",
                    msg: {
                        clusterID: this.clusterID,
                        guilds: this.clusterGuilds,
                        users: this.clusterUsers,
                        uptime: this.clusterUptime,
                        ram: process.memoryUsage().rss,
                        shards: this.clusterShards,
                        exclusiveGuilds: this.clusterExclusiveGuilds,
                        largeGuilds: this.clusterLargeGuilds,
                        voice: this.clusterVoiceChannels,
                        shardStats: this.shardsStats,
                    },
                });
            },
        };
        this.ipc = new IPC_1.default();
    }
    /**
     * Register the process error handlers
     */
    registerErrorHandlers() {
        process.on('uncaughtException', (err) => {
            process.send({
                payload: 'clusterError',
                msg: {
                    shards: [this.firstShardID, this.lastShardID],
                    clusterID: this.clusterID,
                    message: err,
                },
            });
        });
        process.on('unhandledRejection', (reason) => {
            process.send({
                payload: 'clusterError',
                msg: {
                    shards: [this.firstShardID, this.lastShardID],
                    clusterID: this.clusterID,
                    message: `Unhandled rejection`,
                    error: {
                        name: reason.name,
                        message: reason.message,
                        stack: reason.stack,
                    },
                },
            });
        });
    }
    /**
     * Register process payloads
     */
    registerPayloads() {
        process.on('message', (msg) => {
            if (msg.payload) {
                try {
                    this.payloads[msg.payload](msg);
                }
                catch (err) {
                    process.send({
                        payload: 'clusterError',
                        msg: {
                            shards: [this.firstShardID, this.lastShardID],
                            clusterID: this.clusterID,
                            message: `Failed to execute payload function, may be because not valid payload event | ERR: ${err}`,
                        },
                    });
                }
            }
        });
    }
    /**
     * Spawn the cluster
     */
    spawn() {
        this.registerErrorHandlers();
        this.registerPayloads();
    }
    /**
     * Connect Client Shards
     */
    connect(firstShardID, lastShardID, totalShards, token, clientOptions) {
        process.send({
            payload: "clusterInfo",
            msg: {
                shards: [this.firstShardID, this.lastShardID],
                clusterID: this.clusterID,
                message: `Connecting with ${this.clusterShards} shard(s)`,
            },
        });
        const options = Object.assign(clientOptions, {
            autoreconnect: true,
            firstShardID: firstShardID,
            lastShardID: lastShardID,
            maxShards: totalShards,
        });
        const client = new eris_1.default.Client(token, options);
        this.client = client;
        this.registerClientListeners(client);
        client.connect();
    }
    /**
     * Register all client listeners for cluster
     * @param client Client
     */
    registerClientListeners(client) {
        client.on('connect', id => {
            process.send({
                payload: "shardConnect",
                msg: {
                    clusterID: this.clusterID,
                    message: `Shard established connection`,
                    shard: id,
                    shards: [this.firstShardID, this.lastShardID],
                },
            });
        })
            .on('shardDisconnect', (err, id) => {
            process.send({
                payload: "shardDisconnect",
                msg: {
                    clusterID: this.clusterID,
                    message: err,
                    shard: id,
                    shards: [this.firstShardID, this.lastShardID],
                },
            });
        })
            .on('shardReady', id => {
            process.send({
                payload: "shardReady",
                msg: {
                    clusterID: this.clusterID,
                    message: `Shard is ready`,
                    shard: id,
                    shards: [this.firstShardID, this.lastShardID],
                },
            });
        })
            .on('shardResume', id => {
            process.send({
                payload: "shardResume",
                msg: {
                    clusterID: this.clusterID,
                    message: `Shard has resumed`,
                    shard: id,
                    shards: [this.firstShardID, this.lastShardID],
                },
            });
        })
            .on('warn', (message, id) => {
            process.send({
                payload: "shardWarn",
                msg: {
                    clusterID: this.clusterID,
                    message: message,
                    shard: id,
                    shards: [this.firstShardID, this.lastShardID],
                },
            });
        })
            .on('error', (err, id) => {
            process.send({
                payload: "shardError",
                msg: {
                    clusterID: this.clusterID,
                    message: err,
                    shard: id,
                    shards: [this.firstShardID, this.lastShardID],
                },
            });
        })
            .on('ready', () => {
            process.send({
                payload: "clusterInfo",
                msg: {
                    shards: [this.firstShardID, this.lastShardID],
                    clusterID: this.clusterID,
                    message: `Shards ${this.firstShardID} - ${this.lastShardID} are ready`,
                },
            });
        })
            .once('ready', () => {
            process.send({ payload: "shardsStarted" });
            this.loadCode(client);
            this.startStats(client);
        });
    }
    /**
     * Load the clients code
     * @param client Eris client
     */
    async loadCode(client) {
        let rootPath = process.cwd();
        rootPath = rootPath.replace(`\\`, "/");
        const path = `${rootPath}${this.initFile}`;
        let application = await Promise.resolve().then(() => __importStar(require(path)));
        if (application.default !== undefined)
            application = application.default;
        if (application.prototype instanceof Base_1.default) {
            this.application = new application({
                client: client,
                ipc: this.ipc,
                clusterID: this.clusterID,
            });
            this.application.init();
        }
        else {
            throw new Error("Please Extends Base Class Of YuaSharder Lib!!");
        }
    }
    /**
     * Start sending stats
     * @param client Eris client
     */
    startStats(client) {
        setInterval(() => {
            this.clusterGuilds = client.guilds.size;
            this.clusterUsers = client.users.size;
            this.clusterUptime = client.uptime;
            this.clusterVoiceChannels = client.voiceConnections.size;
            this.clusterLargeGuilds = client.guilds.filter(g => g.large).length;
            this.clusterExclusiveGuilds = client.guilds.filter(g => g.members.filter(m => m.bot).length === 1).length;
            this.shardsStats = [];
            this.client.shards.forEach(shard => {
                this.shardsStats.push({
                    shardId: shard.id,
                    ready: shard.ready,
                    latency: shard.latency,
                    status: shard.status,
                });
            });
        }, 1000 * 5);
    }
}
exports.default = Cluster;
