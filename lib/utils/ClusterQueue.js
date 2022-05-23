"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
class ClusterQueue extends events_1.EventEmitter {
    constructor() {
        super();
        this.queue = [];
    }
    /**
     * Attempts to start shards in first cluster in queue if one
     * @returns
     */
    startShards() {
        const cluster = this.queue[0];
        if (!cluster)
            return;
        this.emit("startShards", cluster);
    }
    /**
     * Queues a new cluster of shards and starts it if none are in the queue
     * @param item Cluster info item
     */
    queueShards(item) {
        if (this.queue.length === 0) {
            this.queue.push(item);
            this.startShards();
        }
        else {
            this.queue.push(item);
        }
    }
}
exports.default = ClusterQueue;
