/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import nodeCluster from 'cluster'
import Cluster from './Cluster'
import os from 'os'
const numCPUs = os.cpus().length
import { EventEmitter } from 'events'
import Eris from 'eris'
import Queue from '../utils/ClusterQueue'
import {
  ClusterManagerOptions, ClusterMessages, ClusterQueueObject, ClusterStats, IPCEvents, MasterStats, ProcessEventsPartials, ShardMessages, 
} from 'typings'

class ClusterManager extends EventEmitter {
  private totalShards: number
  private firstShardID: number
  private lastShardID: number
  private totalClusters: number
  private clusterTimeout: number
  private token: string

  private clusters: Map<number, {
    workerID?: number
    lastShardID?: number
    firstShardID?: number
    totalShards?: number
  }>

  private workers: Map<number, number>
  private queue: Queue
  private callbacks: Map<string, number>
  private statsInterval: number
  private initFile: string
  private guildsPerShard: number
  private clientOptions: Eris.ClientOptions
  private stats: MasterStats
  private eris: Eris.Client

  constructor(token: string, initFile: string, options: ClusterManagerOptions) {
    super()

    this.totalShards = options.totalShards || null
    this.firstShardID = options.firstShardID || 0
    this.lastShardID = options.lastShardID || 0
    this.totalClusters = options.totalClusters || numCPUs
    this.clusterTimeout = options.clusterTimeout * 1000 || 5000
    this.token = token || null
    this.clusters = new Map()
    this.workers = new Map()
    this.callbacks = new Map()
    this.queue = new Queue()
    this.statsInterval = options.statsInterval * 1000 || 60 * 1000
    this.initFile = initFile
    this.guildsPerShard = options.guildsPerShard || 1300
    this.clientOptions = options.clientOptions || {}

    this.stats = {
      guilds: 0,
      users: 0,
      ram: 0,
      voice: 0,
      exclusiveGuilds: 0,
      largeGuilds: 0,
      clusters: [],
      clustersCounted: 0,
    }

    if (this.token) {
      this.eris = new Eris.Client(token)
    } else {
      throw new Error("No Token Provided")
    }
  }
  /**
   * Determines if process is master or forked process
   */
  private isMaster(): boolean {
    return nodeCluster.isMaster
  }

  /**
   * Start gettings stats on an interval
   */
  private startStats(): void {
    if (this.statsInterval) {
      setInterval(() => {
        this.stats.guilds = 0
        this.stats.users = 0
        this.stats.ram = 0
        this.stats.clusters = []
        this.stats.voice = 0
        this.stats.exclusiveGuilds = 0
        this.stats.largeGuilds = 0
        this.stats.clustersCounted = 0

        const clusters = Object.entries(nodeCluster.workers)

        this.executeStats(clusters, 0)
      }, this.statsInterval)
    }
  }
  /**
   * Loop through all clusters and request the stats
   * @param clusters All Clusters
   * @param start Cluster to start on
   */
  private executeStats(clusters: [string, nodeCluster.Worker][], start: number): void {
    // @ts-expect-error
    const clustertoRequest = clusters.filter(c => c[1].state === 'online')[start]
    if (clustertoRequest) {
      const cluster: nodeCluster.Worker = clustertoRequest[1]
      cluster.send({ payload: "stats" })
      this.executeStats(clusters, start + 1)
    }
  }

  /**
   * Do some before start calculations then start
   */
  private preStart(): void {
    process.nextTick(async () => {
      this.emit("info", "Cluster manager has started")

      if (!this.totalShards) {
        this.totalShards = await this.calculateShards()
      }

      if (this.totalClusters > this.totalShards) {
        console.error(new Error("More clusters open than shards, reducing cluster amount to shard amount"))
        this.totalClusters = this.totalShards
      }

      if (this.lastShardID === 0) this.lastShardID = this.totalShards - 1

      this.emit("info", `Calculations Complete, Starting ${this.totalShards} Shards Across ${this.totalClusters} Clusters`)

      nodeCluster.setupMaster({
        silent: false,
      })

      this.start(0)
    })
  }

  /**
   * Loop through all clusters starting from specified cluster and start them
   * @param clusterID Clusters Id
   */
  private start(clusterID: number): void {
    if (clusterID === this.totalClusters) {
      this.emit("info", "All clusters have been launched")

      const shards = []

      for (let i = this.firstShardID; i <= this.lastShardID; i++) {
        shards.push(i)
      }

      const chunkedShards = this.chunk(shards, this.totalClusters)

      chunkedShards.forEach((chunk, clusterID) => {
        const cluster = this.clusters.get(clusterID)

        this.clusters.set(clusterID, Object.assign(cluster, {
          firstShardID: Math.min(...chunk),
          lastShardID: Math.max(...chunk),
        }))
      })

      this.connectShards()
    } else {
      const worker = nodeCluster.fork()

      this.clusters.set(clusterID, { workerID: worker.id })
      this.workers.set(worker.id, clusterID)

      this.emit("clusterInfo", {
        shards: [null, null],
        clusterID: clusterID,
        message: "Launching Cluster",
      })

      clusterID += 1
      this.start(clusterID)
    }
  }

  /**
   * Register Error Handlers
   */
  private registerErrorHandlers(): void {
    process.on('uncaughtException', err => {
      this.emit("error", err.stack)
    })
  }

  /**
   * Register Process Payload Handler
   */
  private registerPayloads(): void {
    nodeCluster.on('message', async (worker, message: ProcessEventsPartials) => {
      if (message.payload) {
        const clusterID = this.workers.get(worker.id)

        try {

          this.payloads[message.payload](message, clusterID)

        } catch (err) {

          this.emit("error", `Failed to execute payload function, may be because not valid payload event | ERR: ${err}`)

        }

      }
    })
  }

  /**
   * Register Other Handlers
   */
  private registerHandlers(): void {
    nodeCluster.on('disconnect', worker => {
      const clusterID = this.workers.get(worker.id)
      const cluster = this.clusters.get(clusterID)
      this.emit("clusterWarn", {
        clusterID: clusterID,
        shards: [cluster.firstShardID, cluster.lastShardID],
        message: "Cluster Disconnected",
      })
    })
    nodeCluster.on('exit', (worker, code, signal) => {
      this.restartCluster(worker, code, signal)
    })
    this.queue.on('startShards', (item: ClusterQueueObject) => {
      const cluster = this.clusters.get(item.clusterId)

      const value = item.value

      if (cluster) {
        nodeCluster.workers[cluster.workerID].send(value)
      }
    })
  }

  /**
   * Launch Yua Sharder :3
   */
  public launch(): void {
    if (nodeCluster.isMaster) {
      this.registerErrorHandlers()
      this.preStart()
    } else if (nodeCluster.isWorker) {
      const cluster = new Cluster()
      cluster.spawn()
    }
    this.registerPayloads()
    this.registerHandlers()
  }

  /**
   * Process Payload Events
   */
  private payloads = {
    // Handle Emmiting all log events out of the Manager
    clusterInfo: (message: ProcessEventsPartials): void => {
      const msg: ClusterMessages = message.msg
      this.emit('clusterInfo', msg)
    },
    clusterWarn: (message: ProcessEventsPartials): void => {
      const msg: ClusterMessages = message.msg
      this.emit('clusterWarn', msg)
    },
    clusterError: (message: ProcessEventsPartials): void => {
      const msg: ClusterMessages = message.msg
      this.emit('clusterError', msg)
    },
    shardConnect: (message: ProcessEventsPartials): void => {
      const msg: ShardMessages = message.msg
      this.emit('shardConnect', msg)
    },
    shardDisconnect: (message: ProcessEventsPartials): void => {
      const msg: ShardMessages = message.msg
      this.emit('shardDisconnect', msg)
    },
    shardReady: (message: ProcessEventsPartials): void => {
      const msg: ShardMessages = message.msg
      this.emit('shardReady', msg)
    },
    shardResume: (message: ProcessEventsPartials): void => {
      const msg: ShardMessages = message.msg
      this.emit('shardResume', msg)
    },
    shardWarn: (message: ProcessEventsPartials): void => {
      const msg: ShardMessages = message.msg
      this.emit('shardWarn', msg)
    },
    shardError: (message: ProcessEventsPartials): void => {
      const msg: ShardMessages = message.msg
      this.emit('shardError', msg)
    },
    info: (message: ProcessEventsPartials): void => {
      const msg: string = message.msg
      this.emit('info', msg)
    },
    error: (message: ProcessEventsPartials): void => {
      const msg: any = message.msg
      this.emit('error', msg)
    },
    // Once cluster has started and all shards have started, attempt next cluster
    shardsStarted: (): void => {
      this.queue.queue.splice(0, 1)
      if (this.queue.queue.length > 0) {
        setTimeout(() => this.queue.startShards(), this.clusterTimeout)
      }
    },
    // Handles stats
    stats: (message: ProcessEventsPartials): void => {
      const msg: ClusterStats = message.msg
      this.stats.guilds += msg.guilds
      this.stats.users += msg.users
      this.stats.voice += msg.voice
      this.stats.ram += msg.ram
      this.stats.exclusiveGuilds += msg.exclusiveGuilds
      this.stats.largeGuilds += msg.largeGuilds
      msg.ram = msg.ram / 1000000
      this.stats.clusters.push(msg)
      this.stats.clustersCounted += 1

      if (this.stats.clustersCounted === this.clusters.size) {
        function compare (a: ClusterStats, b: ClusterStats): number {
          if (a.clusterID < b.clusterID)
            return -1
          if (a.clusterID > b.clusterID)
            return 1

          return 0
        }

        this.stats.clusters = this.stats.clusters.sort(compare)

        this.emit("stats", this.stats)
        this.broadcast(0, {
          _eventName: "stats",
          msg: this.stats,
        })
      }
    },
    broadcast: (message: ProcessEventsPartials): void => {
      this.broadcast(0, message.msg)
    },
    sendTo: (message: ProcessEventsPartials): void => {
      this.sendTo(message.clusterID, message.msg)
    },
  }

  /**
   * Restart a cluster
   * @param worker Worker that exited
   * @param code Exit code
   * @param signal Yeah... idk
   */
  private restartCluster(worker: nodeCluster.Worker, code: number, signal: string): void {
    const clusterID = this.workers.get(worker.id)

    const cluster = this.clusters.get(clusterID)

    this.emit("clusterWarn", {
      shards: [cluster.firstShardID, cluster.lastShardID],
      clusterID: clusterID,
      message: `Cluster Died, Attempting Restart`,
      code: code,
      signal: signal,
    })

    const shards = cluster.totalShards

    const newWorker = nodeCluster.fork()

    this.workers.delete(worker.id)

    this.clusters.set(clusterID, Object.assign(cluster, { workerID: newWorker.id }))

    this.workers.set(newWorker.id, clusterID)

    this.emit("clusterInfo", {
      shards: [cluster.firstShardID, cluster.lastShardID],
      clusterID: clusterID,
      message: `Restarting Cluster`,
    })

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
    })
  }
  /**
   * Loops through clusters and queues shards
   */
  private connectShards(): void {
    for (const clusterID in [...Array(this.totalClusters).keys()]) {
      const clusterIDInt = parseInt(clusterID)

      const cluster = this.clusters.get(clusterIDInt)

      if (!cluster.hasOwnProperty('firstShardID')) break

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
      })
    }

    this.emit("info", "All shards spread")

    this.startStats()
  }

  /**
   * Calculate Shards based off of guilds per shard and bot gateway
   * @returns 
   */
  private async calculateShards(): Promise<number> {
    let shards = this.totalShards

    const result = await this.eris.getBotGateway()
    shards = result.shards

    if (shards === 1) {
      return Promise.resolve(shards)
    } else {
      const guildCount = shards * 1000
      const guildsPerShard = this.guildsPerShard
      const shardsDecimal = guildCount / guildsPerShard
      const finalShards = Math.ceil(shardsDecimal)

      return Promise.resolve(finalShards)
    }
  }

  /**
   * Evenly chunk shards across all clusters
   * @param shards Array of all shards
   * @param totalClusters Total amount of clusters 
   * @returns
   */
  private chunk(shards: number[], totalClusters: number): number[][] {
    if (totalClusters < 2) return [shards]

    const len = shards.length
    const out = []
    let i = 0
    let size

    if (len % totalClusters === 0) {
      size = Math.floor(len / totalClusters)

      while (i < len) {
        out.push(shards.slice(i, i += size))
      }
    } else {
      while (i < len) {
        size = Math.ceil((len - i) / totalClusters--)
        out.push(shards.slice(i, i += size))
      }
    }

    return out
  }
  /**
   * Broadcast message to all clusters
   * @param start Cluster to start on
   * @param message ...
   */
  public broadcast(start: number, message: IPCEvents): void {
    const cluster = this.clusters.get(start)
    if (cluster) {
      nodeCluster.workers[cluster.workerID].send(message)
      this.broadcast(start + 1, message)
    }
  }
  /**
   * Send message to specific cluster
   * @param cluster ...
   * @param message ...
   */
  public sendTo(cluster: number, message: IPCEvents): void {
    const worker = nodeCluster.workers[this.clusters.get(cluster).workerID]
    if (worker) {
      worker.send(message)
    }
  }
}

export = ClusterManager
