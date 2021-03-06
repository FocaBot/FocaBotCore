require('colors')
const Discord = require('discord.js')
const util = require('util')
const moment = require('moment')
const CommandManager = require('./commands')
const GuildManager = require('./guilds')
const ModuleManager = require('./modules')
const PermissionsManager = require('./permissions')
const { GunDataStore, RedisDataStore } = require('./data')
const SettingsManager = require('./settings')
const AudioPlayer = require('./audioPlayer')
const LocaleManager = require('./locales')
const pkg = require('../package.json')
const EventEmitter = require('events').EventEmitter

/**
 * The mother of all seals.
 */
class Azarasi {
  /**
   * Instantiates a new Bot.
   * @param {object} properties - The properties object.
   * @param {string} properties.prefix - Default bot prefix (REQUIRED)
   * @param {string} properties.token - Bot token (REQUIRED)
   * @param {boolean} properties.selfBot - Defines this bot as a selfbot
   * @param {string} properties.publicPrefix - Public Prefix (SelfBots only)
   * @param {string[]} properties.owner - Bot owner user IDs
   * @param {string[]} properties.admins - Global admin user IDs
   * @param {string[]} properties.adminRoles - Admin role names
   * @param {string[]} properties.djRoles - "DJ" role names
   * @param {string[]} properties.blacklist - Blacklisted User IDs
   * @param {string} properties.modulePath - Path to load modules from
   * @param {string} properties.ffmpegBin - Path to the FFMPEG binary (will use the global PATH if not set)
   * @param {string} properties.dbFile - Database file.
   * @param {string} properties.dbPort - Database port.
   * @param {boolean} properties.redis - Enable to use Redis as data store instead of Gun
   * @param {string} properties.redisURL - URL of the redis database (only required in Redis mode)
   * @param {boolean} properties.debug - True to enable debug mode
   * @param {boolean} properties.watch - True to enable automatic hot-reloading of modules
   * @param {string} properties.localePath - Path to load locales from
   * @param {string} properties.locale - Default locale
   */
  constructor (properties) {
    global.Core = this
    /** The properties object */
    this.properties = properties
    // Some checks
    if (!this.properties) throw new Error('No properties object.')
    if (!this.properties.prefix) throw new Error('No prefix set.')
    if (!this.properties.token) throw new Error('Missing bot token.')
    /** The Discord.js Client */
    this.bot = new Discord.Client()
    /**
     * The data store
     */
    this.data = this.properties.redis ? new RedisDataStore() : new GunDataStore()
    /**
     * The guild manager
     * @type {GuildManager}
     */
    this.guilds = new GuildManager()
    /**
     * The permissions manager
     * @type {PermissionsManager}
     */
    this.permissions = new PermissionsManager()
    /**
     * The command manager
     * @type {CommandManager}
     */
    this.commands = new CommandManager()
    /**
     * The module manager
     * @type {ModuleManager}
     */
    this.modules = new ModuleManager()
    /**
     * The locale manager
     * @type {LocaleManager}
     */
    this.locales = new LocaleManager()
    /**
     * The settings manager
     * @type {SettingsManager}
     */
    this.settings = new SettingsManager()
    /**
     * Sharding client
     * @type {Discord.ShardClientUtil}
     */
    this.shard = this.bot.shard || { }
    /**
     * Main Event Emitter
     */
    this.events = new EventEmitter()
    this.events.setMaxListeners(1000)

    /**
     * Is the bot ready?
     */
    this.ready = false

    this.AudioPlayer = AudioPlayer

    this.bot.on('ready', () => {
      this.log(`Connected! (${this.bot.user.username}#${this.bot.user.discriminator}).`)
      this.ready = true
      if (this.properties.selfBot) {
        this.permissions.owner.push(this.bot.user.id)
      }
    })
    this.bot.on('message', msg => this.processMessage(msg))
    this.bot.on('debug', m => this.log(m, 1))
    this.bot.on('error', e => {
      this.log('Something went wrong:', 2)
      this.log(e, 2)
      process.exit()
    })

    // hacks
    if (Core.properties.ffmpegBin) {
      require('prism-media/src/transcoders/ffmpeg/Ffmpeg').selectFfmpegCommand = () => {
        return Core.properties.ffmpegBin
      }
    }

    this.bootDate = moment()
    this.version = pkg.version
  }

  /**
   * Establishes connection with discord.
   */
  establishConnection () {
    this.bot.login(this.properties.token)
  }

  /**
   * Processes messages.
   * @param {object} msg - Discord.js message object
   */
  processMessage (msg) {
    // Check if the user isn't in the blacklist
    if (this.properties.blacklist && this.properties.blacklist.indexOf(msg.author.id) >= 0) {
      return
    }
    this.commands.processMessage(msg)
  }

  /**
   * Logs stuff to the console.
   * @param {number} type - 0 for important stuff, 1 for debug info, 2 for errors.
   */
  log (message, type = 0) {
    // Avoid useless logs when debug mode is disabled.
    if (type === 1 && !this.properties.debug) return
    const msg = (typeof message === 'string') ? message : util.inspect(message)

    const t = moment()
    const i = (this.shard.id || 0).toString()
    let prefix = `[${t.format('YY/MM/DD@').dim.cyan}${t.format('HH:mm').cyan} ${i.yellow}]`

    if (type >= 2) {
      prefix = `[${t.format('YY/MM/DD@').dim.red}${t.format('HH:mm').red} ${i.yellow}]`
      process.stderr.write(`${prefix} ${msg}\n`, 'utf8')
    } else {
      process.stdout.write(`${prefix} ${type === 1 ? msg.gray : msg}\n`, 'utf8')
    }
  }
}

module.exports = Azarasi
