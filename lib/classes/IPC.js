"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-explicit-any */
const events_1 = require("events");
class IPC extends events_1.EventEmitter {
    constructor() {
        super();
        //private events: Map<string, { callback: (msg: IPCEvents) => void }> = new Map()
        this._events = new Map();
        this.eventListenerStart();
    }
    /**
     * Register Event Listeners On Process
     * @private
     */
    eventListenerStart() {
        process.on('message', (msg) => {
            const event = this._events.get(msg._eventName);
            if (event) {
                event.forEach((event) => {
                    event.cb(msg);
                });
            }
        });
    }
    /**
     * Register new listener for events passed through IPC
     * @param event Events name
     * @param callback Callback function
     */
    register(event, callback) {
        if (!this._events.get(event))
            this._events.set(event, []);
        const cb = {
            cb: callback,
        };
        const events = this._events.get(event);
        events.push(cb);
        const index = this._events.get(event).indexOf(cb);
        const removeListener = () => {
            this._events.get(event).splice(index, 1);
        };
        return {
            removeListener,
            index,
            eventName: event,
        };
    }
    /**
     * Unregister event listener
     * @param event Events name
     */
    unregister(event, callback) {
        if (typeof event === 'string') {
            if (callback) {
                if (this._events.get(event)) {
                    if (typeof callback === 'number')
                        this._events.get(event).splice(callback, 1);
                    else {
                        const index = this._events.get(event).findIndex(e => e.cb === callback);
                        if (index !== -1)
                            this._events.get(event).splice(index, 1);
                    }
                }
            }
        }
        else {
            if (event.removeListener)
                event.removeListener();
            else {
                if (event.index && event.eventName) {
                    this._events.get(event.eventName).splice(event.index, 1);
                }
            }
        }
    }
    /**
     * Broadcast a message to all clusters
     * @param event Event name
     * @param message Message to send
     */
    broadcast(event, message = {}) {
        process.send({
            payload: "broadcast",
            msg: {
                _eventName: event,
                msg: message,
            },
        });
    }
    /**
     * Broadcast a message to specific cluster
     * @param event Cluster ID
     * @param event Event name
     * @param message Message to send
     */
    sendTo(clusterID, event, message = {}) {
        process.send({
            payload: "sendTo",
            clusterID: clusterID,
            msg: {
                _eventName: event,
                msg: message,
            },
        });
    }
}
exports.default = IPC;
