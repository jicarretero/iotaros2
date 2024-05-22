#!/usr/bin/env node

const info = require('../package.json')
const iotAgentLib = require('iotagent-node-lib')
const iotAgent = require('../lib/iotagentCore')
const config = require('../lib/configService')
const configJS = require('../config.js')
const loop = require("../lib/ros2Bindings.js")
const ros = require("../lib/ros2Bindings.js")
const request = require('request')
console.log('After the config... what?')
const logger = config.getLogger()

const context = {
    op: 'IoTAgentRos2.Executable'
}

iota_conf = {}
ros2_system_conf = {}

/*
*
*  Code Section for STEP 1: Initialize the app and Activate the Agent
*
*/
function readConfigurationParams() {
    // Read IoTA Service Configuration
    iota_conf["server_host"] = configJS.iota.server.host;
    iota_conf["server_port"] = configJS.iota.server.port;
    if (iota_conf["server_host"] == undefined) {
        iota_conf["server_host"] = "127.0.0.1"
    }
    iota_conf["cbroker_host"] = configJS.iota.contextBroker.host;
    iota_conf["cbroker_port"] = configJS.iota.contextBroker.port;
    iota_conf["default_type"] = configJS.iota.defaultType;
    iota_conf["default_key"] = configJS.iota.defaultKey;
    iota_conf["default_resource"] = configJS.iota.defaultResource;
    
    // Read ROS 2 System Configuration
    ros2_system_conf["id"]= configJS.ros_2.system.iota_id;
    ros2_system_conf["type"]= configJS.ros_2.system.ngsiv2_type;
    ros2_system_conf["name"]= configJS.ros_2.system.ngsiv2_id;
    ros2_system_conf["service"]= configJS.ros_2.system.service;
    ros2_system_conf["subservice"]= configJS.ros_2.system.subservice;
    ros2_system_conf["attributes"] = configJS.ros_2.system.ngsiv2_active_attrs;
    ros2_system_conf["lazy_attrs"] = configJS.ros_2.system.ngsiv2_lazy_attrs;
    ros2_system_conf["commands"] = configJS.ros_2.system.ngsiv2_commands;
    ros2_system_conf["subscribers"] = configJS.ros_2.subscribers;
  
    console.log('------------------- readConfigurationParams ------------')
    console.log(iota_conf)
    console.log(ros2_system_conf)
}


function activateIoTAgent(){
    // iotAgentLib.activate(config.getConfig().iota, function (error) {
    iotAgentLib.activate(configJS.iota, function (error) {
      if (error) {
          console.log("There was an error activating the IOTA");
          process.exit(1);
      } else {
          console.log("The IOTA started successfully!!");
          iotAgentLib.setDataQueryHandler(queryContextHandler);
          iotAgentLib.setCommandHandler(commandHandler);
          iotAgentLib.setProvisioningHandler(deviceProvisioningHandler); // No need here to set another one.
          // iotAgentLib.setConfigurationHandler(configurationHandler); // No need here to set this one.
          iotAgentLib.setDataUpdateHandler(updateHandler);

          iotAgentLib.addUpdateMiddleware(iotAgentLib.dataPlugins.attributeAlias.update);
          iotAgentLib.addUpdateMiddleware(iotAgentLib.dataPlugins.addEvents.update);
          iotAgentLib.addUpdateMiddleware(iotAgentLib.dataPlugins.expressionTransformation.update);
          iotAgentLib.addUpdateMiddleware(iotAgentLib.dataPlugins.multiEntity.update);
          iotAgentLib.addUpdateMiddleware(iotAgentLib.dataPlugins.timestampProcess.update);

          iotAgentLib.addDeviceProvisionMiddleware(iotAgentLib.dataPlugins.bidirectionalData.deviceProvision);
          iotAgentLib.addConfigurationProvisionMiddleware(iotAgentLib.dataPlugins.bidirectionalData.groupProvision);
          iotAgentLib.addNotificationMiddleware(iotAgentLib.dataPlugins.bidirectionalData.notification);

          if (config.getConfig().configRetrieval) {
              iotAgentLib.setNotificationHandler(configurationNotificationHandler);
          } else {
              iotAgentLib.setNotificationHandler(notificationHandler);
          }
      }
    });
}

function deviceProvisioningHandler(device, callback)
{
    var devID = device.id;
    var activeNode = loop.ROSNodes.find(o => o.name === devID);

    console.log('There is a deviceID: ', device )

    if (activeNode == null) {
      try {
        loop.initROSDevice(device)
      } catch (error) {
        console.log("ERROR:", error)
      }
    }


    callback(null, device);
}


function updateHandler(id, type, attributes, service, subservice, callback) {
    console.log("updateHandler: ", attributes);
    callback();
}

function configurationHandler([configuration], callback) {
     // TODO - Remove if not needed (no transport to be selected - It is ROS2 and it is out of scope.)
     // transportSelector.applyFunctionFromBinding([configuration], 'configurationHandler', null, callback);
}

function queryContextHandler(id, type, service, subservice, attributes, callback) {
  var response = {};
  response["id"]= id;
  response["type"]= type;
  for (var i = 0; i < attributes.length; i++) {
      let attrObject = {};
      attrObject["type"] = cached_ros2_msgs_for_lazy_attrs[attributes[i]].type;
      attrObject["value"] = cached_ros2_msgs_for_lazy_attrs[attributes[i]].value;
      response[attributes[i]] = attrObject;
  }
  callback(null, response);
}

function commandHandler(deviceId, type, service, subservice, attributes, callback) {
  // ToDo: generate command execution for the whole command array
  // ToDo: validate the command payload (Check it is a convenient ROS Message)
  console.log("---------");
  console.log(deviceId);
  console.log("---------");
  console.log(attributes);
  var cmdObj = attributes[0];
  generateCommandExecution(service, subservice, deviceId, cmdObj);
  callback();
}

/*
*
*  Code Section for STEP 2: Register the ROS 2 System in the IoTA
*
*/
function provisionROS2Service(){
  console.log("provisionROS2Service - ")
  console.log("apiKey: " + iota_conf.default_key)
  var options = {
    'method': 'POST',
    'url': 'http://'+iota_conf.server_host+':'+iota_conf.server_port+'/iot/services',
    'headers': {
      'fiware-service': ros2_system_conf.service,
      'fiware-servicepath': ros2_system_conf.subservice,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({"services":[{"apikey":iota_conf.default_key,
                                       "cbroker":"http://"+iota_conf.cbroker_host+":"+iota_conf.cbroker_port,
                                       "entity_type":iota_conf.default_type,
                                       "resource":iota_conf.default_resource}]})
  };
  config.getLogger().info('url', options['url']);
  request(options, function (error, response) {
    if (error) throw new Error(error);
    console.log(response.body);
  });
}
function provisionROS2System(){
  console.log("provisionROS2System - ")
  var options = {
    'method': 'POST',
    'url': 'http://'+iota_conf.server_host+':'+iota_conf.server_port+'/iot/devices',
    'headers': {
      'fiware-service': ros2_system_conf.service,
      'fiware-servicepath': ros2_system_conf.subservice,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({"devices":[{"device_id": ros2_system_conf.id,
                                      "entity_name":ros2_system_conf.name,
                                      "entity_type": ros2_system_conf.type,
                                      "apikey": iota_conf.default_key, 
                                      "attributes":ros2_system_conf.attributes,
                                      "lazy": ros2_system_conf.lazy_attrs,
                                      "commands": ros2_system_conf.commands} ]})

  };
  request(options, function (error, response) {
    if (error) throw new Error(error);
    console.log(response.body);
  });
}

// var waitUntilTheIotaIsReady =  function(){checkDeviceLoop = setInterval(checkDevice, 1000);};

function checkDevice(){
  iotAgentLib.listDevices(ros2_system_conf.service, ros2_system_conf.subservice, 20,0, function (error, obj){
    if (error){
      console.log(error);
    }
    else if(obj.count>0){
      clearInterval (checkDeviceLoop);
      registered_devices_count = obj.count;
      console.log("IOTA Agent: The ROS 2 System is Ready");   
    }
    else{
      console.log("IOTA Agent: Waiting for the ROS 2 System to be registered");  
    }
  });
}

function start () {
    let config

    if (process.argv.length === 3) {
        config = require('../' + process.argv[2])
    } else {
        config = require('../config')
    }

    config.iota.iotaVersion = info.version
    console.log(config)

    /* Connection with Context-Broker */
    readConfigurationParams()
    activateIoTAgent()
  
    waitUntilTheIotaIsReady()
    // loop.startTheROS2Loop(ros2_system_conf)
    ros.startTheRobot(config)

}

start()
console.log(".... Is the agent listening yet?")
