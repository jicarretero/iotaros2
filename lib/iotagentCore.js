// const rclnodejs = require('rclnodejs')
const iotAgentLib = require('iotagent-node-lib')
const config = require('./configService')
const async = require('async')
const apply = async.apply
const logger = config.getLogger()

// const errors = require('./errors');

const context = {
  op: 'IoTAgentROS2.Core'
}

function whatever () {
  logger.info('In function whatever')
}

function start (newConfig, callback) {
  config.setLogger(iotAgentLib.logModule)
  config.setConfig(newConfig)

  async.series(
    [apply(whatever, config.getConfig()), apply(iotAgentLib.activate, config.getConfig().iota)],
    function (error, results) {
      if (error) {
        callback(error)
      } else {
        config.getLogger().info(context, 'IoT Agent services activated')
        // initialize(callback)
      }
    }
  )
}

function stop (callback) {
  config.getLogger().info(context, 'Stopping IoT Agent')

  // async.series([sigfoxServer.stop, iotAgentLib.deactivate], callback);
  callback()
}

exports.start = start
exports.stop = stop
