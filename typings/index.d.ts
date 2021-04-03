import Eris from 'eris'
import { EventEmitter } from 'events'

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ClusterQueueObject {
  clusterId: number
  value: {
    payload: "connect"
    clusterId: number
    totalClusters: number
    firstShardID: number
    lastShardID: number
    totalShards: number
    token: string
    initFile: string
    clientOptions: import('eris').ClientOptions
  }
}

export interface IPCEvents {
  _eventName: string
  msg?: any
}

export interface ProcessEventsPartials {
  payload: string
  msg?: any
  [key: string]: any
}

export interface ProcessConnectPayload extends ProcessEventsPartials {
  payload: "connect"
  clusterId: number
  totalClusters: number
  firstShardID: number
  lastShardID: number
  totalShards: number
  token: string
  initFile: string
  clientOptions: import('eris').ClientOptions
}

export interface BaseClassProps {
  client: import('eris').Client
  ipc: import('../src/classes/IPC').default
  clusterID: number
}

export interface MasterStats {
  guilds: number
  users: number
  ram: number
  voice: number
  exclusiveGuilds: number
  largeGuilds: number
  clusters: ClusterStats[]
  clustersCounted: number
}

export interface ClusterStats {
  clusterID: number
  shards: number
  guilds: number
  users: number
  ram: number
  voice: number
  uptime: number
  exclusiveGuilds: number
  largeGuilds: number
  shardsStats: ShardStats[]
}

export interface ShardStats {
  shardId: number
  ready: boolean
  latency: number
  status: string
}

export interface IPCInterface {
  register(event: string, callback: (msg: IPCEvents) => void): void
  unregister(event: string): void
  broadcast(event: string, message: { [key: string]: any }): void
  sendTo(clusterID: number, event: string, message: { [key: string]: any }): void
}

export interface ClusterManagerOptions {
  totalShards?: number
  totalClusters?: number
  firstShardID?: number
  lastShardID?: number
  clusterTimeout?: number
  statsInterval?: number
  guildsPerShard?: number
  clientOptions?: Eris.ClientOptions
}

export interface ClusterMessages {
  clusterID: number
  message: string
  shards: number[]
  [key: string]: any
}

export interface ClusterError extends ClusterMessages {
  promise: Promise<any>
  reason: unknown
}

export interface ShardMessages {
  clusterID: number
  message: string
  shard: number
  shards: number[]
  [key: string]: any
}

export interface ManagerEvents {
  stats: [MasterStats]
  clusterInfo: [ClusterMessages]
  clusterWarn: [ClusterMessages]
  clusterError: [ClusterMessages]
  shardConnect: [ShardMessages]
  shardDisconnect: [ShardMessages]
  shardReady: [ShardMessages]
  shardResume: [ShardMessages]
  shardWarn: [ShardMessages]
  shardError: [ShardMessages]
  info: [string]
  error: [any]
}

declare module 'yuasharder' {

  export class Base {
    client: import('eris').Client
    ipc: IPCInterface
    clusterID: number
    constructor(props: BaseClassProps)
    public init(): void
  }

  export class Manager extends EventEmitter {
    constructor(token: string, file: string, options: ClusterManagerOptions)
    public launch(): void
    public broadcast(start: number, message: IPCEvents): void
    public sendTo(cluster: number, message: IPCEvents): void
    public on<K extends keyof ManagerEvents>(event: K, listener: (...args: ManagerEvents[K]) => void): this
    public on<S extends string | symbol>(
      event: Exclude<S, keyof ManagerEvents>,
      listener: (...args: any[]) => void, 
    ): this
    public once<K extends keyof ManagerEvents>(event: K, listener: (...args: ManagerEvents[K]) => void): this
    public once<S extends string | symbol>(
      event: Exclude<S, keyof ManagerEvents>,
      listener: (...args: any[]) => void, 
    ): this
    public emit<K extends keyof ManagerEvents>(event: K, listener: (...args: ManagerEvents[K]) => void): boolean
    public emit<S extends string | symbol>(
      event: Exclude<S, keyof ManagerEvents>,
      listener: (...args: any[]) => void, 
    ): boolean
  }

}
