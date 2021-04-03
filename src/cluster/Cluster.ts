import Eris from 'eris'
import Base from '../classes/Base'
import IPC from '../classes/IPC'
import {
  ProcessConnectPayload,
  ProcessEventsPartials,
  ShardStats, 
} from 'typings/index'

class Cluster {
  public clusterShards = 0
  public totalShards = 0
  public firstShardID = 0
  public lastShardID = 0
  public initFile: string = null
  public clusterID = 0
  public totalClusters = 0
  public clusterGuilds = 0
  public clusterUsers = 0
  public clusterUptime = 0
  public clusterVoiceChannels = 0
  public clusterLargeGuilds = 0
  public clusterExclusiveGuilds = 0
  public shardsStats: ShardStats[] = []
  public application: Base = null
  public client: Eris.Client = null
  public ipc: IPC = null

  constructor() {
    this.ipc = new IPC()
  }

  /**
   * Register the process error handlers
   */
  private registerErrorHandlers(): void {
    process.on('uncaughtException', (err) => {
      process.send({
        payload: 'clusterError',
        msg: {
          shards: [this.firstShardID, this.lastShardID],
          clusterID: this.clusterID,
          message: err,
        }, 
      })
    })
    process.on('unhandledRejection', (reason: Error) => {
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
      })
    })
  }

  /**
   * Register process payloads
   */
  private registerPayloads(): void {
    process.on('message', (msg: ProcessEventsPartials) => {
      if (msg.payload) {
        
        try {
          
          this.payloads[msg.payload](msg)

        } catch (err) {

          process.send({
            payload: 'clusterError',
            msg: {
              shards: [this.firstShardID, this.lastShardID],
              clusterID: this.clusterID,
              message: `Failed to execute payload function, may be because not valid payload event | ERR: ${err}`,
            }, 
          })

        }

      }
    })
  }

  /**
   * Spawn the cluster
   */
  public spawn(): void {
    this.registerErrorHandlers()
    this.registerPayloads()
  }

  /**
   * Connect Client Shards
   */
  private connect(firstShardID: number, lastShardID: number, totalShards: number, token: string, clientOptions: Eris.ClientOptions): void {
    process.send({
      payload: "clusterInfo",
      msg: {
        shards: [this.firstShardID, this.lastShardID],
        clusterID: this.clusterID,
        message: `Connecting with ${this.clusterShards} shard(s)`,
      },
    })

    const options: Eris.ClientOptions = 
      Object.assign(clientOptions, {
        autoreconnect: true,
        firstShardID: firstShardID,
        lastShardID: lastShardID,
        maxShards: totalShards,
      })

    const client = new Eris.Client(token, options)
    this.client = client

    this.registerClientListeners(client)

    client.connect()

  }

  /**
   * Register all client listeners for cluster
   * @param client Client
   */
  private registerClientListeners(client: Eris.Client): void {
    client.on('connect', id => {
      process.send({
        payload: "shardConnect",
        msg: {
          clusterID: this.clusterID,
          message: `Shard established connection`,
          shard: id,
          shards: [this.firstShardID, this.lastShardID],
        },
      })
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
        })
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
        })
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
        })
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
        })
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
        })
      })
      .on('ready', () => {
        process.send({
          payload: "clusterInfo",
          msg: {
            shards: [this.firstShardID, this.lastShardID],
            clusterID: this.clusterID,
            message: `Shards ${this.firstShardID} - ${this.lastShardID} are ready`,
          },
        })
      })
      .once('ready', () => {
        process.send({ payload: "shardsStarted" })
        this.loadCode(client)
        this.startStats(client)
      })
  }

  /**
   * Load the clients code
   * @param client Eris client
   */
  private async loadCode(client: Eris.Client): Promise<void> {
    let rootPath = process.cwd()
    rootPath = rootPath.replace(`\\`, "/")

    const path = `${rootPath}${this.initFile}`
    let application = await import(path)
    if (application.default !== undefined) application = application.default
    if(application.prototype instanceof Base) {
      this.application = new application({
        client: client,
        ipc: this.ipc,
        clusterID: this.clusterID,
      })
      this.application.init()
    } else {
      throw new Error("Please Extends Base Class Of YuaSharder Lib!!")
    }
  }

  /**
   * Start sending stats
   * @param client Eris client
   */
  private startStats(client: Eris.Client): void {
    setInterval(() => {
      this.clusterGuilds = client.guilds.size
      this.clusterUsers = client.users.size
      this.clusterUptime = client.uptime
      this.clusterVoiceChannels = client.voiceConnections.size
      this.clusterLargeGuilds = client.guilds.filter(g => g.large).length
      this.clusterExclusiveGuilds = client.guilds.filter(g => g.members.filter(m => m.bot).length === 1).length
      this.shardsStats = []
      this.client.shards.forEach(shard => {
        this.shardsStats.push({
          shardId: shard.id,
          ready: shard.ready,
          latency: shard.latency,
          status: shard.status,
        })
      })
    }, 1000 * 5)
  }

  /**
   * Payload events from process
   */
  private payloads = {
    /**
     * Connect Payload Handle
     * @param msg Process message
     * @returns 
     */
    connect: (msg: ProcessConnectPayload): void => {
      this.firstShardID = msg.firstShardID
      this.lastShardID = msg.lastShardID
      this.initFile = msg.initFile
      this.clusterID = msg.clusterId
      this.totalClusters = msg.totalClusters
      this.clusterShards = (this.lastShardID - this.firstShardID) + 1
      this.totalShards = msg.totalShards

      if (this.clusterShards < 1) return

      process.send({
        payload: 'clusterInfo',
        msg: {
          shards: [this.firstShardID, this.lastShardID],
          clusterID: this.clusterID,
          message: `Connect IPC Firing`,
        },
      })
      this.connect(msg.firstShardID, msg.lastShardID, this.totalShards, msg.token, msg.clientOptions)
    },
    /**
     * Stats Payload Handle
     */
    stats: (): void => {
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
      })
    },
  }
}

export default Cluster
