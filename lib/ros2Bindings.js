const rclnodejs = require('rclnodejs');
var ros2_node 
/*
*
*  Code Section for STEP 3: Setup and Run the ROS 2 middleware (South Port of the Agent)
*
*/
var last_message = {}
var ros2_system_conf = {}
// var ros2Loop = {}
var ros2DiscoveryLoop = {}
var registered_devices_count = 1
var iota_conf = {};
var externalROS2SystemsAreReady = false;
var registered_devices_count = 0;
var cached_ros2_msgs_for_lazy_attrs = {};
var ros2_node;
var ROSNodes = [];
var rosDevices = [];
var ros2Subscribers = [];
var ros2Publishers = [];
var lastMessages = {};

var startTheROS2Loop =  function(cnf){ros2Loop = setInterval(startROS(cnf), 1000);}; 


function startROS(cnf){
  ros2_system_conf = cnf
  if(registered_devices_count>0){
    console.log("ROS2 System: IoTA is Ready, Waiting for External ROS 2 Nodes");
    rclnodejs.init().then(() => {
      clearInterval(ros2Loop);
      // Create the ROS 2 Node
      ros2_node = new rclnodejs.Node('iot_agent', 'ngsild');
      var publisher_init = ros2_node.createPublisher('std_msgs/msg/String', 'iota_check');
      publisher_init.publish(`Hello ROS, this is the FIWARE IoTA`);
      ros2DiscoveryLoop = setInterval(startTheBridge, 1000); 
    });
  }
  else{
    console.log("ROS2 System: Waiting for the IOTA");
  }
}

function startTheBridge(){
    var topic_object = ros2_node.getTopicNamesAndTypes();
    var subscriber_keys = Object.keys(ros2_system_conf.subscribers);
    topic_object.forEach(element => {
      let name = element.name;
      for (let j=0; j<subscriber_keys.length; j++)
      {
        if (name.indexOf(ros2_system_conf.subscribers[subscriber_keys[j]].topic_path)>-1)
        {
          externalROS2SystemsAreReady = true;
        }  
      }
      }); 
      console.log(topic_object);
      console.log("------ External ROS2 Nodes are not ready-------");
    if (externalROS2SystemsAreReady==true)
    {
  
      // Create a ROS 2 Subscriber for each Active Attribute
      var ros_attributes = ros2_system_conf.attributes;
      ros_attributes.forEach(element => {
        let ngsi_attr_name = element.name;
        let topic_type_str = ros2_system_conf.subscribers[ngsi_attr_name].topic_type;
        let topic_path_str = ros2_system_conf.subscribers[ngsi_attr_name].topic_path;
        last_message[ngsi_attr_name] = new Date().getTime();
        createSubscriberForActiveAttr(ros2_node,
                              topic_type_str,
                              topic_path_str,
                              ngsi_attr_name, 
                              1000);
      });
      // Create a ROS 2 Subscriber for each Lazy Attribute
      var ros_lazy_attrs = ros2_system_conf.lazy_attrs;
        
        ros_lazy_attrs.forEach(lazy_element => {
        let ngsi_lazy_attr_name = lazy_element.name;
        let lazy_topic_type_str = ros2_system_conf.subscribers[ngsi_lazy_attr_name].topic_type;
        let lazy_topic_path_str = ros2_system_conf.subscribers[ngsi_lazy_attr_name].topic_path;
        last_message[ngsi_lazy_attr_name] = new Date().getTime();
        createSubscriberForLazyAttr(ros2_node,
                              lazy_topic_type_str,
                              lazy_topic_path_str,
                              ngsi_lazy_attr_name, 
                              1000);
      });
      ros2_node.spin(); 
      clearInterval(ros2DiscoveryLoop);
    }
  }
 
/*
*
*  Code Section for Auxiliary Features
*
*/

// Aux Functions for IoTA Features
///////////////////////////////////
var generateCommandExecution = async function (service, subservice, deviceId, commandObj) {
  var myDeviceInfo;
  iotAgentLib.getDeviceByName(deviceId, service, subservice, function(error, dev) {
    if (error) {
        console.log(error);
    } else {
      myDeviceInfo = dev;
    }
  });
  var ros2_command_type = commandObj.value.rosCmd;
  //  if command type is: 
  //    "publish"     -> Create publisher, publish message, update command result
  //    "call_srv"    -> Create Service Client, call Service, update command result
  //    "call_action" -> Create Action Client, call Action, start handler of async command results
  //    Otherwise return "unknown_command" 
  if (ros2_command_type == "publish")
  {
    publishNgsiCommandAsROS2TopicMessage(commandObj);
    // Update the Command
    iotAgentLib.setCommandResult(deviceId,
      iota_conf.default_resource,iota_conf.default_key,
      commandObj.name,
      ros2_commands.PUBLISH_CMD_RESULT,
      ros2_commands.PUBLISH_CMD_FINAL_STATUS,
      myDeviceInfo,
      function(error, obj) {
        if (error){
          console.log(error);
          config.getLogger().debug('Error in Command Update: %s', error);
        }
        else{
          console.log("The command was successfully updated");
          console.log(obj);
        }
      });
  }
  else if(ros2_command_type == "call_srv") 
  {
    publishNgsiCommandAsROS2ServiceCall(commandObj, deviceId, myDeviceInfo);
  }
  else if(ros2_command_type == "call_action") 
  {
    publishNgsiCommandAsROS2ActionCall(commandObj, deviceId, myDeviceInfo);
  }  

}

// Aux Functions for ROS 2 Features
///////////////////////////////////

/** 
* Create a ROS 2 subscriber using rcl-nodejs
*
* @param {Object} ros2_node ROS 2 Node 
* @param {String} topic_type_str A string which determines the ROS 2 Type of the subscription topic
* @param {String} topic_path_str the path of the topic in the ROS 2 System
* @param {String} ngsi_attr_name_str name of the NGSI attribute which will hold the topic data
* @param {Integer} throttling_ms_int sets the minimum period (in milisecs) between messages 
*
*/
function createSubscriberForActiveAttr(ros2_node, topic_type_str, topic_path_str, ngsi_attr_name_str,throttling_ms_int)
{
  /*last_message[ngsi_attr_name_str] = 0;
  var subscriber_initializer_loop = setInterval(() => {
    var topics_names_and_types = ros2_node.getTopicNamesAndTypes();
    console.log(topics_names_and_types);
    
  }, 1000);*/
  ros2_node.createSubscription(topic_type_str, topic_path_str, (msg) => {
    let last_time_stamp = last_message[ngsi_attr_name_str];
    let time_stamp = new Date().getTime();
    let diff = Math.abs(time_stamp - last_time_stamp);
    if (diff > throttling_ms_int) 
    {
      //console.log(`Received message: ${typeof msg}`, msg); //fmf
      last_message[ngsi_attr_name_str] = new Date().getTime();
      sendROS2MessageAsActiveAttribute(ngsi_attr_name_str, msg);
    }
  });
}

function createSubscriberForLazyAttr(ros2_node, topic_type_str, topic_path_str, ngsi_attr_name_str,throttling_ms_int)
{
  // Initialize the aux timestamp for the the throtlling behaviour
  // This aux time stamp will tell the time at which the last message of this topic was sent to the Context Broker 
  last_message[ngsi_attr_name_str] = 0;

  // Create the Subscription 
  ros2_node.createSubscription(topic_type_str, topic_path_str, (msg) => {
    // Calculate the difference between the current time and the time the last message was sent to the Context Broker
    // If the difference is larger than the throttling period -> send a new one
    let last_time_stamp = last_message[ngsi_attr_name_str];
    let time_stamp = new Date().getTime();
    let diff = Math.abs(time_stamp - last_time_stamp);
    if (diff > throttling_ms_int) 
    {
      var messageObject = {"name":ngsi_attr_name_str, "type":"Object", "value":msg};
      cached_ros2_msgs_for_lazy_attrs[ngsi_attr_name_str] = messageObject;
      last_message[ngsi_attr_name_str] = new Date().getTime();
    }
  });

}

function publishNgsiCommandAsROS2TopicMessage(ngsiCommand){
  var command_value = ngsiCommand.value;
  var refCommandValueObject = {rosCmd:"",topic_path:"",topic_type:"",messageObj:{}};
  var isValidCmdValue = deepMessageStructureCheck(refCommandValueObject, command_value, 1);

  if (isValidCmdValue){
    var referenceMessageObj = rclnodejs.createMessageObject(command_value.topic_type);
    var ros2MessageObj = command_value.messageObj; 
    var isValidMessageObj = deepMessageStructureCheck(referenceMessageObj, ros2MessageObj);
    if (isValidMessageObj){
      console.log(referenceMessageObj);
      console.log(command_value.messageObj);
      var publisher = ros2_node.createPublisher(command_value.topic_type, command_value.topic_path);
      publisher.publish(command_value.messageObj);+
      delete publisher;
    }
    else{
      console.log("Wrong 'messageObject' structure for "+commandValueObject.topic_type+ ", the correct structure is:");
      console.log(referenceMessageObj);
      console.log("check the complete message definition at:");
      var msg_type_array = command_value.topic_type.split("/");
      console.log("http://docs.ros.org/en/melodic/api/"+msg_type_array[0]+"/html/msg/"+msg_type_array[2]+".html");
    }
  }
  else if(!isValidCmdValue){
    console.log("Wrong NGSI 'publish' command for ROS2 systems. The correct structure is:");
    console.log(refCommandValueObject);
    console.log("Yours is:");
    console.log(command_value);
  }
  else{
    console.log("This is not a 'publish' command");
  }
}

function publishNgsiCommandAsROS2ServiceCall(ngsiCommand, device_id, device_info){
  var command_value = ngsiCommand.value;
  var refCommandValueObject = {rosCmd:"",srv_type:"", srv_name:"", requestObj:{}};
  var isValidCmdValue = deepMessageStructureCheck(refCommandValueObject, command_value, 1);
  if (isValidCmdValue){
    console.log("Service Calling!!!!!!!!!!");
    // TODO: Find a way to validate service request and add convenient code here
    console.log(command_value);
    var srv_manager = ros2_node.createClient(command_value.srv_type, command_value.srv_name);
    srv_manager.sendRequest(command_value.requestObj, function(response){
      // Update the NGSI Command
      iotAgentLib.setCommandResult(device_id,
        iota_conf.default_resource,iota_conf.default_key,
        ngsiCommand.name,
        response,
        ros2_commands.PUBLISH_CMD_FINAL_STATUS,
        device_info,
        function(error, obj) {
          if (error){
            console.log(error);
            config.getLogger().debug('Error in Command Update: %s', error);
          }
          else{
            console.log("The command was successfully updated");
            console.log("Service Response: %s", JSON.stringify(response, null, 2));
          }
        });
    });
    
  }
  else{
    console.log("Wrong NGSI 'publish' command for ROS2 systems. The correct structure is:");
    console.log(refCommandValueObject);
    console.log("Yours is:");
    console.log(command_value);
  }
}

function publishNgsiCommandAsROS2ActionCall(ngsiCommand, device_id, device_info){
  var command_name = ngsiCommand.name;
  var command_value = ngsiCommand.value;
  var refCommandValueObject = {rosCmd:"", actionType:"", actionName:"", goalObj:{}};
  var isValidCmdValue = deepMessageStructureCheck(refCommandValueObject, command_value, 1);
  
  if (isValidCmdValue){
    // TODO: Find a way to validate service request and add convenient code here
    console.log(command_value);
    var action_result={};
    sendGoal(command_value, command_name);
}

async function sendGoal(ngsi_command_value, ngsi_command_name){
  var action_client = new rclnodejs.ActionClient(ros2_node, ngsi_command_value.actionType, ngsi_command_value.actionName);
  // goalHandle is a "ClientGoalHandle", see http://robotwebtools.org/rclnodejs/docs/0.20.0/ClientGoalHandle.html
  const goalHandle = await action_client.sendGoal(ngsi_command_value.goalObj, (feedback) => {
    ros2_node.getLogger().info(`Received feedback: ${JSON.stringify(feedback)}`);
  });
  if (!goalHandle.accepted) {
    ros2_node.getLogger().info('Goal rejected');
    return;
  }

  ros2_node.getLogger().info('Goal accepted');
  result = await goalHandle.getResult();
  ros2_node.getLogger()
  .info(`Goal suceeded with result: ${JSON.stringify(result)}`);
  // Update the NGSI Command
  iotAgentLib.setCommandResult(device_id,
    iota_conf.default_resource,iota_conf.default_key,
    ngsiCommand.name,
    result.status,
    ros2_commands.PUBLISH_CMD_FINAL_STATUS,
    device_info,
    function(error, obj) {
        if (error){
          console.log(error);
          config.getLogger().debug('Error in Command Update: %s', error);
        }
        else{
          console.log("The command was successfully updated");
          console.log("Service Response: %s", JSON.stringify(obj, null, 2));
        }
      });
  }
}

function deepMessageStructureCheck(object1, object2, max_level=999) {
  if(max_level > 0)
  {
    const keys1 = Object.keys(object1);
    const keys2 = Object.keys(object2);
    if (keys1.length !== keys2.length) {
      return false;
    }
    for (const key of keys1) {
      const val1 = object1[key];
      const val2 = object2[key];
      const areObjects = isObject(val1) && isObject(val2);
      new_max = max_level - 1;
      if (areObjects && !deepMessageStructureCheck(val1, val2, new_max)) {
        return false;
      }
    }
  }
  return true;
}

function isObject(object) {
  return object != null && typeof object === 'object';
}

function sendROS2MessageAsActiveAttribute(ngsi_attribute_name, ros2_message)
{
  var myObject = [{"name":ngsi_attribute_name, "type":"Object", "value":ros2_message}];
  iotAgentLib.retrieveDevice(ros2_system_conf.id, iota_conf.default_key, function (error, device) {
    if (error) {
        console.log("Couldn't find the device: " + JSON.stringify(error));
    } else {
        iotAgentLib.update(device.name, device.type, "", myObject, device, function (error) {
            if (error) {
                console.log("Error updating the device");
            } else {
                console.log("Device successfully updated");
            }
        });
    }
  });
}



// Sys Functions
////////////////
process.on('SIGINT', function() {
  console.log( "\nGracefully shutting down from SIGINT (Ctrl-C)" );
  // some other closing procedures go here
  process.exit(0);
});


function startTheRobot(cnf) {
  var dev = iotAgentLib.listDevices(cnf.ros_2.service, cnf.ros_2.subservice, function (error, device) 
  {
      if (error) 
      {
          console.log("Device Not Found");
          callback(error);
      }
      else 
      {
          try 
          {
              rclnodejs.init().then(() => 
              {
                  for (var i = 0; i < device.count; i++) 
                  {
                      ros2Device = device.devices[i];

                      if (ros2Device.type == "IOT")
                      {
                          initIOTDevice(ros2Device);
                      }
                      else
                      {
                          initROSDevice(ros2Device);
                      }
                  }
              });

              console.log("Robot initialized!");
          } 
          catch (error) {
              console.log(error); 
              callback(error);
          }
      }
  });

}

function initROSDevice(ros2Device) 
{
    activeAttributes = ros2Device.active;
    internalAttributes = ros2Device.internalAttributes;

      // Create Node
      let nodeID = ros2Device.id;
      rclnodejs.init();
      var ROS_Node = rclnodejs.createNode('robot_srv_client_node');
      var newNode = { name: nodeID, node: ROS_Node };
      ROSNodes.push(newNode);

      internalAttributes.map(function (interfaceDescriptor) {
        var internalJson = interfaceDescriptor;
        var key = Object.keys(interfaceDescriptor);

        let subORpub = internalJson[key].ros2Interface.value;
        let topicType = internalJson[key].topicType.value;
        let topicName = internalJson[key].topicName.value;

        // Create publisher
        if (subORpub == "publisher") {
            console.log("CreatePublisher - type:",topicType, "name: ", topicName);
            var publisher = ROS_Node.createPublisher(topicType, topicName);
            var newPublisher = { name: nodeID, publisher: publisher };
            ros2Publishers.push(newPublisher);
        }
      });

      activeAttributes.map(function (interfaceDescriptor) {
        let subscriberName = interfaceDescriptor.name;
        let topicType = interfaceDescriptor.metadata.topicType.value;
        let topicName = interfaceDescriptor.metadata.topicName.value;
        let throttlingInMilliseconds = interfaceDescriptor.metadata.throttlingInMilliseconds.value; lastMessages[subscriberName] = {};
        lastMessages[subscriberName]['msg'] = 'None';
        lastMessages[subscriberName]['lastDataSampleTs'] = new Date().getTime();
        lastMessages[subscriberName]['throttling'] = throttlingInMilliseconds;

        var rosDevice = { topic: topicName, device: ros2Device };
        rosDevices.push(rosDevice);

        let subscription = ROS_Node.createSubscription(topicType, topicName, (msg) => {
            console.log(`Received message: ${typeof msg}`, msg);
            let lastTs = lastMessages[subscriberName].lastDataSampleTs;
            let newTs = new Date().getTime();
            let interval = newTs - lastTs;
            if (interval >= lastMessages[subscriberName].throttling) {
                lastMessages[subscriberName].msg = msg;
                lastMessages[subscriberName].lastDataSampleTs = new Date().getTime();
                attribute = {};
                attribute.name = subscriberName;
                attribute.type = 'object';
                attribute.value = msg;
                attribute.metadata = {};
                attribute.metadata.topicType = { type: 'string', value: topicType };
                attribute.metadata.topicName = { type: 'string', value: topicName };
                attribute.metadata.throttlingInMilliseconds = {
                    type: 'number',
                    value: throttlingInMilliseconds
                };

                var incomingRosDevice = rosDevices.find(o => o.topic === topicName);

                iotAgentLib.update(incomingRosDevice.device.name, incomingRosDevice.device.type, 
                                    device.apikey, [attribute], incomingRosDevice.device, function (error) {
                    if (error) {
                        console.log('Something went wrong!!!');
                        console.log(error);
                    } else {
                        console.log(`Received message:`);
                        console.log(lastMessages[subscriberName]);
                    }
                });
                lastMessages[subscriberName].lastDataSampleTs = new Date().getTime();
            }
        });

        ROS_Node.spin();

        var newSubscriber = { name: nodeID, subscription: subscription };
        ros2Subscribers.push(newSubscriber);
    });

}

exports.startTheRobot = startTheRobot
exports.initROSDevice = initROSDevice
exports.ROSNodes = ROSNodes