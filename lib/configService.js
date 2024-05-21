let config = {}
let logger = require('logops')

function anyIsSet (variableSet) {
  for (let i = 0; i < variableSet.length; i++) {
    if (process.env[variableSet[i]]) {
      return true
    }
  }

  return false
}

// TODO - Remove this function
function processEnvironmentVariables () {
  const environmentVariables = ['IOTA_MODBUS_PORT']
  const modbusVariables = ['IOTA_MODBUS_PORT']

  for (let i = 0; i < environmentVariables.length; i++) {
    if (process.env[environmentVariables[i]]) {
      logger.info(
        'Setting %s to environment value: %s',
        environmentVariables[i],
        process.env[environmentVariables[i]]
      )
    }
  }
  if (anyIsSet(modbusVariables)) {
    config.modbus = {}
  }

  if (process.env.IOTA_SIGFOX_PORT) {
    config.modbus.port = process.env.IOTA_MODBUS_PORT
  }
}

function setConfig (newConfig) {
  config = newConfig

  processEnvironmentVariables()
}

function getConfig () {
  return config
}

function setLogger (newLogger) {
  logger = newLogger
}

function getLogger () {
  return logger
}

exports.setConfig = setConfig
exports.getConfig = getConfig
exports.setLogger = setLogger
exports.getLogger = getLogger
