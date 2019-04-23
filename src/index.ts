import Discord from 'discord.js'
import util from 'util'
import moment, { Moment } from 'moment'
import pkg from '../package.json'
import EventEmitter from 'events'
import c from 'chalk'

import { IDataStore } from './dataStores'
import GetDataStore from './data'
import { GuildManager } from './guilds'
import { ModuleManager } from './moduleManager'
import { Module } from './module'
import { PermissionHelper } from './permissions'
import { Command } from './command'
import { CommandManager } from './commandManager'
import { LocaleManager, Locale } from './locales'
import { SettingsManager } from './settings'

/**
 * The mother of all seals
 */
export class Azarasi {
  /** Is the bot ready? */
  ready : boolean = false
  /** Properties for this instance */
  properties : BotProperties
  /** Discord.js client */
  client : Discord.Client
  /** Shard manager client */
  shard? : Discord.ShardClientUtil
  /** Main Event Emitter */
  events : EventEmitter
  /** Boot date (to calculate uptime) */
  bootDate : Moment
  /** Azarasi framework version */
  version : string

  /** The persistent data store */
  data : IDataStore
  /** Persistent data manager for guilds */
  guilds : GuildManager
  /** Permissions helper */
  permissions : PermissionHelper
  /** The command manager */
  commands : CommandManager
  /** The module manager */
  modules : ModuleManager
  /** The localization manager */
  locales : LocaleManager
  /** Guild settings manager */
  settings : SettingsManager

  static Command = Command
  static Module = Module
  static Locale = Locale

  constructor (properties : BotProperties) {
    this.properties = properties
    // Checks
    if (!properties.token) throw new Error('You must specify a bot token!')

    this.client = new Discord.Client()
    this.shard = this.client.shard
    this.data = GetDataStore(this)
    this.events = new EventEmitter()
    this.events.setMaxListeners(1024)

    this.guilds = new GuildManager(this)
    this.permissions = new PermissionHelper(this)
    this.commands = new CommandManager(this)
    this.modules = new ModuleManager(this)
    this.locales = new LocaleManager(this)
    this.settings = new SettingsManager(this)

    this.client.on('ready', () => {
      this.log(`Connected! (${this.client.user.username}#${this.client.user.discriminator}).`)
      this.ready = true
      if (this.properties.selfBot) {
        this.permissions.owner.push(this.client.user.id)
      }
      this.events.emit('ready')
    })
    this.client.on('message', msg => this.processMessage(msg))
    this.client.on('debug', m => this.logDebug(m))
    this.client.on('error', e => {
      this.logError('Something went wrong:')
      this.logError(e)
      process.exit(1)
    })
    this.bootDate = moment()
    this.version = pkg.version
  }

  /**
   * Establishes connection with Discord.
   */
  establishConnection () {
    this.client.login(this.properties.token)
  }

  /**
   * Processes messages.
   * @param msg - Discord.js message object
   */
  processMessage (msg : Discord.Message) {
    if (this.properties.blacklist && this.properties.blacklist.indexOf(msg.author.id) >= 0) {
      return // blacklisted user
    }
    this.commands.processMessage(msg)
  }

  /**
   * Logs stuff to the console with timestamp and shard id
   */
  log (...args : any[]) {
    const time = moment()
    const shard = this.shard && this.shard.id || 0
    const prefix = `[${c.dim.cyan(time.format('YYYY-MM-DD@'))}${c.cyan(time.format('HH:mm'))} ${c.yellow(shard.toString())}]`

    const msg = args.map(a => (typeof a === 'string' ? a : util.inspect(a)))
    msg.unshift(prefix)

    if (this.shard && this.properties.logToMaster) {
      this.shard.send({ event: 'az.log', payload: { kind: 'log', message: msg.join(' ') }})
    } else {
      console.log(msg.join(' '))
    }
  }

  /**
   * Logs an error to the console with timestamp and shard id
   */
  logError (...args : any[]) {
    const time = moment()
    const shard = this.shard && this.shard.id || 0
    const prefix = `[${c.dim.red(time.format('YYYY-MM-DD@'))}${c.red(time.format('HH:mm'))} ${c.yellow(shard.toString())}]`

    const msg = args.map(a => (typeof a === 'string' ? a : util.inspect(a)))
    msg.unshift(prefix)

    if (this.shard && this.properties.logToMaster) {
      this.shard.send({ event: 'az.log', payload: { kind: 'error', message: msg.join(' ') }})
    } else {
      console.error(msg.join(' '))
    }
  }

  /**
   * Logs information to the console (only in debug mode)
   */
  logDebug (...args : any[]) {
    if (!this.properties.debug) return

    const time = moment()
    const shard = this.shard && this.shard.id || 0
    const prefix = `[${c.dim.cyan(time.format('YYYY-MM-DD@'))}${c.cyan(time.format('HH:mm'))} ${c.yellow(shard.toString())}]`

    const msg = args.map(a => c.gray(typeof a === 'string' ? a : util.inspect(a)))
    msg.unshift(prefix)

    if (this.shard && this.properties.logToMaster) {
      this.shard.send({ event: 'az.log', payload: { kind: 'debug', message: msg.join(' ') }})
    } else {
      console.info(msg.join(' '))
    }
  }
}

/** Global properties for the bot */
export interface BotProperties {
  /** Bot token */
  token : string
  /** Default command prefix */
  prefix? : string
  /** Defines this bot as a selfbot */
  selfBot? : boolean
  /** Public prefix (selfbots only) */
  publicPrefix? : string
  /** Bot owners (user IDs) */
  owner? : string[]
  /** Global admins (user IDs) */
  admins? : string[]
  /** Admin role names */
  adminRoles? : string[]
  /** DJ role names */
  djRoles? : string[]
  /** Blaclisted user IDs */
  blacklist? : string[]
  /** Path to load modules from */
  modulePath? : string
  /**
   * Database backend
   * 
   * You can choose between [Redis](https://redis.io/), [Gun](http://gun.js.org/) and
   * temporary in-memory storage
   */
  dataStore? : 'redis' | 'couchdb' | 'gun' | 'memory'
  /** Database path (Gun backend only) */
  dbPath? : string
  /** Database port (Gun backend only) */
  dbPort? : number
  /** Database URL (Redis backend only) */
  redisUrl? : string
  /** Database server URL (CouchDB backend only) */
  couchdbUrl? : string
  /** Database name (CouchDB backend only) */
  couchdbDatabase? : string
  /** Debug mode (verbose logging) */
  debug? : boolean
  /** Watch module directory for changes */
  watch? : boolean
  /** Path to load translations from */
  localePath? : string
  /** Default locale */
  locale? : string
  /** Log to master process instead of console in sharded setups */
  logToMaster? : boolean
}

export { Command, CommandContext } from './command'
export { Locale } from './locales'
export { Module } from './module'
