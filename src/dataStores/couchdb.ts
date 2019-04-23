import { IDataStore, SubscriptionHandler, DataSubscription } from '.'
import { EventEmitter } from 'events'
import { Azarasi } from '..'
import * as Nano from 'nano'

/**
 * [CouchDB](http://couchdb.apache.org/) data store.
 */
export class CouchDataStore implements IDataStore {
  /**
   * Nano server scope
   * @hidden
   */
  private nano : Nano.ServerScope
  /**
   * Database scope
   * @hidden
   */
  private db : Nano.DocumentScope<DataStructure>
  /**
   * Follow feed
   * @hidden
   */
  private feed! : EventEmitter
  /**
   * Azarasi instance
   * @hidden
   */
  private readonly az : Azarasi
  /**
   * Data Subscriptions
   * @hidden
   */
  private subscriptions : DataSubscription[] = []
  /**
   * Internal event emitter
   * @hidden
   */
  private _emitter : EventEmitter = new EventEmitter()

  connected : boolean = false
  ready : boolean = false

  /**
   * Instantiate new Redis Data Store
   * @param az - Azarasi instance
   * @hidden
   */
  constructor (az : Azarasi) {
    this.az = az
    // Server Scope
    this.nano = Nano.default({
      url: this.az.properties.couchdbUrl || 'http://127.0.0.1:5984',
      log (id, args) {
        az.logDebug(id, args)
      }
    })
    // Document scope
    this.db = this.nano.db.use(this.az.properties.couchdbDatabase || 'azarasi')
  }

  async connect () {
    try {
      // Check if database exists
      const dbInfo = this.nano.db.get(this.az.properties.couchdbDatabase || 'azarasi')
    } catch (e) {
      if (e.statusCode === 404) {
        // Create database
        this.nano.db.create(this.az.properties.couchdbDatabase || 'azarasi')
      } else {
        throw e
      }
    }
    // Connect to change feed
    this.feed = this.nano.followUpdates({
      db: this.az.properties.couchdbDatabase || 'azarasi',
      since: 'now',
      include_docs: true
    })
    this.feed.on('change', change => {
      this.az.logDebug('DB Change:', change)
      const doc = change.doc as DataStructure
      this.subscriptions
        .filter(s => s.key === doc._id)
        .forEach(s => s.handler(doc.val))
    })
    //@ts-ignore
    this.feed.follow()
  }

  ensureReady () {
    if (this.ready) return Promise.resolve()
    return new Promise(resolve => this._emitter.once('connected', () => resolve()))
  }

  async get (key : string, raw=false) {
    await this.ensureReady()
    try {
      const doc = await this.db.get(key)
      return raw ? doc : doc.val
    } catch (e) {
      return raw ? { val: null } : null
    }
  }

  async set (key : string, val : any) {
    await this.ensureReady()
    const orig = await this.get(key, true)
    await this.db.insert({ ...orig, val })
    return 'OK'
  }

  async del (key : string) {
    const orig = await this.get(key, true)
    await this.db.destroy(key, orig._rev)
    return 'OK'
  }

  async subscribe (key : string, handler : SubscriptionHandler) : Promise<DataSubscription> {
    await this.ensureReady()
    const sub = new DataSubscription(key, handler)
    sub.off = () => this.subscriptions.splice(this.subscriptions.indexOf(sub, 1))
    this.subscriptions.push(sub)
    return sub
  }
}

export interface DataStructure {
  _id : string
  _rev : string
  val : any
}
