# YuaSharder

YuaSharder is a clustering and sharding library for [Discord Eris](https://github.com/abalabahaha/eris) written in typescript with typings.

It was written explicitly for [Yua Bot](https://discord.gg/yua) but I decided to open source it as there are not too many good working libraries for sharding and clustering.

## Installation

Node Version: ᵗᵇʰ ᶦᵈᵏ ˡᵐᵃᵒ

```npm
npm install yuasharder
```

## Simple Usage

`index.js`
```js
const { Manager } = require('yuasharder')

const manager = new Manager("Cool-Discord-Token", "/bot.js", {})

manager.launch()
```
`bot.js`
```js
const { Base } = require('yuasharder')

class Bot extends Base {
  constructor(props) {
    super(props)
  }
  init() {
    console.log("Logged in as", this.client.user.username)
  }
}

module.exports = Bot

```
`package.json`
```json
{
  "name": "my-bot",
  "version": "1.0.0",
  "description": "My cool bot",
  "main": "index.js",
  "author": "You silly",
  "license": "ISC",
  "dependencies": {
    "yuasharder": "^1.0.0"
  }
}
```

Start with `node .`

## More Info/Examples

### `yuasharder.Manager(token, file, options)`
|parameter|Type|Default|Description|
|:---  |:---|:---   |:--- |
|`token`|`string`|`undefined`|Bot API Token|
|`file`|`string`|`undefined`|File path relative to root|
|`options`|`ClusterManagerOptions`|`null`|Options passed to manager|
|`options.totalShards`|`number`|`null`|Specifies amount of shards, checks gateway if null|
|`options.totalClusters`|`number`|`node:os.numCPUs()`|Amount fo clusters to spread shards across|
|`options.firstShardID`|`number`|`0`|Shard that yuasharder should start on|
|`options.lastShardID`|`number`|`firstShardID - 1`|Shard that yuasharder should end on|
|`options.clusterTimeout`|`number`|`5`|Timeout between launching each cluster (seconds)|
|`options.statsInterval`|`number`|`60`|Interval between each stats event emitted (seconds)|
|`options.guildsPerShard`|`number`|`1300`|Amount of guilds per shard (`totalShards` must be `null`)|
|`options.clientOptions`|`Eris.ClientOptions`|`{}`|Eris client options to pass to bot|


### Functions
`Manager` *extends* `node:events.EventEmitter`


#### `launch()` `void`
|Parameters|Type|Description|
|:---      |:---|:---       |

> *Launch yuasharder*


#### `broadcast(start, message)` `void`
|Parameters|Type|Description|
|:---      |:---|:---       |
|`start`|`number`|Cluster to start boradcasting from|
|`message`|`IPCEvents`|Message to broadcast|

> *Broadcast message to all clusters*

#### `sendTo(cluster, message)` `void`
|Parameters|Type|Description|
|:---      |:---|:---       |
|`cluster`|`number`|Cluster to send message to|
|`message`|`IPCEvents`|Message to broadcast|
 
> *Send message to specific cluster*

### Events

|Event|Callback |Emits on?| 
|:--- |  :---  |:---     |
|`info`|`string`|General info|
|`error`|`any`|On  error|
|`stats`|`MasterStats`|Stats interval|
|`clusterInfo`|`ClusterMessages`|General cluster info|
|`clusterWarn`|`ClusterMessages`|Something semi dangerous|
|`clusterError`|`ClusterMessages`|On cluster error|
|`shardConnect`|`ShardMessages`|When shard connects|
|`shardDisconnect`|`ShardMessages`|When shard disconnects|
|`shardReady`|`ShardMessages`|When a shard becomes ready|
|`shardResume`|`ShardMessages`|When shard resumes|
|`shardWarn`|`ShardMessages`|Something semi dangerous occurs|
|`shardError`|`ShardMessages`|When shard runs into error|

#### Example Usage

```js
const { Manager } = require('yuasharder')

const manager = new Manager("Cool-Discord-Token", "/bot.js", {
  totalShards: null, // Will Check Gateway For Recommended Shards
  totalClusters: null, // Will Use Number Of Cpus
  firstShardID: null, // Will Use Default
  lastShardID: null, // Will Use Default
  statsInterval: 30, // Every 30 seconds
  guildsPerShard: 1000, // 1000 Guilds Per Shard
  clientOptions: {
    allowedMentions: {
      everyone: false,
    },
  },
})

manager.on('stats', (stats) => {
  console.log(stats)
})

manager.launch()
```

***

### `yuasharder.Base(props)`
*Base should not be constructed as it will not do anything, it should always be extended then exported*

|parameter|Type|Description|
|:---     |:---|:---       |
|`props`|`BaseClassProps`|props given to contructor by yuasharder|
|`props.client`|`Eris.Client`|Clusters eris client instance|
|`options.ipc`|`IPCInterface`|Clusters IPC instance|
|`options.clusterID`|`number`|Cluster instance is located on|

### Props

#### `.client` `Eris.Client`
> Eris client instance

#### `.ipc` `IPCInterface`
> IPC for cluster instance

#### `.clusterID` `number`
> Id of cluster current instance is on

### Functions

#### `init()` `void`
|Parameters|Type|Description|
|:---      |:---|:---       |

> *Used to start code*

#### Example Usage

*It looks like this because yuasharder will create an instance of your bot class extending Base then pass the props shown above to it. It will then run init to start your code*

```js
const { Base } = require('yuasharder')

class Bot extends Base {
  constructor(props) {
    super(props)
  }
  init() {
    const bot = this.client
    const ipc = this.ipc
    const clusterID = this.clusterID
    console.log("Logged in as", bot.user.username, "on cluster", clusterID)
  }
}

module.exports = Bot

```

___

### `IPC`

### Default Events
|Event|Callback |Description| 
|:--- |  :---  |:---     |
|`stats`|`MasterStats`|All stats|

### Functions

#### `register(event, callback)` `void`
|Parameters|Type|Description|
|:---      |:---|:---       |
|`event`|`string`|Events Name|
|`callback`|`(msg: IPCEvents) => void`|Callback function|

> *Register event listener for IPC event*

#### `unregister(event)` `void`
|Parameters|Type|Description|
|:---      |:---|:---       |
|`event`|`string`|Events name|

> *Unregister event listener*

#### `broadcast(event, message)` `void`
|Parameters|Type|Description|
|:---      |:---|:---       |
|`event`|`string`|Events name|
|`message`|`object`|Message to send with event|

> *Broadcast message to all clusters*

#### `sendTo(clusterID, event, message)` `void`
|Parameters|Type|Description|
|:---      |:---|:---       |
|`clusterID`|`number`|Cluster to send to|
|`event`|`string`|Events name|
|`message`|`object`|Message to send with event|

> *Send message to specific cluster*

#### Examples

```js
const { Base } = require('yuasharder')

class Bot extends Base {
  constructor(props) {
    super(props)
  }
  init() {

    this.ipc.register('stats', (stats) => {
      console.log(stats)
    })

  }
}

module.exports = Bot

```

```js
const { Base } = require('yuasharder')

class Bot extends Base {
  constructor(props) {
    super(props)
  }
  init() {

    this.ipc.register('PING', (clusterID) => {
      this.ipc.sendTo(clusterID, "PONG", {
        clusterID: this.clusterID,
        uptime: this.client.uptime
      })
    })

    this.ipc.register('PONG', (msg) => {
      console.log(msg.clusterID, "responded with", msg.uptime, "uptime")
    })

    this.ipc.broadcast("PING")

  }
}

module.exports = Bot

```

## Random Extra
*Just some random extra stuff that may or may not be helpful*
#### Process Event Object
```js
{
  payload: "event",
  msg: {
    ...
  }
}
```
#### IPC Event Object
```js
{
  _eventName: "event",
  msg: {
    ...
  }
}
```

## Issues / Feature Request
Please submit an issue in the issues section and I will try to get back asap

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make be sure to **TEST** all functionality before requesting

## License
[AGPL-3.0](https://choosealicense.com/licenses/agpl-3.0/)