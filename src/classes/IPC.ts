/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from 'events'
import { IPCEvents } from 'typings/index'

export interface IPCEvent {
  isSingleUse?: boolean
  cb: ((msg: IPCEvents) => void)
}

export interface IPCEventListener {
  removeListener: (() => void)
  index: number
  eventName: string
}

class IPC extends EventEmitter {
  //private events: Map<string, { callback: (msg: IPCEvents) => void }> = new Map()
  private _events = new Map<string,IPCEvent[]>()
  constructor() {
    super()
    this.eventListenerStart()
  }

  /**
   * Register Event Listeners On Process
   * @private
   */
  private eventListenerStart(): void {
    process.on('message', (msg: IPCEvents) => {
      const event = this._events.get(msg._eventName)
      if (event) {
        event.forEach((event) => {
          event.cb(msg)
        })
      }
    })
  }
  /**
   * Register new listener for events passed through IPC
   * @param event Events name
   * @param callback Callback function
   */
  public register(event: string, callback: (msg: IPCEvents) => void): IPCEventListener {
    if (!this._events.get(event)) this._events.set(event, [])
    const cb: IPCEvent = {
      cb: callback,
    }

    const events = this._events.get(event)
    events.push(cb)
    const index = this._events.get(event).indexOf(cb)

    const removeListener = (): void => {
      this._events.get(event).splice(index, 1)
    }

    return {
      removeListener,
      index,
      eventName: event,
    }
  }

  /**
   * Unregister event listener
   * @param event Events name
   */
  public unregister(event: IPCEventListener | string, callback?: ((msg: IPCEvents) => void | number) | number): void {
    if (typeof event === 'string') {
      if (callback) {
        if (this._events.get(event)) {
          if (typeof callback === 'number') this._events.get(event).splice(callback, 1)
          else {
            const index = this._events.get(event).findIndex(e => e.cb === callback)
            if (index !== -1) this._events.get(event).splice(index, 1)
          }
        }
      }
    } else {
      if (event.removeListener) event.removeListener()
      else {
        if (event.index && event.eventName) {
          this._events.get(event.eventName).splice(event.index, 1)
        }
      }
    }
  }

  /**
   * Broadcast a message to all clusters
   * @param event Event name
   * @param message Message to send
   */
  public broadcast(event: string, message: any = {}): void {
    process.send({
      payload: "broadcast",
      msg: {
        _eventName: event,
        msg: message,
      },
    })
  }
  /**
   * Broadcast a message to specific cluster
   * @param event Cluster ID
   * @param event Event name
   * @param message Message to send
   */
  public sendTo(clusterID: number, event: string, message: any = {}): void {
    process.send({
      payload: "sendTo",
      clusterID: clusterID,
      msg: {
        _eventName: event,
        msg: message,
      },
    })
  }
}

export default IPC
