/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from 'events'
import { IPCEvents } from 'typings/index'

class IPC extends EventEmitter {
  private events: Map<string, { callback: (msg: IPCEvents) => void }> = new Map()
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
      const event = this.events.get(msg._eventName)
      if (event) event.callback(msg)
    })
  }

  /**
   * Register new listener for events passed through IPC
   * @param event Events name
   * @param callback Callback function
   */
  public register(event: string, callback: (msg: IPCEvents) => void): void {
    this.events.set(event, { callback: callback })
  }

  /**
   * Unregister event listener
   * @param event Events name
   */
  public unregister(event: string): void {
    this.events.delete(event)
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
